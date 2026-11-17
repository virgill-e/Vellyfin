<script setup lang="ts">
// Téléchargements : progression en cours et fichiers lisibles hors ligne,
// avec vignettes enregistrées localement (visibles sans réseau).
import { QUALITIES, bitrateOfVariant } from "~/utils/quality";
import { formatRemaining, formatSpeed } from "~/utils/eta";

const downloads = useDownloadsStore();

onMounted(() => downloads.init());

const inProgress = computed(() =>
  Object.values(downloads.active).filter((d) => !["completed", "cancelled"].includes(d.state)),
);
const completed = computed(() => downloads.saved.filter((d) => d.state === "completed"));
// Interrompus : enregistrés mais ni terminés ni affichés dans « En cours » (annulés compris).
const SHOWN_IN_PROGRESS = new Set(["queued", "downloading", "assembling", "failed"]);
const partial = computed(() =>
  downloads.saved.filter(
    (d) => d.state !== "completed" && !SHOWN_IN_PROGRESS.has(downloads.active[d.itemId]?.state ?? ""),
  ),
);

const error = ref("");
const resuming = ref<string | null>(null);

async function resume(itemId: string) {
  const meta = downloads.saved.find((d) => d.itemId === itemId);
  if (!meta) return;
  error.value = "";
  resuming.value = itemId;
  try {
    await downloads.resume(meta);
  } catch (e) {
    error.value = `Reprise impossible : ${e instanceof Error ? e.message : e}`;
  } finally {
    resuming.value = null;
  }
}

function qualityLabel(variant: string) {
  const bitrate = bitrateOfVariant(variant);
  return QUALITIES.find((q) => q.maxBitrate === bitrate)?.label ?? "Originale";
}

function localImage(itemId: string) {
  return downloads.saved.find((d) => d.itemId === itemId)?.image ?? null;
}

