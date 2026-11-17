# Vellyfin — Analyse

Client Jellyfin desktop (macOS + Windows) avec téléchargement pour lecture hors ligne et synchronisation de la progression.

*Version révisée le 2026-11-17 (voir [ADR-001](adr/001-lecteur.md) et [ADR-002](adr/002-strategie-telechargement.md)). Document public : aucune information d'infrastructure personnelle (domaine, adresses, comptes) ne doit y figurer.*

---

## 1. Contexte

- Serveur cible : **Jellyfin 12.4.0** (version minimale supportée), auto-hébergé, exposé en HTTPS.
- Serveur type : GPU intégré (VAAPI, H.264/HEVC), débit montant domestique limité (~30 Mbit/s).
- Médias type : majoritairement **1080p HEVC (x265) en MKV**, sous-titres texte (SRT/ASS) et image (PGS).
- Besoin : un client **macOS + Windows, à égalité**, avec téléchargement hors ligne. Une alternative existe (**Fladder**) : Vellyfin est un projet de **portfolio** et de **maîtrise totale de l'interface**, pas un manque fonctionnel.

## 2. Objectifs

1. Parcourir les médiathèques Films / Séries avec une interface soignée.
2. Lire en streaming dans le format le plus économe que la machine sait décoder, avec reprise synchronisée avec le serveur (la progression reste cohérente quel que soit le client utilisé ensuite).
3. **Télécharger** films, épisodes ou saisons entières dans un format lisible hors ligne, avec reprise après coupure.
4. Lire hors ligne et **synchroniser la progression** au retour du réseau.
5. Distribuer des installeurs macOS (`.dmg`, Apple Silicon) et Windows (`.exe` NSIS, x64).

## 3. Hors périmètre (v1)

TV en direct, musique, livres, administration du serveur, Chromecast/AirPlay, applications mobiles et TV, multi-serveur dans l'interface, lecture directe de tous les formats (lecteur natif type mpv, voir ADR-001), rendu stylé des sous-titres ASS (JASSUB envisageable en v2), Mac Intel (macOS 26 est la dernière version à les supporter), Windows ARM.

## 4. Stack

| Couche | Choix | Raison |
|---|---|---|
| Application | **Tauri 2** | Rust pour le système de fichiers, les téléchargements et le protocole local ; faible empreinte |
| Interface | **Nuxt 4 en mode SPA** (`ssr: false`) + **Tailwind CSS 4** | Continuité avec le portfolio (Nuxt) |
| Accès API | **`@jellyfin/sdk`** | Types et appels générés depuis l'OpenAPI ; la 1.0.2 cible l'API 12.3, compatible 12.4 |
| Lecture | `<video>` + **hls.js** (streaming), fichier `.mp4` local (hors ligne) | Même lecteur sur les deux OS ; formats adaptés par le serveur (ADR-001) |
| Téléchargements | **Rust** (`reqwest`, `tokio`) | Segments HLS, reprise, concaténation, événements de progression vers l'UI (ADR-002) |
| Données locales | **SQLite détenue par Rust** (`rusqlite` ou `sqlx`) | La file de téléchargement et la synchronisation vivent en Rust : un seul écrivain |
| Secrets | **Trousseau système** (crate `keyring`) | Jeton jamais en clair sur disque |
| Tests | Vitest (UI), `cargo test` (Rust), intégration contre un **Jellyfin Docker en CI** avec médias libres (Big Buck Bunny) | Pas de dépendance à un serveur personnel ni de secret en CI |
| CI/CD | GitHub Actions + `tauri-apps/tauri-action` | Build macOS arm64 / Windows x64 sur tag |
| Dépendances | **Dependabot** (`npm`, `cargo`, `github-actions`) | Dès le premier commit |

## 5. Points techniques clés

### 5.1 Authentification
- Identifiant/mot de passe dès la phase 0 ; **Quick Connect** en phase 1.
- En-tête : `MediaBrowser Client="Vellyfin", Device="…", DeviceId="…", Version="…", Token="…"`.
- **`DeviceId` stable** : UUID généré au premier lancement et conservé dans les données de l'app.
- Jeton dans le trousseau ; déconnexion = révocation serveur (`Sessions/Logout`) + suppression locale.
- Builds non signés sur macOS : la signature ad hoc change à chaque build, le trousseau redemande l'autorisation. Acceptable.

### 5.2 Navigation
Vues utilisateur, `Items` (filtres, tri, pagination), reprise, « À suivre » (`Shows/NextUp`), saisons/épisodes, recherche, images (toujours avec `maxWidth`). **Routes à vérifier sur l'OpenAPI du serveur** (`/api-docs/openapi.json`).

### 5.3 Lecture
- **Détection des codecs** au lancement via `MediaSource.isTypeSupported` (H.264, HEVC `hvc1`, AAC, AC-3/E-AC-3) → **profil d'appareil** envoyé à `PlaybackInfo`.
- macOS : HEVC décodé par WKWebView → remux serveur (vidéo copiée). Windows : HEVC si disponible (extension HEVC de Windows), sinon H.264 transcodé par le serveur.
- Streaming : URL HLS (segments fMP4) lue par hls.js ; jeton dans l'en-tête des requêtes hls.js (`xhrSetup`), pas dans l'URL quand c'est possible.
- Sous-titres texte : récupérés en WebVTT, piste `<track>`. PGS : incrustation demandée au serveur.
- Rapport de lecture : début / progression (~10 s) / arrêt via `Sessions/Playing*`, avec la méthode réelle (`DirectStream` pour un remux, `Transcode` sinon).

