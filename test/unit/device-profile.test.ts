import { describe, expect, it } from "vitest";
import { buildDeviceProfile, detectCodecs } from "../../app/utils/device-profile";
import { transcodeReasons } from "../../app/utils/playback";

const all = { h264: true, hevc: true, aac: true, ac3: true, eac3: true };

describe("buildDeviceProfile", () => {
  it("annonce le HEVC quand le WebView le décode (remux possible)", () => {
    const hls = buildDeviceProfile(all).TranscodingProfiles![0]!;
    expect(hls.VideoCodec).toBe("hevc,h264");
    expect(hls.Protocol).toBe("hls");
    expect(hls.Container).toBe("mp4");
  });

  it("se limite au H.264 sans HEVC (transcodage serveur)", () => {
    const hls = buildDeviceProfile({ ...all, hevc: false }).TranscodingProfiles![0]!;
    expect(hls.VideoCodec).toBe("h264");
  });

  it("retombe sur h264/aac si rien n'est détecté", () => {
    const none = { h264: false, hevc: false, aac: false, ac3: false, eac3: false };
    const hls = buildDeviceProfile(none).TranscodingProfiles![0]!;
    expect(hls.VideoCodec).toBe("h264");
    expect(hls.AudioCodec).toBe("aac");
  });

  it("demande les sous-titres texte en WebVTT externe", () => {
    expect(buildDeviceProfile(all).SubtitleProfiles).toEqual([{ Format: "vtt", Method: "External" }]);
  });
});

describe("detectCodecs", () => {
  it("interroge le WebView pour chaque codec", () => {
    const seen: string[] = [];
    const result = detectCodecs((type) => {
      seen.push(type);
      return type.includes("hvc1");
    });
    expect(result.hevc).toBe(true);
    expect(result.h264).toBe(false);
    expect(seen).toHaveLength(5);
  });
});

describe("transcodeReasons", () => {
  it("lit les raisons depuis l'URL de Jellyfin", () => {
    expect(transcodeReasons("/videos/x/master.m3u8?a=1&TranscodeReasons=ContainerNotSupported,AudioCodecNotSupported"))
      .toEqual(["ContainerNotSupported", "AudioCodecNotSupported"]);
    expect(transcodeReasons("/videos/x/master.m3u8?a=1")).toEqual([]);
  });
});

describe("describeTranscoding", () => {
  it("signale une vidéo copiée (remux)", async () => {
    const { describeTranscoding } = await import("../../app/utils/playback");
    expect(
      describeTranscoding({ IsVideoDirect: true, IsAudioDirect: false, VideoCodec: "hevc", AudioCodec: "aac" }),
    ).toBe("Vidéo copiée (hevc) · Audio transcodé (aac)");
  });

  it("signale un transcodage vidéo et l'accélération matérielle", async () => {
    const { describeTranscoding } = await import("../../app/utils/playback");
    expect(
      describeTranscoding({
        IsVideoDirect: false,
        IsAudioDirect: true,
        VideoCodec: "h264",
        AudioCodec: "aac",
        HardwareAccelerationType: "vaapi",
      }),
    ).toBe("Vidéo transcodée (h264) · Audio copié (aac) · VAAPI");
  });
});
