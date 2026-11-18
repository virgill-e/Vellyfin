// Calculs du lecteur : aperçus de la barre de lecture (trickplay Jellyfin),
// segments (intro, générique), épisode suivant et raccourcis clavier.
import type { BaseItemDto, MediaSegmentDto, TrickplayInfoDto } from "@jellyfin/sdk/lib/generated-client/models";
import { toSeconds } from "./progress";

export interface Trickplay {
  width: number;
  info: Required<Pick<TrickplayInfoDto, "Width" | "Height" | "TileWidth" | "TileHeight" | "ThumbnailCount" | "Interval">>;
}

/** Résolution d'aperçus la plus petite disponible (largeur ≥ 160) pour la source lue. */
export function trickplayOf(item: BaseItemDto | null, mediaSourceId: string | null): Trickplay | null {
  const byWidth = mediaSourceId ? item?.Trickplay?.[mediaSourceId] : undefined;
  if (!byWidth) return null;
  const candidates = Object.entries(byWidth)
    .map(([width, info]) => ({ width: Number(width), info }))
    .filter(
      ({ width, info }) =>
        width >= 160 && info.Width && info.Height && info.TileWidth && info.TileHeight && info.ThumbnailCount && info.Interval,
    )
    .sort((a, b) => a.width - b.width);
  return (candidates[0] as Trickplay | undefined) ?? null;
}

export interface TrickplayFrame {
  /** Numéro de la planche (image JPEG contenant TileWidth × TileHeight vignettes). */
  tile: number;
  x: number;
  y: number;
}

/** Vignette à afficher pour un instant donné. */
export function trickplayFrame(seconds: number, { info }: Trickplay): TrickplayFrame {
  const index = Math.min(info.ThumbnailCount - 1, Math.max(0, Math.floor((seconds * 1000) / info.Interval)));
  const perTile = info.TileWidth * info.TileHeight;
  const position = index % perTile;
  return {
    tile: Math.floor(index / perTile),
    x: (position % info.TileWidth) * info.Width,
    y: Math.floor(position / info.TileWidth) * info.Height,
  };
}

/** Segment (intro, générique…) en cours à cet instant, parmi les types demandés. */
export function activeSegment(
  seconds: number,
  segments: MediaSegmentDto[],
  types: string[],
): (MediaSegmentDto & { end: number }) | null {
  for (const segment of segments) {
    if (!segment.Type || !types.includes(segment.Type)) continue;
    const start = toSeconds(segment.StartTicks ?? 0);
    const end = toSeconds(segment.EndTicks ?? 0);
    if (end > start && seconds >= start && seconds < end - 1) return { ...segment, end };
  }
  return null;
}

/** Épisode suivant dans une liste ordonnée (résultat de getEpisodes avec adjacentTo). */
export function nextEpisode(episodes: BaseItemDto[], currentId: string): BaseItemDto | null {
  const index = episodes.findIndex((e) => e.Id === currentId);
  return index >= 0 ? (episodes[index + 1] ?? null) : null;
}

export type PlayerAction =
  | "toggle-play"
  | "back-10"
  | "forward-10"
  | "volume-up"
  | "volume-down"
  | "mute"
  | "fullscreen"
  | "exit-fullscreen"
  | "subtitles"
  | "next";

/** Raccourci clavier → action, ou null (laisse passer la touche). */
export function keyAction(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">): PlayerAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  switch (event.key) {
    case " ":
    case "k":
    case "K":
      return "toggle-play";
    case "ArrowLeft":
    case "j":
    case "J":
      return "back-10";
    case "ArrowRight":
    case "l":
    case "L":
      return "forward-10";
    case "ArrowUp":
      return "volume-up";
    case "ArrowDown":
      return "volume-down";
    case "m":
    case "M":
      return "mute";
    case "f":
    case "F":
      return "fullscreen";
    case "Escape":
      return "exit-fullscreen";
    case "c":
    case "C":
      return "subtitles";
    case "n":
    case "N":
      return "next";
    default:
      return null;
  }
}
