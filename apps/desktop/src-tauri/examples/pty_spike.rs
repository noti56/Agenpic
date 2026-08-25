// Standalone spike: prove portable-pty can open a real PTY, spawn a shell,
// run an interactive CLI (`claude --version`), resize the pty, and read
// output back — independent of the Tauri window, so it can be verified
// from a script instead of clicking around a GUI.
use std::io::{Read, Write};
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

fn main() {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("failed to open pty");

    // cmd.exe used here only because this standalone harness has no terminal
    // emulator to answer PSReadLine's cursor-position query (ESC[6n) that
    // powershell.exe sends on startup; xterm.js answers that automatically
    // in the real app, so powershell.exe is used there instead.
    let shell = if cfg!(windows) {
        "cmd.exe".to_string()
    } else {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    };

    let mut cmd = CommandBuilder::new(&shell);
    cmd.cwd(std::env::current_dir().unwrap());

    let mut child = pair.slave.spawn_command(cmd).expect("failed to spawn shell");
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().expect("clone reader");
    let writer = std::sync::Arc::new(std::sync::Mutex::new(
        pair.master.take_writer().expect("take writer"),
    ));

    // ConPTY (Windows) expects the reading side to behave like a real
    // terminal and answer its ESC[6n cursor-position query with ESC[r;cR
    // before it will release further output. xterm.js does this itself in
    // the real app; here we fake a minimal reply so the handshake unblocks.
    let responder = writer.clone();
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                    if chunk.contains("\x1b[6n") {
                        let mut w = responder.lock().unwrap();
                        let _ = w.write_all(b"\x1b[24;1R");
                        let _ = w.flush();
                    }
                    if tx.send(chunk).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });

    std::thread::sleep(Duration::from_millis(800));

    writer.lock().unwrap().write_all(b"claude --version\r\n").unwrap();
    std::thread::sleep(Duration::from_millis(1500));

    // Resize mid-session to prove resize works while the child is alive.
    pair.master
        .resize(PtySize {
            rows: 40,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("resize failed");
    println!("[spike] resized pty to 120x40 successfully");

    writer.lock().unwrap().write_all(b"echo RESIZE_OK\r\n").unwrap();
    std::thread::sleep(Duration::from_millis(800));

    writer.lock().unwrap().write_all(b"exit\r\n").unwrap();
    std::thread::sleep(Duration::from_millis(500));

    let mut output = String::new();
    while let Ok(chunk) = rx.try_recv() {
        output.push_str(&chunk);
    }

    let _ = child.kill();

    println!("=== PTY OUTPUT ===");
    println!("{output}");
    println!("=== END OUTPUT ===");

    let ok_version = output.contains("Claude Code");
    let ok_resize = output.to_lowercase().contains("resize_ok");
    println!("[spike] claude --version detected: {ok_version}");
    println!("[spike] resize command echoed back: {ok_resize}");

    if !ok_version {
        std::process::exit(1);
    }
}
