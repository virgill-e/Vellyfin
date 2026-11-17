import { acceptHMRUpdate, defineStore } from "pinia";
import { native, type DownloadMeta, type DownloadProgress } from "~/utils/native";
import { negotiatePlayback, stopEncoding } from "~/utils/playback";
import { pushSample, remainingSeconds, speedOf, type Sample } from "~/utils/eta";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { thumbUrl } from "~/utils/images";
import { QUALITIES, bitrateOfVariant, variantOf } from "~/utils/quality";


const QUALITY_KEY = "vellyfin.download-quality";
const FINISHED = new Set(["completed", "failed", "cancelled"]);


export type ActiveDownload = DownloadProgress & {
  name: string;
  imageUrl?: string;
  /** Débit lissé en octets/s, null tant qu'il n'est pas fiable. */
  speed: number | null;
  /** Temps restant estimé en secondes, null tant qu'il n'est pas fiable. */
  eta: number | null;
};

export const useDownloadsStore = defineStore("downloads", () => {
  const session = useSessionStore();
  const saved = ref<DownloadMeta[]>([]);
  const active = ref<Record<string, ActiveDownload>>({});
  const quality = ref(Number(localStorage.getItem(QUALITY_KEY) ?? 0) || 0);
  const playSessions = new Map<string, string>();
  const samples = new Map<string, Sample[]>();
  let listening = false;

  watch(quality, (value) => localStorage.setItem(QUALITY_KEY, String(value)));

  async function init() {
    if (listening) return;
    listening = true;
    await native.onDownloadProgress(async (progress) => {
      const previous = active.value[progress.itemId];
      let speed: number | null = null;
      if (progress.state === "downloading") {
        const history = pushSample(samples.get(progress.itemId) ?? [], {
          at: Date.now(),
          received: progress.downloaded,
        });
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

      if (FINISHED.has(progress.state)) {
        // Libère le transcodage côté serveur dès que le téléchargement s'arrête.
        const playSessionId = playSessions.get(progress.itemId);
        playSessions.delete(progress.itemId);
        if (playSessionId && session.api) {
          await stopEncoding(session.api, playSessionId).catch(() => {});
        }
        await refresh();
      }
    });
    await refresh();
  }

  async function refresh() {
    saved.value = await native.downloadsList();
  }

  /** État affichable d'un élément : en cours, terminé, ou rien. */
  function statusOf(itemId: string): DownloadProgress["state"] | null {
    const running = active.value[itemId];
    if (running && !FINISHED.has(running.state)) return running.state;
    return saved.value.some((d) => d.itemId === itemId && d.state === "completed") ? "completed" : null;
  }

  /** Avancement de 0 à 1, ou null si rien n'est en cours. */
  function progressOf(itemId: string): number | null {
    const running = active.value[itemId];
    if (!running || FINISHED.has(running.state)) return null;
    return running.total ? running.done / running.total : 0;
  }

  /** Nouveau téléchargement, à la qualité choisie dans les préférences. */
  function start(itemId: string, name: string, imageUrl?: string) {
    const option = QUALITIES[quality.value] ?? QUALITIES[0]!;
    return launch(itemId, name, imageUrl, option.maxBitrate);
  }

  /** Reprend un téléchargement interrompu ou en échec, à sa qualité d'origine. */
  async function resume(meta: DownloadMeta) {
    const api = session.api;
    const current = session.session;
    if (!api || !current) throw new Error("Connexion requise pour reprendre.");
    if (meta.serverId !== current.serverId || meta.userId !== current.userId) {
      throw new Error("Ce téléchargement appartient à un autre compte ou serveur.");
    }
    // Vignette : récupérée si elle manque (téléchargements antérieurs aux vignettes).
    let imageUrl: string | undefined;
    if (!meta.image) {
      try {
        const { data } = await getLibraryApi(api).getItem({ itemId: meta.itemId, userId: current.userId });
        imageUrl = thumbUrl(api.basePath, data);
      } catch {
        // Sans vignette, le téléchargement reprend quand même.
      }
    }
    return launch(meta.itemId, meta.name, imageUrl, bitrateOfVariant(meta.variant));
  }

  async function launch(itemId: string, name: string, imageUrl: string | undefined, maxBitrate?: number) {
    const api = session.api;
    const current = session.session;
    if (!api || !current) throw new Error("Connexion requise.");

    // Affiché « en attente » immédiatement : évite un double clic pendant la négociation.
    active.value[itemId] = {
      itemId,
      name,
      imageUrl,
      state: "queued",
      done: 0,
      total: 0,
      bytes: 0,
      downloaded: 0,
      error: null,
      speed: null,
      eta: null,
    };

    try {
      const source = await negotiatePlayback(api, itemId, {
        userId: current.userId,
        maxBitrate,
      });
      playSessions.set(itemId, source.playSessionId);

      await native.downloadStart({
        serverId: current.serverId,
        userId: current.userId,
        itemId,
        name,
        playlistUrl: source.playlistUrl,
        authorization: api.authorizationHeader,
        variant: variantOf(maxBitrate),
        imageUrl,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      active.value[itemId] = { ...active.value[itemId]!, state: "failed", error: message };
      throw e;
    }
  }

  const cancel = (itemId: string) => native.downloadCancel(itemId);

  async function remove(meta: DownloadMeta) {
    await native.downloadDelete(meta.serverId, meta.userId, meta.itemId);
    delete active.value[meta.itemId];
    await refresh();
  }

  /** Temps restant estimé (secondes), ou null. */
  function etaOf(itemId: string): number | null {
    return active.value[itemId]?.eta ?? null;
  }

  return { saved, active, quality, init, refresh, statusOf, progressOf, etaOf, start, resume, cancel, remove };
});

// Développement : remplace le store à chaud au lieu de garder une version périmée.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useDownloadsStore, import.meta.hot));
