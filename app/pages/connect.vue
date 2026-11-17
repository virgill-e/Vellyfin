<script setup lang="ts">
// Étape 1 : adresse du serveur. Le fond du serveur n'apparaît qu'une fois l'adresse validée.
const session = useSessionStore();
const address = ref(session.server?.url ?? import.meta.env.VITE_DEV_SERVER_URL ?? "");
const error = ref("");
const pending = ref(false);

async function submit() {
  error.value = "";
  pending.value = true;
  try {
    await session.connect(address.value);
    await navigateTo("/login");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Connexion au serveur impossible.";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <AuthBackdrop>
    <form class="auth-card" @submit.prevent="submit">
      <h1 class="text-3xl font-bold">Ton serveur</h1>
      <p class="text-sm text-zinc-400">Adresse de ton serveur Jellyfin.</p>
      <input
        v-model="address"
        type="text"
        inputmode="url"
        autocomplete="url"
        autofocus
        required
        placeholder="jellyfin.example.com"
        aria-label="Adresse du serveur"
        class="auth-field"
      />
      <p v-if="error" role="alert" class="text-sm text-amber-400">{{ error }}</p>
      <button type="submit" :disabled="pending" class="auth-button">
        {{ pending ? "Vérification…" : "Continuer" }}
      </button>
    </form>
  </AuthBackdrop>
</template>
