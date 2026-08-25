import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@agenpic/ui";
import { useProjectContext } from "../state/ProjectContext";
import { useEffectiveRole } from "../hooks/useEffectiveRole";
import { useLocalProjectPath } from "../hooks/useLocalProjectPath";
import { useAgenpicCliConfig } from "../hooks/useAgenpicCliConfig";
import { toggleLogViewer } from "../lib/logger";
import { TerminalPanel } from "../components/TerminalPanel";
import { MissionHangarPanel } from "../components/MissionHangarPanel";
import { ChatPanel } from "../components/ChatPanel";

// Phaser (~1MB) / the markdown editor are only needed once their tabs are
// actually visited — code-split them out of the main bundle instead of
// paying that parse/init cost on every app launch.
const PresenceMap = lazy(() => import("../components/PresenceMap").then((m) => ({ default: m.PresenceMap })));
const DocsPanel = lazy(() => import("../components/DocsPanel").then((m) => ({ default: m.DocsPanel })));
import { MembersPanel } from "./MembersPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ProjectPathSetup } from "./ProjectPathSetup";
import styles from "./Shell.module.css";

type Tab = "terminal" | "hangar" | "map" | "chat" | "docs";

export function Shell() {
  const { activeProject, selectProject } = useProjectContext();
  const [tab, setTab] = useState<Tab>("terminal");
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPathSetup, setShowPathSetup] = useState(false);
  const { role, isOwner, isLoading: isRoleLoading } = useEffectiveRole(activeProject);
  const {
    path: localPath,
    isLoading: isPathLoading,
    setPath: saveLocalPath,
  } = useLocalProjectPath(activeProject?.id);

  // `project.path` is only the owner's local checkout. Everyone else needs
  // their own machine-local override, picked once and remembered locally.
  const projectPath = isOwner ? activeProject?.path : (localPath ?? undefined);
  const needsPathSetup = !isOwner && !isRoleLoading && !isPathLoading && !localPath;

  useAgenpicCliConfig(activeProject?.id, projectPath);

  // Global "~" shortcut to toggle the log panel, like a game/dev console —
  // skipped while typing in the terminal or any input so `~` still types
  // normally there (e.g. `~/projects` paths).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "`" && e.key !== "~") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (target?.closest(".xterm")) return;
      e.preventDefault();
      toggleLogViewer();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!activeProject) return null;

  if (needsPathSetup || showPathSetup) {
    return (
      <ProjectPathSetup
        project={activeProject}
        onBack={() => (showPathSetup ? setShowPathSetup(false) : selectProject(null))}
        onSave={async (path) => {
          await saveLocalPath(path);
          setShowPathSetup(false);
        }}
      />
    );
  }

  if (!projectPath) return null;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => selectProject(null)}>
            ← Projects
          </button>
          <span className={styles.projectName}>{activeProject.name}</span>
          <span className={styles.roleBadge}>{role}</span>
        </div>

        <nav className={styles.tabs}>
          <button
            className={[styles.tab, tab === "terminal" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("terminal")}
          >
            Terminal
          </button>
          <button
            className={[styles.tab, tab === "hangar" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("hangar")}
          >
            Mission Hangar
          </button>
          <button
            className={[styles.tab, tab === "map" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("map")}
          >
            Map
          </button>
          <button
            className={[styles.tab, tab === "chat" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
          <button
            className={[styles.tab, tab === "docs" ? styles.tabActive : ""].join(" ")}
            onClick={() => setTab("docs")}
          >
            Docs
          </button>
        </nav>

        <div className={styles.headerRight}>
          {!isOwner && (
            <Button variant="ghost" onClick={() => setShowPathSetup(true)}>
              Change Folder
            </Button>
          )}
          <Button variant="ghost" onClick={() => setShowSettings(true)}>
            Settings
          </Button>
          <Button variant="ghost" onClick={() => setShowMembers(true)}>
            Members
          </Button>
          <Button variant="ghost" onClick={toggleLogViewer} title="Toggle logs (~)">
            Logs
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        <div style={{ display: tab === "terminal" ? "block" : "none", height: "100%" }}>
          <TerminalPanel cwd={projectPath} projectId={activeProject.id} />
        </div>
        <div style={{ display: tab === "hangar" ? "block" : "none", height: "100%" }}>
          <MissionHangarPanel project={activeProject} role={role} />
        </div>
        <div style={{ display: tab === "map" ? "block" : "none", height: "100%" }}>
          <Suspense fallback={null}>
            <PresenceMap project={activeProject} />
          </Suspense>
        </div>
        <div style={{ display: tab === "chat" ? "block" : "none", height: "100%" }}>
          <ChatPanel projectId={activeProject.id} />
        </div>
        <div style={{ display: tab === "docs" ? "block" : "none", height: "100%" }}>
          <Suspense fallback={null}>
            <DocsPanel projectId={activeProject.id} role={role} />
          </Suspense>
        </div>
      </main>

      {showMembers && (
        <MembersPanel project={activeProject} isOwner={isOwner} onClose={() => setShowMembers(false)} />
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
