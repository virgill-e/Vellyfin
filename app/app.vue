<script setup lang="ts">
// Au lancement : mise à jour obligatoire si une version plus récente est publiée,
// puis l'app (et l'envoi des positions de lecture enregistrées hors ligne).
const { phase } = useUpdater();
const ready = computed(() => phase.value === "ready");
const connectivity = useConnectivityStore();
const session = useSessionStore();

watch(ready, (value) => value && useProgressStore().startSync(), { immediate: true });

// Retour du réseau : session encore valide ? Puis positions de lecture et file de téléchargement.
watch(
  () => connectivity.status,
  async (now, before) => {
    if (now !== "online" || before !== "offline" || !session.session) return;
    if ((await session.verify()) === "expired") {
      await navigateTo({ path: "/login", query: { expired: "1" } }, { replace: true });
      return;
    }
    void useProgressStore().flush();
    useDownloadsStore().retryFailed();
  },
);
</script>

<template>
  <template v-if="ready">
    <NuxtPage />
    <DownloadDialog />
  </template>
  <UpdateGate v-else />
</template>
