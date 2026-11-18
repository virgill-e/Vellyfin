import { describe, expect, it } from "vitest";
import type { DownloadMeta } from "../../app/utils/native";
import { estimateSize, formatSize, groupOffline, nextOfflineEpisode, pickAudio } from "../../app/utils/downloads";
import { parseVariant, variantOf } from "../../app/utils/quality";
import { toTicks } from "../../app/utils/progress";

describe("pickAudio", () => {
  const tracks = [
    { index: 1, label: "English", language: "eng" },
    { index: 2, label: "Français", language: "fre" },
  ];
  it("trouve la langue préférée quel que soit le code ISO", () => {
    expect(pickAudio(tracks, "fra")).toBe(2);
    expect(pickAudio(tracks, "fre")).toBe(2);
    expect(pickAudio(tracks, "en")).toBe(1);
  });
  it("renvoie null sans préférence ou si la langue manque", () => {
    expect(pickAudio(tracks, null)).toBeNull();
    expect(pickAudio(tracks, "ger")).toBeNull();
  });
});

describe("variant", () => {
  it("encode et relit qualité, piste audio et source", () => {
    const v = variantOf({ maxBitrate: 4_000_000, audioStreamIndex: 2, mediaSourceId: "abc" });
    expect(v).toBe("bitrate=4000000;audio=2;source=abc");
    expect(parseVariant(v)).toEqual({ maxBitrate: 4_000_000, audioStreamIndex: 2, mediaSourceId: "abc" });
  });
  it("reste compatible avec les anciens identifiants", () => {
    expect(variantOf({})).toBe("bitrate=original");
    expect(parseVariant("bitrate=original")).toEqual({ maxBitrate: undefined, audioStreamIndex: undefined, mediaSourceId: undefined });
  });
});

describe("estimateSize", () => {
  const twoHours = toTicks(7200);
  it("débit plafonné × durée, sans dépasser le débit d'origine", () => {
    expect(estimateSize(twoHours, 8_000_000, { Bitrate: 20_000_000 })).toBe(7_200_000_000);
    expect(estimateSize(twoHours, 8_000_000, { Bitrate: 4_000_000 })).toBe(3_600_000_000);
  });
  it("qualité d'origine : taille du fichier source", () => {
    expect(estimateSize(twoHours, undefined, { Size: 12e9 })).toBe(12e9);
    expect(estimateSize(null, undefined, undefined)).toBeNull();
  });
  it("formate en Go ou Mo", () => {
    expect(formatSize(4.25e9)).toBe("4,3 Go");
    expect(formatSize(850e6)).toBe("850 Mo");
  });
});

const meta = (itemId: string, info: DownloadMeta["info"], name = itemId): DownloadMeta => ({
  serverId: "s",
  userId: "u",
  itemId,
  name,
  state: "completed",
  segments: 1,
  variant: "bitrate=original",
  file: "/f",
  image: null,
  subtitles: [],
  info,
  size: 100,
});

describe("groupOffline", () => {
  it("sépare les films et regroupe les épisodes par série, dans l'ordre", () => {
    const items = [
      meta("e2", { kind: "Episode", seriesId: "S", seriesName: "Série", season: 1, episode: 2 }),
      meta("m", { kind: "Movie" }, "Film"),
      meta("e1", { kind: "Episode", seriesId: "S", seriesName: "Série", season: 1, episode: 1 }),
      meta("old", {}),
    ];
    const { movies, series } = groupOffline(items);
    expect(movies.map((m) => m.itemId)).toEqual(["m", "old"]);
    expect(series).toHaveLength(1);
    expect(series[0]!.episodes.map((e) => e.itemId)).toEqual(["e1", "e2"]);
    expect(series[0]!.size).toBe(200);
  });
});

describe("nextOfflineEpisode", () => {
  it("passe à l'épisode téléchargé suivant, y compris la saison suivante", () => {
    const items = [
      meta("s1e1", { kind: "Episode", seriesId: "S", season: 1, episode: 1 }),
      meta("s2e1", { kind: "Episode", seriesId: "S", season: 2, episode: 1 }),
      meta("s1e2", { kind: "Episode", seriesId: "S", season: 1, episode: 2 }),
    ];
    expect(nextOfflineEpisode(items, items[0]!)?.itemId).toBe("s1e2");
    expect(nextOfflineEpisode(items, items[2]!)?.itemId).toBe("s2e1");
    expect(nextOfflineEpisode(items, items[1]!)).toBeNull();
  });
});
