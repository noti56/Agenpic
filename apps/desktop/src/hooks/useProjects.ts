import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { client } from "../lib/pocketbase";
import { useAuth } from "../state/AuthContext";
import { getLogger } from "../lib/logger";

const log = getLogger("project-scaffold");

export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["projects", user?.id],
    queryFn: () => client.projects.getFullList({ sort: "-created" }),
    enabled: !!user,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ name, path }: { name: string; path: string }) => {
      if (!user) throw new Error("Not authenticated");
      const project = await client.projects.create({ name, path, owner: user.id });
      try {
        await invoke("scaffold_project", { projectPath: path });
      } catch (err) {
        log.error("scaffold_project failed", err);
      }
      return project;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
