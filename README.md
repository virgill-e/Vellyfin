# Vellyfin

[![CI](https://github.com/virgill-e/Vellyfin/actions/workflows/ci.yml/badge.svg)](https://github.com/virgill-e/Vellyfin/actions/workflows/ci.yml)

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

## Installeurs

Les installeurs macOS (`.dmg`) et Windows (`.exe`) sont sur la page [Releases](https://github.com/virgill-e/Vellyfin/releases). Ils ne sont pas signés par Apple ni Microsoft ; les instructions d'installation figurent dans chaque Release. Une fois installée, l'app se met à jour automatiquement ([ADR-003](docs/adr/003-mise-a-jour.md)).

Publier une version : mettre à jour `version` dans `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml`, pousser le tag `vX.Y.Z` correspondant, puis publier le brouillon de Release créé par le workflow **Build**.

## Licence

MIT.
