import { acceptHMRUpdate, defineStore } from "pinia";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserViewApi } from "@jellyfin/sdk/lib/utils/api/user-view-api";

/** Types de médiathèques gérés en v1 (docs/ANALYSE.md §3). */
const SUPPORTED = new Set(["movies", "tvshows"]);

export const useLibrariesStore = defineStore("libraries", () => {
  const session = useSessionStore();
  const items = ref<BaseItemDto[]>([]);
  let loaded: Promise<void> | null = null;

  function load(): Promise<void> {
    loaded ??= (async () => {
      const api = session.api;
      const userId = session.session?.userId;
      if (!api || !userId) return;
      try {
        const { data } = await getUserViewApi(api).getUserViews({ userId });
        items.value = (data.Items ?? []).filter((v) => SUPPORTED.has(v.CollectionType ?? ""));
      } catch {
        loaded = null; // Hors ligne : nouvel essai au prochain affichage.
      }
    })();
    return loaded;
  }

  function byId(id: string) {
    return items.value.find((l) => l.Id === id);
  }

  function reset() {
    items.value = [];
    loaded = null;
  }

  return { items, load, byId, reset };
});

// Développement : remplace le store à chaud au lieu de garder une version périmée.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useLibrariesStore, import.meta.hot));
