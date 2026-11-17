<script setup lang="ts">
// Fond plein écran façon Netflix : mosaïque d'affiches générée par le serveur
// (/Branding/Splashscreen), assombrie par des dégradés. Repli sur un dégradé seul.
const props = defineProps<{ serverUrl?: string }>();

const loaded = ref(false);
const failed = ref(false);
const src = computed(() =>
  props.serverUrl ? `${props.serverUrl}/Branding/Splashscreen?format=Jpg` : undefined,
);

watch(src, () => {
  loaded.value = false;
  failed.value = false;
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-black">
    <img
      v-if="src && !failed"
      :src="src"
      alt=""
      aria-hidden="true"
      class="absolute inset-0 h-full w-full scale-105 object-cover transition-opacity duration-700"
      :class="loaded ? 'opacity-60' : 'opacity-0'"
      @load="loaded = true"
      @error="failed = true"
    />
    <div class="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/70" />
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]" />

    <header class="relative z-10 px-8 py-6 sm:px-12">
      <AppLogo size="lg" />
    </header>

    <div class="relative z-10 flex min-h-[calc(100vh-96px)] items-center justify-center px-4 pb-16">
      <slot />
    </div>
  </div>
</template>
