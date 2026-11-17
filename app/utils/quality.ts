// Qualités de téléchargement et identifiant enregistré avec chaque téléchargement.

export interface QualityOption {
  label: string;
  /** undefined = qualité d'origine (remux si le codec est lisible). */
  maxBitrate?: number;
}

export const QUALITIES: QualityOption[] = [
  { label: "Originale" },
  { label: "1080p · 8 Mbit/s", maxBitrate: 8_000_000 },
  { label: "720p · 4 Mbit/s", maxBitrate: 4_000_000 },
];

/** Qualité ↔ identifiant enregistré avec le téléchargement (reprise à l'identique). */
export function variantOf(maxBitrate?: number): string {
  return `bitrate=${maxBitrate ?? "original"}`;
}

export function bitrateOfVariant(variant: string): number | undefined {
  const match = /^bitrate=(\d+)$/.exec(variant);
  return match ? Number(match[1]) : undefined;
}
