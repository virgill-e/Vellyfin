<script setup lang="ts">
// Lecteur : streaming HLS (hls.js) ou fichier téléchargé (?offline=1), avec commandes maison.
// Reprend à la dernière position, signale la progression à Jellyfin, propose
// « Passer l'intro » et enchaîne l'épisode suivant.
import Hls from "hls.js";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { BaseItemDto, MediaSegmentDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getMediaSegmentApi } from "@jellyfin/sdk/lib/utils/api/media-segment-api";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api/show-api";
import { getUserDataApi } from "@jellyfin/sdk/lib/utils/api/user-data-api";
import { formatClock, pickResume, type ServerPosition } from "~/utils/progress";
import { detectCodecs } from "~/utils/device-profile";
import {
  describeTranscoding,
  fetchTranscodingInfo,
  negotiatePlayback,
  stopEncoding,
  type PlaybackSource,
} from "~/utils/playback";
import { activeSegment, keyAction, nextEpisode, trickplayOf, type PlayerAction } from "~/utils/player";

// Une page par lecture : passer à l'épisode suivant recrée le lecteur.
definePageMeta({ public: true, key: (route) => route.fullPath });

const VOLUME_KEY = "vellyfin.volume";
const HIDE_CONTROLS_MS = 3000;
const NEXT_COUNTDOWN_S = 8;
const NEXT_CARD_BEFORE_END_S = 30;

const route = useRoute();
const session = useSessionStore();
const downloads = useDownloadsStore();
const progress = useProgressStore();
const router = useRouter();
const appWindow = getCurrentWindow();

const itemId = String(route.params.id);
const offline = route.query.offline === "1";
/** « Depuis le début » (?start=0) : ignore la position de reprise. */
const fromStart = route.query.start === "0";

const video = ref<HTMLVideoElement | null>(null);
const v = useVideoState(video);
const source = ref<PlaybackSource | null>(null);
const item = ref<BaseItemDto | null>(null);
const offlineName = ref("");
const error = ref("");
const loading = ref(true);
const codecs = detectCodecs();
const streamInfo = ref("Analyse du flux…");
const audioIndex = ref<number | null>(null);
const subtitleIndex = ref<number | null>(null);
let lastSubtitle: number | null = null;
const switching = ref(false);
const panel = ref<null | "tracks" | "info">(null);
const fullscreen = ref(false);
const controlsShown = ref(true);
/** Position de reprise affichée quelques secondes, avec « Recommencer ». */
const resumedAt = ref(0);
const segments = ref<MediaSegmentDto[]>([]);
const next = ref<BaseItemDto | null>(null);
const nextDismissed = ref(false);
const countdown = ref<number | null>(null);

const tracker = usePlaybackTracker(itemId);
let hls: Hls | null = null;
let infoTimer: ReturnType<typeof setTimeout> | null = null;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

// ---- Affichage -------------------------------------------------------------

const title = computed(() => item.value?.Name ?? offlineName.value);
const subtitleLine = computed(() => {
  const i = item.value;
  if (i?.Type !== "Episode") return "";
  return `${i.SeriesName ?? ""} · S${i.ParentIndexNumber ?? "?"}É${i.IndexNumber ?? "?"}`;
});
const controlsVisible = computed(() => controlsShown.value || v.paused.value || panel.value !== null || !!error.value);
const textSubtitles = computed(() => source.value?.textSubtitles ?? []);
const hasTracks = computed(() => (source.value?.audioTracks.length ?? 0) > 1 || textSubtitles.value.length > 0 || offline);

const trickplay = computed(() => trickplayOf(item.value, source.value?.mediaSourceId ?? null));
const { preview } = useTrickplay(
  () => session.api,
  itemId,
  () => source.value?.mediaSourceId ?? null,
  () => trickplay.value,
);

const skippable = computed(() => activeSegment(v.current.value, segments.value, ["Intro", "Recap", "Preview"]));
const skipLabel = computed(() => (skippable.value?.Type === "Recap" ? "Passer le récap" : skippable.value?.Type === "Preview" ? "Passer l'aperçu" : "Passer l'intro"));
const nearEnd = computed(
  () =>
    v.duration.value > 0 &&
    (v.duration.value - v.current.value <= NEXT_CARD_BEFORE_END_S ||
      activeSegment(v.current.value, segments.value, ["Outro"]) !== null),
);
const showNext = computed(() => !!next.value && !nextDismissed.value && (countdown.value !== null || nearEnd.value));

