# ADR-001 — Lecteur : libmpv ou WebView

- Statut : **accepté** — lecture dans le WebView, formats adaptés par le serveur
- Date : 2026-11-17

## Contexte

Vellyfin doit lire MKV/HEVC/ASS/PGS sur macOS et Windows, à égalité. Option étudiée en premier : lecture directe via libmpv, avec Tauri 2 + `tauri-plugin-libmpv` 0.3.2 (+ `libmpv-wrapper` compilé depuis les sources) et une interface Vue superposée à la vidéo dans une fenêtre transparente.

## Essai 1 — libmpv dans Tauri, macOS (Apple Silicon, macOS 27, mpv 0.42.0 Homebrew)

Configuration : fenêtre `transparent: true`, `macOSPrivateApi: true`, options mpv `vo=gpu-next`, `hwdec=auto-safe`, `force-window=yes`. Le plugin transmet le `NSView` de la fenêtre à mpv via `--wid`.

| Critère | Résultat |
|---|---|
| Vidéo intégrée sous le WebView | **Échec** : mpv ouvre sa propre fenêtre (carré noir indépendant, ne suit pas la fenêtre Vellyfin) |
| Contrôles superposés, fenêtre transparente | OK |
| Sous-titres ASS, décodage matériel | Non testable |

Cause : l'intégration `--wid` du plugin n'est pas fonctionnelle sur macOS (README du plugin : « macOS : non testé »). Une intégration fiable passerait par l'API de rendu de mpv dans une couche native sous le WKWebView (approche d'IINA et de media_kit).

## Options considérées

1. Intégration libmpv maison dans Tauri (couche OpenGL native sous le WKWebView) : code natif délicat, OpenGL déprécié sur macOS, Windows à valider séparément.
2. Flutter + media_kit : lecture directe éprouvée, mais changement complet de stack (Dart) et même stack que Fladder.
3. **Lecture dans le WebView, le serveur fournissant un format lisible** : on garde Tauri et l'écosystème Vue (Nuxt + Tailwind) ; le serveur remuxe ou transcode selon ce que le WebView sait décoder.

## Décision

**Option 3.** La lecture directe de tous les formats n'est plus un objectif : le serveur adapte le flux.

- L'app détecte au lancement les codecs décodables par le WebView (`MediaSource.isTypeSupported`) et en déduit le profil d'appareil envoyé à Jellyfin.
- macOS (WKWebView décode le HEVC) : **remux** côté serveur, qualité d'origine, charge serveur minime.
- Windows (WebView2) : HEVC seulement si le système le décode (extension HEVC de Windows) ; sinon **transcodage H.264** par le serveur.

## Conséquences

- Charge GPU sur le serveur pour les clients sans HEVC (lecture et téléchargement).
- Sous-titres : texte converti en WebVTT (mise en forme ASS perdue ; JASSUB envisageable plus tard) ; PGS incrusté par le serveur, piste choisie avant lecture ou téléchargement.
- Audio non lisible par le WebView (DTS, TrueHD) converti en AAC par le serveur.
- Le prototype libmpv est abandonné (conservé hors dépôt).
