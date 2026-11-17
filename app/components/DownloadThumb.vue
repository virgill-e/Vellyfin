<script setup lang="ts">
// Vignette 16:9 d'un téléchargement : fichier local s'il existe (hors ligne),
// sinon image du serveur, sinon initiale du titre.
import { convertFileSrc } from "@tauri-apps/api/core";

const props = defineProps<{ name: string; localPath?: string | null; remoteUrl?: string }>();

const failed = ref(false);
const src = computed(() => {
  if (props.localPath) return convertFileSrc(props.localPath);
  return props.remoteUrl;
});
watch(src, () => (failed.value = false));
</script>

<template>
  <div class="relative aspect-video w-36 shrink-0 overflow-hidden rounded bg-surface-raised md:w-44">
    <img v-if="src && !failed" :src="src" alt="" class="h-full w-full object-cover" @error="failed = true" />
    <span v-else class="absolute inset-0 grid place-items-center text-2xl font-bold text-zinc-600">
      {{ name[0]?.toUpperCase() }}
    </span>
    <slot />
  </div>
</template>
