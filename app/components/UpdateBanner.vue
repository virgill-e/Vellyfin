<script setup lang="ts">
// Notification discrète quand une mise à jour est téléchargée et prête à installer.
const { ready, installing, error, installAndRestart, dismiss } = useUpdater();
const downloads = useDownloadsStore();
const route = useRoute();

const downloading = computed(() =>
  Object.values(downloads.active).some((d) => ["queued", "downloading", "assembling"].includes(d.state)),
);
// Pas par-dessus le lecteur.
const visible = computed(() => ready.value && !route.path.startsWith("/play"));
</script>

<template>
  <aside
    v-if="visible"
    role="status"
    class="fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-3 rounded bg-surface-raised p-4 shadow-2xl ring-1 ring-white/10"
  >
    <p class="font-semibold">Vellyfin {{ ready!.version }} est prêt</p>
    <p class="text-sm text-zinc-400">
      Redémarre l'app pour installer la mise à jour.
      <template v-if="downloading"> Le téléchargement en cours sera interrompu (reprise possible ensuite).</template>
    </p>
    <p v-if="error" class="text-sm text-amber-400">{{ error }}</p>
    <div class="flex justify-end gap-2">
      <button class="btn-ghost" :disabled="installing" @click="dismiss">Plus tard</button>
      <button class="btn-play py-1.5" :disabled="installing" @click="installAndRestart">
        {{ installing ? "Installation…" : "Redémarrer" }}
      </button>
    </div>
  </aside>
</template>
