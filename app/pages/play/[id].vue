<script setup lang="ts">
// Lecteur de phase 0 : streaming HLS (hls.js) ou fichier téléchargé (?offline=1).
import Hls from "hls.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { detectCodecs } from "~/utils/device-profile";
import { negotiatePlayback, stopEncoding, type PlaybackSource } from "~/utils/playback";

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
let hls: Hls | null = null;

onMounted(async () => {
  try {
    if (offline) await playOffline();
    else await playStream();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
});

onBeforeUnmount(async () => {
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

async function playStream() {
  const api = session.api;
  const current = session.session;
  if (!api || !current) throw new Error("Connexion requise pour le streaming.");

  source.value = await negotiatePlayback(api, itemId, { userId: current.userId });
  const el = video.value!;

  if (Hls.isSupported()) {
    hls = new Hls({
      xhrSetup: (xhr) => xhr.setRequestHeader("Authorization", api.authorizationHeader),
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) error.value = `Erreur de lecture (${data.type} : ${data.details})`;
    });
    hls.loadSource(source.value.playlistUrl);
    hls.attachMedia(el);
  } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
    el.src = source.value.playlistUrl;
  } else {
    throw new Error("Ce système ne sait pas lire le HLS.");
  }
  await el.play().catch(() => {});
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
        <template v-if="source">
          · {{ source.transcodeReasons.length ? source.transcodeReasons.join(", ") : "aucune conversion" }}
        </template>
      </span>
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
