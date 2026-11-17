<script setup lang="ts">
// Fiche série : bannière, choix de la saison, liste des épisodes (lecture / téléchargement).
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getShowApi } from "@jellyfin/sdk/lib/utils/api/show-api";
import { backdropUrl, posterUrl } from "~/utils/images";

const route = useRoute();
const session = useSessionStore();
const downloads = useDownloadsStore();

const seriesId = String(route.params.id);
const series = ref<BaseItemDto | null>(null);
const seasons = ref<BaseItemDto[]>([]);
const seasonId = ref<string | null>(null);
const episodes = ref<BaseItemDto[]>([]);
const loadingEpisodes = ref(false);
const error = ref("");

const base = computed(() => session.api?.basePath ?? "");
const banner = computed(() => (series.value && base.value ? backdropUrl(base.value, series.value) : undefined));
const meta = computed(() =>
  series.value
    ? [series.value.ProductionYear, series.value.OfficialRating, seasons.value.length && `${seasons.value.length} saison(s)`]
        .filter(Boolean)
        .join(" · ")
    : "",
);

onMounted(async () => {
  await downloads.init();
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId) return;
  try {
    const [item, seasonList] = await Promise.all([
      getLibraryApi(api).getItem({ itemId: seriesId, userId }),
      getShowApi(api).getSeasons({ seriesId, userId }),
    ]);
    series.value = item.data;
    seasons.value = seasonList.data.Items ?? [];
    // Première saison avec des épisodes non vus, sinon la première.
    const next = seasons.value.find((s) => (s.UserData?.UnplayedItemCount ?? 0) > 0) ?? seasons.value[0];
    seasonId.value = next?.Id ?? null;
  } catch {
    error.value = "Impossible de charger la série.";
  }
});

watch(seasonId, async (id) => {
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId || !id) return;
  loadingEpisodes.value = true;
  try {
    const { data } = await getShowApi(api).getEpisodes({ seriesId, userId, seasonId: id, fields: ["Overview"] });
    episodes.value = data.Items ?? [];
  } catch {
    error.value = "Impossible de charger les épisodes.";
  } finally {
    loadingEpisodes.value = false;
  }
});

function runtime(ticks?: number | null) {
  return ticks ? `${Math.round(ticks / 600_000_000)} min` : "";
}

function episodeName(ep: BaseItemDto) {
  return `${series.value?.Name ?? ""} · S${ep.ParentIndexNumber ?? "?"}É${ep.IndexNumber ?? "?"} · ${ep.Name ?? ""}`;
}
</script>

<template>
  <div class="min-h-screen pb-16">
    <AppHeader />

    <section class="relative h-[60vh] min-h-[380px] w-full overflow-hidden">
      <img v-if="banner" :src="banner" alt="" class="absolute inset-0 h-full w-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-surface to-transparent" />
      <div v-if="series" class="relative z-10 flex h-full max-w-2xl flex-col justify-end gap-3 px-6 pb-12 sm:px-12">
        <h1 class="text-5xl font-black leading-none drop-shadow-lg">{{ series.Name }}</h1>
        <p v-if="meta" class="text-sm font-medium text-zinc-300">{{ meta }}</p>
        <p v-if="series.Overview" class="line-clamp-3 text-zinc-100 drop-shadow">{{ series.Overview }}</p>
      </div>
    </section>

    <p v-if="error" role="alert" class="mx-6 mb-6 rounded bg-zinc-800 px-4 py-3 text-sm sm:mx-12">{{ error }}</p>

    <section class="px-6 sm:px-12">
      <div class="mb-6 flex items-center justify-between gap-4">
        <h2 class="text-2xl font-bold">Épisodes</h2>
        <select v-if="seasons.length" v-model="seasonId" class="field bg-surface-raised py-2 text-base" aria-label="Saison">
          <option v-for="s in seasons" :key="s.Id" :value="s.Id">{{ s.Name }}</option>
        </select>
      </div>

      <p v-if="loadingEpisodes" class="text-zinc-500">Chargement…</p>
      <ol v-else class="flex flex-col divide-y divide-white/10 border-t border-white/10">
        <li v-for="ep in episodes" :key="ep.Id" class="group flex items-center gap-5 py-5">
          <span class="w-8 shrink-0 text-center text-2xl text-zinc-400">{{ ep.IndexNumber }}</span>

          <NuxtLink :to="`/play/${ep.Id}`" class="relative aspect-video w-44 shrink-0 overflow-hidden rounded bg-surface-raised md:w-56">
            <img v-if="posterUrl(base, ep, 480)" :src="posterUrl(base, ep, 480)" :alt="ep.Name ?? ''" loading="lazy" class="h-full w-full object-cover" />
            <span class="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <span class="grid size-11 place-items-center rounded-full border-2 border-white bg-black/50">
                <svg viewBox="0 0 24 24" class="size-5 fill-white" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
              </span>
            </span>
            <div v-if="(ep.UserData?.PlayedPercentage ?? 0) > 0" class="absolute inset-x-0 bottom-0 h-1 bg-zinc-600/80">
              <div class="h-full bg-accent" :style="{ width: `${ep.UserData?.PlayedPercentage}%` }" />
            </div>
          </NuxtLink>

          <div class="min-w-0 flex-1">
            <div class="mb-1 flex items-baseline justify-between gap-4">
              <h3 class="truncate font-semibold">{{ ep.Name }}</h3>
              <span class="shrink-0 text-sm text-zinc-400">{{ runtime(ep.RunTimeTicks) }}</span>
            </div>
            <p v-if="ep.Overview" class="line-clamp-2 text-sm text-zinc-400">{{ ep.Overview }}</p>
          </div>

          <DownloadButton
            class="shrink-0"
            :item-id="ep.Id!"
            :name="episodeName(ep)"
            :image-url="posterUrl(base, ep, 480)"
            @error="error = $event"
          />
        </li>
      </ol>
    </section>
  </div>
</template>
