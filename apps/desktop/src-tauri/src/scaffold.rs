use std::path::{Path, PathBuf};

const AGENPIC_MD: &str = include_str!("../templates/AGENPIC.md");
const AGENPIC_CLI: &str = include_str!("../templates/agenpic-cli.mjs");

/// The line that pulls AGENPIC.md into every Claude Code session. Claude Code
/// only auto-loads CLAUDE.md, so without this the mission protocol never
/// reaches the model.
const CLAUDE_MD_POINTER: &str = "@AGENPIC.md";

/// Run on every project *open*, not just once at creation. All three files it
/// writes are tool-owned, so re-running is how they stay current: a teammate
/// who joins an existing project gets them the first time they open it, and
/// everyone else picks up changes when Agenpic updates.
#[tauri::command]
pub fn scaffold_project(project_path: String) -> Result<(), String> {
    let root = PathBuf::from(&project_path);
    let bin_dir = root.join(".agenpic").join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    std::fs::write(bin_dir.join("agenpic-cli.mjs"), AGENPIC_CLI).map_err(|e| e.to_string())?;
    std::fs::write(root.join("AGENPIC.md"), AGENPIC_MD).map_err(|e| e.to_string())?;

    ensure_claude_md_pointer(&root)?;
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

/// Prepends `@AGENPIC.md` to the project's CLAUDE.md, creating the file if it
/// doesn't exist. Unlike the files above, CLAUDE.md belongs to the user — most
/// projects have a real hand-written one — so this only ever adds the single
/// missing line and never rewrites what's already there.
fn ensure_claude_md_pointer(root: &Path) -> Result<(), String> {
    let claude_md = root.join("CLAUDE.md");
    let existing = std::fs::read_to_string(&claude_md).unwrap_or_default();
    if existing
        .lines()
        .any(|line| line.trim() == CLAUDE_MD_POINTER)
    {
        return Ok(());
    }
    let updated = if existing.trim().is_empty() {
        format!("{CLAUDE_MD_POINTER}\n")
    } else {
        format!("{CLAUDE_MD_POINTER}\n\n{existing}")
    };
    std::fs::write(&claude_md, updated).map_err(|e| e.to_string())
}

fn ensure_gitignored(root: &Path) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "agenpic-scaffold-{tag}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn creates_claude_md_when_missing() {
        let root = temp_dir("missing");
        ensure_claude_md_pointer(&root).unwrap();
        let body = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        assert_eq!(body, "@AGENPIC.md\n");
    }

    #[test]
    fn prepends_without_disturbing_existing_content() {
        let root = temp_dir("existing");
        let original = "# My Project\n\nHand-written notes.\n";
        std::fs::write(root.join("CLAUDE.md"), original).unwrap();
        ensure_claude_md_pointer(&root).unwrap();
        let body = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        assert_eq!(body, format!("@AGENPIC.md\n\n{original}"));
    }

    #[test]
    fn is_idempotent_across_repeated_opens() {
        let root = temp_dir("idempotent");
        std::fs::write(root.join("CLAUDE.md"), "# My Project\n").unwrap();
        ensure_claude_md_pointer(&root).unwrap();
        let after_first = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        ensure_claude_md_pointer(&root).unwrap();
        ensure_claude_md_pointer(&root).unwrap();
        let after_third = std::fs::read_to_string(root.join("CLAUDE.md")).unwrap();
        assert_eq!(after_first, after_third);
        assert_eq!(after_third.matches("@AGENPIC.md").count(), 1);
    }
}
