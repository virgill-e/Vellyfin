// Restaure la session au premier passage, puis guide vers la bonne étape :
// /connect (adresse du serveur) → /login (identifiants) → application.
// Hors ligne, les pages qui demandent le serveur mènent aux téléchargements.
let restored = false;

/** Pages utilisables sans serveur. */
const OFFLINE_PAGES = ["/downloads"];

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSessionStore();
  const connectivity = useConnectivityStore();
  if (!restored) {
    restored = true;
    await session.restore();
    connectivity.start();
    if (session.isAuthenticated) await connectivity.check();
  }

  const isAuthStep = to.path === "/connect" || to.path === "/login";
  if (session.isAuthenticated) {
    if (isAuthStep) return navigateTo("/");
    if (connectivity.offline) {
      if (to.path.startsWith("/play/")) {
        // Lecture en streaming impossible : le fichier téléchargé s'il existe.
        if (to.query.offline !== "1") return navigateTo({ path: to.path, query: { ...to.query, offline: "1" } });
        return;
      }
      if (!OFFLINE_PAGES.includes(to.path)) return navigateTo("/downloads");
    }
    return;
  }

  if (to.path === "/login" && !session.server) return navigateTo("/connect");
  if (isAuthStep || to.meta.public === true) return;
  return navigateTo(session.server ? "/login" : "/connect");
});
