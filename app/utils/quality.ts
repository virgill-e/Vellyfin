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

export interface Variant {
  maxBitrate?: number;
  /** Piste audio choisie ; absente = piste par défaut du serveur. */
  audioStreamIndex?: number;
  /** Source vidéo (obligatoire pour que Jellyfin applique la piste audio). */
  mediaSourceId?: string;
}

/**
 * Paramètres du flux ↔ identifiant enregistré avec le téléchargement : une reprise
 * doit redemander exactement le même flux (« bitrate=original;audio=2;source=… »).
 */
export function variantOf(variant: Variant | number | undefined): string {
  const v = typeof variant === "object" ? variant : { maxBitrate: variant };
  const parts = [`bitrate=${v.maxBitrate ?? "original"}`];
  if (v.audioStreamIndex !== undefined) parts.push(`audio=${v.audioStreamIndex}`);
  if (v.mediaSourceId) parts.push(`source=${v.mediaSourceId}`);
  return parts.join(";");
}

export function parseVariant(variant: string): Variant {
  const fields = new Map(
    variant
      .split(";")
      .map((part) => part.split("=") as [string, string | undefined])
      .filter(([, value]) => value !== undefined) as [string, string][],
  );
  const number = (value?: string) => (value && /^\d+$/.test(value) ? Number(value) : undefined);
  return {
    maxBitrate: number(fields.get("bitrate")),
    audioStreamIndex: number(fields.get("audio")),
    mediaSourceId: fields.get("source") || undefined,
  };
}

export function bitrateOfVariant(variant: string): number | undefined {
  return parseVariant(variant).maxBitrate;
}
