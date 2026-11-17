// Normalisation et validation de l'adresse du serveur.
// HTTPS obligatoire, sauf pour une adresse locale (localhost, IP privée, *.local).

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/,
];

export function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST.some((re) => re.test(hostname));
}

export function normalizeServerUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new Error("Adresse du serveur requise.");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Adresse du serveur invalide.");
  }

  if (url.protocol === "http:" && !isPrivateHost(url.hostname)) {
    throw new Error("HTTPS est obligatoire hors réseau local.");
  }

  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}
