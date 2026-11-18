<script setup lang="ts">
// Barre de lecture : position, mémoire tampon, temps et vignette au survol, glisser pour se déplacer.
import type { TrickplayPreview } from "~/composables/useTrickplay";
import { formatClock } from "~/utils/progress";

const props = defineProps<{
  current: number;
  duration: number;
  buffered: number;
  preview?: (seconds: number) => TrickplayPreview | null;
}>();
const emit = defineEmits<{ seek: [seconds: number] }>();

const bar = ref<HTMLElement | null>(null);
const hover = ref<number | null>(null);
const dragging = ref(false);

const pct = (seconds: number) => (props.duration ? Math.min(100, (seconds / props.duration) * 100) : 0);
const thumb = computed(() => (hover.value !== null && props.preview ? props.preview(hover.value) : null));
const shown = computed(() => (dragging.value && hover.value !== null ? hover.value : props.current));

function timeAt(event: PointerEvent): number {
  const rect = bar.value!.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return ratio * props.duration;
}

function onMove(event: PointerEvent) {
  if (!props.duration) return;
  hover.value = timeAt(event);
}

function onDown(event: PointerEvent) {
  if (!props.duration) return;
  dragging.value = true;
  bar.value!.setPointerCapture(event.pointerId);
  hover.value = timeAt(event);
}

function onUp(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  emit("seek", timeAt(event));
}

function onKey(event: KeyboardEvent) {
  // Les flèches sont gérées par le lecteur (±10 s) ; Début/Fin ici.
  if (event.key === "Home") emit("seek", 0);
  if (event.key === "End") emit("seek", Math.max(0, props.duration - 1));
}
</script>

<template>
  <div
    ref="bar"
    class="group/seek relative flex h-5 cursor-pointer items-center"
    role="slider"
    tabindex="0"
    aria-label="Position de lecture"
    :aria-valuemin="0"
    :aria-valuemax="Math.round(duration)"
    :aria-valuenow="Math.round(current)"
    :aria-valuetext="`${formatClock(current)} sur ${formatClock(duration)}`"
    @pointermove="onMove"
    @pointerleave="!dragging && (hover = null)"
    @pointerdown="onDown"
    @pointerup="onUp"
    @keydown="onKey"
  >
    <div class="relative h-1 w-full rounded-full bg-white/25 transition-all group-hover/seek:h-1.5">
      <div class="absolute inset-y-0 left-0 rounded-full bg-white/40" :style="{ width: `${pct(buffered)}%` }" />
      <div class="absolute inset-y-0 left-0 rounded-full bg-accent" :style="{ width: `${pct(shown)}%` }" />
      <div
        class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full bg-accent transition group-hover/seek:scale-100"
        :class="dragging && 'scale-100'"
        :style="{ left: `${pct(shown)}%` }"
      />
    </div>

    <!-- Aperçu au survol -->
    <div
      v-if="hover !== null"
      class="pointer-events-none absolute bottom-6 flex -translate-x-1/2 flex-col items-center gap-1"
      :style="{ left: `clamp(${thumb ? thumb.width / 2 : 30}px, ${pct(hover)}%, calc(100% - ${thumb ? thumb.width / 2 : 30}px))` }"
    >
      <div
        v-if="thumb"
        class="overflow-hidden rounded border-2 border-white/80 bg-black shadow-xl"
        :style="{
          width: `${thumb.width}px`,
          height: `${thumb.height}px`,
          backgroundImage: `url(${thumb.src})`,
          backgroundPosition: `-${thumb.x}px -${thumb.y}px`,
        }"
      />
      <span class="rounded bg-black/80 px-2 py-0.5 text-sm font-medium tabular-nums">{{ formatClock(hover) }}</span>
    </div>
  </div>
</template>
