import { describe, expect, it } from "vitest";
import { compareVersions } from "../../app/utils/version";

describe("compareVersions", () => {
  it("compare les composantes numériquement", () => {
    expect(compareVersions("12.10.0", "12.4.0")).toBe(1);
    expect(compareVersions("12.3.9", "12.4.0")).toBe(-1);
    expect(compareVersions("12.4", "12.4.0")).toBe(0);
  });
});
