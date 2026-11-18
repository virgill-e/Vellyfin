mod auth;
mod downloads;
mod hls;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(downloads::Downloads::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Mises à jour signées publiées sur les Releases GitHub (ADR-003).
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth::device_id,
            auth::token_save,
            auth::token_load,
            auth::token_delete,
            downloads::download_start,
            downloads::download_cancel,
            downloads::downloads_list,
            downloads::download_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
