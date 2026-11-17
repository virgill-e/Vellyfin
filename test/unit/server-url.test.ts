import { describe, expect, it } from "vitest";
import { isPrivateHost, normalizeServerUrl } from "../../app/utils/server-url";

describe("normalizeServerUrl", () => {
  it("ajoute https par défaut et retire le slash final", () => {
    expect(normalizeServerUrl("jellyfin.example.com/")).toBe("https://jellyfin.example.com");
  });

  it("conserve un chemin de base", () => {
    expect(normalizeServerUrl("https://example.com/jellyfin/")).toBe("https://example.com/jellyfin");
  });

  it("refuse http hors réseau local", () => {
    expect(() => normalizeServerUrl("http://jellyfin.example.com")).toThrow(/HTTPS/);
  });

  it("accepte http sur une adresse privée", () => {
    expect(normalizeServerUrl("http://192.168.1.10:8096")).toBe("http://192.168.1.10:8096");
  });

  it("refuse une entrée vide", () => {
    expect(() => normalizeServerUrl("  ")).toThrow();
  });
});

describe("isPrivateHost", () => {
  it.each(["localhost", "10.0.0.5", "172.16.0.1", "192.168.0.2", "zax.local"])("%s est local", (h) => {
    expect(isPrivateHost(h)).toBe(true);
  });

  it.each(["172.32.0.1", "8.8.8.8", "example.com"])("%s n'est pas local", (h) => {
    expect(isPrivateHost(h)).toBe(false);
  });
});
