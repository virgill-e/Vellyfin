// Restaure la session au premier passage, puis guide vers la bonne étape :
// /connect (adresse du serveur) → /login (identifiants) → application.
let restored = false;

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSessionStore();
  if (!restored) {
    restored = true;
    await session.restore();
  }

  const isAuthStep = to.path === "/connect" || to.path === "/login";
  if (session.isAuthenticated) {
    if (isAuthStep) return navigateTo("/");
    return;
  }

  if (to.path === "/login" && !session.server) return navigateTo("/connect");
  if (isAuthStep || to.meta.public === true) return;
  return navigateTo(session.server ? "/login" : "/connect");
});
