// Aperçus de la barre de lecture : planches de vignettes générées par Jellyfin,
// téléchargées à la demande avec le jeton (en-tête, jamais dans l'URL) et gardées en mémoire.
import type { Api } from "@jellyfin/sdk";
import { trickplayFrame, type Trickplay } from "~/utils/player";

export interface TrickplayPreview {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function useTrickplay(
  api: () => Api | null,
  itemId: string,
  mediaSourceId: () => string | null,
  trickplay: () => Trickplay | null,
) {
  const tiles = reactive(new Map<number, string>());
  const loading = new Set<number>();

  async function load(tile: number) {
    const client = api();
    const config = trickplay();
    const source = mediaSourceId();
    if (!client || !config || !source || loading.has(tile)) return;
    loading.add(tile);
    try {
      const { data } = await client.axiosInstance.get<Blob>(
        `${client.basePath}/Videos/${itemId}/Trickplay/${config.width}/${tile}.jpg`,
        { params: { mediaSourceId: source }, responseType: "blob", headers: { Authorization: client.authorizationHeader } },
      );
      tiles.set(tile, URL.createObjectURL(data));
    } catch {
      // Pas d'aperçu pour cette planche : la barre fonctionne sans.
    }
  }

  /** Vignette pour un instant (null si indisponible ou pas encore chargée). */
  function preview(seconds: number): TrickplayPreview | null {
    const config = trickplay();
    if (!config) return null;
    const frame = trickplayFrame(seconds, config);
    const src = tiles.get(frame.tile);
    if (!src) {
      void load(frame.tile);
      return null;
    }
    return { src, x: frame.x, y: frame.y, width: config.info.Width, height: config.info.Height };
  }

  onBeforeUnmount(() => {
    for (const url of tiles.values()) URL.revokeObjectURL(url);
  });

  return { preview };
}
