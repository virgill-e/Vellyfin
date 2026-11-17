<script setup lang="ts">
// Logo Vellyfin et signature, communs à la navigation et aux écrans de connexion.
withDefaults(defineProps<{ size?: "md" | "lg" }>(), { size: "md" });
</script>

<template>
  <span class="inline-flex flex-col items-start leading-none">
    <span
      class="font-black uppercase tracking-tight text-accent drop-shadow"
      :class="size === 'lg' ? 'text-3xl' : 'text-2xl'"
    >
      Vellyfin
    </span>
    <span
      class="mt-0.5 self-end font-medium tracking-wide text-white drop-shadow"
      :class="size === 'lg' ? 'text-xs' : 'text-[10px]'"
    >
      by Virgill_e
    </span>
  </span>
</template>
