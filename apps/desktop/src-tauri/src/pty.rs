use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::claude_detect::is_claude_running_in;

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
    /// Cleared on pty_kill so the claude-detection poller thread stops.
    alive: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct PtyState(Mutex<HashMap<String, PtySession>>);

#[derive(Serialize, Clone)]
struct PtyOutputPayload {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct PtyExitPayload {
    id: String,
    code: Option<u32>,
}

#[derive(Serialize, Clone)]
struct PtyClaudeStatusPayload {
    id: String,
    running: bool,
}

const CLAUDE_POLL_INTERVAL: Duration = Duration::from_secs(2);

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    cwd: Option<String>,
    shell: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<String, String> {
    let cwd = cwd.unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    });
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell_bin = shell.unwrap_or_else(|| {
        if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        }
    });

    let mut cmd = CommandBuilder::new(&shell_bin);
    cmd.cwd(&cwd);

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Drop the slave handle in the parent process; the child owns its copy.
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let alive = Arc::new(AtomicBool::new(true));
    let root_pid = child.process_id();

    let session = PtySession {
        master: pair.master,
        writer,
        child,
        alive: alive.clone(),
    };
    state.0.lock().insert(id.clone(), session);

    let emit_app = app.clone();
    let reader_id = id.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = emit_app.emit(
                        "pty://output",
                        PtyOutputPayload {
                            id: reader_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = emit_app.emit(
            "pty://exit",
            PtyExitPayload {
                id: reader_id.clone(),
                code: None,
            },
        );
    });

    // Periodically checks whether a `claude` process is running as a
    // descendant of this shell with a matching cwd, and tells the frontend
    // only when that changes — this is what backs the "Claude Code
    // Terminal" presence node, instead of just assuming a terminal tab
    // being open means Claude is active in it.
    if let Some(root_pid) = root_pid {
        let project_dir = PathBuf::from(&cwd);
        let claude_app = app.clone();
        let claude_id = id.clone();
        let claude_alive = alive;
        std::thread::spawn(move || {
            let mut last_known = false;
            while claude_alive.load(Ordering::Relaxed) {
                std::thread::sleep(CLAUDE_POLL_INTERVAL);
                if !claude_alive.load(Ordering::Relaxed) {
                    break;
                }
                let running = is_claude_running_in(root_pid, &project_dir);
                if running != last_known {
                    last_known = running;
                    let _ = claude_app.emit(
                        "pty://claude-status",
                        PtyClaudeStatusPayload {
                            id: claude_id.clone(),
                            running,
                        },
                    );
                }
            }
        });
    }

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    let mut sessions = state.0.lock();
    let session = sessions.get_mut(&id).ok_or("pty session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.0.lock();
    let session = sessions.get(&id).ok_or("pty session not found")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn pty_kill(state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.0.lock();
    if let Some(mut session) = sessions.remove(&id) {
        session.alive.store(false, Ordering::Relaxed);
        let _ = session.child.kill();
    }
    Ok(())
}
