<script setup lang="ts">
// Téléchargements : file d'attente (ordre, pause), bibliothèque hors ligne regroupée
// par série, téléchargements interrompus et place occupée sur le disque.
import type { DownloadMeta } from "~/utils/native";
import { QUALITIES, parseVariant } from "~/utils/quality";
import { formatRemaining, formatSpeed } from "~/utils/eta";
import { formatSize, groupOffline } from "~/utils/downloads";
import { MAX_RESUME_PCT } from "~/utils/progress";

const downloads = useDownloadsStore();
const progress = useProgressStore();
const connectivity = useConnectivityStore();

onMounted(async () => {
  await downloads.init();
  await downloads.refresh();
});

const completed = computed(() => downloads.saved.filter((d) => d.state === "completed"));
const library = computed(() => groupOffline(completed.value));
const queued = computed(() => new Set(downloads.queue.map((e) => e.itemId)));
// Interrompus : segments sur le disque, mais ni terminés ni dans la file.
const partial = computed(() => downloads.saved.filter((d) => d.state !== "completed" && !queued.value.has(d.itemId)));
const open = ref<Set<string>>(new Set());
const error = ref("");

function toggle(seriesId: string) {
  const next = new Set(open.value);
  if (next.has(seriesId)) next.delete(seriesId);
  else next.add(seriesId);
  open.value = next;
}

function localImage(itemId: string) {
  return downloads.saved.find((d) => d.itemId === itemId)?.image ?? null;
}

/** Avancement de lecture sur cet appareil (0-100), 0 si non commencé ou terminé. */
function watched(itemId: string) {
  const entry = progress.local(itemId);
  if (!entry?.durationTicks) return 0;
  const pct = (entry.positionTicks / entry.durationTicks) * 100;
  return pct < MAX_RESUME_PCT ? pct : 0;
}

