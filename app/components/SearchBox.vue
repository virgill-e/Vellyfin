<script setup lang="ts">
// Champ de recherche de l'en-tête : loupe qui s'ouvre au clic ou avec « / » / Ctrl+K,
// recherche pendant la frappe (page /search?q=…).
const route = useRoute();
const input = ref<HTMLInputElement | null>(null);
const query = ref(typeof route.query.q === "string" ? route.query.q : "");
const open = ref(query.value !== "" || route.path === "/search");
let timer: ReturnType<typeof setTimeout> | null = null;

async function show() {
  open.value = true;
  await nextTick();
  input.value?.focus();
}

function onInput() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const q = query.value.trim();
    if (q) void navigateTo({ path: "/search", query: { q } }, { replace: route.path === "/search" });
  }, 300);
}

function onBlur() {
  if (!query.value.trim() && route.path !== "/search") open.value = false;
}

function clear() {
  query.value = "";
  input.value?.focus();
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const typing = target?.closest("input, textarea, select, [contenteditable]");
  if ((event.key === "/" && !typing) || (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey))) {
    event.preventDefault();
    void show();
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  if (route.path === "/search") void show();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="flex items-center">
    <button v-if="!open" class="grid size-9 place-items-center text-zinc-200 hover:text-white" aria-label="Rechercher (/)" title="Rechercher (/)" @click="show">
      <svg viewBox="0 0 24 24" class="size-5 fill-none stroke-current stroke-2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" stroke-linecap="round" />
      </svg>
    </button>
    <div v-else class="flex items-center gap-2 border border-white/80 bg-black/80 px-3 py-1.5">
      <svg viewBox="0 0 24 24" class="size-4 shrink-0 fill-none stroke-current stroke-2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" stroke-linecap="round" />
      </svg>
      <input
        ref="input"
        v-model="query"
        type="search"
        placeholder="Titres, personnes, genres"
        aria-label="Rechercher"
        class="w-48 bg-transparent text-sm outline-none placeholder:text-zinc-500 md:w-64"
        @input="onInput"
        @blur="onBlur"
        @keydown.esc="clear"
      />
    </div>
  </div>
</template>
