<script setup lang="ts">
// Icône d'état d'un téléchargement :
// flèche (rien) · anneau qui tourne (en attente, finalisation) · anneau de progression
// (téléchargement) · anneau gris et pause (en pause) · coche (terminé) · point d'exclamation (échec).
const props = defineProps<{ status: string | null; progress?: number | null }>();

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const offset = computed(() => CIRCUMFERENCE * (1 - Math.min(Math.max(props.progress ?? 0, 0), 1)));
</script>

<template>
  <svg v-if="status === 'completed'" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-[2.5]" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>

  <svg v-else-if="status === 'failed'" viewBox="0 0 24 24" class="size-5 fill-none stroke-amber-400 stroke-[2.5]" aria-hidden="true">
    <path d="M12 6v8M12 17.5v.5" />
  </svg>

  <svg
    v-else-if="status === 'queued' || status === 'assembling'"
    viewBox="0 0 24 24"
    class="size-6 animate-spin fill-none stroke-current stroke-2 motion-reduce:animate-none"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" :r="RADIUS" class="stroke-white/25" />
    <path d="M12 3a9 9 0 0 1 9 9" stroke-linecap="round" />
  </svg>

  <svg v-else-if="status === 'paused'" viewBox="0 0 24 24" class="size-6 -rotate-90 fill-none stroke-2" aria-hidden="true">
    <circle cx="12" cy="12" :r="RADIUS" class="stroke-white/25" />
    <circle
      cx="12"
      cy="12"
      :r="RADIUS"
      class="stroke-zinc-400"
      stroke-linecap="round"
      :stroke-dasharray="CIRCUMFERENCE"
      :stroke-dashoffset="offset"
    />
    <path d="M10 9v6M14 9v6" class="rotate-90 stroke-current" style="transform-origin: 12px 12px" stroke-linecap="round" />
  </svg>

  <svg v-else-if="status === 'downloading'" viewBox="0 0 24 24" class="size-6 -rotate-90 fill-none stroke-2" aria-hidden="true">
    <circle cx="12" cy="12" :r="RADIUS" class="stroke-white/25" />
    <circle
      cx="12"
      cy="12"
      :r="RADIUS"
      class="stroke-accent transition-[stroke-dashoffset] duration-500"
      stroke-linecap="round"
      :stroke-dasharray="CIRCUMFERENCE"
      :stroke-dashoffset="offset"
    />
  </svg>

  <svg v-else viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2" aria-hidden="true">
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
  </svg>
</template>
