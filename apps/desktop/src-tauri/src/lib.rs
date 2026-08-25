mod pty;
mod watcher;

use pty::PtyState;
use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(PtyState::default())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            watcher::watch_project,
            watcher::unwatch_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
