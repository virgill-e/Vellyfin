<script setup lang="ts">
// Lecteur : streaming HLS (hls.js) ou fichier téléchargé (?offline=1).
// Reprend à la dernière position connue et signale la progression à Jellyfin.
import Hls from "hls.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getUserDataApi } from "@jellyfin/sdk/lib/utils/api/user-data-api";
import type { ServerPosition } from "~/utils/progress";
import { formatClock, pickResume } from "~/utils/progress";
import { detectCodecs } from "~/utils/device-profile";
import {
  describeTranscoding,
  fetchTranscodingInfo,
  negotiatePlayback,
  stopEncoding,
  type PlaybackSource,
} from "~/utils/playback";

definePageMeta({ public: true });

const route = useRoute();
const session = useSessionStore();
const downloads = useDownloadsStore();
const progress = useProgressStore();
const router = useRouter();

const itemId = String(route.params.id);
const offline = route.query.offline === "1";
const video = ref<HTMLVideoElement | null>(null);
const source = ref<PlaybackSource | null>(null);
const title = ref("");
const error = ref("");
const codecs = detectCodecs();
const streamInfo = ref("Analyse du flux…");
const audioIndex = ref<number | null>(null);
const switching = ref(false);
/** Position de reprise affichée quelques secondes, avec « Recommencer ». */
const resumedAt = ref(0);
const tracker = usePlaybackTracker(itemId);
let hls: Hls | null = null;
let infoTimer: ReturnType<typeof setTimeout> | null = null;

/** Interroge la session Jellyfin jusqu'à connaître l'état du flux (copie ou transcodage). */
function watchTranscoding(attempt = 0) {
  infoTimer = setTimeout(async () => {
    const api = session.api;
    if (!api) return;
    const info = await fetchTranscodingInfo(api).catch(() => null);
    if (info) streamInfo.value = describeTranscoding(info);
    else if (attempt < 5) watchTranscoding(attempt + 1);
    else streamInfo.value = "État du flux indisponible";
  }, 3000);
}

