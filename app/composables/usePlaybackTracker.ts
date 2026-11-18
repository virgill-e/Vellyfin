// Suivi d'une lecture : signale début, progression (toutes les 10 s et à chaque pause,
// reprise ou déplacement) et arrêt à Jellyfin, et enregistre la position localement.
// Hors ligne, ou si le serveur ne répond pas, la position reste dans la file locale
// (store progress) et sera synchronisée plus tard.
import type { Api } from "@jellyfin/sdk";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { toTicks } from "~/utils/progress";

const REPORT_EVERY_MS = 10_000;
const STOP_TIMEOUT_MS = 3_000;

export interface TrackedStream {
  mediaSourceId: string;
  playSessionId: string;
  audioStreamIndex: number | null;
}

export function usePlaybackTracker(itemId: string) {
  const session = useSessionStore();
  const progress = useProgressStore();
  let el: HTMLVideoElement | null = null;
  let stream: TrackedStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let finished = false;

  const api = (): Api | null => (stream ? session.api : null);
  const position = () => el?.currentTime ?? 0;
  const duration = () => el?.duration ?? NaN;

  function base() {
    return {
      ItemId: itemId,
      MediaSourceId: stream!.mediaSourceId,
      PlaySessionId: stream!.playSessionId,
      PositionTicks: toTicks(position()),
    };
  }

  function saveLocal() {
    progress.record(itemId, position(), duration());
  }

  async function report() {
    if (finished || !el) return;
    saveLocal();
    const client = api();
    if (!client) return;
    try {
      await getSessionApi(client).reportPlaybackProgress({
        playbackProgressInfo: {
          ...base(),
          IsPaused: el.paused,
          CanSeek: true,
          PlayMethod: "Transcode",
          AudioStreamIndex: stream!.audioStreamIndex,
        },
      });
      progress.markSynced(itemId);
    } catch {
      // Gardé localement, synchronisé plus tard.
    }
  }

  const onPause = () => void report();
  const onPlay = () => void report();
  const onSeeked = () => void report();
  const onEnded = () => void finish();
  // Fermeture de la fenêtre : au moins la position locale est conservée.
  const onUnload = () => saveLocal();

  /** Commence le suivi sur l'élément vidéo. */
  function attach(video: HTMLVideoElement) {
    el = video;
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    el.addEventListener("seeked", onSeeked);
    el.addEventListener("ended", onEnded);
    window.addEventListener("beforeunload", onUnload);
    timer = setInterval(() => {
      if (el && !el.paused) void report();
    }, REPORT_EVERY_MS);
  }

  /** Nouveau flux serveur (début de lecture ou changement de piste audio) ; null = hors ligne. */
  async function setStream(next: TrackedStream | null) {
    stream = next;
    const client = api();
    if (!client || !el) return;
    await getSessionApi(client)
      .reportPlaybackStart({
        playbackStartInfo: {
          ...base(),
          IsPaused: el.paused,
          CanSeek: true,
          PlayMethod: "Transcode",
          AudioStreamIndex: stream!.audioStreamIndex,
        },
      })
      .catch(() => {});
  }

  /** Signale l'arrêt du flux courant sans terminer le suivi (changement de piste). */
  async function stopStream() {
    const client = api();
    if (!client) return;
    saveLocal();
    const stop = getSessionApi(client)
      .reportPlaybackStopped({ playbackStopInfo: base() })
      .then(() => progress.markSynced(itemId));
    await withTimeout(stop).catch(() => {});
  }

  /**
   * Fin de lecture : position enregistrée tout de suite (avant que le lecteur soit détruit),
   * arrêt signalé au serveur (3 s max), sinon gardé pour plus tard.
   */
  async function finish() {
    if (finished) return;
    finished = true;
    saveLocal();
    const stopping = stopStream();
    if (timer) clearInterval(timer);
    window.removeEventListener("beforeunload", onUnload);
    el?.removeEventListener("pause", onPause);
    el?.removeEventListener("play", onPlay);
    el?.removeEventListener("seeked", onSeeked);
    el?.removeEventListener("ended", onEnded);
    await stopping;
    if (!stream) void progress.flush(); // Hors ligne : envoie tout de suite si le réseau est là.
  }

  return { attach, setStream, stopStream, finish };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), STOP_TIMEOUT_MS)),
  ]);
}
