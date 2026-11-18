// Téléchargements : file d'attente (ordre, pause, reprise), un seul téléchargement
// actif à la fois (ménage le serveur), choix de la piste audio et sous-titres hors ligne.
// La file est enregistrée localement : elle reprend après un redémarrage de l'app.
import { acceptHMRUpdate, defineStore } from "pinia";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { native, type DownloadMeta, type DownloadProgress, type DownloadUsage, type MediaInfo } from "~/utils/native";
import { negotiatePlayback, stopEncoding, type PlaybackSource } from "~/utils/playback";
import { pushSample, remainingSeconds, speedOf, type Sample } from "~/utils/eta";
import { thumbUrl } from "~/utils/images";
import { QUALITIES, parseVariant, variantOf } from "~/utils/quality";
import { pickAudio } from "~/utils/downloads";

const QUALITY_KEY = "vellyfin.download-quality";
const QUEUE_KEY = "vellyfin.download-queue";
const AUDIO_KEY = "vellyfin.download-audio";
const FINISHED = new Set(["completed", "failed", "cancelled"]);

/**
 * Piste audio d'une entrée : index précis, « auto » (langue préférée si disponible)
 * ou « default » (piste par défaut du serveur, sans préférence : reprises anciennes).
 */
export type AudioChoice = number | "auto" | "default";

export interface QueueEntry {
  serverId: string;
  userId: string;
  itemId: string;
  name: string;
  imageUrl?: string;
  maxBitrate?: number;
  audio: AudioChoice;
  mediaSourceId?: string;
  paused: boolean;
  error: string | null;
}

export type ActiveDownload = DownloadProgress & {
  name: string;
  imageUrl?: string;
  /** Débit lissé en octets/s, null tant qu'il n'est pas fiable. */
  speed: number | null;
  /** Temps restant estimé en secondes, null tant qu'il n'est pas fiable. */
  eta: number | null;
};

