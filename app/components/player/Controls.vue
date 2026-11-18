<script setup lang="ts">
// Commandes du lecteur, superposées à la vidéo : titre et retour en haut,
// barre de lecture et boutons en bas. Masquées par la page après inactivité.
import type { TrickplayPreview } from "~/composables/useTrickplay";
import { formatClock } from "~/utils/progress";

defineProps<{
  title: string;
  subtitle?: string;
  current: number;
  duration: number;
  buffered: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  fullscreen: boolean;
  hasNext: boolean;
  hasTracks: boolean;
  preview?: (seconds: number) => TrickplayPreview | null;
}>();
defineEmits<{
  back: [];
  togglePlay: [];
  seek: [seconds: number];
  skip: [delta: number];
  volume: [value: number];
  mute: [];
  fullscreen: [];
  next: [];
  tracks: [];
  info: [];
}>();
</script>

<template>
  <div class="pointer-events-none absolute inset-0 flex flex-col justify-between">
    <!-- Haut : retour et titre -->
    <div class="pointer-events-auto flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent px-6 pb-16 pt-5">
      <button class="player-icon" aria-label="Retour" title="Retour" @click="$emit('back')">
        <svg viewBox="0 0 24 24" class="size-7 fill-none stroke-current stroke-2" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="min-w-0">
        <p class="truncate text-lg font-semibold">{{ title }}</p>
        <p v-if="subtitle" class="truncate text-sm text-zinc-300">{{ subtitle }}</p>
      </div>
    </div>

    <!-- Bas : barre de lecture et boutons -->
    <div class="pointer-events-auto flex flex-col gap-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-6 pb-5 pt-16">
      <div class="flex items-center gap-4">
        <PlayerSeekBar class="flex-1" :current="current" :duration="duration" :buffered="buffered" :preview="preview" @seek="$emit('seek', $event)" />
        <span class="w-20 shrink-0 text-right text-sm tabular-nums text-zinc-300">
          -{{ formatClock(Math.max(0, duration - current)) }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button class="player-icon" :aria-label="paused ? 'Lecture (espace)' : 'Pause (espace)'" :title="paused ? 'Lecture (espace)' : 'Pause (espace)'" @click="$emit('togglePlay')">
          <svg v-if="paused" viewBox="0 0 24 24" class="size-8 fill-current" aria-hidden="true"><path d="M7 4v16l13-8z" /></svg>
          <svg v-else viewBox="0 0 24 24" class="size-8 fill-current" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
        </button>
        <button class="player-icon" aria-label="Reculer de 10 secondes (←)" title="Reculer de 10 s (←)" @click="$emit('skip', -10)">
          <svg viewBox="0 0 24 24" class="size-7 fill-none stroke-current stroke-2" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5" stroke-linecap="round" stroke-linejoin="round" />
            <text x="12" y="15.5" text-anchor="middle" class="fill-current stroke-0 text-[7px] font-bold">10</text>
          </svg>
        </button>
        <button class="player-icon" aria-label="Avancer de 10 secondes (→)" title="Avancer de 10 s (→)" @click="$emit('skip', 10)">
          <svg viewBox="0 0 24 24" class="size-7 fill-none stroke-current stroke-2" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5" stroke-linecap="round" stroke-linejoin="round" />
            <text x="12" y="15.5" text-anchor="middle" class="fill-current stroke-0 text-[7px] font-bold">10</text>
          </svg>
        </button>

        <div class="group/volume flex items-center">
          <button class="player-icon" :aria-label="muted ? 'Réactiver le son (M)' : 'Couper le son (M)'" :title="muted ? 'Réactiver le son (M)' : 'Couper le son (M)'" @click="$emit('mute')">
            <svg viewBox="0 0 24 24" class="size-7 fill-none stroke-current stroke-2" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9z" class="fill-current" stroke-linejoin="round" />
              <path v-if="muted || volume === 0" d="m16 9 5 6m0-6-5 6" stroke-linecap="round" />
              <template v-else>
                <path d="M16 9.5a3.5 3.5 0 0 1 0 5" stroke-linecap="round" />
                <path v-if="volume > 0.5" d="M18.5 7a7 7 0 0 1 0 10" stroke-linecap="round" />
              </template>
            </svg>
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="muted ? 0 : volume"
            aria-label="Volume"
            class="w-0 accent-white opacity-0 transition-all duration-200 group-hover/volume:ml-1 group-hover/volume:w-24 group-hover/volume:opacity-100 focus:ml-1 focus:w-24 focus:opacity-100"
            @input="$emit('volume', Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <span class="ml-auto" />

        <button v-if="hasNext" class="player-icon" aria-label="Épisode suivant (N)" title="Épisode suivant (N)" @click="$emit('next')">
          <svg viewBox="0 0 24 24" class="size-7 fill-current" aria-hidden="true"><path d="M5 4v16l11-8zM17 4h3v16h-3z" /></svg>
        </button>
        <button v-if="hasTracks" class="player-icon" aria-label="Audio et sous-titres (C)" title="Audio et sous-titres" @click="$emit('tracks')">
          <svg viewBox="0 0 24 24" class="size-7 fill-none stroke-current stroke-2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 12h4M13 12h4M7 15.5h7M16 15.5h1" stroke-linecap="round" />
          </svg>
        </button>
        <button class="player-icon" aria-label="Informations sur le flux" title="Informations sur le flux" @click="$emit('info')">
          <svg viewBox="0 0 24 24" class="size-6 fill-none stroke-current stroke-2" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" stroke-linecap="round" />
          </svg>
        </button>
        <button class="player-icon" :aria-label="fullscreen ? 'Quitter le plein écran (F)' : 'Plein écran (F)'" :title="fullscreen ? 'Quitter le plein écran (F)' : 'Plein écran (F)'" @click="$emit('fullscreen')">
          <svg viewBox="0 0 24 24" class="size-7 fill-none stroke-current stroke-2" aria-hidden="true">
            <path v-if="fullscreen" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" stroke-linecap="round" stroke-linejoin="round" />
            <path v-else d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
