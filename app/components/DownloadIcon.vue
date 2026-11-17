<script setup lang="ts">
defineProps<{ status: string | null }>();
</script>

<template>
  <svg v-if="status === 'completed'" viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-[2.5]" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
  <svg v-else viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2" aria-hidden="true">
    <path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" />
  </svg>
</template>
