// Appels vers le cœur Rust (src-tauri/src).
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type DownloadState =
  | "queued"
  | "downloading"
  | "assembling"
  | "completed"
  | "cancelled"
  | "failed";

export interface DownloadProgress {
  itemId: string;
  state: DownloadState;
  done: number;
  total: number;
  bytes: number;
  /** Octets réellement reçus depuis le démarrage (hors segments déjà présents). */
  downloaded: number;
  error: string | null;
}

export interface DownloadMeta {
  serverId: string;
  userId: string;
  itemId: string;
  name: string;
  state: DownloadState;
  segments: number;
  /** Qualité utilisée (ex. bitrate=original) : une reprise doit la réutiliser. */
  variant: string;
  file: string | null;
  /** Vignette enregistrée localement (disponible hors ligne). */
  image: string | null;
  subtitles: SubtitleFile[];
  info: MediaInfo;
  /** Taille du fichier final (0 tant qu'il n'est pas terminé). */
  size: number;
}

export interface SubtitleFile {
  index: number;
  label: string;
  language?: string | null;
  path: string;
}

export interface MediaInfo {
  kind?: string | null;
  seriesId?: string | null;
  seriesName?: string | null;
  season?: number | null;
  episode?: number | null;
  runtimeTicks?: number | null;
  /** Libellé de la piste audio téléchargée. */
  audio?: string | null;
}

export interface DownloadUsage {
  used: number;
  free: number;
}

export interface DownloadRequest {
  serverId: string;
  userId: string;
  itemId: string;
  name: string;
  playlistUrl: string;
  authorization: string;
  /** Paramètres de qualité ; une reprise n'est possible qu'avec les mêmes. */
  variant: string;
  /** Vignette à enregistrer avec le téléchargement. */
  imageUrl?: string;
  subtitles?: { index: number; label: string; language?: string; url: string }[];
  info?: MediaInfo;
}

export const native = {
  deviceId: () => invoke<string>("device_id"),
  tokenSave: (serverId: string, userId: string, token: string) =>
    invoke<void>("token_save", { serverId, userId, token }),
  tokenLoad: (serverId: string, userId: string) =>
    invoke<string | null>("token_load", { serverId, userId }),
  tokenDelete: (serverId: string, userId: string) =>
    invoke<void>("token_delete", { serverId, userId }),

  downloadStart: (request: DownloadRequest) => invoke<void>("download_start", { request }),
  downloadCancel: (itemId: string) => invoke<void>("download_cancel", { itemId }),
  downloadsList: () => invoke<DownloadMeta[]>("downloads_list"),
  downloadDelete: (serverId: string, userId: string, itemId: string) =>
    invoke<void>("download_delete", { serverId, userId, itemId }),
  downloadsUsage: () => invoke<DownloadUsage>("downloads_usage"),
  onDownloadProgress: (handler: (p: DownloadProgress) => void): Promise<UnlistenFn> =>
    listen<DownloadProgress>("download-progress", (event) => handler(event.payload)),
};
