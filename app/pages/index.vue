<script setup lang="ts">
// Accueil façon Netflix : bannière + rangées horizontales.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api/show-api";

const session = useSessionStore();
const downloads = useDownloadsStore();
const progress = useProgressStore();

const libraries = useLibrariesStore();
const resume = ref<BaseItemDto[]>([]);
const nextUp = ref<BaseItemDto[]>([]);
const movies = ref<BaseItemDto[]>([]);
const shows = ref<BaseItemDto[]>([]);
const error = ref("");
const loading = ref(true);

// Carrousel : les 6 derniers films ajoutés qui ont une image de fond.
const heroes = computed(() => movies.value.filter((m) => m.BackdropImageTags?.length).slice(0, 6));

onMounted(async () => {
  // Positions vues hors ligne envoyées d'abord : « Reprendre » est alors à jour.
  await Promise.all([downloads.init(), libraries.load(), progress.flush()]);
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId) return;

  const library = getLibraryApi(api);
  try {
    const [resumeRes, nextUpRes, moviesRes, showsRes] = await Promise.all([
      library.getItems({
        userId,
        includeItemTypes: ["Movie", "Episode"],
        filters: ["IsResumable"],
        recursive: true,
        sortBy: ["DatePlayed"],
        sortOrder: ["Descending"],
        limit: 20,
      }),
      // Épisode suivant des séries commencées (les épisodes entamés sont déjà dans « Reprendre »).
      getShowApi(api).getNextUp({ userId, limit: 20, enableResumable: false, enableTotalRecordCount: false }),
      library.getItems({
        userId,
        includeItemTypes: ["Movie"],
        recursive: true,
        sortBy: ["DateCreated"],
        sortOrder: ["Descending"],
        fields: ["Overview"],
        limit: 30,
      }),
      library.getItems({
        userId,
        includeItemTypes: ["Series"],
        recursive: true,
        sortBy: ["DateLastContentAdded"],
        sortOrder: ["Descending"],
        limit: 30,
      }),
    ]);
    resume.value = resumeRes.data.Items ?? [];
    nextUp.value = nextUpRes.data.Items ?? [];
    movies.value = moviesRes.data.Items ?? [];
    shows.value = showsRes.data.Items ?? [];
  } catch {
    error.value = "Impossible de joindre le serveur. Tes téléchargements restent disponibles.";
  } finally {
    loading.value = false;
  }
});

function showError(message: string) {
  error.value = message;
}
</script>

<template>
  <div class="min-h-screen pb-16">
    <AppHeader />

    <HeroBanner v-if="heroes.length" :items="heroes" @error="showError" />
    <div v-else class="h-28" />

    <p v-if="error" role="alert" class="mx-6 mb-6 rounded bg-zinc-800 px-4 py-3 text-sm text-zinc-200 sm:mx-12">
      {{ error }}
      <NuxtLink v-if="error.includes('serveur')" to="/downloads" class="ml-2 underline">Voir les téléchargements</NuxtLink>
    </p>

    <div class="relative z-10 flex flex-col gap-6" :class="heroes.length ? '-mt-32' : ''">
      <MediaRow title="Reprendre la lecture" :items="resume" landscape @error="showError" />
      <MediaRow title="À suivre" :items="nextUp" landscape @error="showError" />
      <LibraryRow />
      <MediaRow title="Films ajoutés récemment" :items="movies" @error="showError" />
      <MediaRow title="Séries mises à jour" :items="shows" @error="showError" />
    </div>

    <p v-if="loading" class="px-12 text-zinc-500">Chargement…</p>
  </div>
</template>
