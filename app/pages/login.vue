<script setup lang="ts">
// Étape 2 : identifiants, sur le fond du serveur choisi.
// Si le serveur expose ses profils, on propose un choix façon « Qui regarde ? ».
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";

const session = useSessionStore();
const server = computed(() => session.server);

const profiles = ref<UserDto[]>([]);
const selected = ref<UserDto | null>(null);
const manual = ref(false);
const username = ref("");
const password = ref("");
const error = ref("");
const pending = ref(false);
const route = useRoute();
/** Jeton révoqué pendant une période hors ligne. */
const expired = route.query.expired === "1";

// Quick Connect : code à valider depuis un appareil déjà connecté (aucun mot de passe saisi ici).
const quickAvailable = ref(false);
const quickCode = ref<string | null>(null);
const quickError = ref("");
let quickTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  const [users, quick] = await Promise.all([session.publicUsers(), session.quickConnectEnabled()]);
  profiles.value = users;
  quickAvailable.value = quick;
  manual.value = profiles.value.length === 0;
});
onBeforeUnmount(stopQuickConnect);

async function startQuickConnect() {
  stopQuickConnect();
  quickError.value = "";
  try {
    const { code, secret } = await session.quickConnectStart();
    quickCode.value = code;
    pollQuickConnect(secret);
  } catch {
    quickError.value = "Quick Connect est indisponible sur ce serveur.";
    quickCode.value = "";
  }
}

function pollQuickConnect(secret: string) {
  quickTimer = setTimeout(async () => {
    try {
      if (await session.quickConnectPoll(secret)) {
        stopQuickConnect();
        await navigateTo("/", { replace: true });
        return;
      }
      pollQuickConnect(secret);
    } catch {
      // Code expiré (quelques minutes) ou serveur injoignable.
      quickError.value = "Le code a expiré.";
    }
  }, 3000);
}

function stopQuickConnect() {
  if (quickTimer) clearTimeout(quickTimer);
  quickTimer = null;
}

function cancelQuickConnect() {
  stopQuickConnect();
  quickCode.value = null;
  quickError.value = "";
}

function avatar(user: UserDto) {
  if (!server.value || !user.PrimaryImageTag) return undefined;
  return `${server.value.url}/Users/${user.Id}/Images/Primary?maxWidth=200&tag=${user.PrimaryImageTag}`;
}

function choose(user: UserDto) {
  selected.value = user;
  username.value = user.Name ?? "";
  password.value = "";
  error.value = "";
  if (user.HasPassword === false) submit();
}

function back() {
  selected.value = null;
  manual.value = profiles.value.length === 0;
  error.value = "";
}

async function submit() {
  error.value = "";
  pending.value = true;
  try {
    await session.login(username.value, password.value);
    password.value = "";
    await navigateTo("/", { replace: true });
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } }).response?.status;
    error.value =
      status === 401
        ? "Identifiant ou mot de passe incorrect."
        : e instanceof Error
          ? e.message
          : "Connexion impossible.";
  } finally {
    pending.value = false;
  }
}

async function changeServer() {
  session.forgetServer();
  await navigateTo("/connect");
}
</script>

<template>
  <AuthBackdrop :server-url="server?.url">
    <p
      v-if="expired"
      role="alert"
      class="absolute left-1/2 top-8 z-20 w-[min(32rem,90vw)] -translate-x-1/2 rounded bg-zinc-900/95 px-4 py-3 text-center text-sm text-zinc-200"
    >
      Ta session a expiré sur le serveur. Reconnecte-toi : tes téléchargements sont conservés.
    </p>
    <!-- Quick Connect -->
    <section v-if="quickCode !== null" class="auth-card items-center text-center">
      <h1 class="text-3xl font-bold">Quick Connect</h1>
      <template v-if="quickCode">
        <p class="text-sm text-zinc-400">
          Sur un appareil déjà connecté à <span class="text-zinc-200">{{ server?.name }}</span>, ouvre
          <span class="text-zinc-200">Profil → Quick Connect</span> et saisis ce code :
        </p>
        <p class="font-mono text-5xl font-bold tracking-[0.3em]" aria-live="polite">{{ quickCode }}</p>
        <p v-if="!quickError" class="text-sm text-zinc-500">En attente de validation…</p>
      </template>
      <p v-if="quickError" role="alert" class="text-sm text-amber-400">{{ quickError }}</p>
      <button v-if="quickError && quickAvailable" class="auth-button" @click="startQuickConnect">Nouveau code</button>
      <button class="text-sm text-zinc-400 hover:text-white" @click="cancelQuickConnect">← Retour</button>
    </section>

    <!-- Choix du profil -->
    <section v-else-if="!manual && !selected" class="flex flex-col items-center gap-10">
      <h1 class="text-4xl font-medium">Qui regarde ?</h1>
      <ul class="flex flex-wrap justify-center gap-8">
        <li v-for="user in profiles" :key="user.Id">
          <button class="group flex flex-col items-center gap-3" @click="choose(user)">
            <span class="grid size-32 place-items-center overflow-hidden rounded-md bg-zinc-800 ring-accent transition group-hover:ring-4">
              <img v-if="avatar(user)" :src="avatar(user)" alt="" class="h-full w-full object-cover" />
              <span v-else class="text-5xl font-semibold text-zinc-300">{{ user.Name?.[0]?.toUpperCase() }}</span>
            </span>
            <span class="text-zinc-400 group-hover:text-white">{{ user.Name }}</span>
          </button>
        </li>
      </ul>
      <div class="flex gap-8 text-sm text-zinc-400">
        <button class="hover:text-white" @click="manual = true">Autre utilisateur</button>
        <button v-if="quickAvailable" class="hover:text-white" @click="startQuickConnect">Utiliser Quick Connect</button>
      </div>
    </section>

    <!-- Identifiants -->
    <form v-else class="auth-card" @submit.prevent="submit">
      <h1 class="text-3xl font-bold">S'identifier</h1>
      <p class="text-sm text-zinc-400">
        sur <span class="text-zinc-200">{{ server?.name }}</span>
      </p>

      <input
        v-if="!selected"
        v-model="username"
        autocomplete="username"
        autofocus
        required
        placeholder="Nom d'utilisateur"
        aria-label="Nom d'utilisateur"
        class="auth-field"
      />
      <p v-else class="text-lg font-medium">{{ selected.Name }}</p>

      <input
        v-model="password"
        type="password"
        autocomplete="current-password"
        :autofocus="!!selected"
        placeholder="Mot de passe"
        aria-label="Mot de passe"
        class="auth-field"
      />

      <p v-if="error" role="alert" class="text-sm text-amber-400">{{ error }}</p>
      <button type="submit" :disabled="pending" class="auth-button">
        {{ pending ? "Connexion…" : "S'identifier" }}
      </button>
      <button v-if="quickAvailable" type="button" class="btn-secondary justify-center" @click="startQuickConnect">
        Utiliser Quick Connect
      </button>

      <div class="flex justify-between text-sm text-zinc-400">
        <button v-if="profiles.length" type="button" class="hover:text-white" @click="back">← Profils</button>
        <button type="button" class="ml-auto hover:text-white" @click="changeServer">Changer de serveur</button>
      </div>
    </form>
  </AuthBackdrop>
</template>
