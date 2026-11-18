<script setup lang="ts">
// Écran affiché au lancement pendant la vérification et l'installation d'une mise à jour.
import { formatSize } from "~/utils/downloads";

const { phase, version, received, total } = useUpdater();
const percent = computed(() => (total.value ? Math.min(100, Math.round((received.value / total.value) * 100)) : null));
</script>

<template>
  <main class="fixed inset-0 grid place-items-center bg-surface">
    <div class="flex w-80 flex-col items-center gap-6 text-center" role="status" aria-live="polite">
      <AppLogo />
      <template v-if="phase === 'checking'">
        <span class="size-8 animate-spin rounded-full border-4 border-white/15 border-t-accent" aria-hidden="true" />
      </template>
      <template v-else>
        <p class="text-lg font-semibold">Mise à jour vers Vellyfin {{ version }}</p>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
          <div
            class="h-full bg-accent transition-all"
            :class="phase === 'installing' || percent === null ? 'w-full animate-pulse' : ''"
            :style="phase === 'downloading' && percent !== null ? { width: `${percent}%` } : undefined"
          />
        </div>
        <p class="text-sm text-zinc-400">
          <template v-if="phase === 'installing'">Installation… l'app va redémarrer.</template>
          <template v-else-if="percent !== null">{{ percent }} % · {{ formatSize(received) }} sur {{ formatSize(total!) }}</template>
          <template v-else>Téléchargement…</template>
        </p>
      </template>
    </div>
  </main>
</template>
