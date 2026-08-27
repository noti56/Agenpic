import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getLogger } from "../lib/logger";

const log = getLogger("project-scaffold");

/**
 * Writes the tool-owned files into the project: the bundled
 * `agenpic-cli.mjs`, AGENPIC.md, the `@AGENPIC.md` pointer in CLAUDE.md, and
 * the `.agenpic/` .gitignore entry.
 *
 * Runs on project *open* rather than at creation, for two reasons: a teammate
 * who joins an existing project never takes the create path at all (they only
 * pick a local folder — see ProjectPathSetup), so they'd otherwise end up with
 * credentials but no CLI; and pinning the scaffold to creation time would
 * freeze every project on whatever CLI version happened to ship that day.
 */
export function useProjectScaffold(projectPath: string | undefined) {
  useEffect(() => {
    if (!projectPath) return;
    invoke("scaffold_project", { projectPath }).catch((err) =>
      log.error("scaffold_project failed", err),
    );
  }, [projectPath]);
}