function percent(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

function qualityLabel(variant: string) {
  const bitrate = parseVariant(variant).maxBitrate;
  return QUALITIES.find((q) => q.maxBitrate === bitrate)?.label ?? "Originale";
}

function episodeCode(d: DownloadMeta) {
  return d.info?.season != null && d.info?.episode != null ? `S${d.info.season}É${d.info.episode}` : "";
}

function details(d: DownloadMeta) {
  return [d.size ? formatSize(d.size) : "", d.info?.audio ?? "", d.subtitles?.length ? `${d.subtitles.length} sous-titre(s)` : ""]
    .filter(Boolean)
    .join(" · ");
}

async function act(action: () => unknown) {
  error.value = "";
  try {
    await action();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function removeSeries(episodes: DownloadMeta[]) {
  for (const episode of episodes) await downloads.remove(episode);
}

const STATE_LABEL: Record<string, string> = {
  queued: "En attente",
  downloading: "Téléchargement",
  assembling: "Finalisation",
  failed: "Échec",
  paused: "En pause",
};
</script>

<template>
  <div class="min-h-screen">
    <AppHeader />

    <main class="mx-auto max-w-5xl px-6 pb-16 pt-28 sm:px-12">
      <div class="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold">Téléchargements</h1>
          <p v-if="downloads.usage" class="mt-1 text-sm text-zinc-400">
            {{ formatSize(downloads.usage.used) }} utilisés · {{ formatSize(downloads.usage.free) }} libres
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <label class="flex items-center gap-3 text-sm text-zinc-400">
            Qualité
            <select v-model="downloads.quality" class="field py-1.5">
              <option v-for="(q, i) in QUALITIES" :key="q.label" :value="i">{{ q.label }}</option>
            </select>
          </label>
          <label class="flex items-center gap-2 text-sm text-zinc-400" title="Libère de la place : un épisode est supprimé dès que tu l'as regardé jusqu'au générique. Les films sont conservés.">
            <input v-model="downloads.autoDelete" type="checkbox" class="size-4 accent-accent" />
            Supprimer les épisodes vus
          </label>
        </div>
      </div>

      <p v-if="error" role="alert" class="mb-6 rounded bg-zinc-800 px-4 py-3 text-sm text-amber-300">{{ error }}</p>
      <p v-if="connectivity.offline" role="status" class="mb-6 rounded bg-zinc-800 px-4 py-3 text-sm text-zinc-300">
        Serveur injoignable : tes téléchargements restent lisibles. La file d'attente et la synchronisation reprendront
        au retour du réseau.
      </p>

      <!-- File d'attente -->
      <section v-if="downloads.queue.length" class="mb-12">
        <h2 class="mb-4 text-lg font-semibold text-zinc-300">File d'attente</h2>
        <ol class="flex flex-col gap-3">
          <li v-for="(entry, i) in downloads.queue" :key="entry.itemId" class="flex gap-5 rounded bg-surface-raised p-4">
            <DownloadThumb :name="entry.name" :local-path="localImage(entry.itemId)" :remote-url="entry.imageUrl">
              <span class="absolute inset-0 grid place-items-center bg-black/50">
                <DownloadIcon :status="downloads.statusOf(entry.itemId)" :progress="downloads.progressOf(entry.itemId)" />
              </span>
            </DownloadThumb>

            <div class="flex min-w-0 flex-1 flex-col justify-center gap-3">
              <div class="flex items-center justify-between gap-4">
                <span class="truncate font-semibold">{{ entry.name }}</span>
                <span class="shrink-0 text-sm text-zinc-400">
                  {{ STATE_LABEL[downloads.statusOf(entry.itemId) ?? "queued"] }}
                  <template v-if="downloads.active[entry.itemId]?.total">
                    · {{ percent(downloads.active[entry.itemId]!.done, downloads.active[entry.itemId]!.total) }} %
                    · {{ formatSize(downloads.active[entry.itemId]!.bytes) }}
                  </template>
                </span>
              </div>
              <div class="h-1 overflow-hidden rounded-full bg-zinc-700">
                <div
                  class="h-full transition-all"
                  :class="entry.paused ? 'bg-zinc-400' : 'bg-accent'"
                  :style="{ width: `${(downloads.progressOf(entry.itemId) ?? 0) * 100}%` }"
                />
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <p v-if="entry.error" class="text-sm text-amber-400">{{ entry.error }}</p>
                <p v-else-if="downloads.current === entry.itemId && downloads.active[entry.itemId]?.state === 'downloading'" class="text-sm text-zinc-400">
                  <template v-if="downloads.active[entry.itemId]!.eta !== null">
                    Environ <span class="font-semibold text-white">{{ formatRemaining(downloads.active[entry.itemId]!.eta!) }}</span> restantes
                  </template>
                  <template v-else>Calcul du temps restant…</template>
                  <template v-if="downloads.active[entry.itemId]!.speed"> · {{ formatSpeed(downloads.active[entry.itemId]!.speed!) }}</template>
                </p>
                <p v-else-if="downloads.current === entry.itemId" class="text-sm text-zinc-400">Préparation du flux…</p>

                <span class="ml-auto" />
                <button class="btn-ghost px-2" :disabled="i === 0" aria-label="Monter dans la file" title="Plus tôt" @click="downloads.move(entry.itemId, -1)">↑</button>
                <button class="btn-ghost px-2" :disabled="i === downloads.queue.length - 1" aria-label="Descendre dans la file" title="Plus tard" @click="downloads.move(entry.itemId, 1)">↓</button>
                <button v-if="entry.paused || entry.error" class="btn-play py-1.5" @click="downloads.resumeEntry(entry.itemId)">
                  {{ entry.error ? "Réessayer" : "Reprendre" }}
                </button>
                <button v-else class="btn-ghost" @click="act(() => downloads.pause(entry.itemId))">Pause</button>
                <button class="btn-ghost" @click="act(() => downloads.dequeue(entry.itemId))">Retirer</button>
              </div>
            </div>
          </li>
        </ol>
      </section>

      <!-- Bibliothèque hors ligne -->
      <section class="mb-12">
        <h2 class="mb-4 text-lg font-semibold text-zinc-300">Disponibles hors ligne</h2>
        <p v-if="!completed.length" class="text-zinc-500">
          Aucun téléchargement terminé. Utilise le bouton Télécharger sur un film, un épisode ou une saison.
        </p>

        <ul class="flex flex-col gap-1">
          <!-- Séries -->
          <li v-for="group in library.series" :key="group.seriesId">
            <button class="group flex w-full items-center gap-5 rounded p-2 text-left transition hover:bg-surface-raised" :aria-expanded="open.has(group.seriesId)" @click="toggle(group.seriesId)">
              <DownloadThumb :name="group.seriesName" :local-path="group.episodes[0]?.image" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-lg">{{ group.seriesName }}</span>
                <span class="text-sm text-zinc-500">{{ group.episodes.length }} épisode(s)<template v-if="group.size"> · {{ formatSize(group.size) }}</template></span>
              </span>
              <span class="text-2xl text-zinc-400 transition" :class="open.has(group.seriesId) && 'rotate-90'" aria-hidden="true">›</span>
            </button>
            <ul v-if="open.has(group.seriesId)" class="mb-3 ml-8 flex flex-col gap-1 border-l border-white/10 pl-4">
              <li v-for="d in group.episodes" :key="d.itemId" class="group/ep flex items-center gap-4 rounded p-2 transition hover:bg-surface-raised">
                <NuxtLink :to="`/play/${d.itemId}?offline=1`" class="relative" :aria-label="`Lire ${d.name}`">
                  <DownloadThumb :name="d.name" :local-path="d.image" class="!w-32">
                    <span v-if="watched(d.itemId) > 0" class="absolute inset-x-0 bottom-0 h-1 bg-zinc-600/80">
                      <span class="block h-full bg-accent" :style="{ width: `${watched(d.itemId)}%` }" />
                    </span>
                  </DownloadThumb>
                </NuxtLink>
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{{ episodeCode(d) }} · {{ d.name.split(" · ").pop() }}</span>
                  <span class="text-xs text-zinc-500">{{ details(d) }}</span>
                </span>
                <NuxtLink :to="`/play/${d.itemId}?offline=1`" class="btn-play py-1.5">Lecture</NuxtLink>
                <button class="btn-ghost" @click="act(() => downloads.remove(d))">Supprimer</button>
              </li>
              <li class="p-2">
                <button class="text-sm text-zinc-400 hover:text-white" @click="act(() => removeSeries(group.episodes))">
                  Supprimer les {{ group.episodes.length }} épisodes
                </button>
              </li>
            </ul>
          </li>

          <!-- Films -->
          <li v-for="d in library.movies" :key="d.itemId" class="group flex items-center gap-5 rounded p-2 transition hover:bg-surface-raised">
            <NuxtLink :to="`/play/${d.itemId}?offline=1`" class="relative" :aria-label="`Lire ${d.name}`">
              <DownloadThumb :name="d.name" :local-path="d.image">
                <span class="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <span class="grid size-10 place-items-center rounded-full border-2 border-white bg-black/50">
                    <svg viewBox="0 0 24 24" class="size-4 fill-white" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
                  </span>
                </span>
                <span v-if="watched(d.itemId) > 0" class="absolute inset-x-0 bottom-0 h-1 bg-zinc-600/80">
                  <span class="block h-full bg-accent" :style="{ width: `${watched(d.itemId)}%` }" />
                </span>
              </DownloadThumb>
            </NuxtLink>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-lg">{{ d.name }}</span>
              <span class="text-sm text-zinc-500">{{ details(d) }}</span>
            </span>
            <div class="flex shrink-0 gap-2">
              <NuxtLink :to="`/play/${d.itemId}?offline=1`" class="btn-play py-1.5">Lecture</NuxtLink>
              <button class="btn-ghost" @click="act(() => downloads.remove(d))">Supprimer</button>
            </div>
          </li>
        </ul>
      </section>

      <!-- Interrompus -->
      <section v-if="partial.length">
        <h2 class="mb-2 text-lg font-semibold text-zinc-300">Interrompus</h2>
        <p class="mb-4 text-sm text-zinc-500">La reprise repart des segments déjà reçus, avec les mêmes réglages.</p>
        <ul class="flex flex-col gap-3">
          <li v-for="d in partial" :key="d.itemId" class="flex items-center gap-5 rounded p-2 transition hover:bg-surface-raised">
            <DownloadThumb :name="d.name" :local-path="d.image" class="opacity-70" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-lg">{{ d.name }}</p>
              <p class="text-sm text-zinc-500">Qualité : {{ qualityLabel(d.variant) }}</p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button class="btn-play py-1.5" @click="act(() => downloads.resume(d))">Reprendre</button>
              <button class="btn-ghost" @click="act(() => downloads.remove(d))">Supprimer</button>
            </div>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>