### 5.4 Téléchargements hors ligne
Voir [ADR-002](adr/002-strategie-telechargement.md) : HLS fMP4 téléchargé segment par segment par Rust, puis concaténé en un seul `.mp4`.

- File côté Rust : 1 téléchargement à la fois par défaut (protège le GPU et le débit montant du serveur), pause/reprise, reprise automatique au relancement.
- Choix au moment du téléchargement : qualité (Original/remux si le codec est lisible, ou débit plafonné), piste audio, piste de sous-titres (les PGS sont incrustés).
- Stockage : `<données app>/<ServerId>/<UserId>/<ItemId>/` (média `.mp4`, sous-titres `.vtt`, images, métadonnées JSON).
- **Droits** : bouton Télécharger affiché seulement si la politique du compte l'autorise (`EnableContentDownloading`). Ce n'est **pas** un contrôle de sécurité côté serveur pour cette stratégie (le flux HLS reste accessible à tout compte autorisé à lire) — à documenter.

### 5.5 Synchronisation hors ligne
- File locale d'événements (position, vu/non vu) horodatés dans SQLite.
- Au retour du réseau : envoi via l'endpoint de données utilisateur (`UserData`, route à confirmer en 12.4), **pas** en rejouant `Sessions/Playing*` (qui fixerait `LastPlayedDate` à l'instant de l'envoi).
- Conflit : comparer l'horodatage local à `UserData.LastPlayedDate` du serveur ; la plus récente gagne. Tolérer un décalage d'horloge.
- Expiration optionnelle des téléchargements vus.

### 5.6 Sécurité
- HTTPS uniquement (`http://` toléré seulement sur adresses privées), validation normale des certificats.
- Fichiers locaux servis par un **protocole personnalisé géré en Rust** (`vellyfin://`), limité au dossier des téléchargements.
- CSP stricte, capabilities Tauri minimales, aucun contenu distant exécuté.
- Aucun secret ni URL de serveur personnel dans le dépôt : configuration de développement dans un `.env` ignoré par git.

### 5.7 Licences
Code de Vellyfin : **MIT**. Aucune bibliothèque native GPL embarquée.

## 6. Contraintes et risques

| Risque | Impact | Parade |
|---|---|---|
| Comportement de Jellyfin quand les segments sont demandés en avance (limitation, arrêt du job) | Téléchargements lents ou interrompus | Prototype de phase 0 ; réglages de transcodage du serveur documentés |
| HEVC non décodable dans WebView2 | Transcodage serveur pour Windows | Détection automatique ; recommander l'extension HEVC de Windows |
| Charge GPU du serveur pendant les téléchargements | Lectures des autres utilisateurs ralenties | 1 téléchargement à la fois, remux privilégié |
| Changements d'API Jellyfin 12.x | Casse de l'app | SDK officiel, tests d'intégration Docker, version minimale affichée |
| Débit montant du serveur | Téléchargements lents hors domicile | Recommander de télécharger sur le réseau local |
| Builds non signés | Gatekeeper / SmartScreen | Acceptable ; Apple Developer seulement si diffusion large |
| Ampleur du projet | Projet inachevé | Périmètre v1 strict, phases utilisables |

## 7. Feuille de route

Estimation réaliste en soirées et week-ends : **3 mois** pour la v1.

| Phase | Contenu | Livrable |
|---|---|---|
| **0. Prototype** (~1 sem.) | Squelette Tauri + Nuxt + Tailwind, connexion, streaming HLS avec profil selon les codecs, téléchargement par segments + concaténation, lecture hors ligne | ADR-002 validé |
| **1. Navigation** (1–2 sem.) | Quick Connect, accueil (reprendre, à suivre, ajouts récents), films, séries, recherche, fiches | App utilisable en lecture seule |
| **2. Lecture** (1–2 sem.) | Lecteur complet : pistes audio/sous-titres, reprise, rapport de progression, épisode suivant | Remplace le client web au quotidien |
| **3. Téléchargements** (2 sem.) | File Rust complète, pause/reprise, saison entière, espace disque, bibliothèque hors ligne | Fonction phare |
| **4. Synchronisation** (1–2 sem.) | File de sync, mode avion, expiration | v1 fonctionnelle |
| **5. Distribution** (~1 sem.) | CI de release, mises à jour automatiques (`tauri-plugin-updater`), README avec captures/GIF, schéma d'architecture | v1 publiée + page portfolio |
| **6. Finitions** | Thème, raccourcis clavier, accessibilité | v1.x |

**Critères de sortie de la phase 0** (macOS **et** Windows) :
1. Streaming d'un film HEVC/MKV : remux sur macOS, H.264 (ou HEVC si disponible) sur Windows.
2. Téléchargement d'un film par segments, avec reprise après coupure.
3. Concaténation en un seul `.mp4` lu hors ligne, avec déplacement dans la vidéo.
4. Sous-titres texte affichés.

## 8. Livrables portfolio

README soigné (captures, GIF, schéma d'architecture), ADR, tests et CI visibles, vidéo de démo (un visiteur n'a pas de compte serveur), page dédiée sur le site portfolio.

## 9. Décisions

| Sujet | Décision |
|---|---|
| Nom | Vellyfin |
| Dépôt / licence | Public, MIT |
| Plateformes | macOS Apple Silicon et Windows x64, à égalité |
| Stack | Tauri 2 + Nuxt 4 (SPA) + Tailwind 4 |
| Lecteur | WebView + hls.js, formats adaptés par le serveur (ADR-001) |
| Téléchargements | HLS fMP4 par segments + concaténation (ADR-002) |
| Multi-serveur | Non dans l'interface v1 ; stockage clé par serveur/utilisateur dès le départ |
| Authentification | Mot de passe (phase 0) + Quick Connect (phase 1) |
