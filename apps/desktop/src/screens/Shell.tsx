import { lazy, Suspense, useEffect, useState } from "react";
// Deep-imported per icon (rather than the `@phosphor-icons/react` barrel)
// so the bundle only includes the handful of icons actually used here — the
// barrel re-exports the entire ~2000-icon set in a way Rollup couldn't
// tree-shake, which bloated the build by ~1MB when tried.
import { ChatCircle } from "@phosphor-icons/react/ChatCircle";
import { FileText } from "@phosphor-icons/react/FileText";
import { Gear } from "@phosphor-icons/react/Gear";
import { Kanban } from "@phosphor-icons/react/Kanban";
import { MapTrifold } from "@phosphor-icons/react/MapTrifold";
import { ListBullets } from "@phosphor-icons/react/ListBullets";
import { Terminal as TerminalIcon } from "@phosphor-icons/react/Terminal";
import { Users } from "@phosphor-icons/react/Users";
import { useProjectContext } from "../state/ProjectContext";
import { useEffectiveRole } from "../hooks/useEffectiveRole";
import { useLocalProjectPath } from "../hooks/useLocalProjectPath";
import { useAgenpicCliConfig } from "../hooks/useAgenpicCliConfig";
import { useWorkspaceLayout, type PanelId } from "../hooks/useWorkspaceLayout";
import { toggleLogViewer } from "../lib/logger";
import { ActivityBar, type ActivityBarItem } from "../components/ActivityBar";
import { WorkspacePane } from "../components/WorkspacePane";
import { TerminalPanel } from "../components/TerminalPanel";
import { MissionHangarPanel } from "../components/MissionHangarPanel";
import { ChatPanel } from "../components/ChatPanel";

// Phaser (~1MB) / the markdown editor are only needed once their panels are
// actually opened — code-split them out of the main bundle instead of
// paying that parse/init cost on every app launch.
const PresenceMap = lazy(() => import("../components/PresenceMap").then((m) => ({ default: m.PresenceMap })));
const DocsPanel = lazy(() => import("../components/DocsPanel").then((m) => ({ default: m.DocsPanel })));
import { MembersPanel } from "./MembersPanel";
import { SettingsPanel } from "./SettingsPanel";
import { ProjectPathSetup } from "./ProjectPathSetup";
import styles from "./Shell.module.css";

const ACTIVITY_ITEMS: ActivityBarItem[] = [
  { id: "terminal", label: "Terminal", icon: <TerminalIcon size={24} /> },
  { id: "hangar", label: "Mission Hangar", icon: <Kanban size={24} /> },
  { id: "map", label: "Map", icon: <MapTrifold size={24} /> },
  { id: "chat", label: "Chat", icon: <ChatCircle size={24} /> },
  { id: "docs", label: "Docs", icon: <FileText size={24} /> },
];

const PANEL_TITLES: Record<PanelId, string> = {
  terminal: "Terminal",
  hangar: "Mission Hangar",
  map: "Map",
  chat: "Chat",
  docs: "Docs",
};

export function Shell() {
  const { activeProject, selectProject } = useProjectContext();
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

  const { activePanel, select, close } = useWorkspaceLayout(activeProject?.id ?? "");

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

        <div className={styles.headerRight}>
          {!isOwner && (
            <button className={styles.iconBtn} onClick={() => setShowPathSetup(true)} title="Change Folder">
              <FileText size={17} />
            </button>
          )}
          <button className={styles.iconBtn} onClick={() => setShowSettings(true)} title="Settings">
            <Gear size={17} />
          </button>
          <button className={styles.iconBtn} onClick={() => setShowMembers(true)} title="Members">
            <Users size={17} />
          </button>
          <button className={styles.iconBtn} onClick={toggleLogViewer} title="Toggle logs (~)">
            <ListBullets size={17} />
          </button>
        </div>
      </header>

      <div className={styles.body}>
        <ActivityBar items={ACTIVITY_ITEMS} activePanel={activePanel} onSelect={select} />

        <main className={styles.main}>
          <div style={{ display: activePanel === "terminal" ? "flex" : "none", height: "100%" }}>
            <WorkspacePane title={PANEL_TITLES.terminal} onClose={close}>
              <TerminalPanel cwd={projectPath} projectId={activeProject.id} />
            </WorkspacePane>
          </div>

          <div style={{ display: activePanel === "hangar" ? "flex" : "none", height: "100%" }}>
            <WorkspacePane title={PANEL_TITLES.hangar} onClose={close}>
              <MissionHangarPanel project={activeProject} role={role} />
            </WorkspacePane>
          </div>

          <div style={{ display: activePanel === "map" ? "flex" : "none", height: "100%" }}>
            <WorkspacePane title={PANEL_TITLES.map} onClose={close}>
              <Suspense fallback={null}>
                <PresenceMap project={activeProject} active={activePanel === "map"} />
              </Suspense>
            </WorkspacePane>
          </div>

          <div style={{ display: activePanel === "chat" ? "flex" : "none", height: "100%" }}>
            <WorkspacePane title={PANEL_TITLES.chat} onClose={close}>
              <ChatPanel projectId={activeProject.id} />
            </WorkspacePane>
          </div>

          <div style={{ display: activePanel === "docs" ? "flex" : "none", height: "100%" }}>
            <WorkspacePane title={PANEL_TITLES.docs} onClose={close}>
              <Suspense fallback={null}>
                <DocsPanel projectId={activeProject.id} role={role} />
              </Suspense>
            </WorkspacePane>
          </div>

          {!activePanel && (
            <div className={styles.emptyWorkspace}>
              <div className={styles.emptyWordmark}>
                <span className={styles.emptyCyan}>AGEN</span>
                <span className={styles.emptyMagenta}>PIC</span>
              </div>
              <p className={styles.emptyHint}>Select a panel from the left to get started</p>
            </div>
          )}
        </main>
      </div>

      {showMembers && (
        <MembersPanel project={activeProject} isOwner={isOwner} onClose={() => setShowMembers(false)} />
      )}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
}
