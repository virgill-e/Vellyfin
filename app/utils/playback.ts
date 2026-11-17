// Négociation de lecture avec Jellyfin : PlaybackInfo + profil d'appareil
// → URL HLS (remux ou transcodage) et sous-titres WebVTT.
import type { Api } from "@jellyfin/sdk";
import type { MediaStream, TranscodingInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi } from "@jellyfin/sdk/lib/utils/api/media-info-api";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { buildDeviceProfile, detectCodecs } from "./device-profile";

export interface PlaybackOptions {
  userId: string;
  /** Débit plafonné (bit/s) ; absent = qualité d'origine (remux si possible). */
  maxBitrate?: number;
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
  startTimeTicks?: number;
}

export interface PlaybackSource {
  playSessionId: string;
  mediaSourceId: string;
  /** URL absolue de la playlist HLS. */
  playlistUrl: string;
  /**
   * Raisons données par Jellyfin. Contient toujours « DirectPlayError » : Vellyfin
   * désactive volontairement la lecture directe pour tout faire passer par HLS.
   * Pour savoir si la vidéo est copiée, voir {@link describeTranscoding}.
   */
  transcodeReasons: string[];
  textSubtitles: { index: number; label: string; language?: string; url: string }[];
  audioStreams: MediaStream[];
}

export async function negotiatePlayback(
  api: Api,
  itemId: string,
  options: PlaybackOptions,
): Promise<PlaybackSource> {
  const { data } = await getMediaInfoApi(api).getPostedPlaybackInfo({
    itemId,
    playbackInfoDto: {
      UserId: options.userId,
      DeviceProfile: buildDeviceProfile(detectCodecs()),
      MaxStreamingBitrate: options.maxBitrate ?? 120_000_000,
      AudioStreamIndex: options.audioStreamIndex,
      SubtitleStreamIndex: options.subtitleStreamIndex,
      StartTimeTicks: options.startTimeTicks,
      EnableDirectPlay: false,
      EnableDirectStream: false,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: false,
    },
  });

  const source = data.MediaSources?.[0];
  if (!data.PlaySessionId || !source?.Id || !source.TranscodingUrl) {
    throw new Error(data.ErrorCode ? `Lecture refusée : ${data.ErrorCode}` : "Aucun flux lisible.");
  }

  const streams = source.MediaStreams ?? [];
  const textSubtitles = streams
    .filter((s) => s.Type === "Subtitle" && s.DeliveryMethod === "External" && s.DeliveryUrl)
    .map((s) => ({
      index: s.Index ?? -1,
      label: s.DisplayTitle ?? s.Language ?? `Piste ${s.Index}`,
      language: s.Language ?? undefined,
      url: absolute(api, s.DeliveryUrl!),
    }));

  return {
    playSessionId: data.PlaySessionId,
    mediaSourceId: source.Id,
    playlistUrl: absolute(api, source.TranscodingUrl),
    transcodeReasons: transcodeReasons(source.TranscodingUrl),
    textSubtitles,
    audioStreams: streams.filter((s) => s.Type === "Audio"),
  };
}

/** Arrête le transcodage côté serveur (route non documentée dans l'OpenAPI 12.4, mais présente). */
export async function stopEncoding(api: Api, playSessionId: string) {
  await api.axiosInstance.delete(`${api.basePath}/Videos/ActiveEncodings`, {
    params: { deviceId: api.deviceInfo.id, playSessionId },
    headers: { Authorization: api.authorizationHeader },
  });
}

function absolute(api: Api, path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${api.basePath}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function transcodeReasons(url: string): string[] {
  const query = url.includes("?") ? url.slice(url.indexOf("?") + 1) : "";
  const value = new URLSearchParams(query).get("TranscodeReasons");
  return value ? value.split(",").filter(Boolean) : [];
}

/**
 * État réel du flux côté serveur (copie ou transcodage), lu dans la session
 * Jellyfin de cet appareil. Disponible quelques secondes après le début du flux.
 */
export async function fetchTranscodingInfo(api: Api): Promise<TranscodingInfo | null> {
  const { data } = await getSessionApi(api).getSessions({ deviceId: api.deviceInfo.id });
  return data.find((s) => s.TranscodingInfo)?.TranscodingInfo ?? null;
}

/** Résumé lisible : « Vidéo copiée (hevc) · Audio transcodé (aac) · VAAPI ». */
export function describeTranscoding(info: TranscodingInfo): string {
  const video = info.IsVideoDirect ? "Vidéo copiée" : "Vidéo transcodée";
  const audio = info.IsAudioDirect ? "Audio copié" : "Audio transcodé";
  const parts = [
    `${video}${info.VideoCodec ? ` (${info.VideoCodec})` : ""}`,
    `${audio}${info.AudioCodec ? ` (${info.AudioCodec})` : ""}`,
  ];
  const hw = info.HardwareAccelerationType;
  if (!info.IsVideoDirect && hw && hw !== "none") parts.push(hw.toUpperCase());
  return parts.join(" · ");
}
