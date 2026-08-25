use std::collections::{HashMap, HashSet};
use std::path::Path;

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};

/// True if a `claude` process is running as a descendant of `root_pid`
/// (the terminal's own shell process) **and** its working directory is
/// inside `project_path`. Ancestry alone would already scope this to the
/// right terminal — no other project's PTY is an ancestor of this one —
/// but checking cwd too means a `claude` launched here and then `cd`'d
/// elsewhere no longer counts, matching "is Claude running on this
/// project" rather than just "was it launched from this terminal".
pub fn is_claude_running_in(root_pid: u32, project_path: &Path) -> bool {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cwd(UpdateKind::Always)
            .with_exe(UpdateKind::Always),
    );

    let root = Pid::from_u32(root_pid);

    let mut children_map: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, process) in sys.processes() {
        if let Some(parent) = process.parent() {
            children_map.entry(parent).or_default().push(*pid);
        }
    }

    let mut stack = vec![root];
    let mut visited = HashSet::new();
    while let Some(pid) = stack.pop() {
        if !visited.insert(pid) {
            continue;
        }
        let Some(children) = children_map.get(&pid) else {
            continue;
        };
        for &child_pid in children {
            if let Some(process) = sys.process(child_pid) {
                let name = process.name().to_string_lossy().to_lowercase();
                if name == "claude" || name == "claude.exe" {
                    let cwd_matches = process
                        .cwd()
                        .map(|cwd| cwd.starts_with(project_path))
                        .unwrap_or(true); // cwd unreadable (e.g. permissions) — fall back to ancestry match
                    if cwd_matches {
                        return true;
                    }
                }
            }
            stack.push(child_pid);
        }
    }
    false
}
