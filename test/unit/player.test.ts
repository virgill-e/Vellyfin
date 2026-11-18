import { describe, expect, it } from "vitest";
import type { BaseItemDto, MediaSegmentDto } from "@jellyfin/sdk/lib/generated-client/models";
import { activeSegment, keyAction, nextEpisode, trickplayFrame, trickplayOf } from "../../app/utils/player";
import { toTicks } from "../../app/utils/progress";

const info = { Width: 320, Height: 180, TileWidth: 10, TileHeight: 10, ThumbnailCount: 250, Interval: 10_000 };

describe("trickplayOf", () => {
  it("choisit la plus petite résolution utilisable de la source lue", () => {
    const item = { Trickplay: { src: { "320": info, "640": { ...info, Width: 640 }, "120": { ...info, Width: 120 } } } } as BaseItemDto;
    expect(trickplayOf(item, "src")?.width).toBe(320);
    expect(trickplayOf(item, "autre")).toBeNull();
    expect(trickplayOf(null, "src")).toBeNull();
  });
});

describe("trickplayFrame", () => {
  const config = { width: 320, info };

  it("situe la vignette dans sa planche", () => {
    expect(trickplayFrame(0, config)).toEqual({ tile: 0, x: 0, y: 0 });
    // 125 s → vignette 12 : planche 0, colonne 2, ligne 1.
    expect(trickplayFrame(125, config)).toEqual({ tile: 0, x: 640, y: 180 });
    // 1500 s → vignette 150 : planche 1, colonne 0, ligne 5.
    expect(trickplayFrame(1500, config)).toEqual({ tile: 1, x: 0, y: 900 });
  });

  it("borne aux vignettes existantes", () => {
    expect(trickplayFrame(99_999, config).tile).toBe(2);
    expect(trickplayFrame(-5, config)).toEqual({ tile: 0, x: 0, y: 0 });
  });
});

describe("activeSegment", () => {
  const segments = [
    { Type: "Intro", StartTicks: toTicks(30), EndTicks: toTicks(90) },
    { Type: "Outro", StartTicks: toTicks(2500), EndTicks: toTicks(2600) },
  ] as MediaSegmentDto[];

  it("trouve le segment en cours parmi les types demandés", () => {
    expect(activeSegment(45, segments, ["Intro"])?.end).toBe(90);
    expect(activeSegment(45, segments, ["Outro"])).toBeNull();
    expect(activeSegment(10, segments, ["Intro"])).toBeNull();
  });

  it("disparaît juste avant la fin du segment", () => {
    expect(activeSegment(89.5, segments, ["Intro"])).toBeNull();
  });
});

describe("nextEpisode", () => {
  const episodes = [{ Id: "a" }, { Id: "b" }, { Id: "c" }] as BaseItemDto[];
  it("renvoie l'épisode qui suit, ou null", () => {
    expect(nextEpisode(episodes, "b")?.Id).toBe("c");
    expect(nextEpisode(episodes, "c")).toBeNull();
    expect(nextEpisode(episodes, "x")).toBeNull();
  });
});

describe("keyAction", () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    keyAction({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods });

  it("associe les raccourcis du lecteur", () => {
    expect(key(" ")).toBe("toggle-play");
    expect(key("ArrowLeft")).toBe("back-10");
    expect(key("ArrowRight")).toBe("forward-10");
    expect(key("f")).toBe("fullscreen");
    expect(key("M")).toBe("mute");
    expect(key("Escape")).toBe("exit-fullscreen");
  });

  it("laisse passer les combinaisons système et les autres touches", () => {
    expect(key("f", { metaKey: true })).toBeNull();
    expect(key("q")).toBeNull();
  });
});
