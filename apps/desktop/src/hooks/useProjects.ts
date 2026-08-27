import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "../lib/pocketbase";
import { useAuth } from "../state/AuthContext";

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
      // Scaffolding the CLI/AGENPIC.md/CLAUDE.md pointer deliberately does
      // *not* happen here — it runs on every project open instead, so
      // teammates and pre-existing projects get it too. See useProjectScaffold.
      return client.projects.create({ name, path, owner: user.id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
