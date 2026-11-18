import { describe, expect, it } from "vitest";
import type { MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import { audioTracks, streamAudioIndex } from "../../app/utils/playback";

describe("audioTracks", () => {
  it("ne garde que les pistes audio, dans l'ordre, avec leur libellé", () => {
    const streams = [
      { Type: "Video", Index: 0 },
      { Type: "Audio", Index: 1, DisplayTitle: "Français - E-AC-3 - 5.1 - Par défaut" },
      { Type: "Audio", Index: 2, Language: "eng" },
      { Type: "Audio", Index: 3 },
      { Type: "Subtitle", Index: 4, DisplayTitle: "Français" },
    ] as MediaStream[];
    expect(audioTracks(streams)).toEqual([
      { index: 1, label: "Français - E-AC-3 - 5.1 - Par défaut" },
      { index: 2, label: "eng", language: "eng" },
      { index: 3, label: "Piste 3" },
    ]);
  });

  it("ignore une piste sans index (non sélectionnable)", () => {
    expect(audioTracks([{ Type: "Audio", DisplayTitle: "?" }] as MediaStream[])).toEqual([]);
  });
});

describe("streamAudioIndex", () => {
  it("lit la piste audio inscrite dans l'URL de transcodage", () => {
    expect(streamAudioIndex("/videos/x/master.m3u8?MediaSourceId=a&AudioStreamIndex=2&VideoCodec=hevc")).toBe(2);
  });

  it("renvoie null si l'URL ne précise pas de piste", () => {
    expect(streamAudioIndex("/videos/x/master.m3u8?MediaSourceId=a")).toBeNull();
    expect(streamAudioIndex("/videos/x/master.m3u8?AudioStreamIndex=")).toBeNull();
  });
});
