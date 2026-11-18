// Mise à jour obligatoire au lancement : si une version plus récente est publiée,
// elle est téléchargée et installée avant d'afficher l'app, puis l'app redémarre.
// Sans réseau (ou en cas d'erreur), l'app démarre normalement : les téléchargements
// doivent rester lisibles hors ligne. Pas de vérification en cours d'utilisation :
// une installation forcée couperait une lecture.
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/** Délai maximal de la vérification : au-delà, l'app démarre sans attendre. */
const CHECK_TIMEOUT_MS = 5000;

export type UpdatePhase = "checking" | "downloading" | "installing" | "ready";

// En développement, la version locale n'est pas publiée : pas de vérification.
const phase = ref<UpdatePhase>(import.meta.dev ? "ready" : "checking");
const version = ref("");
const received = ref(0);
const total = ref<number | null>(null);
let started = false;

async function run() {
  try {
    const update = await Promise.race([
      check({ timeout: CHECK_TIMEOUT_MS }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), CHECK_TIMEOUT_MS + 1000)),
    ]);
    if (!update) {
      phase.value = "ready";
      return;
    }
    version.value = update.version;
    phase.value = "downloading";
    await update.download((event) => {
      if (event.event === "Started") total.value = event.data.contentLength ?? null;
      if (event.event === "Progress") received.value += event.data.chunkLength;
    });
    phase.value = "installing";
    // Sous Windows, l'installeur ferme l'app puis la relance lui-même.
    await update.install();
    await relaunch();
  } catch (e) {
    // Hors ligne, Release inaccessible ou installation impossible : on démarre quand même.
    console.warn("Mise à jour impossible", e);
    phase.value = "ready";
  }
}

export function useUpdater() {
  if (!started && phase.value === "checking") {
    started = true;
    void run();
  }
  return { phase, version, received, total };
}
