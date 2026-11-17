import { acceptHMRUpdate, defineStore } from "pinia";
import { computed, shallowRef, ref } from "vue";
import { Jellyfin, type Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getSystemApi } from "@jellyfin/sdk/lib/utils/api/system-api";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { native } from "~/utils/native";
import { normalizeServerUrl } from "~/utils/server-url";
import { MIN_SERVER_VERSION, compareVersions } from "~/utils/version";

// Connexion en deux temps : 1) serveur (adresse vérifiée), 2) identifiants.
// Seules des informations non secrètes sont conservées dans localStorage ;
// le jeton vit uniquement dans le trousseau système.

export interface ServerInfo {
  url: string;
  id: string;
  name: string;
  version: string;
}

interface StoredSession {
  serverUrl: string;
  serverId: string;
  serverName: string;
  userId: string;
  userName: string;
}

const SESSION_KEY = "vellyfin.session";
const SERVER_KEY = "vellyfin.server";
const APP_VERSION = "0.1.0";

function deviceName(): string {
  const ua = navigator.userAgent;
  if (ua.includes("Windows")) return "Vellyfin (Windows)";
  if (ua.includes("Mac")) return "Vellyfin (macOS)";
  return "Vellyfin";
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
}

export const useSessionStore = defineStore("session", () => {
  const server = ref<ServerInfo | null>(readJson<ServerInfo>(SERVER_KEY));
  const session = ref<StoredSession | null>(null);
  const api = shallowRef<Api | null>(null);
  let jellyfin: Jellyfin | null = null;

  const isAuthenticated = computed(() => api.value !== null && session.value !== null);

  async function client(): Promise<Jellyfin> {
    if (!jellyfin) {
      jellyfin = new Jellyfin({
        clientInfo: { name: "Vellyfin", version: APP_VERSION },
        deviceInfo: { name: deviceName(), id: await native.deviceId() },
      });
    }
    return jellyfin;
  }

  function persistSession(value: StoredSession | null) {
    session.value = value;
    writeJson(SESSION_KEY, value);
  }

  /** Étape 1 : vérifie que l'adresse pointe vers un Jellyfin supporté et la mémorise. */
  async function connect(input: string): Promise<ServerInfo> {
    const url = normalizeServerUrl(input);
    const candidate = (await client()).createApi(url);

    let info;
    try {
      ({ data: info } = await getSystemApi(candidate).getPublicSystemInfo());
    } catch {
      throw new Error("Serveur injoignable. Vérifie l'adresse.");
    }
    if (!info.Id || !info.Version || info.ProductName?.includes("Jellyfin") === false) {
      throw new Error("Ce n'est pas un serveur Jellyfin.");
    }
    if (compareVersions(info.Version, MIN_SERVER_VERSION) < 0) {
      throw new Error(`Jellyfin ${info.Version} non supporté (minimum ${MIN_SERVER_VERSION}).`);
    }

    server.value = { url, id: info.Id, name: info.ServerName ?? url, version: info.Version };
    writeJson(SERVER_KEY, server.value);
    return server.value;
  }

  function forgetServer() {
    server.value = null;
    writeJson(SERVER_KEY, null);
  }

  /** Profils visibles sur l'écran de connexion (vide si le serveur les masque). */
  async function publicUsers(): Promise<UserDto[]> {
    if (!server.value) return [];
    const candidate = (await client()).createApi(server.value.url);
    try {
      const { data } = await getUserApi(candidate).getPublicUsers();
      return data;
    } catch {
      return [];
    }
  }

  /** Étape 2 : authentification sur le serveur choisi. */
  async function login(username: string, password: string) {
    const target = server.value;
    if (!target) throw new Error("Choisis d'abord un serveur.");
    const candidate = (await client()).createApi(target.url);

    const { data: auth } = await candidate.authenticateUserByName(username, password);
    const token = auth.AccessToken;
    const user = auth.User;
    if (!token || !user?.Id) throw new Error("Authentification refusée.");

    await native.tokenSave(target.id, user.Id, token);
    candidate.update({ accessToken: token });
    api.value = candidate;
    persistSession({
      serverUrl: target.url,
      serverId: target.id,
      serverName: target.name,
      userId: user.Id,
      userName: user.Name ?? username,
    });
  }

  /** Restaure la session au lancement. Retourne false si une reconnexion est nécessaire. */
  async function restore(): Promise<boolean> {
    const stored = readJson<StoredSession>(SESSION_KEY);
    if (!stored) return false;

    const token = await native.tokenLoad(stored.serverId, stored.userId);
    if (!token) {
      persistSession(null);
      return false;
    }

    const restored = (await client()).createApi(stored.serverUrl, token);
    try {
      await getUserApi(restored).getCurrentUser();
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status === 401 || status === 403) {
        await native.tokenDelete(stored.serverId, stored.userId);
        persistSession(null);
        return false;
      }
      // Serveur injoignable : on garde la session (mode hors ligne, phase 4).
    }

    api.value = restored;
    session.value = stored;
    return true;
  }

  /** Déconnexion : révoque le jeton, garde le serveur pour la prochaine connexion. */
  async function logout() {
    const current = session.value;
    try {
      await api.value?.logout();
    } catch {
      // Hors ligne : la suppression locale suffit.
    }
    if (current) await native.tokenDelete(current.serverId, current.userId);
    api.value = null;
    persistSession(null);
  }

  return {
    server,
    session,
    api,
    isAuthenticated,
    connect,
    forgetServer,
    publicUsers,
    login,
    restore,
    logout,
  };
});

// Développement : remplace le store à chaud au lieu de garder une version périmée.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useSessionStore, import.meta.hot));
