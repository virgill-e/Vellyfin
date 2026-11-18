<script setup lang="ts">
// Résultats de recherche (?q=…) : films, séries, épisodes et personnes.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getPersonApi } from "@jellyfin/sdk/lib/utils/api/person-api";

const route = useRoute();
const session = useSessionStore();
const downloads = useDownloadsStore();

const query = computed(() => (typeof route.query.q === "string" ? route.query.q.trim() : ""));
const movies = ref<BaseItemDto[]>([]);
const series = ref<BaseItemDto[]>([]);
const episodes = ref<BaseItemDto[]>([]);
const people = ref<BaseItemDto[]>([]);
const loading = ref(false);
const error = ref("");
let latest = 0;

const empty = computed(
  () => !loading.value && !error.value && query.value && ![movies, series, episodes, people].some((r) => r.value.length),
);

async function search(q: string) {
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId || !q) return;
  const request = ++latest;
  loading.value = true;
  error.value = "";
  const library = getLibraryApi(api);
  const find = (types: ("Movie" | "Series" | "Episode")[], limit: number) =>
    library
      .getItems({ userId, searchTerm: q, includeItemTypes: types, recursive: true, limit, enableTotalRecordCount: false })
      .then((r) => r.data.Items ?? []);
  try {
    const [m, s, e] = await Promise.all([find(["Movie"], 40), find(["Series"], 40), find(["Episode"], 24)]);
    // Titres avec les personnes dont le nom correspond (acteurs, réalisateurs…).
    const p = await getPersonApi(api)
      .getPersons({ userId, searchTerm: q, limit: 5 })
      .then(({ data }) => (data.Items ?? []).map((person) => person.Id!).filter(Boolean))
      .then((personIds) =>
        personIds.length
          ? library
              .getItems({ userId, personIds, includeItemTypes: ["Movie", "Series"], recursive: true, limit: 24, enableTotalRecordCount: false })
              .then((r) => r.data.Items ?? [])
          : [],
      )
      .catch(() => [] as BaseItemDto[]);
    if (request !== latest) return; // Une recherche plus récente a été lancée.
    const shown = new Set([...m, ...s].map((i) => i.Id));
    movies.value = m;
    series.value = s;
    episodes.value = e;
    people.value = p.filter((i) => !shown.has(i.Id));
  } catch {
    if (request === latest) error.value = "Recherche impossible : le serveur est peut-être injoignable.";
  } finally {
    if (request === latest) loading.value = false;
  }
}

watch(query, (q) => void search(q));
onMounted(async () => {
  await downloads.init();
  await search(query.value);
});
</script>

<template>
  <div class="min-h-screen pb-16">
    <AppHeader />

    <main class="flex flex-col gap-10 pt-28">
      <h1 class="px-6 text-2xl font-semibold text-zinc-300 sm:px-12">
        <template v-if="query">Résultats pour « <span class="text-white">{{ query }}</span> »</template>
        <template v-else>Recherche</template>
      </h1>

      <p v-if="error" role="alert" class="mx-6 rounded bg-zinc-800 px-4 py-3 text-sm text-amber-300 sm:mx-12">{{ error }}</p>
      <p v-else-if="!query" class="px-6 text-zinc-500 sm:px-12">Tape un titre, un nom d'acteur ou de réalisateur.</p>
      <p v-else-if="empty" class="px-6 text-zinc-500 sm:px-12">Aucun résultat.</p>

      <section v-for="block in [{ title: 'Films', items: movies }, { title: 'Séries', items: series }, { title: 'Avec cette personne', items: people }]" :key="block.title">
        <template v-if="block.items.length">
          <h2 class="mb-3 px-6 text-lg font-semibold sm:px-12">{{ block.title }}</h2>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-3 gap-y-6 px-6 sm:px-12 md:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            <MediaCard v-for="item in block.items" :key="item.Id" :item="item" fluid @error="error = $event" />
          </div>
        </template>
      </section>

      <MediaRow title="Épisodes" :items="episodes" landscape @error="error = $event" />

      <p v-if="loading" class="px-6 text-zinc-500 sm:px-12">Recherche…</p>
    </main>
  </div>
</template>
