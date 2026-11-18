<script setup lang="ts">
// Barre de navigation fixe : transparente en haut de page, noire après défilement.
const session = useSessionStore();
const libraries = useLibrariesStore();
const connectivity = useConnectivityStore();
const scrolled = ref(false);
/** Affiché quelques secondes au retour du réseau. */
const backOnline = ref(false);
let backOnlineTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => connectivity.status,
  (now, before) => {
    if (now === "online" && before === "offline") {
      backOnline.value = true;
      libraries.load();
      if (backOnlineTimer) clearTimeout(backOnlineTimer);
      backOnlineTimer = setTimeout(() => (backOnline.value = false), 10_000);
    }
  },
);

function onScroll() {
  scrolled.value = window.scrollY > 10;
}
onMounted(() => {
  window.addEventListener("scroll", onScroll, { passive: true });
  libraries.load();
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  if (backOnlineTimer) clearTimeout(backOnlineTimer);
});

async function logout() {
  await session.logout();
  libraries.reset();
  await navigateTo("/login", { replace: true });
}
</script>

<template>
  <header
    class="fixed inset-x-0 top-0 z-30 flex items-center gap-8 px-6 py-4 transition-colors duration-300 sm:px-12"
    :class="scrolled ? 'bg-surface' : 'bg-gradient-to-b from-black/80 to-transparent'"
  >
    <NuxtLink to="/" aria-label="Vellyfin, accueil"><AppLogo /></NuxtLink>
    <nav class="flex items-center gap-5 text-sm">
      <template v-if="!connectivity.offline">
        <NuxtLink to="/" class="text-zinc-300 transition hover:text-zinc-400" exact-active-class="!font-semibold !text-white">
          Accueil
        </NuxtLink>
        <NuxtLink
          v-for="library in libraries.items"
          :key="library.Id"
          :to="`/library/${library.Id}`"
          class="text-zinc-300 transition hover:text-zinc-400"
          active-class="!font-semibold !text-white"
        >
          {{ library.Name }}
        </NuxtLink>
      </template>
      <NuxtLink to="/downloads" class="text-zinc-300 transition hover:text-zinc-400" active-class="!font-semibold !text-white">
        Téléchargements
      </NuxtLink>
    </nav>
    <div v-if="session.session" class="ml-auto flex items-center gap-4 text-sm">
      <span
        v-if="connectivity.offline"
        class="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1 text-zinc-200"
        role="status"
        title="Serveur injoignable : tes téléchargements restent disponibles. Nouvel essai toutes les 15 s."
      >
        <span class="size-2 rounded-full bg-amber-400" aria-hidden="true" />
        Hors ligne
      </span>
      <NuxtLink
        v-else-if="backOnline"
        to="/"
        class="flex items-center gap-2 rounded-full bg-zinc-800 px-3 py-1 text-zinc-200 hover:bg-zinc-700"
        role="status"
      >
        <span class="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
        De nouveau en ligne · Accueil
      </NuxtLink>
      <SearchBox v-if="!connectivity.offline" />
      <span class="grid size-8 place-items-center rounded bg-accent font-semibold" :title="session.session.userName">
        {{ session.session.userName[0]?.toUpperCase() }}
      </span>
      <button class="text-zinc-300 transition hover:text-white" @click="logout">Se déconnecter</button>
    </div>
  </header>
</template>
