//! Identité de l'appareil et stockage du jeton Jellyfin.
//!
//! - `DeviceId` : UUID généré au premier lancement, conservé dans le dossier de
//!   données de l'app. Il doit rester stable, sinon chaque lancement crée un
//!   nouvel appareil côté serveur.
//! - Jeton : trousseau système (Keychain macOS / Credential Manager Windows),
//!   jamais écrit en clair sur disque.

use std::fs;

use tauri::{AppHandle, Manager};

const KEYRING_SERVICE: &str = "com.vellyfin.app";
const DEVICE_ID_FILE: &str = "device-id";

fn keyring_entry(server_id: &str, user_id: &str) -> Result<keyring::Entry, String> {
    if server_id.is_empty() || user_id.is_empty() {
        return Err("serverId et userId sont requis".into());
    }
    keyring::Entry::new(KEYRING_SERVICE, &format!("{server_id}/{user_id}"))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn device_id(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = dir.join(DEVICE_ID_FILE);

    if let Ok(existing) = fs::read_to_string(&path) {
        let id = existing.trim();
        if uuid::Uuid::parse_str(id).is_ok() {
            return Ok(id.to_string());
        }
    }

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    fs::write(&path, &id).map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn token_save(server_id: String, user_id: String, token: String) -> Result<(), String> {
    keyring_entry(&server_id, &user_id)?
        .set_password(&token)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn token_load(server_id: String, user_id: String) -> Result<Option<String>, String> {
    match keyring_entry(&server_id, &user_id)?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn token_delete(server_id: String, user_id: String) -> Result<(), String> {
    match keyring_entry(&server_id, &user_id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