/** État affiché d'un élément (cartes, boutons). */
export type DisplayStatus = DownloadProgress["state"] | "paused" | null;

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export const useDownloadsStore = defineStore("downloads", () => {
  const session = useSessionStore();
  const saved = ref<DownloadMeta[]>([]);
  const active = ref<Record<string, ActiveDownload>>({});
  const queue = ref<QueueEntry[]>(readJson<QueueEntry[]>(QUEUE_KEY, []));
  const quality = ref(Number(localStorage.getItem(QUALITY_KEY) ?? 0) || 0);
  /** Langue audio préférée pour les téléchargements (code « fre », « eng »…). */
  const preferredAudio = ref<string | null>(localStorage.getItem(AUDIO_KEY));
  const usage = ref<DownloadUsage | null>(null);
  /** Élément en cours de téléchargement côté Rust. */
  const current = ref<string | null>(null);
  /** Demande en attente de confirmation (choix de la langue, espace disque). */
  const dialog = ref<{ itemId: string; name: string; imageUrl?: string } | null>(null);
  const playSessions = new Map<string, string>();
  const samples = new Map<string, Sample[]>();
  let listening = false;

  watch(quality, (value) => localStorage.setItem(QUALITY_KEY, String(value)));
  watch(preferredAudio, (value) => (value ? localStorage.setItem(AUDIO_KEY, value) : localStorage.removeItem(AUDIO_KEY)));
  watch(queue, (value) => localStorage.setItem(QUEUE_KEY, JSON.stringify(value)), { deep: true });

  /** File du compte connecté (les autres comptes gardent la leur). */
  const myQueue = computed(() =>
    queue.value.filter((e) => e.serverId === session.session?.serverId && e.userId === session.session?.userId),
  );

  async function init() {
    if (listening) return;
    listening = true;
    await native.onDownloadProgress((progress) => void onProgress(progress));
    await refresh();
    void process();
  }

  async function onProgress(progress: DownloadProgress) {
    const previous = active.value[progress.itemId];
    let speed: number | null = null;
    if (progress.state === "downloading") {
      const history = pushSample(samples.get(progress.itemId) ?? [], { at: Date.now(), received: progress.downloaded });
      samples.set(progress.itemId, history);
      speed = speedOf(history);
    } else {
      samples.delete(progress.itemId);
    }
    active.value[progress.itemId] = {
      ...progress,
      name: previous?.name ?? progress.itemId,
      imageUrl: previous?.imageUrl,
      speed,
      eta: remainingSeconds({ ...progress, speed }),
    };

    if (!FINISHED.has(progress.state)) return;
    // Libère le transcodage côté serveur dès que le téléchargement s'arrête.
    const playSessionId = playSessions.get(progress.itemId);
    playSessions.delete(progress.itemId);
    if (playSessionId && session.api) await stopEncoding(session.api, playSessionId).catch(() => {});

    const entry = queue.value.find((e) => e.itemId === progress.itemId);
    if (progress.state === "completed") removeEntry(progress.itemId);
    else if (progress.state === "failed" && entry) entry.error = progress.error ?? "Échec du téléchargement.";
    // « cancelled » : mise en pause (entrée gardée) ou retrait (entrée déjà supprimée).
    if (current.value === progress.itemId) current.value = null;
    await refresh();
    void process();
  }

  async function refresh() {
    saved.value = await native.downloadsList();
    usage.value = await native.downloadsUsage().catch(() => usage.value);
  }

  // ---- État affiché ----------------------------------------------------------

  function statusOf(itemId: string): DisplayStatus {
    const running = active.value[itemId];
    if (running && !FINISHED.has(running.state)) return running.state;
    const entry = myQueue.value.find((e) => e.itemId === itemId);
    if (entry) return entry.error ? "failed" : entry.paused ? "paused" : "queued";
    return saved.value.some((d) => d.itemId === itemId && d.state === "completed") ? "completed" : null;
  }

  /** Avancement de 0 à 1, ou null si rien n'est en cours. */
  function progressOf(itemId: string): number | null {
    const running = active.value[itemId];
    if (running && running.total && (!FINISHED.has(running.state) || running.state === "cancelled")) {
      return running.done / running.total;
    }
    return statusOf(itemId) === "queued" ? 0 : null;
  }

  /** Temps restant estimé (secondes), ou null. */
  function etaOf(itemId: string): number | null {
    return active.value[itemId]?.eta ?? null;
  }

  // ---- File d'attente --------------------------------------------------------------

  /** Ajoute des éléments à la file (ignorés s'ils sont déjà en file ou téléchargés). */
  function enqueue(items: { itemId: string; name: string; imageUrl?: string; audio?: AudioChoice; mediaSourceId?: string; maxBitrate?: number }[]) {
    const me = session.session;
    if (!me) throw new Error("Connexion requise.");
    const option = QUALITIES[quality.value] ?? QUALITIES[0]!;
    for (const item of items) {
      const status = statusOf(item.itemId);
      if (status === "completed") continue;
      const existing = queue.value.find((e) => e.itemId === item.itemId);
      if (existing) {
        existing.paused = false;
        existing.error = null;
        continue;
      }
      queue.value.push({
        serverId: me.serverId,
        userId: me.userId,
        itemId: item.itemId,
        name: item.name,
        imageUrl: item.imageUrl,
        maxBitrate: "maxBitrate" in item ? item.maxBitrate : option.maxBitrate,
        audio: item.audio ?? "auto",
        mediaSourceId: item.mediaSourceId,
        paused: false,
        error: null,
      });
    }
    void process();
  }

  /** Lance le premier élément en attente si rien n'est en cours. */
  async function process() {
    if (current.value || !session.api) return;
    const entry = myQueue.value.find((e) => !e.paused && !e.error);
    if (!entry) return;
    current.value = entry.itemId;
    try {
      await launch(entry);
    } catch (e) {
      entry.error = e instanceof Error ? e.message : String(e);
      active.value[entry.itemId] = { ...active.value[entry.itemId]!, state: "failed", error: entry.error };
      current.value = null;
      void process();
    }
  }

  async function launch(entry: QueueEntry) {
    const api = session.api;
    const me = session.session;
    if (!api || !me) throw new Error("Connexion requise.");

    // Affiché « en attente » immédiatement, le temps de négocier le flux.
    active.value[entry.itemId] = {
      itemId: entry.itemId,
      name: entry.name,
      imageUrl: entry.imageUrl,
      state: "queued",
      done: 0,
      total: 0,
      bytes: 0,
      downloaded: 0,
      error: null,
      speed: null,
      eta: null,
    };

    const { data: item } = await getLibraryApi(api).getItem({ itemId: entry.itemId, userId: me.userId });
    const request = (audioStreamIndex?: number, mediaSourceId?: string) =>
      negotiatePlayback(api, entry.itemId, {
        userId: me.userId,
        maxBitrate: entry.maxBitrate,
        audioStreamIndex,
        mediaSourceId: audioStreamIndex !== undefined ? mediaSourceId : undefined,
      });

    let explicit = typeof entry.audio === "number" ? entry.audio : undefined;
    let source: PlaybackSource = await request(explicit, entry.mediaSourceId ?? item.MediaSources?.[0]?.Id ?? undefined);
    if (entry.audio === "auto") {
      // Langue préférée si le fichier la propose et que ce n'est pas déjà la piste par défaut.
      const wanted = pickAudio(source.audioTracks, preferredAudio.value);
      if (wanted !== null && wanted !== source.audioIndex) {
        explicit = wanted;
        source = await request(wanted, source.mediaSourceId);
      }
    }
    // Choix figé : une reprise redemandera exactement le même flux.
    entry.audio = explicit ?? "default";
    entry.mediaSourceId = source.mediaSourceId;
    playSessions.set(entry.itemId, source.playSessionId);

    await native.downloadStart({
      serverId: me.serverId,
      userId: me.userId,
      itemId: entry.itemId,
      name: entry.name,
      playlistUrl: source.playlistUrl,
      authorization: api.authorizationHeader,
      variant: variantOf({
        maxBitrate: entry.maxBitrate,
        audioStreamIndex: explicit,
        mediaSourceId: explicit !== undefined ? source.mediaSourceId : undefined,
      }),
      imageUrl: entry.imageUrl ?? thumbUrl(api.basePath, item),
      subtitles: source.textSubtitles.map((s) => ({ index: s.index, label: s.label, language: s.language, url: s.url })),
      info: mediaInfo(item, source),
    });
  }

  function mediaInfo(item: BaseItemDto, source: PlaybackSource): MediaInfo {
    return {
      kind: item.Type ?? null,
      seriesId: item.SeriesId ?? null,
      seriesName: item.SeriesName ?? null,
      season: item.ParentIndexNumber ?? null,
      episode: item.IndexNumber ?? null,
      runtimeTicks: item.RunTimeTicks ?? null,
      audio: source.audioTracks.find((t) => t.index === source.audioIndex)?.label ?? null,
    };
  }

  /** Met en pause (les segments reçus sont gardés) ; le suivant démarre. */
  async function pause(itemId: string) {
    const entry = queue.value.find((e) => e.itemId === itemId);
    if (!entry) return;
    entry.paused = true;
    if (current.value === itemId) await native.downloadCancel(itemId);
  }

  /** Reprend un élément en pause ou en échec (à sa place dans la file). */
  function resumeEntry(itemId: string) {
    const entry = queue.value.find((e) => e.itemId === itemId);
    if (!entry) return;
    entry.paused = false;
    entry.error = null;
    void process();
  }

  /** Retire de la file ; les segments déjà reçus restent dans « Interrompus ». */
  async function dequeue(itemId: string) {
    removeEntry(itemId);
    if (current.value === itemId) await native.downloadCancel(itemId);
    else delete active.value[itemId];
  }

  function removeEntry(itemId: string) {
    queue.value = queue.value.filter((e) => e.itemId !== itemId);
  }

  /** Déplace un élément d'un cran dans la file (-1 = plus tôt). */
  function move(itemId: string, delta: -1 | 1) {
    const list = [...queue.value];
    const from = list.findIndex((e) => e.itemId === itemId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to]!, list[from]!];
    queue.value = list;
  }

  // ---- Raccourcis pour l'interface -----------------------------------------------------

  /** Téléchargement simple : piste audio selon la langue préférée. */
  function start(itemId: string, name: string, imageUrl?: string) {
    enqueue([{ itemId, name, imageUrl }]);
  }

  /** Bouton Télécharger : passe par la fenêtre de choix (affichée seulement si utile). */
  function request(itemId: string, name: string, imageUrl?: string) {
    if (!session.session) throw new Error("Connexion requise.");
    dialog.value = { itemId, name, imageUrl };
  }

  /** Reprend un téléchargement interrompu, avec exactement les mêmes paramètres. */
  function resume(meta: DownloadMeta) {
    const me = session.session;
    if (!me) throw new Error("Connexion requise pour reprendre.");
    if (meta.serverId !== me.serverId || meta.userId !== me.userId) {
      throw new Error("Ce téléchargement appartient à un autre compte ou serveur.");
    }
    const variant = parseVariant(meta.variant);
    enqueue([
      {
        itemId: meta.itemId,
        name: meta.name,
        maxBitrate: variant.maxBitrate,
        audio: variant.audioStreamIndex ?? "default",
        mediaSourceId: variant.mediaSourceId,
      },
    ]);
  }

  async function remove(meta: DownloadMeta) {
    await native.downloadDelete(meta.serverId, meta.userId, meta.itemId);
    delete active.value[meta.itemId];
    await refresh();
  }

  return {
    saved,
    active,
    queue: myQueue,
    current,
    dialog,
    quality,
    preferredAudio,
    usage,
    init,
    refresh,
    statusOf,
    progressOf,
    etaOf,
    enqueue,
    start,
    request,
    resume,
    resumeEntry,
    pause,
    dequeue,
    move,
    remove,
  };
});

// Développement : remplace le store à chaud au lieu de garder une version périmée.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useDownloadsStore, import.meta.hot));
