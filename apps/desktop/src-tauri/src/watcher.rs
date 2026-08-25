use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::time::{Duration, Instant};

use notify::{RecursiveMode, Watcher};
use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct WatcherState(Mutex<HashMap<String, notify::RecommendedWatcher>>);

#[derive(Serialize, Clone)]
struct ClaudeMdChangedPayload {
    project_id: String,
    content: Option<String>,
}

#[derive(Serialize, Clone)]
struct TicketChangedPayload {
    project_id: String,
    slug: String,
    content: Option<String>,
}

const DEBOUNCE: Duration = Duration::from_millis(250);

#[tauri::command]
pub fn watch_project(
    app: AppHandle,
    state: State<'_, WatcherState>,
    project_id: String,
    project_path: String,
) -> Result<(), String> {
    let root = PathBuf::from(&project_path);
    let tickets_dir = root.join(".agenpic").join("tickets");
    let claude_md = root.join("CLAUDE.md");

    let (tx, rx) = channel::<notify::Result<notify::Event>>();
    let mut watcher =
        notify::recommended_watcher(tx).map_err(|e| e.to_string())?;
    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;

    state.0.lock().insert(project_id.clone(), watcher);

    let emit_app = app.clone();
    std::thread::spawn(move || {
        let mut last_emitted: HashMap<PathBuf, Instant> = HashMap::new();
        for res in rx {
            let Ok(event) = res else { continue };
            for path in event.paths {
                if !is_relevant(&path, &claude_md, &tickets_dir) {
                    continue;
                }
                let now = Instant::now();
                if let Some(last) = last_emitted.get(&path) {
                    if now.duration_since(*last) < DEBOUNCE {
                        continue;
                    }
                }
                last_emitted.insert(path.clone(), now);

                if path == claude_md {
                    let content = std::fs::read_to_string(&path).ok();
                    let _ = emit_app.emit(
                        "agenpic://claude-md",
                        ClaudeMdChangedPayload {
                            project_id: project_id.clone(),
                            content,
                        },
                    );
                } else if path.starts_with(&tickets_dir)
                    && path.extension().and_then(|e| e.to_str()) == Some("json")
                {
                    let slug = path
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or_default()
                        .to_string();
                    let content = std::fs::read_to_string(&path).ok();
                    let _ = emit_app.emit(
                        "agenpic://ticket-changed",
                        TicketChangedPayload {
                            project_id: project_id.clone(),
                            slug,
                            content,
                        },
                    );
                }
            }
        }
    });

    Ok(())
}

fn is_relevant(path: &Path, claude_md: &Path, tickets_dir: &Path) -> bool {
    path == claude_md || path.starts_with(tickets_dir)
}

#[tauri::command]
pub fn unwatch_project(state: State<'_, WatcherState>, project_id: String) -> Result<(), String> {
    state.0.lock().remove(&project_id);
    Ok(())
}
