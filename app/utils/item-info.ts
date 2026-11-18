// Informations affichées sur les fiches : durée, heure de fin, langues, équipe.
import type { BaseItemDto, BaseItemPerson, MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import { TICKS_PER_SECOND } from "./progress";

/** « 2 h 08 min », « 45 min », ou "" si inconnue. */
export function formatRuntime(ticks?: number | null): string {
  if (!ticks || ticks <= 0) return "";
  const minutes = Math.round(ticks / TICKS_PER_SECOND / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

/** Heure de fin si la lecture commence maintenant (depuis la position de reprise). */
export function endsAt(runtimeTicks?: number | null, positionTicks = 0, now = new Date()): string {
  if (!runtimeTicks || runtimeTicks <= 0) return "";
  const remainingMs = Math.max(0, runtimeTicks - positionTicks) / (TICKS_PER_SECOND / 1000);
  const end = new Date(now.getTime() + remainingMs);
  return `${end.getHours()}:${String(end.getMinutes()).padStart(2, "0")}`;
}

/** Langues distinctes des pistes audio et sous-titres, dans l'ordre du fichier. */
export function streamLanguages(streams: MediaStream[] | null | undefined): { audio: string[]; subtitles: string[] } {
  const pick = (type: string) => {
    const names = (streams ?? [])
      .filter((s) => s.Type === type)
      .map((s) => languageName(s.Language) ?? s.DisplayTitle ?? null)
      .filter((n): n is string => !!n);
    return [...new Set(names)];
  };
  return { audio: pick("Audio"), subtitles: pick("Subtitle") };
}

const languageNames = new Intl.DisplayNames(["fr"], { type: "language" });

/** « fre » / « fra » / « fr » → « français » ; null si inconnu. */
export function languageName(code?: string | null): string | null {
  if (!code || code === "und") return null;
  const normalized = ISO639_2B[code.toLowerCase()] ?? code;
  try {
    const name = languageNames.of(normalized);
    return name && name !== normalized ? name.charAt(0).toUpperCase() + name.slice(1) : null;
  } catch {
    return null;
  }
}

// Codes bibliographiques ISO 639-2/B (fréquents dans les MKV) inconnus d'Intl.
const ISO639_2B: Record<string, string> = {
  fre: "fr",
  ger: "de",
  dut: "nl",
  chi: "zh",
  cze: "cs",
  gre: "el",
  per: "fa",
  rum: "ro",
  slo: "sk",
  alb: "sq",
  arm: "hy",
  baq: "eu",
  bur: "my",
  geo: "ka",
  ice: "is",
  mac: "mk",
  may: "ms",
  tib: "bo",
  wel: "cy",
};

/** Personnes d'un type donné (« Director », « Actor »…). */
export function peopleOf(item: BaseItemDto | null, type: string): BaseItemPerson[] {
  return (item?.People ?? []).filter((p) => p.Type === type);
}
