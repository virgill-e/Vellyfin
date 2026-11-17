// Profil d'appareil envoyé à Jellyfin (ADR-001) : construit à partir de ce que
// le WebView sait réellement décoder, pour que le serveur remuxe quand c'est
// possible et ne transcode qu'en dernier recours.
import type { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";

export interface CodecSupport {
  h264: boolean;
  hevc: boolean;
  aac: boolean;
  ac3: boolean;
  eac3: boolean;
}

const PROBES: Record<keyof CodecSupport, string> = {
  h264: 'video/mp4; codecs="avc1.640028"',
  hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  ac3: 'audio/mp4; codecs="ac-3"',
  eac3: 'audio/mp4; codecs="ec-3"',
};

type TypeProbe = (type: string) => boolean;

function defaultProbe(): TypeProbe {
  const ms =
    (globalThis as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource ??
    globalThis.MediaSource;
  return ms ? (type) => ms.isTypeSupported(type) : () => false;
}

export function detectCodecs(probe: TypeProbe = defaultProbe()): CodecSupport {
  return Object.fromEntries(
    Object.entries(PROBES).map(([codec, type]) => [codec, probe(type)]),
  ) as unknown as CodecSupport;
}

export function buildDeviceProfile(codecs: CodecSupport): DeviceProfile {
  const videoCodecs = [codecs.hevc && "hevc", codecs.h264 && "h264"].filter(Boolean).join(",");
  const audioCodecs = [codecs.aac && "aac", codecs.eac3 && "eac3", codecs.ac3 && "ac3"]
    .filter(Boolean)
    .join(",");

  return {
    Name: "Vellyfin",
    MaxStreamingBitrate: 120_000_000,
    MaxStaticBitrate: 120_000_000,
    // Tout passe par HLS fMP4 : un seul chemin pour le streaming et le téléchargement.
    DirectPlayProfiles: [],
    TranscodingProfiles: [
      {
        Container: "mp4",
        Type: "Video",
        Protocol: "hls",
        Context: "Streaming",
        VideoCodec: videoCodecs || "h264",
        AudioCodec: audioCodecs || "aac",
        MaxAudioChannels: "6",
        BreakOnNonKeyFrames: true,
        MinSegments: 1,
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
      // Sous-titres texte convertis en WebVTT ; les autres (PGS…) sont incrustés.
      { Format: "vtt", Method: "External" },
    ],
  };
}