onMounted(async () => {
  tracker.attach(video.value!);
  try {
    if (offline) await playOffline();
    else await playStream(undefined, await onlineStart());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

onBeforeUnmount(async () => {
  // La position est relevée avant de détruire le lecteur (qui la remet à zéro).
  const finishing = tracker.finish();
  if (infoTimer) clearTimeout(infoTimer);
  if (resumeTimer) clearTimeout(resumeTimer);
  hls?.destroy();
  await finishing;
  const api = session.api;
  if (api && source.value) await stopEncoding(api, source.value.playSessionId).catch(() => {});
});

async function back() {
  // Attend que l'arrêt soit signalé : l'accueil affichera la bonne progression.
  await tracker.finish();
  router.back();
}

/** En ligne : envoie d'abord les positions en attente, puis lit celle du serveur. */
async function onlineStart(): Promise<number> {
  const api = session.api;
  const current = session.session;
  if (!api || !current) return 0;
  await progress.flush();
  try {
    const { data } = await getLibraryApi(api).getItem({ itemId, userId: current.userId });
    title.value = data.Name ?? "";
    return pickResume(progress.local(itemId), data.UserData ?? null);
  } catch {
    return pickResume(progress.local(itemId), null);
  }
}

/** Hors ligne : position locale, ou celle du serveur si elle est plus récente et joignable. */
async function offlineStart(): Promise<number> {
  const api = session.api;
  const current = session.session;
  let server: ServerPosition | null = null;
  if (api && current) {
    server = await Promise.race([
      getUserDataApi(api)
        .getItemUserData({ itemId, userId: current.userId })
        .then((r) => r.data)
        .catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
  }
  return pickResume(progress.local(itemId), server);
}

let resumeTimer: ReturnType<typeof setTimeout> | null = null;
function announceResume(startAt: number) {
  if (startAt <= 0) return;
  resumedAt.value = startAt;
  resumeTimer = setTimeout(() => (resumedAt.value = 0), 8000);
}

function restart() {
  resumedAt.value = 0;
  if (video.value) video.value.currentTime = 0;
}

async function playOffline() {
  await downloads.init();
  const meta = downloads.saved.find((d) => d.itemId === itemId && d.state === "completed");
  if (!meta?.file) throw new Error("Fichier hors ligne introuvable.");
  title.value = meta.name;
  const startAt = await offlineStart();
  const el = video.value!;
  if (startAt > 0) el.addEventListener("loadedmetadata", () => (el.currentTime = startAt), { once: true });
  el.src = convertFileSrc(meta.file);
  await tracker.setStream(null);
  await el.play().catch(() => {});
  announceResume(startAt);
}

/** Négocie le flux (piste audio éventuelle) et le lit à partir de `startAt` secondes. */
async function playStream(audioStreamIndex?: number, startAt = 0) {
  const api = session.api;
  const current = session.session;
  if (!api || !current) throw new Error("Connexion requise pour le streaming.");

  source.value = await negotiatePlayback(api, itemId, {
    userId: current.userId,
    mediaSourceId: audioStreamIndex !== undefined ? source.value?.mediaSourceId : undefined,
    audioStreamIndex,
  });
  audioIndex.value = source.value.audioIndex;
  const el = video.value!;

  if (Hls.isSupported()) {
    hls = new Hls({
      xhrSetup: (xhr) => xhr.setRequestHeader("Authorization", api.authorizationHeader),
      startPosition: startAt > 0 ? startAt : -1,
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) error.value = `Erreur de lecture (${data.type} : ${data.details})`;
    });
    hls.loadSource(source.value.playlistUrl);
    hls.attachMedia(el);
  } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
    el.src = source.value.playlistUrl;
    if (startAt > 0) el.addEventListener("loadedmetadata", () => (el.currentTime = startAt), { once: true });
  } else {
    throw new Error("Ce système ne sait pas lire le HLS.");
  }
  await el.play().catch(() => {});
  await tracker.setStream({
    mediaSourceId: source.value.mediaSourceId,
    playSessionId: source.value.playSessionId,
    audioStreamIndex: source.value.audioIndex,
  });
  if (audioStreamIndex === undefined) announceResume(startAt);
  watchTranscoding();
}

/**
 * Change de piste audio : le flux HLS de Jellyfin n'en contient qu'une, il faut donc
 * renégocier avec la nouvelle piste et reprendre au même instant.
 */
async function changeAudio(index: number) {
  const api = session.api;
  if (!api || !source.value || index === audioIndex.value) return;
  const el = video.value!;
  const at = el.currentTime;
  const previous = source.value.playSessionId;

  switching.value = true;
  error.value = "";
  streamInfo.value = "Analyse du flux…";
  if (infoTimer) clearTimeout(infoTimer);
  const stopping = tracker.stopStream(); // Position relevée avant la destruction du lecteur.
  hls?.destroy();
  hls = null;
  await stopping;
  await stopEncoding(api, previous).catch(() => {});
  try {
    await playStream(index, at);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    // Reprend la lecture sur la piste par défaut plutôt que de laisser un écran noir.
    await playStream(undefined, at).catch(() => {});
  } finally {
    switching.value = false;
  }
}

const supported = Object.entries(codecs)
  .filter(([, ok]) => ok)
  .map(([codec]) => codec)
  .join(", ");
</script>

<template>
  <main class="flex h-screen flex-col bg-black">
    <header class="flex items-center gap-4 px-4 py-3 text-sm">
      <button class="btn-ghost" @click="back">← Retour</button>
      <span class="truncate font-medium">{{ title }}</span>
      <span class="ml-auto text-zinc-500">
        {{ offline ? "Hors ligne" : "Streaming" }} · codecs WebView : {{ supported || "aucun" }}
        <template v-if="source"> · {{ streamInfo }}</template>
      </span>
      <label v-if="source && source.audioTracks.length > 1" class="flex shrink-0 items-center gap-2 text-zinc-400">
        Audio
        <select
          class="field max-w-64 py-1 text-sm"
          :value="audioIndex ?? undefined"
          :disabled="switching"
          @change="changeAudio(Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="track in source.audioTracks" :key="track.index" :value="track.index">
            {{ track.label }}
          </option>
        </select>
      </label>
    </header>

    <p v-if="error" role="alert" class="px-4 pb-2 text-sm text-red-400">{{ error }}</p>

    <div class="relative flex min-h-0 flex-1">
      <video ref="video" class="min-h-0 w-full flex-1" controls crossorigin="anonymous" playsinline>
        <track
          v-for="(sub, i) in source?.textSubtitles ?? []"
          :key="sub.index"
          kind="subtitles"
          :src="sub.url"
          :srclang="sub.language"
          :label="sub.label"
          :default="i === 0"
        />
      </video>
      <div
        v-if="resumedAt > 0"
        role="status"
        class="absolute left-6 top-6 flex items-center gap-4 rounded bg-black/80 px-4 py-3 text-sm shadow-lg"
      >
        Reprise à {{ formatClock(resumedAt) }}
        <button class="btn-secondary py-1.5" @click="restart">Recommencer</button>
      </div>
    </div>
  </main>
</template>
