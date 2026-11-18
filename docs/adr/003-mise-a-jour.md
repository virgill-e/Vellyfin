# ADR-003 — Mise à jour automatique

- Statut : **accepté**
- Date : 2026-11-17

## Contexte

Les installeurs sont publiés sur les Releases GitHub, sans signature Apple ni Microsoft (projet personnel, coûts annuels non justifiés). Les utilisateurs doivent recevoir les nouvelles versions sans réinstaller à la main.

## Décision

Plugin officiel `tauri-plugin-updater`, avec les Releases GitHub comme serveur de mises à jour :

1. Le workflow **Build**, sur tag `v*`, construit les installeurs avec `createUpdaterArtifacts`, les signe avec la clé de mise à jour (secrets `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) et crée un **brouillon** de Release contenant `latest.json`.
2. La publication du brouillon (action manuelle) rend la version visible : l'app interroge `releases/latest/download/latest.json`.
3. L'app vérifie au démarrage puis toutes les 6 h, télécharge en arrière-plan, vérifie la signature avec la clé publique de `tauri.conf.json`, et propose de redémarrer. Elle n'interrompt jamais une lecture d'elle-même.

## Conséquences

- Les **pré-releases** ne sont pas proposées en mise à jour (`releases/latest` les ignore).
- La clé privée de mise à jour doit être sauvegardée hors du dépôt : si elle est perdue, les versions installées ne peuvent plus être mises à jour (réinstallation manuelle nécessaire).
- `pnpm tauri build` en local exige la clé privée dans l'environnement ; `pnpm tauri dev` non.
- Les versions antérieures à 0.2.0 n'ont pas le module de mise à jour : à réinstaller une fois à la main.
