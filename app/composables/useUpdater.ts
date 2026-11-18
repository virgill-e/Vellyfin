// Mise à jour automatique : vérifie la dernière Release GitHub au démarrage puis toutes
// les 6 h, télécharge la mise à jour en arrière-plan, et laisse l'utilisateur choisir
// le moment du redémarrage (une lecture ou un téléchargement en cours n'est jamais coupé).
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const ready = shallowRef<Update | null>(null);
const installing = ref(false);
const error = ref("");
let started = false;
let checking = false;

async function checkNow() {
  if (checking || ready.value) return;
  checking = true;
  try {
    const update = await check();
    if (!update) return;
    await update.download();
    ready.value = update;
  } catch (e) {
    // Hors ligne ou Release inaccessible : on réessaiera à la prochaine vérification.
    console.warn("Mise à jour : vérification impossible", e);
  } finally {
    checking = false;
  }
}

async function installAndRestart() {
  const update = ready.value;
  if (!update || installing.value) return;
  installing.value = true;
  error.value = "";
  try {
    // Sous Windows, l'installeur ferme l'app puis la relance lui-même.
    await update.install();
    await relaunch();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    installing.value = false;
  }
}

export function useUpdater() {
  // Pas de vérification en développement : la version locale n'est pas publiée.
  if (!started && !import.meta.dev) {
    started = true;
    void checkNow();
    setInterval(checkNow, CHECK_EVERY_MS);
  }
  return { ready, installing, error, installAndRestart, dismiss: () => (ready.value = null) };
}
