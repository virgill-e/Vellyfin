// Règles de progression de lecture, alignées sur les valeurs par défaut de Jellyfin
// (Tableau de bord → Lecture → Reprise) pour que hors ligne et en ligne donnent le même résultat.

export const TICKS_PER_SECOND = 10_000_000;

/** En dessous de ce pourcentage, la lecture n'est pas enregistrée comme reprise. */
export const MIN_RESUME_PCT = 5;
/** Au-delà de ce pourcentage, l'élément est considéré comme vu. */
export const MAX_RESUME_PCT = 90;
/** Les vidéos plus courtes ne sont jamais reprises (vues ou non vues). */
export const MIN_RESUME_SECONDS = 300;

export const toTicks = (seconds: number) => Math.round(seconds * TICKS_PER_SECOND);
export const toSeconds = (ticks: number) => ticks / TICKS_PER_SECOND;

export interface ResumeState {
  played: boolean;
  /** Position à enregistrer (0 si vu ou trop proche du début). */
  positionTicks: number;
}

/** État à enregistrer pour une position donnée, ou null si rien ne doit changer. */
export function resumeState(positionTicks: number, durationTicks: number): ResumeState | null {
  if (!(durationTicks > 0) || positionTicks < 0) return null;
  const pct = (positionTicks / durationTicks) * 100;
  if (pct >= MAX_RESUME_PCT) return { played: true, positionTicks: 0 };
  if (toSeconds(durationTicks) < MIN_RESUME_SECONDS) return null;
  if (pct < MIN_RESUME_PCT) return null;
  return { played: false, positionTicks };
}

/** Position de reprise en secondes, ou 0 si la lecture doit partir du début. */
export function resumeSeconds(positionTicks: number | null | undefined, played?: boolean | null): number {
  if (played || !positionTicks || positionTicks <= 0) return 0;
  return toSeconds(positionTicks);
}

/** Vrai si la donnée locale est plus récente que celle du serveur (dernier visionnage). */
export function localIsNewer(localUpdatedAt: string, serverLastPlayed: string | null | undefined): boolean {
  if (!serverLastPlayed) return true;
  return Date.parse(localUpdatedAt) > Date.parse(serverLastPlayed);
}

/** « 1:12:03 » ou « 12:03 ». */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export interface LocalPosition {
  positionTicks: number;
  durationTicks: number;
  updatedAt: string;
}

export interface ServerPosition {
  PlaybackPositionTicks?: number | null;
  Played?: boolean | null;
  LastPlayedDate?: string | null;
}

/**
 * Position de départ (secondes) : la plus récente entre cet appareil et le serveur.
 * `server` vaut null hors ligne.
 */
export function pickResume(local: LocalPosition | null, server: ServerPosition | null): number {
  if (local && (!server || localIsNewer(local.updatedAt, server.LastPlayedDate))) {
    const state = resumeState(local.positionTicks, local.durationTicks);
    return state ? resumeSeconds(state.positionTicks, state.played) : 0;
  }
  return server ? resumeSeconds(server.PlaybackPositionTicks, server.Played) : 0;
}
