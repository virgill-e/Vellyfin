<script setup lang="ts">
// Au lancement : mise à jour obligatoire si une version plus récente est publiée,
// puis l'app (et l'envoi des positions de lecture enregistrées hors ligne).
const { phase } = useUpdater();
const ready = computed(() => phase.value === "ready");

watch(ready, (value) => value && useProgressStore().startSync(), { immediate: true });
</script>

<template>
  <template v-if="ready">
    <NuxtPage />
    <DownloadDialog />
  </template>
  <UpdateGate v-else />
</template>
