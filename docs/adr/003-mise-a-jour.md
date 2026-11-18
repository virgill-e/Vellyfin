# ADR-003 — Mise à jour automatique

- Statut : **accepté**
- Date : 2026-11-17

## Contexte

Les installeurs sont publiés sur les Releases GitHub, sans signature Apple ni Microsoft (projet personnel, coûts annuels non justifiés). Les utilisateurs doivent recevoir les nouvelles versions sans réinstaller à la main.

## Décision

Plugin officiel `tauri-plugin-updater`, avec les Releases GitHub comme serveur de mises à jour :

1. Le workflow **Build**, sur tag `v*`, construit les installeurs avec `createUpdaterArtifacts`, les signe avec la clé de mise à jour (secrets `TAURI_SIGNING_PRIVATE_KEY` et `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) et crée un **brouillon** de Release contenant `latest.json`.
2. La publication du brouillon (action manuelle) rend la version visible : l'app interroge `releases/latest/download/latest.json`.
3. **Mise à jour obligatoire au lancement** (depuis 0.5.0) : l'app vérifie avant de s'afficher (5 s au plus) ; si une version plus récente existe, elle la télécharge, vérifie la signature avec la clé publique de `tauri.conf.json`, l'installe et redémarre, sans choix possible. Sans réseau ou en cas d'erreur, l'app démarre normalement (les téléchargements restent lisibles hors ligne). Aucune vérification en cours d'utilisation, pour ne jamais couper une lecture.

Jusqu'à 0.4.0, l'app vérifiait aussi toutes les 6 h et proposait de redémarrer (« Plus tard » possible) : ces versions passent à 0.5.0 de cette façon, puis les suivantes sont imposées.

## Conséquences

- Les **pré-releases** ne sont pas proposées en mise à jour (`releases/latest` les ignore).
- La clé privée de mise à jour doit être sauvegardée hors du dépôt : si elle est perdue, les versions installées ne peuvent plus être mises à jour (réinstallation manuelle nécessaire).
- `pnpm tauri build` en local exige la clé privée dans l'environnement ; `pnpm tauri dev` non.
- Les versions antérieures à 0.2.0 n'ont pas le module de mise à jour : à réinstaller une fois à la main.
