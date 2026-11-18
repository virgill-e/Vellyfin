<script setup lang="ts">
// Envoie au serveur les positions de lecture enregistrées hors ligne.
onMounted(() => useProgressStore().startSync());
</script>

<template>
  <NuxtPage />
  <UpdateBanner />
</template>
