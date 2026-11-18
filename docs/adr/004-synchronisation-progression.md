# ADR-004 — Synchronisation de la progression

- Statut : **accepté**
- Date : 2026-11-18

## Contexte

Jellyfin doit savoir ce qui a été regardé dans Vellyfin (reprise sur un autre appareil, « Reprendre », éléments vus), y compris pour les lectures hors ligne.

## Décision

- **En ligne** : rapports de session standard (`Sessions/Playing`, `Progress` toutes les 10 s et à chaque pause, reprise ou déplacement, `Stopped`). Le serveur calcule lui-même la position de reprise et l'état « vu ».
- **Sur l'appareil** : chaque lecture enregistre sa position localement (`localStorage`, par serveur et utilisateur), avec un indicateur « synchronisé ». Écriture synchrone : la position survit à une fermeture brutale.
- **Hors ligne ou serveur injoignable** : les positions non synchronisées sont envoyées au démarrage, au retour du réseau, toutes les 5 min et avant l'accueil, via `UserItems/{id}/UserData` (position, vu, date de visionnage).
- **Règles** identiques aux valeurs par défaut de Jellyfin : rien avant 5 %, vu au-delà de 90 %, pas de reprise sous 5 min.
- **Conflit** (même élément regardé ailleurs entre-temps) : la date de visionnage la plus récente l'emporte. Au démarrage d'une lecture, Vellyfin reprend à la position la plus récente entre l'appareil et le serveur.

## Conséquences

- Si les seuils de reprise sont modifiés dans le tableau de bord Jellyfin, les lectures hors ligne continuent d'appliquer les valeurs par défaut.
- La comparaison des dates suppose des horloges à peu près justes sur l'appareil et le serveur.
