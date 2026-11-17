// Débit et temps restant d'un téléchargement.
//
// - Débit : moyenne sur une fenêtre glissante (20 s) des octets réellement reçus,
//   pour lisser les à-coups (un segment arrive toutes les quelques secondes).
// - Taille totale : inconnue tant que le serveur transcode ; estimée à partir de
//   la taille moyenne des segments déjà reçus.

export interface Sample {
  /** Horodatage en millisecondes. */
  at: number;
  /** Octets reçus depuis le début de la session. */
  received: number;
}

const WINDOW_MS = 20_000;
/** En dessous, l'estimation n'est pas assez fiable pour être affichée. */
const MIN_SPAN_MS = 4_000;
const MIN_SEGMENTS = 2;

/** Ajoute un échantillon et retire ceux sortis de la fenêtre (en gardant un point d'appui). */
export function pushSample(samples: Sample[], sample: Sample): Sample[] {
  const next = [...samples, sample];
  while (next.length > 2 && sample.at - next[1]!.at >= WINDOW_MS) next.shift();
  return next;
}

/** Débit en octets/s, ou null si la fenêtre est trop courte. */
export function speedOf(samples: Sample[]): number | null {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last || last.at - first.at < MIN_SPAN_MS) return null;
  const bytes = last.received - first.received;
  return bytes > 0 ? (bytes * 1000) / (last.at - first.at) : null;
}

/** Secondes restantes, ou null si l'estimation n'est pas encore possible. */
export function remainingSeconds(p: {
  done: number;
  total: number;
  bytes: number;
  speed: number | null;
}): number | null {
  if (!p.speed || p.done < MIN_SEGMENTS || p.total <= 0 || p.done >= p.total) return null;
  const estimatedTotal = (p.bytes / p.done) * p.total;
  return Math.max(0, (estimatedTotal - p.bytes) / p.speed);
}

export function formatRemaining(seconds: number): string {
  if (seconds < 60) return "moins d'une minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

export function formatSpeed(bytesPerSecond: number): string {
  const mbps = (bytesPerSecond * 8) / 1e6;
  return mbps >= 10 ? `${Math.round(mbps)} Mbit/s` : `${mbps.toFixed(1).replace(".", ",")} Mbit/s`;
}
