mod claude_detect;
mod media_permissions;
mod pty;
mod scaffold;

use pty::PtyState;
use tauri::menu::MenuBuilder;
use tauri::tray::TrayIconBuilder;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyState::default())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                media_permissions::grant_media_permissions(&window);

                // Pressing the window's close button "closes to tray" rather
                // than quitting the process — only the tray menu's Quit item
                // (below) actually terminates the app.
                let close_target = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = close_target.hide();
                        let _ = close_target.set_skip_taskbar(true);
                    }
                });
            }

            let tray_menu = MenuBuilder::new(app)
                .text("show", "Show Agenpic")
                .text("quit", "Quit")
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.set_skip_taskbar(false);
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

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
