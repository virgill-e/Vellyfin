//! Téléchargements hors ligne (ADR-002) : HLS fMP4 téléchargé segment par
//! segment, puis concaténé en un seul `media.mp4`.
//!
//! Disposition : `<données app>/downloads/<ServerId>/<UserId>/<ItemId>/`
//!   - `parts/init.mp4`, `parts/00000.m4s`… pendant le téléchargement
//!   - `media.mp4` + `meta.json` une fois terminé
//!
//!   - `subs/<index>.vtt` : sous-titres texte (WebVTT), `image.jpg` : vignette
//!
//! Reprise : un segment n'est écrit sous son nom définitif qu'une fois complet ;
//! relancer un téléchargement saute les segments déjà présents.
//!
//! L'ordre, la pause et la file d'attente sont gérés par l'interface, qui ne lance
//! qu'un téléchargement à la fois ; le sémaphore ci-dessous reste une sécurité.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::{Mutex, Semaphore};
use url::Url;

use crate::hls;

const EVENT: &str = "download-progress";
const MAX_RETRIES: usize = 3;

pub struct Downloads {
    client: reqwest::Client,
    /// Un seul téléchargement actif : protège le GPU et le débit montant du serveur.
    slots: Arc<Semaphore>,
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Downloads {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(concat!("Vellyfin/", env!("CARGO_PKG_VERSION")))
            // Le premier segment peut attendre le démarrage du transcodage.
            .timeout(Duration::from_secs(180))
            .build()
            .expect("client HTTP");
        Self {
            client,
            slots: Arc::new(Semaphore::new(1)),
            cancel_flags: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadRequest {
    pub server_id: String,
    pub user_id: String,
    pub item_id: String,
    pub name: String,
    /// URL absolue de la playlist HLS (TranscodingUrl de PlaybackInfo).
    pub playlist_url: String,
    /// En-tête `Authorization` Jellyfin complet.
    pub authorization: String,
    /// Paramètres de qualité : une reprise n'est possible qu'avec les mêmes.
    pub variant: String,
    /// Vignette à conserver avec le téléchargement (affichage hors ligne).
    #[serde(default)]
    pub image_url: Option<String>,
    /// Sous-titres texte à enregistrer (WebVTT), lisibles hors ligne.
    #[serde(default)]
    pub subtitles: Vec<SubtitleRequest>,
    /// Informations d'affichage hors ligne (série, saison, épisode…).
    #[serde(default)]
    pub info: MediaInfo,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleRequest {
    pub index: u32,
    pub label: String,
    #[serde(default)]
    pub language: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleFile {
    pub index: u32,
    pub label: String,
    #[serde(default)]
    pub language: Option<String>,
    /// Chemin absolu du fichier .vtt.
    pub path: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MediaInfo {
    /// « Movie » ou « Episode ».
    pub kind: Option<String>,
    pub series_id: Option<String>,
    pub series_name: Option<String>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
    pub runtime_ticks: Option<u64>,
    /// Libellé de la piste audio téléchargée.
    pub audio: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DownloadState {
    Queued,
    Downloading,
    Assembling,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    item_id: String,
    state: DownloadState,
    done: usize,
    total: usize,
    bytes: u64,
    /// Octets réellement reçus depuis le démarrage de cette session
    /// (hors segments déjà présents) : sert au calcul du débit.
    downloaded: u64,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadMeta {
    pub server_id: String,
    pub user_id: String,
    pub item_id: String,
    pub name: String,
    pub state: DownloadState,
    pub segments: usize,
    #[serde(default)]
    pub variant: String,
    /// Chemin absolu du fichier lisible, une fois terminé.
    pub file: Option<String>,
    /// Chemin absolu de la vignette locale, si elle a pu être récupérée.
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub subtitles: Vec<SubtitleFile>,
    #[serde(default)]
    pub info: MediaInfo,
    /// Taille du fichier final en octets (0 tant qu'il n'est pas terminé).
    #[serde(default)]
    pub size: u64,
}

fn is_safe_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

fn downloads_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("downloads"))
}

fn item_dir(root: &Path, server_id: &str, user_id: &str, item_id: &str) -> Result<PathBuf, String> {
    if ![server_id, user_id, item_id]
        .iter()
        .all(|id| is_safe_id(id))
    {
        return Err("identifiant invalide".into());
    }
    Ok(root.join(server_id).join(user_id).join(item_id))
}

async fn write_meta(dir: &Path, meta: &DownloadMeta) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(meta).map_err(|e| e.to_string())?;
    tokio::fs::write(dir.join("meta.json"), json)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn download_start(
    app: AppHandle,
    downloads: State<'_, Downloads>,
    request: DownloadRequest,
) -> Result<(), String> {
    let root = downloads_root(&app)?;
    let dir = item_dir(
        &root,
        &request.server_id,
        &request.user_id,
        &request.item_id,
    )?;
    Url::parse(&request.playlist_url).map_err(|e| e.to_string())?;

    let flag = Arc::new(AtomicBool::new(false));
    {
        let mut flags = downloads.cancel_flags.lock().await;
        if flags.contains_key(&request.item_id) {
            return Err("téléchargement déjà en cours".into());
        }
        flags.insert(request.item_id.clone(), flag.clone());
    }

    let client = downloads.client.clone();
    let slots = downloads.slots.clone();
    let item_id = request.item_id.clone();

    tauri::async_runtime::spawn(async move {
        let job = Job {
            app: app.clone(),
            client,
            request,
            dir,
            cancel: flag,
            received: AtomicU64::new(0),
        };
        job.emit(DownloadState::Queued, 0, 0, 0, None);

        let result = match slots.acquire_owned().await {
            Ok(_permit) => job.run().await,
            Err(e) => Err(e.to_string()),
        };

        match result {
            Ok(()) => {}
            Err(_) if job.cancelled() => job.emit(DownloadState::Cancelled, 0, 0, 0, None),
            Err(error) => {
                log::error!("téléchargement {item_id} : {error}");
                job.emit(DownloadState::Failed, 0, 0, 0, Some(error));
            }
        }

        if let Some(downloads) = app.try_state::<Downloads>() {
            downloads.cancel_flags.lock().await.remove(&item_id);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn download_cancel(
    downloads: State<'_, Downloads>,
    item_id: String,
) -> Result<(), String> {
    if let Some(flag) = downloads.cancel_flags.lock().await.get(&item_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub async fn downloads_list(app: AppHandle) -> Result<Vec<DownloadMeta>, String> {
    let root = downloads_root(&app)?;
    let mut found = Vec::new();
    // Profondeur fixe : serveur / utilisateur / élément.
    for server in read_dirs(&root).await {
        for user in read_dirs(&server).await {
            for item in read_dirs(&user).await {
                if let Ok(bytes) = tokio::fs::read(item.join("meta.json")).await
                    && let Ok(meta) = serde_json::from_slice::<DownloadMeta>(&bytes)
                {
                    found.push(meta);
                }
            }
        }
    }
    Ok(found)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// Octets occupés par les téléchargements (terminés et partiels).
    used: u64,
    /// Octets disponibles sur le disque des téléchargements.
    free: u64,
}

#[tauri::command]
pub async fn downloads_usage(app: AppHandle) -> Result<Usage, String> {
    let root = downloads_root(&app)?;
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|e| e.to_string())?;
    let used = dir_size(&root).await;
    let free = fs4::available_space(&root).map_err(|e| e.to_string())?;
    Ok(Usage { used, free })
}

/// Taille totale d'un dossier (récursif, sans suivre les liens).
async fn dir_size(root: &Path) -> u64 {
    let mut total = 0;
    let mut pending = vec![root.to_path_buf()];
    while let Some(dir) = pending.pop() {
        let Ok(mut entries) = tokio::fs::read_dir(&dir).await else {
            continue;
        };
        while let Ok(Some(entry)) = entries.next_entry().await {
            let Ok(meta) = entry.metadata().await else {
                continue;
            };
            if meta.is_dir() {
                pending.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    total
}

#[tauri::command]
pub async fn download_delete(
    app: AppHandle,
    downloads: State<'_, Downloads>,
    server_id: String,
    user_id: String,
    item_id: String,
) -> Result<(), String> {
    if downloads.cancel_flags.lock().await.contains_key(&item_id) {
        return Err("annuler le téléchargement avant de le supprimer".into());
    }
    let dir = item_dir(&downloads_root(&app)?, &server_id, &user_id, &item_id)?;
    match tokio::fs::remove_dir_all(&dir).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

async fn read_dirs(path: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(mut entries) = tokio::fs::read_dir(path).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if entry.file_type().await.map(|t| t.is_dir()).unwrap_or(false) {
                dirs.push(entry.path());
            }
        }
    }
    dirs
}

struct Job {
    app: AppHandle,
    client: reqwest::Client,
    request: DownloadRequest,
    dir: PathBuf,
    cancel: Arc<AtomicBool>,
    /// Octets reçus du réseau pendant cette session.
    received: AtomicU64,
}

impl Job {
    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    fn emit(
        &self,
        state: DownloadState,
        done: usize,
        total: usize,
        bytes: u64,
        error: Option<String>,
    ) {
        let progress = Progress {
            item_id: self.request.item_id.clone(),
            state,
            done,
            total,
            bytes,
            downloaded: self.received.load(Ordering::Relaxed),
            error,
        };
        let _ = self.app.emit(EVENT, progress);
    }

    fn meta(
        &self,
        state: DownloadState,
        segments: usize,
        file: Option<String>,
        subtitles: Vec<SubtitleFile>,
        size: u64,
    ) -> DownloadMeta {
        DownloadMeta {
            server_id: self.request.server_id.clone(),
            user_id: self.request.user_id.clone(),
            item_id: self.request.item_id.clone(),
            name: self.request.name.clone(),
            state,
            segments,
            variant: self.request.variant.clone(),
            file,
            image: self
                .image_path()
                .exists()
                .then(|| self.image_path().to_string_lossy().into_owned()),
            subtitles,
            info: self.request.info.clone(),
            size,
        }
    }

    fn image_path(&self) -> PathBuf {
        self.dir.join("image.jpg")
    }

    /// Récupère la vignette (meilleur effort : un échec ne bloque pas le téléchargement).
    async fn fetch_image(&self) {
        let Some(url) = self
            .request
            .image_url
            .as_deref()
            .and_then(|u| Url::parse(u).ok())
        else {
            return;
        };
        if let Err(e) = self.fetch_to(&url, &self.image_path()).await {
            log::warn!("vignette de {} : {e}", self.request.item_id);
        }
    }

    /// Récupère les sous-titres texte (meilleur effort, chacun indépendamment).
    async fn fetch_subtitles(&self) -> Vec<SubtitleFile> {
        let dir = self.dir.join("subs");
        if self.request.subtitles.is_empty() || tokio::fs::create_dir_all(&dir).await.is_err() {
            return Vec::new();
        }
        let mut saved = Vec::new();
        for sub in &self.request.subtitles {
            let Ok(url) = Url::parse(&sub.url) else {
                continue;
            };
            let path = dir.join(format!("{}.vtt", sub.index));
            match self.fetch_to(&url, &path).await {
                Ok(_) => saved.push(SubtitleFile {
                    index: sub.index,
                    label: sub.label.clone(),
                    language: sub.language.clone(),
                    path: path.to_string_lossy().into_owned(),
                }),
                Err(e) => log::warn!(
                    "sous-titres {} de {} : {e}",
                    sub.index,
                    self.request.item_id
                ),
            }
        }
        saved
    }

    async fn get_text(&self, url: &Url) -> Result<String, String> {
        self.client
            .get(url.clone())
            .header("Authorization", &self.request.authorization)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .text()
            .await
            .map_err(|e| e.to_string())
    }

    async fn run(&self) -> Result<(), String> {
        let master_url = Url::parse(&self.request.playlist_url).map_err(|e| e.to_string())?;
        let master = self.get_text(&master_url).await?;
        let (media_url, media_body) = match hls::first_variant(&master, &master_url)? {
            Some(variant) => {
                let body = self.get_text(&variant).await?;
                (variant, body)
            }
            None => (master_url, master),
        };
        let playlist = hls::parse_media(&media_body, &media_url)?;
        let total = playlist.segments.len();

        let parts = self.dir.join("parts");
        if !self.can_resume(total).await {
            // Qualité ou découpage différents : les segments existants sont inutilisables.
            let _ = tokio::fs::remove_dir_all(&parts).await;
        }
        tokio::fs::create_dir_all(&parts)
            .await
            .map_err(|e| e.to_string())?;
        self.fetch_image().await;
        write_meta(
            &self.dir,
            &self.meta(DownloadState::Downloading, total, None, Vec::new(), 0),
        )
        .await?;

        let mut bytes = 0u64;
        if let Some(init) = &playlist.init {
            bytes += self.fetch_to(init, &parts.join("init.mp4")).await?;
        }

        for (index, segment) in playlist.segments.iter().enumerate() {
            if self.cancelled() {
                return Err("annulé".into());
            }
            bytes += self
                .fetch_to(segment, &parts.join(segment_name(index)))
                .await?;
            self.emit(DownloadState::Downloading, index + 1, total, bytes, None);
        }

        self.emit(DownloadState::Assembling, total, total, bytes, None);
        let file = self.dir.join("media.mp4");
        assemble(&parts, playlist.init.is_some(), total, &file).await?;
        tokio::fs::remove_dir_all(&parts)
            .await
            .map_err(|e| e.to_string())?;
        let subtitles = self.fetch_subtitles().await;
        let size = tokio::fs::metadata(&file)
            .await
            .map(|m| m.len())
            .unwrap_or(0);

        let file = file.to_string_lossy().into_owned();
        write_meta(
            &self.dir,
            &self.meta(DownloadState::Completed, total, Some(file), subtitles, size),
        )
        .await?;
        self.emit(DownloadState::Completed, total, total, bytes, None);
        Ok(())
    }

    async fn can_resume(&self, total: usize) -> bool {
        let Ok(bytes) = tokio::fs::read(self.dir.join("meta.json")).await else {
            return false;
        };
        serde_json::from_slice::<DownloadMeta>(&bytes)
            .map(|m| m.variant == self.request.variant && m.segments == total)
            .unwrap_or(false)
    }

    /// Télécharge `url` vers `dest` si le fichier n'existe pas déjà (reprise).
    /// Retourne la taille du fichier.
    async fn fetch_to(&self, url: &Url, dest: &Path) -> Result<u64, String> {
        if let Ok(meta) = tokio::fs::metadata(dest).await {
            return Ok(meta.len());
        }
        let mut last_error = String::new();
        for attempt in 1..=MAX_RETRIES {
            match self.fetch_once(url, dest).await {
                Ok(size) => return Ok(size),
                Err(e) => {
                    log::warn!("segment {} (essai {attempt}) : {e}", dest.display());
                    last_error = e;
                    if self.cancelled() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_secs(2 * attempt as u64)).await;
                }
            }
        }
        Err(last_error)
    }

    async fn fetch_once(&self, url: &Url, dest: &Path) -> Result<u64, String> {
        let response = self
            .client
            .get(url.clone())
            .header("Authorization", &self.request.authorization)
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?;

        let tmp = dest.with_extension("tmp");
        let mut file = tokio::fs::File::create(&tmp)
            .await
            .map_err(|e| e.to_string())?;
        let mut stream = response.bytes_stream();
        let mut size = 0u64;
        while let Some(chunk) = stream.next().await {
            if self.cancelled() {
                drop(file);
                let _ = tokio::fs::remove_file(&tmp).await;
                return Err("annulé".into());
            }
            let chunk = chunk.map_err(|e| e.to_string())?;
            size += chunk.len() as u64;
            self.received
                .fetch_add(chunk.len() as u64, Ordering::Relaxed);
            file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        }
        file.flush().await.map_err(|e| e.to_string())?;
        drop(file);
        tokio::fs::rename(&tmp, dest)
            .await
            .map_err(|e| e.to_string())?;
        Ok(size)
    }
}

fn segment_name(index: usize) -> String {
    format!("{index:05}.m4s")
}

/// Concatène `init.mp4` puis les segments dans l'ordre : un MP4 fragmenté valide.
async fn assemble(parts: &Path, has_init: bool, total: usize, dest: &Path) -> Result<(), String> {
    let tmp = dest.with_extension("mp4.tmp");
    let mut out = tokio::fs::File::create(&tmp)
        .await
        .map_err(|e| e.to_string())?;

    let names = has_init
        .then(|| "init.mp4".to_string())
        .into_iter()
        .chain((0..total).map(segment_name));

    for name in names {
        let mut input = tokio::fs::File::open(parts.join(&name))
            .await
            .map_err(|e| format!("{name} : {e}"))?;
        tokio::io::copy(&mut input, &mut out)
            .await
            .map_err(|e| e.to_string())?;
    }
    out.flush().await.map_err(|e| e.to_string())?;
    drop(out);
    tokio::fs::rename(&tmp, dest)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifiants_surs() {
        assert!(is_safe_id("fcea068718bc43c687190797ba14688f"));
        assert!(is_safe_id("3f2a-11"));
        assert!(!is_safe_id(""));
        assert!(!is_safe_id("../etc"));
        assert!(!is_safe_id("a/b"));
    }

    #[test]
    fn chemin_refuse_la_traversee() {
        let root = Path::new("/data/downloads");
        assert!(item_dir(root, "s", "u", "..").is_err());
        assert_eq!(item_dir(root, "s", "u", "i").unwrap(), root.join("s/u/i"));
    }

    #[tokio::test]
    async fn concatene_init_puis_segments_dans_l_ordre() {
        let dir = tempfile::tempdir().unwrap();
        let parts = dir.path().join("parts");
        tokio::fs::create_dir_all(&parts).await.unwrap();
        tokio::fs::write(parts.join("init.mp4"), b"INIT")
            .await
            .unwrap();
        for i in 0..3 {
            tokio::fs::write(parts.join(segment_name(i)), format!("S{i}"))
                .await
                .unwrap();
        }
        let dest = dir.path().join("media.mp4");
        assemble(&parts, true, 3, &dest).await.unwrap();
        assert_eq!(
            tokio::fs::read_to_string(&dest).await.unwrap(),
            "INITS0S1S2"
        );
    }

    #[test]
    fn meta_ancienne_version_reste_lisible() {
        let json = r#"{"serverId":"s","userId":"u","itemId":"i","name":"Film","state":"completed","segments":3,"variant":"bitrate=original","file":"/x/media.mp4"}"#;
        let meta: DownloadMeta = serde_json::from_str(json).unwrap();
        assert!(meta.subtitles.is_empty());
        assert_eq!(meta.size, 0);
        assert!(meta.info.series_name.is_none());
    }

    #[tokio::test]
    async fn taille_d_un_dossier_recursive() {
        let dir = tempfile::tempdir().unwrap();
        tokio::fs::create_dir_all(dir.path().join("a/b"))
            .await
            .unwrap();
        tokio::fs::write(dir.path().join("a/x"), b"12345")
            .await
            .unwrap();
        tokio::fs::write(dir.path().join("a/b/y"), b"123")
            .await
            .unwrap();
        assert_eq!(dir_size(dir.path()).await, 8);
    }

    #[tokio::test]
    async fn concatenation_echoue_si_un_segment_manque() {
        let dir = tempfile::tempdir().unwrap();
        let parts = dir.path().join("parts");
        tokio::fs::create_dir_all(&parts).await.unwrap();
        tokio::fs::write(parts.join(segment_name(0)), b"S0")
            .await
            .unwrap();
        assert!(
            assemble(&parts, false, 2, &dir.path().join("m.mp4"))
                .await
                .is_err()
        );
    }
}
