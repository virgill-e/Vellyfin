# Vellyfin

Client [Jellyfin](https://jellyfin.org) desktop pour macOS et Windows, avec téléchargement pour lecture hors ligne et synchronisation de la progression.

> Projet en phase 0 (prototype). Voir [docs/ANALYSE.md](docs/ANALYSE.md) et les [décisions d'architecture](docs/adr/).

## Stack

Tauri 2 (Rust) · Nuxt 4 en SPA · Tailwind CSS 4 · `@jellyfin/sdk` · hls.js

## Développement

Prérequis : Node 22+, pnpm, Rust stable.

```bash
pnpm install
cp .env.example .env   # optionnel : pré-remplit l'adresse du serveur
pnpm tauri dev
```

Vérifications :

```bash
pnpm test && pnpm typecheck && (cd src-tauri && cargo test && cargo clippy)
```

## Licence

MIT.
