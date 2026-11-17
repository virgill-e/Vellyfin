import { describe, expect, it } from "vitest";
import {
  formatRemaining,
  formatSpeed,
  pushSample,
  remainingSeconds,
  speedOf,
  type Sample,
} from "../../app/utils/eta";

describe("speedOf", () => {
  it("calcule le débit moyen sur la fenêtre", () => {
    const samples: Sample[] = [
      { at: 0, received: 0 },
      { at: 5_000, received: 5_000_000 },
      { at: 10_000, received: 10_000_000 },
    ];
    expect(speedOf(samples)).toBe(1_000_000);
  });

  it("attend une fenêtre suffisante avant d'estimer", () => {
    expect(speedOf([{ at: 0, received: 0 }, { at: 2_000, received: 4_000_000 }])).toBeNull();
    expect(speedOf([])).toBeNull();
  });
});

describe("pushSample", () => {
  it("oublie les échantillons de plus de 20 s", () => {
    let samples: Sample[] = [];
    for (let t = 0; t <= 60_000; t += 5_000) samples = pushSample(samples, { at: t, received: t });
    expect(samples[0]!.at).toBeGreaterThanOrEqual(35_000);
    expect(samples.at(-1)!.at).toBe(60_000);
  });

  it("ignore l'à-coup des segments déjà présents lors d'une reprise", () => {
    // Le débit se base sur les octets reçus, pas sur la taille cumulée des segments.
    const samples = [
      { at: 0, received: 0 },
      { at: 10_000, received: 20_000_000 },
    ];
    expect(speedOf(samples)).toBe(2_000_000);
  });
});

describe("remainingSeconds", () => {
  it("extrapole la taille totale depuis les segments reçus", () => {
    // 10 segments sur 100, 50 Mo reçus → ~500 Mo au total, 450 Mo restants à 5 Mo/s.
    expect(remainingSeconds({ done: 10, total: 100, bytes: 50e6, speed: 5e6 })).toBe(90);
  });

  it("n'estime rien trop tôt, sans débit ou une fois fini", () => {
    expect(remainingSeconds({ done: 1, total: 100, bytes: 5e6, speed: 5e6 })).toBeNull();
    expect(remainingSeconds({ done: 10, total: 100, bytes: 50e6, speed: null })).toBeNull();
    expect(remainingSeconds({ done: 100, total: 100, bytes: 500e6, speed: 5e6 })).toBeNull();
  });
});

describe("formats", () => {
  it("formate le temps restant", () => {
    expect(formatRemaining(30)).toBe("moins d'une minute");
    expect(formatRemaining(12 * 60)).toBe("12 min");
    expect(formatRemaining(65 * 60)).toBe("1 h 05");
    expect(formatRemaining(120 * 60)).toBe("2 h");
  });

  it("formate le débit en Mbit/s", () => {
    expect(formatSpeed(3_500_000)).toBe("28 Mbit/s");
    expect(formatSpeed(500_000)).toBe("4,0 Mbit/s");
  });
});
