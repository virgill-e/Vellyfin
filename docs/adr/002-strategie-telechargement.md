# ADR-002 — Stratégie de téléchargement

- Statut : **proposé** — à valider par le prototype de phase 0
- Date : 2026-11-17

## Contexte

Le fichier original (MKV, HEVC, ASS, DTS…) n'est pas toujours lisible par le WebView (ADR-001). Le téléchargement doit produire un fichier lisible hors ligne, reprendre après coupure, et ménager le serveur (GPU intégré, débit montant ~30 Mbit/s).

## Options

| Option | Reprise | Lisible hors ligne | Remarque |
|---|---|---|---|
| A. Fichier original (`Items/{id}/Download`) | Oui (HTTP Range) | Non (MKV/ASS/DTS) | Imposerait un lecteur natif |
| B. MP4 progressif transcodé (`Videos/{id}/stream.mp4`) | **Non** (taille inconnue, pas de Range pendant le transcodage) | Oui | Écarté |
| **C. HLS fMP4 segment par segment, puis concaténation** | Oui, au segment près | Oui | Retenu |

## Décision proposée : C

1. `PlaybackInfo` avec le profil d'appareil (ADR-001) → URL HLS (`master.m3u8`) avec conteneur de segments **fMP4**.
2. Rust télécharge la playlist, le segment d'initialisation (`#EXT-X-MAP`) puis chaque segment, dans l'ordre ; chaque segment terminé est enregistré, ce qui permet la reprise.
3. À la fin : concaténation `init + segments` en un seul `.mp4` (MP4 fragmenté valide, aucun ffmpeg local), suppression des segments.
4. Lecture hors ligne : `<video>` lit le `.mp4` via un protocole local servi par Rust, avec prise en charge des requêtes Range (déplacement dans la vidéo).

## Constat sur Jellyfin 12.4

Les routes HLS dynamiques (`/Videos/{id}/master.m3u8`, `main.m3u8`, segments) et `DELETE /Videos/ActiveEncodings` **ne figurent plus dans l'OpenAPI** publiée par le serveur, mais répondent toujours (401 sans jeton, 404 pour une route inexistante). Vellyfin ne construit donc jamais ces URL lui-même : il utilise la `TranscodingUrl` renvoyée par `PlaybackInfo`. Risque à surveiller à chaque version de Jellyfin.

## Points à valider en phase 0

- Jellyfin accepte que les segments soient demandés plus vite que la lecture (limitation des transcodages, arrêt du job sans activité).
- Reprise au segment N : Jellyfin relance le transcodage à cette position ; vérifier la continuité des timestamps dans le fichier concaténé.
- Le `.mp4` concaténé est lisible et navigable dans WKWebView et WebView2.
- Durée totale et taille annoncées pour estimer l'espace disque (pas de taille exacte avant la fin d'un transcodage).
