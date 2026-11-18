<script setup lang="ts">
// Panneau audio / sous-titres. Changer d'audio relance le flux côté serveur
// (une seule piste par flux HLS) ; les sous-titres basculent instantanément.
import type { AudioTrack } from "~/utils/playback";

defineProps<{
  audioTracks: AudioTrack[];
  audioIndex: number | null;
  subtitles: { index: number; label: string }[];
  subtitleIndex: number | null;
  switching: boolean;
  offline: boolean;
}>();
defineEmits<{ audio: [index: number]; subtitle: [index: number | null]; close: [] }>();
</script>

<template>
  <div
    class="absolute bottom-28 right-6 z-20 grid max-h-[60vh] w-[min(36rem,calc(100vw-3rem))] grid-cols-2 gap-6 overflow-y-auto rounded-lg bg-black/90 p-5 shadow-2xl ring-1 ring-white/10"
    role="dialog"
    aria-label="Audio et sous-titres"
    @keydown.esc.stop="$emit('close')"
  >
    <section>
      <h2 class="mb-3 text-lg font-semibold">Audio</h2>
      <p v-if="offline" class="text-sm text-zinc-500">Piste téléchargée uniquement.</p>
      <ul v-else class="flex flex-col">
        <li v-for="track in audioTracks" :key="track.index">
          <button
            class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/10 disabled:opacity-50"
            :class="track.index === audioIndex ? 'font-semibold text-white' : 'text-zinc-400'"
            :disabled="switching"
            @click="$emit('audio', track.index)"
          >
            <span class="w-4 shrink-0">{{ track.index === audioIndex ? "✓" : "" }}</span>
            {{ track.label }}
          </button>
        </li>
      </ul>
      <p v-if="switching" class="mt-2 text-xs text-zinc-500">Changement de piste…</p>
    </section>
    <section>
      <h2 class="mb-3 text-lg font-semibold">Sous-titres</h2>
      <ul class="flex flex-col">
        <li>
          <button
            class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/10"
            :class="subtitleIndex === null ? 'font-semibold text-white' : 'text-zinc-400'"
            @click="$emit('subtitle', null)"
          >
            <span class="w-4 shrink-0">{{ subtitleIndex === null ? "✓" : "" }}</span>
            Désactivés
          </button>
        </li>
        <li v-for="sub in subtitles" :key="sub.index">
          <button
            class="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/10"
            :class="sub.index === subtitleIndex ? 'font-semibold text-white' : 'text-zinc-400'"
            @click="$emit('subtitle', sub.index)"
          >
            <span class="w-4 shrink-0">{{ sub.index === subtitleIndex ? "✓" : "" }}</span>
            {{ sub.label }}
          </button>
        </li>
      </ul>
      <p v-if="offline && !subtitles.length" class="mt-2 text-xs text-zinc-500">Les sous-titres ne sont pas encore téléchargés.</p>
    </section>
  </div>
</template>
