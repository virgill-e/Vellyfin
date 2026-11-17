<script setup lang="ts">
// Médiathèque (Films ou Séries) : bannière à l'image de la bibliothèque,
// grille d'affiches triable, chargement progressif au défilement.
import type { BaseItemDto, ItemSortBy, SortOrder } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { libraryImageUrl } from "~/utils/images";

const PAGE_SIZE = 60;
const SORTS: { label: string; by: ItemSortBy[]; order: SortOrder }[] = [
  { label: "Ajouts récents", by: ["DateCreated"], order: "Descending" },
  { label: "Titre (A-Z)", by: ["SortName"], order: "Ascending" },
  { label: "Année de sortie", by: ["ProductionYear", "SortName"], order: "Descending" },
  { label: "Note", by: ["CommunityRating", "SortName"], order: "Descending" },
];

const route = useRoute();
const session = useSessionStore();
const libraries = useLibrariesStore();
const downloads = useDownloadsStore();

const libraryId = computed(() => String(route.params.id));
const library = computed(() => libraries.byId(libraryId.value));
const isShows = computed(() => library.value?.CollectionType === "tvshows");
const banner = computed(() =>
  session.api && library.value ? libraryImageUrl(session.api.basePath, library.value, 1920) : undefined,
);

const sort = ref(0);
const items = ref<BaseItemDto[]>([]);
const total = ref<number | null>(null);
const loading = ref(false);
const error = ref("");
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

const hasMore = computed(() => total.value === null || items.value.length < total.value);

async function loadMore() {
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId || loading.value || !hasMore.value || !library.value) return;

  loading.value = true;
  const current = SORTS[sort.value]!;
  try {
    const { data } = await getLibraryApi(api).getItems({
      userId,
      parentId: libraryId.value,
      includeItemTypes: [isShows.value ? "Series" : "Movie"],
      recursive: true,
      sortBy: current.by,
      sortOrder: [current.order],
      startIndex: items.value.length,
      limit: PAGE_SIZE,
      enableTotalRecordCount: true,
    });
    items.value.push(...(data.Items ?? []));
    total.value = data.TotalRecordCount ?? items.value.length;
  } catch {
    error.value = "Impossible de charger la médiathèque.";
    total.value = items.value.length;
  } finally {
    loading.value = false;
  }
}

function reset() {
  items.value = [];
  total.value = null;
  error.value = "";
  loadMore();
}

watch(sort, reset);
watch(libraryId, reset);

onMounted(async () => {
  await Promise.all([libraries.load(), downloads.init()]);
  await loadMore();
  observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
    rootMargin: "600px",
  });
  if (sentinel.value) observer.observe(sentinel.value);
});

onBeforeUnmount(() => observer?.disconnect());

function showError(message: string) {
  error.value = message;
}
</script>

<template>
  <div class="min-h-screen pb-16">
    <AppHeader />

    <section class="relative h-72 w-full overflow-hidden md:h-80">
      <img v-if="banner" :src="banner" alt="" class="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div class="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-black/60" />
      <div class="relative z-10 flex h-full items-end justify-between gap-4 px-6 pb-6 sm:px-12">
        <div>
          <h1 class="text-4xl font-black drop-shadow md:text-5xl">{{ library?.Name ?? "Médiathèque" }}</h1>
          <p v-if="total !== null" class="mt-1 text-sm text-zinc-300">
            {{ total }} {{ isShows ? "séries" : "films" }}
          </p>
        </div>
        <label class="flex items-center gap-2 text-sm text-zinc-300">
          Trier par
          <select v-model="sort" class="field bg-black/70 py-1.5">
            <option v-for="(s, i) in SORTS" :key="s.label" :value="i">{{ s.label }}</option>
          </select>
        </label>
      </div>
    </section>

    <p v-if="error" role="alert" class="mx-6 mb-6 rounded bg-zinc-800 px-4 py-3 text-sm sm:mx-12">{{ error }}</p>

    <ul class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-6 px-6 sm:px-12 md:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]">
      <li v-for="item in items" :key="item.Id">
        <MediaCard :item="item" fluid @error="showError" />
      </li>
    </ul>

    <div ref="sentinel" class="h-10" />
    <p v-if="loading" class="px-12 text-center text-zinc-500">Chargement…</p>
  </div>
</template>
