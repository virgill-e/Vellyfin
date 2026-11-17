<script setup lang="ts">
// Rangée « Mes médiathèques » : vignettes des bibliothèques du serveur.
import { libraryImageUrl } from "~/utils/images";

const session = useSessionStore();
const libraries = useLibrariesStore();

function image(view: (typeof libraries.items)[number]) {
  return session.api ? libraryImageUrl(session.api.basePath, view) : undefined;
}
</script>

<template>
  <section v-if="libraries.items.length">
    <h2 class="mb-2 px-6 text-lg font-semibold text-zinc-100 sm:px-12 md:text-xl">Mes médiathèques</h2>
    <div class="row-scroll flex gap-3 overflow-x-auto px-6 py-2 sm:px-12">
      <NuxtLink
        v-for="view in libraries.items"
        :key="view.Id"
        :to="`/library/${view.Id}`"
        class="group relative aspect-video w-72 shrink-0 overflow-hidden rounded bg-surface-raised ring-white/80 transition hover:ring-2 md:w-80"
      >
        <img
          v-if="image(view)"
          :src="image(view)"
          :alt="view.Name ?? ''"
          loading="lazy"
          class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <span class="absolute bottom-3 left-4 text-xl font-bold drop-shadow">{{ view.Name }}</span>
      </NuxtLink>
    </div>
  </section>
</template>
