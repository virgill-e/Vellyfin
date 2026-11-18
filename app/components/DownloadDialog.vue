<script setup lang="ts">
// Avant un téléchargement : choix de la langue audio (si plusieurs), de la qualité,
// et vérification de l'espace disque. Sans choix à faire, le téléchargement part directement.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { audioTracks, type AudioTrack } from "~/utils/playback";
import { QUALITIES } from "~/utils/quality";
import { estimateSize, formatSize, pickAudio } from "~/utils/downloads";
import { streamLanguages } from "~/utils/item-info";

const downloads = useDownloadsStore();
const session = useSessionStore();

const visible = ref(false);
const item = ref<BaseItemDto | null>(null);
const tracks = ref<AudioTrack[]>([]);
const audio = ref<number | null>(null);
const error = ref("");

const target = computed(() => downloads.dialog);
const source = computed(() => item.value?.MediaSources?.[0]);
const estimate = computed(() =>
  estimateSize(item.value?.RunTimeTicks, QUALITIES[downloads.quality]?.maxBitrate, source.value ?? undefined),
);
const free = computed(() => downloads.usage?.free ?? null);
const tooBig = computed(() => estimate.value !== null && free.value !== null && estimate.value > free.value);
const subtitles = computed(() => streamLanguages(source.value?.MediaStreams).subtitles);

watch(target, async (request) => {
  visible.value = false;
  error.value = "";
  item.value = null;
  if (!request) return;
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId) return close();
  try {
    const [{ data }] = await Promise.all([getLibraryApi(api).getItem({ itemId: request.itemId, userId }), downloads.refresh()]);
    item.value = data;
    tracks.value = audioTracks(data.MediaSources?.[0]?.MediaStreams ?? []);
    audio.value =
      pickAudio(tracks.value, downloads.preferredAudio) ??
      data.MediaSources?.[0]?.DefaultAudioStreamIndex ??
      tracks.value[0]?.index ??
      null;
    // Rien à choisir et la place suffit : pas de fenêtre.
    if (tracks.value.length <= 1 && !tooBig.value) return confirm();
    visible.value = true;
  } catch {
    error.value = "Impossible de préparer le téléchargement : serveur injoignable.";
    visible.value = true;
  }
});

function confirm() {
  const request = target.value;
  if (!request) return;
  const chosen = tracks.value.find((t) => t.index === audio.value);
  if (chosen?.language && tracks.value.length > 1) downloads.preferredAudio = chosen.language;
  downloads.enqueue([
    {
      itemId: request.itemId,
      name: request.name,
      imageUrl: request.imageUrl,
      ...(tracks.value.length > 1 && audio.value !== null
        ? { audio: audio.value, mediaSourceId: source.value?.Id ?? undefined }
        : { audio: "default" as const }),
    },
  ]);
  close();
}

function close() {
  downloads.dialog = null;
  visible.value = false;
}
</script>

<template>
  <div
    v-if="target && visible"
    class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6"
    @click.self="close"
    @keydown.esc="close"
  >
    <form
      class="flex w-full max-w-md flex-col gap-5 rounded-lg bg-surface-raised p-6 shadow-2xl ring-1 ring-white/10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-title"
      @submit.prevent="confirm"
    >
      <div>
        <p class="text-sm text-zinc-400">Télécharger</p>
        <h2 id="download-title" class="text-xl font-bold">{{ target.name }}</h2>
      </div>

      <p v-if="error" role="alert" class="text-sm text-amber-400">{{ error }}</p>

      <template v-else-if="item">
        <label v-if="tracks.length > 1" class="flex flex-col gap-2 text-sm text-zinc-300">
          Langue audio
          <select v-model="audio" class="field py-2 text-base">
            <option v-for="t in tracks" :key="t.index" :value="t.index">{{ t.label }}</option>
          </select>
          <span class="text-xs text-zinc-500">Une seule langue par téléchargement. Ce choix est retenu pour les suivants.</span>
        </label>

        <label class="flex flex-col gap-2 text-sm text-zinc-300">
          Qualité
          <select v-model="downloads.quality" class="field py-2 text-base">
            <option v-for="(q, i) in QUALITIES" :key="q.label" :value="i">{{ q.label }}</option>
          </select>
        </label>

        <p v-if="subtitles.length" class="text-sm text-zinc-400">Sous-titres inclus : {{ subtitles.join(", ") }}</p>

        <p class="text-sm" :class="tooBig ? 'text-amber-400' : 'text-zinc-400'">
          <template v-if="estimate !== null">Taille estimée : ~{{ formatSize(estimate) }}</template>
          <template v-if="free !== null"> · {{ formatSize(free) }} libres</template>
          <template v-if="tooBig"><br />Espace disque insuffisant.</template>
        </p>
      </template>
      <p v-else class="text-sm text-zinc-500">Préparation…</p>

      <div class="flex justify-end gap-2">
        <button type="button" class="btn-ghost" @click="close">Annuler</button>
        <button type="submit" class="btn-play py-1.5" :disabled="!item || tooBig" autofocus>Télécharger</button>
      </div>
    </form>
  </div>
</template>
