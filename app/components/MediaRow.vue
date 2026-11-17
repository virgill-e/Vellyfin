<script setup lang="ts">
// Rangée horizontale de cartes, avec flèches de défilement au survol.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

defineProps<{ title: string; items: BaseItemDto[]; landscape?: boolean }>();
defineEmits<{ download: [item: BaseItemDto] }>();

const track = ref<HTMLElement | null>(null);

function scroll(direction: 1 | -1) {
  const el = track.value;
  if (el) el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
}
</script>

<template>
  <section v-if="items.length" class="group/row relative">
    <h2 class="mb-2 px-6 text-lg font-semibold text-zinc-100 sm:px-12 md:text-xl">{{ title }}</h2>
    <div class="relative">
      <button
        class="absolute bottom-12 left-0 top-2 z-20 hidden w-12 bg-black/60 text-4xl opacity-0 transition hover:bg-black/80 group-hover/row:opacity-100 sm:block"
        aria-label="Précédent"
        @click="scroll(-1)"
      >
        ‹
      </button>
      <div ref="track" class="row-scroll flex gap-3 overflow-x-auto scroll-smooth px-6 py-2 sm:px-12">
        <MediaCard
          v-for="item in items"
          :key="item.Id"
          :item="item"
          :landscape="landscape"
          @download="$emit('download', $event)"
        />
      </div>
      <button
        class="absolute bottom-12 right-0 top-2 z-20 hidden w-12 bg-black/60 text-4xl opacity-0 transition hover:bg-black/80 group-hover/row:opacity-100 sm:block"
        aria-label="Suivant"
        @click="scroll(1)"
      >
        ›
      </button>
    </div>
  </section>
</template>
