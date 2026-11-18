<script setup lang="ts">
// Barre de navigation fixe : transparente en haut de page, noire après défilement.
const session = useSessionStore();
const libraries = useLibrariesStore();
const scrolled = ref(false);

function onScroll() {
  scrolled.value = window.scrollY > 10;
}
onMounted(() => {
  window.addEventListener("scroll", onScroll, { passive: true });
  libraries.load();
});
onBeforeUnmount(() => window.removeEventListener("scroll", onScroll));

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
      <NuxtLink to="/downloads" class="text-zinc-300 transition hover:text-zinc-400" active-class="!font-semibold !text-white">
        Téléchargements
      </NuxtLink>
    </nav>
    <div v-if="session.session" class="ml-auto flex items-center gap-4 text-sm">
      <SearchBox />
      <span class="grid size-8 place-items-center rounded bg-accent font-semibold" :title="session.session.userName">
        {{ session.session.userName[0]?.toUpperCase() }}
      </span>
      <button class="text-zinc-300 transition hover:text-white" @click="logout">Se déconnecter</button>
    </div>
  </header>
</template>
