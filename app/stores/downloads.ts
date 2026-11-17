import { defineStore } from "pinia";
import { native, type DownloadMeta, type DownloadProgress } from "~/utils/native";
import { negotiatePlayback, stopEncoding } from "~/utils/playback";

export interface QualityOption {
  label: string;
  /** undefined = qualité d'origine (remux si le codec est lisible). */
  maxBitrate?: number;
}

export const QUALITIES: QualityOption[] = [
  { label: "Originale" },
  { label: "1080p · 8 Mbit/s", maxBitrate: 8_000_000 },
  { label: "720p · 4 Mbit/s", maxBitrate: 4_000_000 },
];

const QUALITY_KEY = "vellyfin.download-quality";
const FINISHED = new Set(["completed", "failed", "cancelled"]);

export const useDownloadsStore = defineStore("downloads", () => {
  const session = useSessionStore();
  const saved = ref<DownloadMeta[]>([]);
  const active = ref<Record<string, DownloadProgress & { name: string }>>({});
  const quality = ref(Number(localStorage.getItem(QUALITY_KEY) ?? 0) || 0);
  const playSessions = new Map<string, string>();
  let listening = false;

  watch(quality, (value) => localStorage.setItem(QUALITY_KEY, String(value)));

  async function init() {
    if (listening) return;
    listening = true;
    await native.onDownloadProgress(async (progress) => {
      const name = active.value[progress.itemId]?.name ?? progress.itemId;
      active.value[progress.itemId] = { ...progress, name };

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

  async function start(itemId: string, name: string) {
    const api = session.api;
    const current = session.session;
    if (!api || !current) throw new Error("Connexion requise.");
    const option = QUALITIES[quality.value] ?? QUALITIES[0]!;

    const source = await negotiatePlayback(api, itemId, {
      userId: current.userId,
      maxBitrate: option.maxBitrate,
    });
    playSessions.set(itemId, source.playSessionId);
    active.value[itemId] = { itemId, name, state: "queued", done: 0, total: 0, bytes: 0, error: null };

    await native.downloadStart({
      serverId: current.serverId,
      userId: current.userId,
      itemId,
      name,
      playlistUrl: source.playlistUrl,
      authorization: api.authorizationHeader,
      variant: `bitrate=${option.maxBitrate ?? "original"}`,
    });
  }

  const cancel = (itemId: string) => native.downloadCancel(itemId);

  async function remove(meta: DownloadMeta) {
    await native.downloadDelete(meta.serverId, meta.userId, meta.itemId);
    delete active.value[meta.itemId];
    await refresh();
  }

  return { saved, active, quality, init, refresh, statusOf, start, cancel, remove };
});
