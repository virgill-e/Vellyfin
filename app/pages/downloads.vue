<script setup lang="ts">
// Téléchargements : progression en cours et fichiers lisibles hors ligne.
import { QUALITIES } from "~/stores/downloads";

const downloads = useDownloadsStore();

onMounted(() => downloads.init());

const inProgress = computed(() =>
  Object.values(downloads.active).filter((d) => !["completed", "cancelled"].includes(d.state)),
);
const completed = computed(() => downloads.saved.filter((d) => d.state === "completed"));
const partial = computed(() =>
  downloads.saved.filter((d) => d.state !== "completed" && !downloads.active[d.itemId]),
);

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

      <section v-if="inProgress.length" class="mb-12">
        <h2 class="mb-4 text-lg font-semibold text-zinc-300">En cours</h2>
        <ul class="flex flex-col gap-3">
          <li v-for="d in inProgress" :key="d.itemId" class="rounded bg-surface-raised p-5">
            <div class="mb-3 flex items-center justify-between gap-4">
              <span class="truncate font-semibold">{{ d.name }}</span>
              <span class="shrink-0 text-sm text-zinc-400">
                {{ STATE_LABEL[d.state] }}
                <template v-if="d.total"> · {{ percent(d.done, d.total) }} % · {{ size(d.bytes) }}</template>
              </span>
            </div>
            <div class="h-1 overflow-hidden rounded-full bg-zinc-700">
              <div class="h-full bg-accent transition-all" :style="{ width: `${percent(d.done, d.total)}%` }" />
            </div>
            <p v-if="d.error" class="mt-3 text-sm text-amber-400">{{ d.error }}</p>
            <button
              v-if="d.state === 'queued' || d.state === 'downloading'"
              class="btn-ghost mt-4"
              @click="downloads.cancel(d.itemId)"
            >
              Annuler
            </button>
          </li>
        </ul>
      </section>

      <section class="mb-12">
        <h2 class="mb-4 text-lg font-semibold text-zinc-300">Disponibles hors ligne</h2>
        <p v-if="!completed.length" class="text-zinc-500">
          Aucun téléchargement terminé. Utilise le bouton Télécharger sur un film.
        </p>
        <ul class="flex flex-col divide-y divide-white/10">
          <li v-for="d in completed" :key="d.itemId" class="flex items-center justify-between gap-4 py-4">
            <span class="truncate text-lg">{{ d.name }}</span>
            <div class="flex shrink-0 gap-2">
              <NuxtLink :to="`/play/${d.itemId}?offline=1`" class="btn-play py-1.5">Lecture</NuxtLink>
              <button class="btn-ghost" @click="downloads.remove(d)">Supprimer</button>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="partial.length">
        <h2 class="mb-2 text-lg font-semibold text-zinc-300">Interrompus</h2>
        <p class="mb-4 text-sm text-zinc-500">
          Relance le téléchargement depuis l'accueil (même qualité) : il reprend aux segments déjà reçus.
        </p>
        <ul class="flex flex-col divide-y divide-white/10">
          <li v-for="d in partial" :key="d.itemId" class="flex items-center justify-between gap-4 py-4">
            <span class="truncate">{{ d.name }}</span>
            <button class="btn-ghost" @click="downloads.remove(d)">Supprimer</button>
          </li>
        </ul>
      </section>
    </main>
  </div>
</template>
