// Positions de lecture enregistrées sur cet appareil, et synchronisation avec Jellyfin.
// Chaque lecture (en ligne ou hors ligne) écrit ici sa position ; ce qui n'a pas pu être
// envoyé au serveur est marqué « non synchronisé » et envoyé au retour du réseau.
// Conflit (le même élément regardé ailleurs entre-temps) : la date la plus récente l'emporte.
import { acceptHMRUpdate, defineStore } from "pinia";
import { getUserDataApi } from "@jellyfin/sdk/lib/utils/api/user-data-api";
import { localIsNewer, resumeState, toTicks } from "~/utils/progress";

const STORAGE_KEY = "vellyfin.progress";
const SYNC_EVERY_MS = 5 * 60 * 1000;

export interface LocalProgress {
  serverId: string;
  userId: string;
  itemId: string;
  positionTicks: number;
  durationTicks: number;
  /** Date ISO de la dernière position enregistrée. */
  updatedAt: string;
  synced: boolean;
}

function load(): Record<string, LocalProgress> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const useProgressStore = defineStore("progress", () => {
  const session = useSessionStore();
  const entries = ref<Record<string, LocalProgress>>(load());
  let syncing: Promise<void> | null = null;
  let started = false;

  const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value));

  function keyOf(itemId: string): string | null {
    const current = session.session;
    return current ? `${current.serverId}/${current.userId}/${itemId}` : null;
  }

  /** Dernière position connue sur cet appareil pour le compte courant. */
  function local(itemId: string): LocalProgress | null {
    const key = keyOf(itemId);
    return key ? (entries.value[key] ?? null) : null;
  }

  /** Enregistre la position courante (écriture synchrone : survit à une fermeture brutale). */
  function record(itemId: string, positionSeconds: number, durationSeconds: number, synced = false) {
    const current = session.session;
    const key = keyOf(itemId);
    if (!current || !key || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    entries.value[key] = {
      serverId: current.serverId,
      userId: current.userId,
      itemId,
      positionTicks: toTicks(Math.max(0, positionSeconds)),
      durationTicks: toTicks(durationSeconds),
      updatedAt: new Date().toISOString(),
      synced,
    };
    persist();
  }

  function markSynced(itemId: string) {
    const entry = local(itemId);
    if (!entry || entry.synced) return;
    entry.synced = true;
    persist();
  }

  /** Envoie au serveur les positions non synchronisées du compte courant. */
  function flush(): Promise<void> {
    syncing ??= doFlush().finally(() => (syncing = null));
    return syncing;
  }

  async function doFlush() {
    const api = session.api;
    const current = session.session;
    if (!api || !current) return;
    const userData = getUserDataApi(api);
    const pending = Object.entries(entries.value).filter(
      ([, e]) => !e.synced && e.serverId === current.serverId && e.userId === current.userId,
    );

    for (const [key, entry] of pending) {
      try {
        const { data: server } = await userData.getItemUserData({ itemId: entry.itemId, userId: entry.userId });
        if (!localIsNewer(entry.updatedAt, server.LastPlayedDate)) {
          // Regardé ailleurs plus récemment : on adopte la position du serveur.
          entries.value[key] = {
            ...entry,
            positionTicks: server.Played ? 0 : (server.PlaybackPositionTicks ?? 0),
            synced: true,
          };
          continue;
        }
        const state = resumeState(entry.positionTicks, entry.durationTicks);
        if (state) {
          await userData.updateItemUserData({
            itemId: entry.itemId,
            userId: entry.userId,
            updateUserItemDataDto: {
              PlaybackPositionTicks: state.positionTicks,
              Played: state.played,
              LastPlayedDate: entry.updatedAt,
            },
          });
        }
        entry.synced = true;
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status;
        if (status === 404) {
          delete entries.value[key]; // Élément supprimé du serveur.
          continue;
        }
        break; // Réseau indisponible : on réessaiera plus tard.
      }
    }
    persist();
  }

  /** Synchronise au démarrage, au retour du réseau et toutes les 5 min. */
  function startSync() {
    if (started) return;
    started = true;
    void flush();
    window.addEventListener("online", () => void flush());
    setInterval(() => void flush(), SYNC_EVERY_MS);
  }

  return { entries, local, record, markSynced, flush, startSync };
});

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useProgressStore, import.meta.hot));
