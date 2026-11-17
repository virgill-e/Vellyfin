import tailwindcss from "@tailwindcss/vite";

// Application de bureau : Nuxt en SPA, servi par Tauri (docs/ANALYSE.md §4).
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  ssr: false,
  devtools: { enabled: false },
  modules: ["@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  app: {
    head: { title: "Vellyfin", htmlAttrs: { lang: "fr" } },
  },
  devServer: { port: 3000 },
  ignore: ["**/src-tauri/**"],
  vite: {
    plugins: [tailwindcss()],
    clearScreen: false,
    envPrefix: ["VITE_", "TAURI_"],
    server: { strictPort: true },
  },
});
