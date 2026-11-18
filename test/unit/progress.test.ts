import { describe, expect, it } from "vitest";
import { formatClock, localIsNewer, pickResume, resumeSeconds, resumeState, toTicks } from "../../app/utils/progress";

const film = toTicks(2 * 3600); // 2 h

describe("resumeState", () => {
  it("enregistre une position au milieu du film", () => {
    expect(resumeState(toTicks(3600), film)).toEqual({ played: false, positionTicks: toTicks(3600) });
  });

  it("marque vu au-delà de 90 %", () => {
    expect(resumeState(toTicks(6600), film)).toEqual({ played: true, positionTicks: 0 });
  });

  it("n'enregistre rien avant 5 %", () => {
    expect(resumeState(toTicks(60), film)).toBeNull();
  });

  it("ne reprend jamais une vidéo de moins de 5 min, mais la marque vue à la fin", () => {
    expect(resumeState(toTicks(120), toTicks(240))).toBeNull();
    expect(resumeState(toTicks(230), toTicks(240))).toEqual({ played: true, positionTicks: 0 });
  });

  it("ignore une durée inconnue", () => {
    expect(resumeState(toTicks(10), 0)).toBeNull();
  });
});

describe("resumeSeconds", () => {
  it("part du début si vu ou sans position", () => {
    expect(resumeSeconds(toTicks(100), true)).toBe(0);
    expect(resumeSeconds(null)).toBe(0);
    expect(resumeSeconds(toTicks(100))).toBe(100);
  });
});

describe("localIsNewer", () => {
  it("compare les dates ; sans date serveur, le local l'emporte", () => {
    expect(localIsNewer("2026-11-18T10:00:00Z", "2026-11-18T09:00:00Z")).toBe(true);
    expect(localIsNewer("2026-11-18T08:00:00Z", "2026-11-18T09:00:00Z")).toBe(false);
    expect(localIsNewer("2026-11-18T08:00:00Z", null)).toBe(true);
  });
});

describe("pickResume", () => {
  const local = { positionTicks: toTicks(1800), durationTicks: film, updatedAt: "2026-11-18T10:00:00Z" };

  it("prend la position locale hors ligne", () => {
    expect(pickResume(local, null)).toBe(1800);
  });

  it("prend la position locale si elle est plus récente que le serveur", () => {
    expect(pickResume(local, { PlaybackPositionTicks: toTicks(600), LastPlayedDate: "2026-11-18T09:00:00Z" })).toBe(1800);
  });

  it("prend le serveur si le film a été regardé ailleurs plus récemment", () => {
    expect(pickResume(local, { PlaybackPositionTicks: toTicks(4000), LastPlayedDate: "2026-11-18T11:00:00Z" })).toBe(4000);
    expect(pickResume(local, { Played: true, LastPlayedDate: "2026-11-18T11:00:00Z" })).toBe(0);
  });

  it("part du début si la position locale indique un film terminé", () => {
    expect(pickResume({ ...local, positionTicks: toTicks(7000) }, null)).toBe(0);
  });

  it("sans rien de connu, part du début", () => {
    expect(pickResume(null, null)).toBe(0);
  });
});

describe("formatClock", () => {
  it("formate heures, minutes et secondes", () => {
    expect(formatClock(4323)).toBe("1:12:03");
    expect(formatClock(723)).toBe("12:03");
    expect(formatClock(5)).toBe("0:05");
  });
});
