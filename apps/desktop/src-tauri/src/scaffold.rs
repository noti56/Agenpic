use std::path::PathBuf;

const AGENPIC_MD: &str = include_str!("../templates/AGENPIC.md");
const AGENPIC_CLI: &str = include_str!("../templates/agenpic-cli.mjs");

/// Run once, right after a project is created. Writes the CLI script (always
/// overwritten — it's tool-owned) and a one-time onboarding file (never
/// clobbered if it already exists), and makes sure the CLI's local
/// credential file won't end up in the project's git history.
#[tauri::command]
pub fn scaffold_project(project_path: String) -> Result<(), String> {
    let root = PathBuf::from(&project_path);
    let bin_dir = root.join(".agenpic").join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    std::fs::write(bin_dir.join("agenpic-cli.mjs"), AGENPIC_CLI).map_err(|e| e.to_string())?;

    let agenpic_md = root.join("AGENPIC.md");
    if !agenpic_md.exists() {
        std::fs::write(&agenpic_md, AGENPIC_MD).map_err(|e| e.to_string())?;
    }

    ensure_gitignored(&root)?;

    Ok(())
}

/// Writes/refreshes the CLI's local connection config — called whenever a
/// project is opened and periodically while it stays open, so the bearer
/// token doesn't go stale mid-session.
#[tauri::command]
pub fn write_agenpic_config(project_path: String, config_json: String) -> Result<(), String> {
    let root = PathBuf::from(&project_path);
    let dir = root.join(".agenpic");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("agenpic.config.json"), config_json).map_err(|e| e.to_string())?;
    Ok(())
}

fn ensure_gitignored(root: &std::path::Path) -> Result<(), String> {
    let gitignore = root.join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    if existing.lines().any(|line| line.trim() == ".agenpic/") {
        return Ok(());
    }
    let mut updated = existing;
    if !updated.is_empty() && !updated.ends_with('\n') {
        updated.push('\n');
    }
    updated.push_str(".agenpic/\n");
    std::fs::write(&gitignore, updated).map_err(|e| e.to_string())
}
