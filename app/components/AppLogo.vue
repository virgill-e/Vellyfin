<script setup lang="ts">
// Logo Vellyfin et signature, communs à la navigation et aux écrans de connexion.
// Police condensée Bebas Neue (embarquée, donc disponible hors ligne) ; les lettres
// grandissent vers les bords pour un effet d'écran incurvé.
import "@fontsource/bebas-neue/latin-400.css";

withDefaults(defineProps<{ size?: "md" | "lg" }>(), { size: "md" });

const WORD = "VELLYFIN";
/** Hausse de taille des lettres extrêmes par rapport au centre. */
const CURVE = 0.18;
const middle = (WORD.length - 1) / 2;
const letters = [...WORD].map((char, i) => ({
  char,
  scale: 1 + CURVE * ((i - middle) / middle) ** 2,
}));
</script>

<template>
  <span class="inline-flex flex-col items-start leading-none">
    <span
      class="flex items-center text-accent drop-shadow"
      :class="size === 'lg' ? 'text-5xl' : 'text-4xl'"
      style="font-family: 'Bebas Neue', sans-serif; -webkit-text-stroke: 0.025em currentColor"
      aria-label="Vellyfin"
    >
      <span
        v-for="(letter, i) in letters"
        :key="i"
        class="inline-block"
        :style="{ transform: `scaleY(${letter.scale})`, marginRight: '-0.01em' }"
        aria-hidden="true"
      >
        {{ letter.char }}
      </span>
    </span>
    <span
      class="mt-1 self-end font-medium tracking-wide text-zinc-300 drop-shadow"
      :class="size === 'lg' ? 'text-xs' : 'text-[10px]'"
    >
      by Virgill_e
    </span>
  </span>
</template>
