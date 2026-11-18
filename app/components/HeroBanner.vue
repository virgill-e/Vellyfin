<script setup lang="ts">
// Grande bannière d'accueil en rotation automatique : fond plein écran, titre,
// résumé, actions. La rotation (useRotation) ne s'arrête que via le bouton
// pause ; si le système demande de réduire les animations, les fondus sont
// désactivés mais la rotation continue.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { backdropUrl, thumbUrl } from "~/utils/images";

const ROTATION_MS = 9000;

const props = defineProps<{ items: BaseItemDto[] }>();
defineEmits<{ error: [message: string] }>();

const session = useSessionStore();

const { index, paused, go } = useRotation(
  computed(() => props.items.length),
  ROTATION_MS,
);

const current = computed(() => props.items[index.value] ?? props.items[0]);
const meta = computed(() =>
  current.value
    ? [current.value.ProductionYear, current.value.OfficialRating, runtime(current.value.RunTimeTicks)]
        .filter(Boolean)
        .join(" · ")
    : "",
);

function image(item: BaseItemDto) {
  return session.api ? backdropUrl(session.api.basePath, item) : undefined;
}

function runtime(ticks?: number | null) {
  if (!ticks) return "";
  const minutes = Math.round(ticks / 600_000_000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

</script>

<template>
  <section
    v-if="current"
    class="relative h-[80vh] min-h-[480px] w-full overflow-hidden"
    aria-roledescription="carrousel"
  >
    <!-- Fonds empilés, fondu enchaîné entre deux films -->
    <img
      v-for="(item, i) in items"
      :key="item.Id"
      :src="image(item)"
      alt=""
      aria-hidden="true"
      :loading="i === 0 ? 'eager' : 'lazy'"
      class="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 motion-reduce:transition-none"
      :class="i === index ? 'opacity-100' : 'opacity-0'"
    />
    <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />
    <div class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-surface to-transparent" />

    <Transition
      mode="out-in"
      enter-active-class="transition duration-500 motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-y-3"
      leave-active-class="transition duration-300"
      leave-to-class="opacity-0"
    >
      <div
        :key="current.Id"
        class="relative z-10 flex h-full max-w-2xl flex-col justify-end gap-4 px-6 pb-[18vh] sm:px-12"
        aria-live="polite"
      >
        <h1 class="text-5xl font-black leading-none drop-shadow-lg md:text-6xl">{{ current.Name }}</h1>
        <p v-if="meta" class="text-sm font-medium text-zinc-300">{{ meta }}</p>
        <p v-if="current.Overview" class="line-clamp-3 text-base text-zinc-100 drop-shadow md:text-lg">
          {{ current.Overview }}
        </p>
        <div class="mt-2 flex gap-3">
          <NuxtLink :to="`/play/${current.Id}`" class="btn-play">
            <svg viewBox="0 0 24 24" class="size-6 fill-current" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
            Lecture
          </NuxtLink>
          <NuxtLink :to="`/item/${current.Id}`" class="btn-secondary">
            <svg viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" stroke-linecap="round" />
            </svg>
            Plus d'infos
          </NuxtLink>
          <DownloadButton
            variant="wide"
            :item-id="current.Id!"
            :name="current.Name ?? current.Id!"
            :image-url="session.api ? thumbUrl(session.api.basePath, current) : undefined"
            @error="$emit('error', $event)"
          />
        </div>
      </div>
    </Transition>

    <!-- Indicateurs : un trait par film, cliquable, et pause / lecture -->
    <div v-if="items.length > 1" class="absolute bottom-[18vh] right-6 z-10 flex items-center gap-1.5 sm:right-12">
      <button
        class="mr-2 grid size-7 place-items-center rounded-full border border-white/40 text-white/80 transition hover:border-white hover:text-white"
        :aria-label="paused ? 'Reprendre le défilement' : 'Mettre le défilement en pause'"
        @click="paused = !paused"
      >
        <svg v-if="paused" viewBox="0 0 24 24" class="size-3.5 fill-current" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
        <svg v-else viewBox="0 0 24 24" class="size-3.5 fill-current" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
      </button>
      <button
        v-for="(item, i) in items"
        :key="item.Id"
        class="h-1 rounded-full transition-all"
        :class="i === index ? 'w-8 bg-white' : 'w-4 bg-white/40 hover:bg-white/70'"
        :aria-label="`Afficher ${item.Name}`"
        :aria-current="i === index"
        @click="go(i)"
      />
    </div>
  </section>
</template>