/** Affiche les commandes, puis les masque après 3 s d'inactivité pendant la lecture. */
function poke() {
  controlsShown.value = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => (controlsShown.value = false), HIDE_CONTROLS_MS);
}

// ---- Démarrage ---------------------------------------------------------------

onMounted(async () => {
  const el = video.value!;
  restoreVolume(el);
  el.textTracks.addEventListener("addtrack", applySubtitles);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", swallowSpace, true);
  fullscreen.value = await appWindow.isFullscreen().catch(() => false);
  tracker.attach(el);
  poke();
  try {
    if (offline) await playOffline();
    else await playStream(undefined, await onlineStart());
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(async () => {
  // La position est relevée avant de détruire le lecteur (qui la remet à zéro).
  const finishing = tracker.finish();
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("keyup", swallowSpace, true);
  for (const timer of [infoTimer, resumeTimer, hideTimer]) if (timer) clearTimeout(timer);
  if (countdownTimer) clearInterval(countdownTimer);
  hls?.destroy();
  await finishing;
  const api = session.api;
  if (api && source.value) await stopEncoding(api, source.value.playSessionId).catch(() => {});
});

// Le plein écran est gardé d'un épisode à l'autre, quitté en sortant du lecteur.
onBeforeRouteLeave((to) => {
  if (fullscreen.value && !to.path.startsWith("/play/")) void appWindow.setFullscreen(false);
});

/** En ligne : envoie d'abord les positions en attente, puis lit celle du serveur. */
async function onlineStart(): Promise<number> {
  const api = session.api;
  const current = session.session;
  if (!api || !current) return 0;
  await progress.flush();
  try {
    const { data } = await getLibraryApi(api).getItem({ itemId, userId: current.userId });
    item.value = data;
    loadExtras(data);
    if (fromStart) return 0;
    return pickResume(progress.local(itemId), data.UserData ?? null);
  } catch {
    return fromStart ? 0 : pickResume(progress.local(itemId), null);
  }
}

/** Segments (intro, générique) et épisode suivant : facultatifs, chargés en parallèle. */
function loadExtras(data: BaseItemDto) {
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId) return;
  getMediaSegmentApi(api)
    .getItemSegments({ itemId, includeSegmentTypes: ["Intro", "Outro", "Recap", "Preview"] })
    .then(({ data: result }) => (segments.value = result.Items ?? []))
    .catch(() => {});
  if (data.Type === "Episode" && data.SeriesId) {
    getShowApi(api)
      .getEpisodes({ seriesId: data.SeriesId, userId, adjacentTo: itemId })
      .then(({ data: result }) => (next.value = nextEpisode(result.Items ?? [], itemId)))
      .catch(() => {});
  }
}

/** Hors ligne : position locale, ou celle du serveur si elle est plus récente et joignable. */
async function offlineStart(): Promise<number> {
  if (fromStart) return 0;
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

async function playOffline() {
  await downloads.init();
  const meta = downloads.saved.find((d) => d.itemId === itemId && d.state === "completed");
  if (!meta?.file) throw new Error("Fichier hors ligne introuvable.");
  offlineName.value = meta.name;
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
  if (audioStreamIndex === undefined) {
    // Sous-titres par défaut selon les préférences Jellyfin de l'utilisateur.
    const preferred = source.value.defaultSubtitleIndex;
    subtitleIndex.value = textSubtitles.value.some((s) => s.index === preferred) ? preferred : null;
  }
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

function announceResume(startAt: number) {
  if (startAt <= 0) return;
  resumedAt.value = startAt;
  resumeTimer = setTimeout(() => (resumedAt.value = 0), 8000);
}

// ---- Commandes ------------------------------------------------------------------

function togglePlay() {
  const el = video.value;
  if (!el) return;
  if (el.paused) void el.play().catch(() => {});
  else el.pause();
}

function seek(seconds: number) {
  const el = video.value;
  if (!el || !v.duration.value) return;
  el.currentTime = Math.min(Math.max(0, seconds), Math.max(0, v.duration.value - 0.5));
}

function setVolume(value: number) {
  const el = video.value;
  if (!el) return;
  el.volume = Math.min(1, Math.max(0, value));
  el.muted = el.volume === 0;
  saveVolume(el);
}

function toggleMute() {
  const el = video.value;
  if (!el) return;
  el.muted = !el.muted;
  if (!el.muted && el.volume === 0) el.volume = 0.5;
  saveVolume(el);
}

function restoreVolume(el: HTMLVideoElement) {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? "null") as { volume: number; muted: boolean } | null;
    if (saved) {
      el.volume = Math.min(1, Math.max(0, saved.volume));
      el.muted = saved.muted;
    }
  } catch {
    // Préférence illisible : volume par défaut.
  }
}

function saveVolume(el: HTMLVideoElement) {
  localStorage.setItem(VOLUME_KEY, JSON.stringify({ volume: el.volume, muted: el.muted }));
}

async function toggleFullscreen() {
  const target = !fullscreen.value;
  await appWindow.setFullscreen(target).catch(() => {});
  fullscreen.value = await appWindow.isFullscreen().catch(() => target);
}

function restart() {
  resumedAt.value = 0;
  seek(0);
}

async function back() {
  // Attend que l'arrêt soit signalé : l'accueil affichera la bonne progression.
  await tracker.finish();
  router.back();
}

function onVideoClick() {
  if (panel.value) panel.value = null;
  else togglePlay();
}

// ---- Audio et sous-titres --------------------------------------------------------

/** Affiche la piste choisie ; TextTrack.id reprend l'id de l'élément <track>. */
function applySubtitles() {
  const el = video.value;
  if (!el) return;
  for (const track of Array.from(el.textTracks)) {
    track.mode = subtitleIndex.value !== null && track.id === `sub-${subtitleIndex.value}` ? "showing" : "disabled";
  }
}
watch(subtitleIndex, (index) => {
  if (index !== null) lastSubtitle = index;
  applySubtitles();
});
watch(textSubtitles, () => nextTick(applySubtitles));

function toggleSubtitles() {
  if (subtitleIndex.value !== null) subtitleIndex.value = null;
  else subtitleIndex.value = lastSubtitle ?? textSubtitles.value[0]?.index ?? null;
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

// ---- Épisode suivant ------------------------------------------------------------

watch(v.ended, (ended) => {
  if (ended && next.value && !nextDismissed.value) startCountdown();
});

function startCountdown() {
  if (countdownTimer) return;
  countdown.value = NEXT_COUNTDOWN_S;
  countdownTimer = setInterval(() => {
    countdown.value = (countdown.value ?? 1) - 1;
    if (countdown.value <= 0) void playNext();
  }, 1000);
}

function cancelNext() {
  nextDismissed.value = true;
  countdown.value = null;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

async function playNext() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
  const target = next.value;
  if (!target?.Id) return;
  await tracker.finish();
  await navigateTo(`/play/${target.Id}`, { replace: true });
}

// ---- Clavier ----------------------------------------------------------------------

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest("input, select, textarea") && event.key !== "Escape") return;
  const action = keyAction(event);
  if (!action) return;
  if (action === "exit-fullscreen") {
    if (panel.value) panel.value = null;
    else if (fullscreen.value) void toggleFullscreen();
    else return;
    event.preventDefault();
    return;
  }
  event.preventDefault();
  poke();
  run(action);
}

/** Espace relâché sur un bouton : ne pas l'activer (espace = lecture/pause partout). */
function swallowSpace(event: KeyboardEvent) {
  if (event.key === " " && (event.target as HTMLElement | null)?.closest("button")) event.preventDefault();
}

function run(action: PlayerAction) {
  switch (action) {
    case "toggle-play":
      return togglePlay();
    case "back-10":
      return seek(v.current.value - 10);
    case "forward-10":
      return seek(v.current.value + 10);
    case "volume-up":
      return setVolume((video.value?.muted ? 0 : v.volume.value) + 0.1);
    case "volume-down":
      return setVolume(v.volume.value - 0.1);
    case "mute":
      return toggleMute();
    case "fullscreen":
      return void toggleFullscreen();
    case "subtitles":
      return toggleSubtitles();
    case "next":
      if (next.value) void playNext();
      return;
  }
}

const supported = Object.entries(codecs)
  .filter(([, ok]) => ok)
  .map(([codec]) => codec)
  .join(", ");
</script>

<template>
  <main
    class="fixed inset-0 select-none overflow-hidden bg-black"
    :class="!controlsVisible && 'cursor-none'"
    @mousemove="poke"
  >
    <video
      ref="video"
      class="h-full w-full"
      crossorigin="anonymous"
      playsinline
      @click="onVideoClick"
      @dblclick="toggleFullscreen"
    >
      <track
        v-for="sub in textSubtitles"
        :id="`sub-${sub.index}`"
        :key="sub.index"
        kind="subtitles"
        :src="sub.url"
        :srclang="sub.language"
        :label="sub.label"
      />
    </video>

    <!-- Chargement -->
    <div
      v-if="!error && (loading || (v.waiting.value && !v.paused.value))"
      class="pointer-events-none absolute inset-0 grid place-items-center"
      aria-label="Chargement"
    >
      <span class="size-14 animate-spin rounded-full border-4 border-white/20 border-t-accent" />
    </div>

    <!-- Erreur -->
    <div v-if="error" role="alert" class="absolute inset-x-0 top-1/2 mx-auto w-fit max-w-xl -translate-y-1/2 rounded bg-black/85 px-5 py-4 text-center">
      <p class="mb-3 text-red-300">{{ error }}</p>
      <button class="btn-secondary" @click="back">Retour</button>
    </div>

    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-500"
      leave-to-class="opacity-0"
    >
      <PlayerControls
        v-show="controlsVisible"
        :title="title"
        :subtitle="subtitleLine"
        :current="v.current.value"
        :duration="v.duration.value"
        :buffered="v.buffered.value"
        :paused="v.paused.value"
        :volume="v.volume.value"
        :muted="v.muted.value"
        :fullscreen="fullscreen"
        :has-next="!!next"
        :has-tracks="hasTracks"
        :preview="trickplay ? preview : undefined"
        @back="back"
        @toggle-play="togglePlay"
        @seek="seek"
        @skip="seek(v.current.value + $event)"
        @volume="setVolume"
        @mute="toggleMute"
        @fullscreen="toggleFullscreen"
        @next="playNext"
        @tracks="panel = panel === 'tracks' ? null : 'tracks'"
        @info="panel = panel === 'info' ? null : 'info'"
      />
    </Transition>

    <PlayerTracksMenu
      v-if="panel === 'tracks'"
      :audio-tracks="source?.audioTracks ?? []"
      :audio-index="audioIndex"
      :subtitles="textSubtitles"
      :subtitle-index="subtitleIndex"
      :switching="switching"
      :offline="offline"
      @audio="changeAudio"
      @subtitle="subtitleIndex = $event"
      @close="panel = null"
    />

    <!-- Informations techniques -->
    <div v-if="panel === 'info'" class="absolute right-6 top-20 z-20 max-w-md rounded-lg bg-black/90 p-4 text-sm ring-1 ring-white/10">
      <p class="font-semibold">{{ offline ? "Fichier hors ligne" : "Streaming" }}</p>
      <p v-if="!offline" class="text-zinc-300">{{ streamInfo }}</p>
      <p class="mt-2 text-zinc-500">Codecs décodés par le système : {{ supported || "aucun" }}</p>
      <p v-if="trickplay" class="text-zinc-500">Aperçus de navigation : {{ trickplay.width }} px</p>
    </div>

    <!-- Reprise -->
    <div
      v-if="resumedAt > 0"
      role="status"
      class="absolute bottom-32 left-6 flex items-center gap-4 rounded bg-black/80 px-4 py-3 text-sm shadow-lg"
    >
      Reprise à {{ formatClock(resumedAt) }}
      <button class="btn-secondary py-1.5" @click="restart">Recommencer</button>
    </div>

    <!-- Passer l'intro / le récap -->
    <button
      v-if="skippable && !showNext"
      class="absolute bottom-32 right-6 rounded border-2 border-white/80 bg-black/70 px-6 py-3 font-semibold transition hover:bg-white hover:text-black"
      @click="seek(skippable.end)"
    >
      {{ skipLabel }}
    </button>

    <!-- Épisode suivant -->
    <div
      v-if="showNext && next"
      class="absolute bottom-32 right-6 z-10 flex w-80 flex-col gap-3 rounded-lg bg-black/90 p-4 shadow-2xl ring-1 ring-white/10"
      role="status"
    >
      <p class="text-sm text-zinc-400">
        Épisode suivant<template v-if="countdown !== null"> dans {{ countdown }} s</template>
      </p>
      <p class="font-semibold">S{{ next.ParentIndexNumber }}É{{ next.IndexNumber }} · {{ next.Name }}</p>
      <div class="flex gap-2">
        <button class="btn-play flex-1 justify-center py-1.5" @click="playNext">
          <svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
          Lire
        </button>
        <button class="btn-ghost" @click="cancelNext">Masquer</button>
      </div>
    </div>
  </main>
</template>