function percent(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

function size(bytes: number) {
  return bytes > 1e9 ? `${(bytes / 1e9).toFixed(2)} Go` : `${Math.round(bytes / 1e6)} Mo`;
}

const STATE_LABEL: Record<string, string> = {
  queued: "En attente",
  downloading: "Téléchargement",
  assembling: "Finalisation",
  failed: "Échec",
  cancelled: "Annulé",
};
</script>

<template>
  <div class="min-h-screen">
    <AppHeader />

    <main class="mx-auto max-w-5xl px-6 pb-16 pt-28 sm:px-12">
      <div class="mb-10 flex flex-wrap items-end justify-between gap-4">
        <h1 class="text-3xl font-bold">Téléchargements</h1>
        <label class="flex items-center gap-3 text-sm text-zinc-400">
          Qualité
          <select v-model="downloads.quality" class="field py-1.5">
            <option v-for="(q, i) in QUALITIES" :key="q.label" :value="i">{{ q.label }}</option>
          </select>
        </label>
      </div>

      <p v-if="error" role="alert" class="mb-6 rounded bg-zinc-800 px-4 py-3 text-sm text-amber-300">{{ error }}</p>

      <section v-if="inProgress.length" class="mb-12">
        <h2 class="mb-4 text-lg font-semibold text-zinc-300">En cours</h2>
        <ul class="flex flex-col gap-3">
          <li v-for="d in inProgress" :key="d.itemId" class="flex gap-5 rounded bg-surface-raised p-4">
            <DownloadThumb :name="d.name" :local-path="localImage(d.itemId)" :remote-url="d.imageUrl">
              <span class="absolute inset-0 grid place-items-center bg-black/50">
                <DownloadIcon :status="d.state" :progress="d.total ? d.done / d.total : 0" />
              </span>
            </DownloadThumb>

            <div class="flex min-w-0 flex-1 flex-col justify-center gap-3">
              <div class="flex items-center justify-between gap-4">
                <span class="truncate font-semibold">{{ d.name }}</span>
                <span class="shrink-0 text-sm text-zinc-400">
                  {{ STATE_LABEL[d.state] }}
                  <template v-if="d.total"> · {{ percent(d.done, d.total) }} % · {{ size(d.bytes) }}</template>
                </span>
              </div>
              <div class="h-1 overflow-hidden rounded-full bg-zinc-700">
                <div class="h-full bg-accent transition-all" :style="{ width: `${percent(d.done, d.total)}%` }" />
              </div>
              <div class="flex items-center gap-4">
                <p v-if="d.error" class="text-sm text-amber-400">{{ d.error }}</p>
                <p v-else-if="d.state === 'downloading'" class="text-sm text-zinc-400">
                  <template v-if="d.eta !== null">
                    Environ <span class="font-semibold text-white">{{ formatRemaining(d.eta) }}</span> restantes
                  </template>
                  <template v-else>Calcul du temps restant…</template>
                  <template v-if="d.speed"> · {{ formatSpeed(d.speed) }}</template>
                </p>
                <p v-else-if="d.state === 'queued'" class="text-sm text-zinc-400">En attente du serveur…</p>
                <button
                  v-if="d.state === 'queued' || d.state === 'downloading'"
                  class="btn-ghost ml-auto"
                  @click="downloads.cancel(d.itemId)"
                >
                  Annuler
                </button>
                <button
                  v-else-if="d.state === 'failed' && downloads.saved.some((m) => m.itemId === d.itemId)"
                  class="btn-play ml-auto py-1.5"
                  :disabled="resuming === d.itemId"
                  @click="resume(d.itemId)"
                >
                  Réessayer
                </button>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section class="mb-12">
        <h2 class="mb-4 text-lg font-semibold text-zinc-300">Disponibles hors ligne</h2>
        <p v-if="!completed.length" class="text-zinc-500">
          Aucun téléchargement terminé. Utilise le bouton Télécharger sur un film ou un épisode.
        </p>
        <ul class="flex flex-col gap-3">
          <li v-for="d in completed" :key="d.itemId" class="group flex items-center gap-5 rounded p-2 transition hover:bg-surface-raised">
            <NuxtLink :to="`/play/${d.itemId}?offline=1`" class="relative" :aria-label="`Lire ${d.name}`">
              <DownloadThumb :name="d.name" :local-path="d.image">
                <span class="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                  <span class="grid size-10 place-items-center rounded-full border-2 border-white bg-black/50">
                    <svg viewBox="0 0 24 24" class="size-4 fill-white" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
                  </span>
                </span>
              </DownloadThumb>
            </NuxtLink>
            <span class="min-w-0 flex-1 truncate text-lg">{{ d.name }}</span>
            <div class="flex shrink-0 gap-2">
              <NuxtLink :to="`/play/${d.itemId}?offline=1`" class="btn-play py-1.5">Lecture</NuxtLink>
              <button class="btn-ghost" @click="downloads.remove(d)">Supprimer</button>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="partial.length">
        <h2 class="mb-2 text-lg font-semibold text-zinc-300">Interrompus</h2>
        <p class="mb-4 text-sm text-zinc-500">La reprise repart des segments déjà reçus, à la même qualité.</p>
        <ul class="flex flex-col gap-3">
          <li v-for="d in partial" :key="d.itemId" class="flex items-center gap-5 rounded p-2 transition hover:bg-surface-raised">
            <DownloadThumb :name="d.name" :local-path="d.image" class="opacity-70" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-lg">{{ d.name }}</p>
              <p class="text-sm text-zinc-500">Qualité : {{ qualityLabel(d.variant) }}</p>
            </div>
            <div class="flex shrink-0 gap-2">
              <button class="btn-play py-1.5" :disabled="resuming === d.itemId" @click="resume(d.itemId)">
                <svg viewBox="0 0 24 24" class="size-4 fill-none stroke-current stroke-[2.5]" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                {{ resuming === d.itemId ? "Reprise…" : "Reprendre" }}
              </button>
              <button class="btn-ghost" @click="downloads.remove(d)">Supprimer</button>
            </div>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>
