<script setup lang="ts">
// Fiche d'un film ou d'un épisode : fond, informations, reprise, téléchargement,
// état « vu », distribution et titres similaires.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api/library-api";
import { getUserDataApi } from "@jellyfin/sdk/lib/utils/api/user-data-api";
import { backdropUrl, personImageUrl, thumbUrl } from "~/utils/images";
import { endsAt, formatRuntime, peopleOf, streamLanguages } from "~/utils/item-info";
import { formatClock, resumeSeconds } from "~/utils/progress";

const route = useRoute();
const session = useSessionStore();
const downloads = useDownloadsStore();

const item = ref<BaseItemDto | null>(null);
const similar = ref<BaseItemDto[]>([]);
const error = ref("");
const toggling = ref(false);

const itemId = computed(() => String(route.params.id));
const base = computed(() => session.api?.basePath ?? "");
const isEpisode = computed(() => item.value?.Type === "Episode");

const banner = computed(() => (item.value && base.value ? backdropUrl(base.value, item.value) : undefined));
const position = computed(() =>
  item.value ? resumeSeconds(item.value.UserData?.PlaybackPositionTicks, item.value.UserData?.Played) : 0,
);
const played = computed(() => item.value?.UserData?.Played === true);
const percent = computed(() => item.value?.UserData?.PlayedPercentage ?? 0);
const remaining = computed(() => {
  const total = item.value?.RunTimeTicks;
  return total ? formatRuntime(total - (item.value?.UserData?.PlaybackPositionTicks ?? 0)) : "";
});

const meta = computed(() => {
  const i = item.value;
  if (!i) return [];
  return [
    i.ProductionYear,
    i.OfficialRating,
    formatRuntime(i.RunTimeTicks),
    i.CommunityRating ? `★ ${i.CommunityRating.toFixed(1)}` : null,
    i.RunTimeTicks ? `Fin à ${endsAt(i.RunTimeTicks, i.UserData?.PlaybackPositionTicks ?? 0)}` : null,
  ].filter(Boolean);
});

const languages = computed(() => streamLanguages(item.value?.MediaSources?.[0]?.MediaStreams ?? item.value?.MediaStreams));
const directors = computed(() => peopleOf(item.value, "Director").map((p) => p.Name).filter(Boolean));
const writers = computed(() => peopleOf(item.value, "Writer").map((p) => p.Name).filter(Boolean));
const cast = computed(() => peopleOf(item.value, "Actor").slice(0, 20));

const episodeLabel = computed(() => {
  const i = item.value;
  if (!i || !isEpisode.value) return "";
  return `Saison ${i.ParentIndexNumber ?? "?"} · Épisode ${i.IndexNumber ?? "?"}`;
});
const downloadName = computed(() => {
  const i = item.value;
  if (!i) return "";
  return isEpisode.value
    ? `${i.SeriesName ?? ""} · S${i.ParentIndexNumber ?? "?"}É${i.IndexNumber ?? "?"} · ${i.Name ?? ""}`
    : (i.Name ?? i.Id ?? "");
});

async function load(id: string) {
  const api = session.api;
  const userId = session.session?.userId;
  if (!api || !userId) return;
  error.value = "";
  try {
    const { data } = await getLibraryApi(api).getItem({ itemId: id, userId });
    item.value = data;
    window.scrollTo({ top: 0 });
  } catch {
    error.value = "Impossible de charger cette fiche. Le serveur est peut-être injoignable.";
    return;
  }
  similar.value = [];
  if (item.value?.Type === "Movie") {
    getLibraryApi(api)
      .getSimilarItems({ itemId: id, userId, limit: 12 })
      .then(({ data }) => (similar.value = data.Items ?? []))
      .catch(() => {});
  }
}

watch(itemId, (id) => void load(id));
onMounted(async () => {
  await downloads.init();
  await load(itemId.value);
});

