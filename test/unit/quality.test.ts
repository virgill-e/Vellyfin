import { describe, expect, it } from "vitest";
import { QUALITIES, bitrateOfVariant, variantOf } from "../../app/utils/quality";

describe("variante de qualité", () => {
  it("fait l'aller-retour pour chaque qualité proposée", () => {
    for (const q of QUALITIES) expect(bitrateOfVariant(variantOf(q.maxBitrate))).toBe(q.maxBitrate);
  });

  it("reste compatible avec l'identifiant enregistré par le Rust", () => {
    expect(variantOf()).toBe("bitrate=original");
    expect(variantOf(8_000_000)).toBe("bitrate=8000000");
    expect(bitrateOfVariant("")).toBeUndefined();
  });
});
