import { describe, expect, it } from "vitest";
import type { BaseItemDto, MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import { endsAt, formatRuntime, languageName, peopleOf, streamLanguages } from "../../app/utils/item-info";
import { toTicks } from "../../app/utils/progress";

describe("formatRuntime", () => {
  it("affiche heures et minutes", () => {
    expect(formatRuntime(toTicks(2 * 3600 + 8 * 60))).toBe("2 h 08 min");
    expect(formatRuntime(toTicks(45 * 60))).toBe("45 min");
    expect(formatRuntime(null)).toBe("");
  });
});

describe("endsAt", () => {
  it("ajoute le temps restant depuis la position de reprise", () => {
    const now = new Date(2026, 10, 18, 20, 30);
    expect(endsAt(toTicks(2 * 3600), 0, now)).toBe("22:30");
    expect(endsAt(toTicks(2 * 3600), toTicks(3600), now)).toBe("21:30");
    expect(endsAt(toTicks(10 * 60), 0, new Date(2026, 10, 18, 23, 55))).toBe("0:05");
  });
});

describe("languageName", () => {
  it("traduit les codes ISO 639-1, 639-2/T et 639-2/B", () => {
    expect(languageName("fr")).toBe("Français");
    expect(languageName("fre")).toBe("Français");
    expect(languageName("eng")).toBe("Anglais");
    expect(languageName("ger")).toBe("Allemand");
  });

  it("ignore les codes absents ou indéterminés", () => {
    expect(languageName("und")).toBeNull();
    expect(languageName(null)).toBeNull();
  });
});

describe("streamLanguages", () => {
  it("liste les langues distinctes, audio et sous-titres séparés", () => {
    const streams = [
      { Type: "Video" },
      { Type: "Audio", Language: "fre" },
      { Type: "Audio", Language: "eng" },
      { Type: "Audio", Language: "fre", DisplayTitle: "Français - Commentaires" },
      { Type: "Subtitle", Language: "fre" },
      { Type: "Subtitle", DisplayTitle: "Forced" },
    ] as MediaStream[];
    expect(streamLanguages(streams)).toEqual({ audio: ["Français", "Anglais"], subtitles: ["Français", "Forced"] });
  });
});

describe("peopleOf", () => {
  it("filtre par rôle", () => {
    const item = { People: [{ Name: "A", Type: "Director" }, { Name: "B", Type: "Actor" }] } as BaseItemDto;
    expect(peopleOf(item, "Director").map((p) => p.Name)).toEqual(["A"]);
    expect(peopleOf(null, "Actor")).toEqual([]);
  });
});