async function togglePlayed() {
  const api = session.api;
  const userId = session.session?.userId;
  const i = item.value;
  if (!api || !userId || !i?.Id) return;
  toggling.value = true;
  try {
    const userData = getUserDataApi(api);
    const { data } = played.value
      ? await userData.markUnplayedItem({ itemId: i.Id, userId })
      : await userData.markPlayedItem({ itemId: i.Id, userId });
    item.value = { ...i, UserData: data };
  } catch {
    error.value = "Impossible de modifier l'état « vu ».";
  } finally {
    toggling.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen pb-16">
    <AppHeader />

    <section class="relative min-h-[75vh] w-full overflow-hidden">
      <img v-if="banner" :src="banner" alt="" class="absolute inset-0 h-full w-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-surface to-transparent" />

      <div v-if="item" class="relative z-10 flex min-h-[75vh] max-w-3xl flex-col justify-end gap-4 px-6 pb-12 pt-28 sm:px-12">
        <NuxtLink
          v-if="isEpisode && item.SeriesId"
          :to="`/series/${item.SeriesId}`"
          class="w-fit text-lg font-semibold text-zinc-200 hover:underline"
        >
          {{ item.SeriesName }}
        </NuxtLink>
        <h1 class="text-4xl font-black leading-tight drop-shadow-lg md:text-6xl">{{ item.Name }}</h1>
        <p v-if="episodeLabel" class="text-zinc-300">{{ episodeLabel }}</p>
        <p v-if="meta.length" class="flex flex-wrap gap-x-3 text-sm font-medium text-zinc-300">
          <span v-for="(m, i) in meta" :key="i">{{ m }}</span>
        </p>
        <p v-if="item.Genres?.length" class="text-sm text-zinc-400">{{ item.Genres.join(" · ") }}</p>

        <!-- Progression -->
        <div v-if="position > 0" class="flex max-w-md items-center gap-3 text-sm text-zinc-300">
          <div class="h-1 flex-1 overflow-hidden rounded-full bg-zinc-600/80">
            <div class="h-full bg-accent" :style="{ width: `${percent}%` }" />
          </div>
          <span class="shrink-0">Il reste {{ remaining }}</span>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-3">
          <NuxtLink :to="`/play/${item.Id}`" class="btn-play">
            <svg viewBox="0 0 24 24" class="size-6 fill-current" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
            {{ position > 0 ? `Reprendre à ${formatClock(position)}` : "Lecture" }}
          </NuxtLink>
          <NuxtLink v-if="position > 0" :to="`/play/${item.Id}?start=0`" class="btn-secondary">
            Depuis le début
          </NuxtLink>
          <DownloadButton
            variant="wide"
            :item-id="item.Id!"
            :name="downloadName"
            :image-url="base ? thumbUrl(base, item) : undefined"
            @error="error = $event"
          />
          <button
            class="grid size-11 place-items-center rounded-full border-2 transition hover:scale-110"
            :class="played ? 'border-white bg-white text-black' : 'border-white/70 bg-black/40 text-white hover:border-white'"
            :aria-pressed="played"
            :aria-label="played ? 'Marquer comme non vu' : 'Marquer comme vu'"
            :title="played ? 'Vu · marquer comme non vu' : 'Marquer comme vu'"
            :disabled="toggling"
            @click="togglePlayed"
          >
            <svg viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-[3]" aria-hidden="true">
              <path d="m5 12 5 5 9-10" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>

    <p v-if="error" role="alert" class="mx-6 mb-6 rounded bg-zinc-800 px-4 py-3 text-sm text-amber-300 sm:mx-12">
      {{ error }}
    </p>

    <div v-if="item" class="flex flex-col gap-10">
      <section class="grid gap-8 px-6 sm:px-12 lg:grid-cols-[2fr_1fr]">
        <div class="flex flex-col gap-3">
          <p v-if="item.Taglines?.length" class="text-lg italic text-zinc-300">{{ item.Taglines[0] }}</p>
          <p v-if="item.Overview" class="max-w-3xl leading-relaxed text-zinc-200">{{ item.Overview }}</p>
          <p v-else class="text-zinc-500">Aucun résumé.</p>
        </div>
        <dl class="grid h-fit grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <template v-if="directors.length">
            <dt class="text-zinc-500">Réalisation</dt>
            <dd class="text-zinc-200">{{ directors.join(", ") }}</dd>
          </template>
          <template v-if="writers.length">
            <dt class="text-zinc-500">Scénario</dt>
            <dd class="text-zinc-200">{{ writers.join(", ") }}</dd>
          </template>
          <template v-if="item.Studios?.length">
            <dt class="text-zinc-500">Studio</dt>
            <dd class="text-zinc-200">{{ item.Studios.map((s) => s.Name).join(", ") }}</dd>
          </template>
          <template v-if="languages.audio.length">
            <dt class="text-zinc-500">Audio</dt>
            <dd class="text-zinc-200">{{ languages.audio.join(", ") }}</dd>
          </template>
          <template v-if="languages.subtitles.length">
            <dt class="text-zinc-500">Sous-titres</dt>
            <dd class="text-zinc-200">{{ languages.subtitles.join(", ") }}</dd>
          </template>
        </dl>
      </section>

      <section v-if="cast.length">
        <h2 class="mb-3 px-6 text-lg font-semibold sm:px-12 md:text-xl">Distribution</h2>
        <ul class="row-scroll flex gap-5 overflow-x-auto px-6 py-2 sm:px-12">
          <li v-for="person in cast" :key="`${person.Id}-${person.Role}`" class="w-28 shrink-0 text-center">
            <div class="mx-auto mb-2 grid size-24 place-items-center overflow-hidden rounded-full bg-surface-raised">
              <img
                v-if="personImageUrl(base, person)"
                :src="personImageUrl(base, person)"
                :alt="person.Name ?? ''"
                loading="lazy"
                class="h-full w-full object-cover"
              />
              <span v-else class="text-2xl font-semibold text-zinc-500">{{ person.Name?.[0] }}</span>
            </div>
            <p class="truncate text-sm text-zinc-200">{{ person.Name }}</p>
            <p v-if="person.Role" class="truncate text-xs text-zinc-500">{{ person.Role }}</p>
          </li>
        </ul>
      </section>

      <MediaRow title="Titres similaires" :items="similar" @error="error = $event" />
    </div>

  </div>
</template>
