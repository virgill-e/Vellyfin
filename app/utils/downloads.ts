// Règles des téléchargements : choix de la piste audio, estimation de taille,
// regroupement de la bibliothèque hors ligne et épisode suivant hors ligne.
import type { AudioTrack } from "./playback";
import type { DownloadMeta } from "./native";
import { languageName } from "./item-info";
import { toSeconds } from "./progress";

/** Piste dans la langue préférée (première trouvée), ou null. */
export function pickAudio(tracks: AudioTrack[], preferred: string | null): number | null {
  if (!preferred) return null;
  const wanted = normalizeLanguage(preferred);
  return tracks.find((t) => t.language && normalizeLanguage(t.language) === wanted)?.index ?? null;
}

/** « fre », « fra », « fr » désignent la même langue. */
function normalizeLanguage(code: string): string {
  return languageName(code) ?? code.toLowerCase();
}

/**
 * Taille estimée en octets : débit plafonné × durée, sinon taille ou débit du fichier
 * d'origine (remux), null si rien ne permet d'estimer.
 */
export function estimateSize(
  runtimeTicks: number | null | undefined,
  maxBitrate: number | undefined,
  source: { Size?: number | null; Bitrate?: number | null } | undefined,
): number | null {
  const seconds = runtimeTicks ? toSeconds(runtimeTicks) : 0;
  if (maxBitrate && seconds) {
    const sourceBitrate = source?.Bitrate ?? Infinity;
    return Math.round((Math.min(maxBitrate, sourceBitrate) * seconds) / 8);
  }
  if (source?.Size) return source.Size;
  if (source?.Bitrate && seconds) return Math.round((source.Bitrate * seconds) / 8);
  return null;
}

/** « 4,2 Go », « 850 Mo ». */
export function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Go`;
  return `${Math.max(1, Math.round(bytes / 1e6))} Mo`;
}

export interface SeriesGroup {
  seriesId: string;
  seriesName: string;
  episodes: DownloadMeta[];
  size: number;
}

/** Téléchargements terminés : films à part, épisodes regroupés par série (ordre S/É). */
export function groupOffline(items: DownloadMeta[]): { movies: DownloadMeta[]; series: SeriesGroup[] } {
  const movies: DownloadMeta[] = [];
  const groups = new Map<string, SeriesGroup>();
  for (const item of items) {
    const info = item.info ?? {};
    if (info.kind !== "Episode" || !info.seriesId) {
      movies.push(item);
      continue;
    }
    const group = groups.get(info.seriesId) ?? {
      seriesId: info.seriesId,
      seriesName: info.seriesName ?? item.name,
      episodes: [],
      size: 0,
    };
    group.episodes.push(item);
    group.size += item.size ?? 0;
    groups.set(info.seriesId, group);
  }
  for (const group of groups.values()) group.episodes.sort(byEpisode);
  movies.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return { movies, series: [...groups.values()].sort((a, b) => a.seriesName.localeCompare(b.seriesName, "fr")) };
}

function byEpisode(a: DownloadMeta, b: DownloadMeta): number {
  return (a.info?.season ?? 0) - (b.info?.season ?? 0) || (a.info?.episode ?? 0) - (b.info?.episode ?? 0);
}

/** Épisode téléchargé qui suit celui-ci dans la même série, ou null. */
export function nextOfflineEpisode(items: DownloadMeta[], current: DownloadMeta): DownloadMeta | null {
  const seriesId = current.info?.seriesId;
  if (current.info?.kind !== "Episode" || !seriesId) return null;
  const episodes = items
    .filter((d) => d.state === "completed" && d.info?.seriesId === seriesId && d.info?.kind === "Episode")
    .sort(byEpisode);
  const index = episodes.findIndex((d) => d.itemId === current.itemId);
  return index >= 0 ? (episodes[index + 1] ?? null) : null;
}
