<script setup lang="ts">
// Bouton de téléchargement commun : lance le téléchargement, affiche son état
// (anneau de progression, temps restant) et ouvre la page Téléchargements s'il est déjà en cours.
import { formatRemaining } from "~/utils/eta";

const props = withDefaults(
  defineProps<{
    itemId: string;
    name: string;
    /** Vignette 16:9 conservée avec le téléchargement. */
    imageUrl?: string;
    variant?: "round" | "wide";
  }>(),
  { variant: "round" },
);
const emit = defineEmits<{ error: [message: string] }>();

const downloads = useDownloadsStore();
const status = computed(() => downloads.statusOf(props.itemId));
const progress = computed(() => downloads.progressOf(props.itemId));
const eta = computed(() => downloads.etaOf(props.itemId));
const busy = computed(() => status.value !== null && status.value !== "completed" && status.value !== "failed");

const label = computed(() => {
  switch (status.value) {
    case "completed":
      return "Téléchargé";
    case "queued":
      return "En attente";
    case "assembling":
      return "Finalisation";
    case "downloading": {
      const percent = `${Math.round((progress.value ?? 0) * 100)} %`;
      return eta.value !== null ? `${percent} · ${formatRemaining(eta.value)}` : percent;
    }
    case "failed":
      return "Réessayer";
    default:
      return "Télécharger";
  }
});

async function onClick() {
  if (busy.value || status.value === "completed") {
    await navigateTo("/downloads");
    return;
  }
  try {
    await downloads.start(props.itemId, props.name, props.imageUrl);
  } catch (e) {
    emit("error", `Téléchargement impossible : ${e instanceof Error ? e.message : e}`);
  }
}
</script>

<template>
  <button
    v-if="variant === 'wide'"
    class="btn-secondary min-w-44 justify-center"
    :title="busy ? 'Voir les téléchargements' : undefined"
    @click="onClick"
  >
    <DownloadIcon :status="status" :progress="progress" />
    {{ label }}
  </button>
  <button
    v-else
    class="grid size-11 place-items-center rounded-full border-2 border-white/70 bg-black/40 text-white transition hover:scale-110 hover:border-white"
    :aria-label="label"
    :title="busy ? `${label} · voir les téléchargements` : label"
    @click.stop="onClick"
  >
    <DownloadIcon :status="status" :progress="progress" />
  </button>
</template>
