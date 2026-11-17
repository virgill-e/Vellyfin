<script setup lang="ts">
// Carte de média : légère mise en avant au survol, actions superposées à l'image
// (rien ne déborde de la rangée), progression de lecture et badge hors ligne.
// Une série ouvre sa fiche ; films et épisodes se lisent ou se téléchargent.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { posterUrl, thumbUrl } from "~/utils/images";

const props = defineProps<{ item: BaseItemDto; landscape?: boolean; fluid?: boolean }>();
defineEmits<{ error: [message: string] }>();

const session = useSessionStore();
const downloads = useDownloadsStore();

const isSeries = computed(() => props.item.Type === "Series");
const target = computed(() => (isSeries.value ? `/series/${props.item.Id}` : `/play/${props.item.Id}`));
const image = computed(() => {
  const base = session.api?.basePath;
  if (!base) return undefined;
  return props.landscape ? thumbUrl(base, props.item) : posterUrl(base, props.item);
});
const status = computed(() => (props.item.Id ? downloads.statusOf(props.item.Id) : null));
const downloadImage = computed(() => (session.api ? thumbUrl(session.api.basePath, props.item) : undefined));
const progress = computed(() => props.item.UserData?.PlayedPercentage ?? 0);
const unplayed = computed(() => (isSeries.value ? props.item.UserData?.UnplayedItemCount ?? 0 : 0));
const subtitle = computed(() => {
  if (props.item.Type === "Episode") {
    return `${props.item.SeriesName ?? ""} · S${props.item.ParentIndexNumber ?? "?"} É${props.item.IndexNumber ?? "?"}`;
  }
  return props.item.ProductionYear?.toString();
});
const width = computed(() => {
  if (props.fluid) return "w-full";
  return props.landscape ? "w-64 md:w-72" : "w-36 md:w-44";
});
</script>

<template>
  <article class="group shrink-0" :class="width">
    <div
      class="relative overflow-hidden rounded bg-surface-raised ring-white/80 transition duration-200 group-hover:ring-2"
      :class="landscape ? 'aspect-video' : 'aspect-[2/3]'"
    >
      <img
        v-if="image"
        :src="image"
        :alt="item.Name ?? ''"
        loading="lazy"
        class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
      />
      <span v-else class="absolute inset-0 grid place-items-center p-3 text-center text-sm text-zinc-400">
        {{ item.Name }}
      </span>

      <span
        v-if="status && status !== 'failed'"
        class="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-black/75"
        :title="status === 'completed' ? 'Disponible hors ligne' : 'Téléchargement en cours'"
      >
        <DownloadIcon :status="status" :progress="item.Id ? downloads.progressOf(item.Id) : null" />
      </span>
      <span
        v-else-if="unplayed > 0"
        class="absolute right-1.5 top-1.5 min-w-6 rounded bg-accent px-1.5 py-0.5 text-center text-xs font-bold"
        :title="`${unplayed} épisode(s) non vu(s)`"
      >
        {{ unplayed }}
      </span>

      <!-- Actions au survol -->
      <NuxtLink
        v-if="isSeries"
        :to="target"
        class="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold opacity-0 transition group-hover:opacity-100 focus:opacity-100"
        :aria-label="`Voir ${item.Name}`"
      >
        Voir la série
      </NuxtLink>
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center gap-3 bg-black/55 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <NuxtLink
          :to="target"
          class="grid size-11 place-items-center rounded-full bg-white text-black transition hover:scale-110"
          aria-label="Lecture"
        >
          <svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
        </NuxtLink>
        <DownloadButton
          :item-id="item.Id!"
          :name="item.Name ?? item.Id!"
          :image-url="downloadImage"
          @error="$emit('error', $event)"
        />
      </div>

      <div v-if="progress > 0" class="absolute inset-x-0 bottom-0 h-1 bg-zinc-600/80">
        <div class="h-full bg-accent" :style="{ width: `${progress}%` }" />
      </div>
    </div>

    <p class="mt-2 truncate text-sm text-zinc-200" :title="item.Name ?? ''">{{ item.Name }}</p>
    <p v-if="subtitle" class="truncate text-xs text-zinc-500">{{ subtitle }}</p>
  </article>
</template>
