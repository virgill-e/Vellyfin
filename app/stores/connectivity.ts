// Joignabilité du serveur Jellyfin (pas seulement du réseau : un Wi-Fi sans accès
// au serveur compte comme hors ligne). Vérifiée au démarrage, aux changements de
// réseau, toutes les 15 s hors ligne et toutes les 2 min en ligne.
import { acceptHMRUpdate, defineStore } from "pinia";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api/system-api";

const PING_TIMEOUT_MS = 4000;
const RETRY_OFFLINE_MS = 15_000;
const RECHECK_ONLINE_MS = 120_000;

export type Connectivity = "unknown" | "online" | "offline";

export const useConnectivityStore = defineStore("connectivity", () => {
  const session = useSessionStore();
  const status = ref<Connectivity>("unknown");
  const offline = computed(() => status.value === "offline");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let checking: Promise<Connectivity> | null = null;
  let started = false;

  /** Vérifie maintenant (une seule vérification à la fois). */
  function check(): Promise<Connectivity> {
    checking ??= ping().finally(() => (checking = null));
    return checking;
  }

  async function ping(): Promise<Connectivity> {
    const api = session.api;
    let next: Connectivity;
    if (!navigator.onLine) next = "offline";
    else if (!api) next = "unknown";
    else {
      try {
        await getSystemApi(api).getPingSystem({ timeout: PING_TIMEOUT_MS });
        next = "online";
      } catch (e) {
        // Le serveur a répondu (même par une erreur) : il est joignable.
        next = (e as { response?: unknown }).response ? "online" : "offline";
      }
    }
    status.value = next;
    schedule();
    return next;
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void check(), status.value === "offline" ? RETRY_OFFLINE_MS : RECHECK_ONLINE_MS);
  }

  /** Signalé par une requête échouée faute de réseau : revérifie tout de suite. */
  function reportFailure() {
    if (status.value !== "offline") void check();
  }

  function start() {
    if (started) return;
    started = true;
    window.addEventListener("online", () => void check());
    window.addEventListener("offline", () => {
      status.value = "offline";
      schedule();
    });
    void check();
  }

  return { status, offline, check, reportFailure, start };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useConnectivityStore, import.meta.hot));
