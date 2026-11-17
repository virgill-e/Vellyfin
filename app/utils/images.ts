// URL d'images Jellyfin, toujours redimensionnées côté serveur.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

export function posterUrl(base: string, item: BaseItemDto, width = 300): string | undefined {
  const tag = item.ImageTags?.Primary;
  return tag ? `${base}/Items/${item.Id}/Images/Primary?maxWidth=${width}&tag=${tag}` : undefined;
}

/** Vignette d'une médiathèque (image principale de la vue, au format 16:9). */
export function libraryImageUrl(base: string, view: BaseItemDto, width = 640): string | undefined {
  return posterUrl(base, view, width);
}

/** Image large : fond de l'élément, sinon celui de la série (épisodes). */
export function backdropUrl(base: string, item: BaseItemDto, width = 1920): string | undefined {
  const own = item.BackdropImageTags?.[0];
  if (own) return `${base}/Items/${item.Id}/Images/Backdrop/0?maxWidth=${width}&tag=${own}`;
  const parent = item.ParentBackdropImageTags?.[0];
  if (parent && item.ParentBackdropItemId) {
    return `${base}/Items/${item.ParentBackdropItemId}/Images/Backdrop/0?maxWidth=${width}&tag=${parent}`;
  }
  return undefined;
}

/** Vignette 16:9 : image principale d'un épisode, sinon fond. */
export function thumbUrl(base: string, item: BaseItemDto, width = 480): string | undefined {
  if (item.Type === "Episode") return posterUrl(base, item, width);
  return backdropUrl(base, item, width) ?? posterUrl(base, item, width);
}
