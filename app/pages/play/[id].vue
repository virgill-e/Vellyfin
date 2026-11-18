<script setup lang="ts">
// Lecteur de phase 0 : streaming HLS (hls.js) ou fichier téléchargé (?offline=1).
import Hls from "hls.js";
import { convertFileSrc } from "@tauri-apps/api/core";
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
  try {
    if (offline) await playOffline();
    else await playStream();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

onBeforeUnmount(async () => {
  if (infoTimer) clearTimeout(infoTimer);
  hls?.destroy();
  const api = session.api;
  if (api && source.value) await stopEncoding(api, source.value.playSessionId).catch(() => {});
});

async function playOffline() {
  await downloads.init();
  const meta = downloads.saved.find((d) => d.itemId === itemId && d.state === "completed");
  if (!meta?.file) throw new Error("Fichier hors ligne introuvable.");
  title.value = meta.name;
  video.value!.src = convertFileSrc(meta.file);
  await video.value!.play().catch(() => {});
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
  hls?.destroy();
  hls = null;
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
      <button class="btn-ghost" @click="$router.back()">← Retour</button>
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

    <video ref="video" class="min-h-0 flex-1" controls crossorigin="anonymous" playsinline>
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
  </main>
</template>
