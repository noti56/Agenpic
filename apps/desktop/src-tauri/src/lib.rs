mod claude_detect;
mod media_permissions;
mod pty;
mod scaffold;

use pty::PtyState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(PtyState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                media_permissions::grant_media_permissions(&window);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            scaffold::scaffold_project,
            scaffold::write_agenpic_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
