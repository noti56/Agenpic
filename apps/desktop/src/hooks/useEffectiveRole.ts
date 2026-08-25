import { useQuery } from "@tanstack/react-query";
import { effectiveRole as computeEffectiveRole, type ProjectRecord } from "@agenpic/types";
import { ClientResponseError } from "pocketbase";
import { client } from "../lib/pocketbase";
import { useAuth } from "../state/AuthContext";

export function useEffectiveRole(project: ProjectRecord | null) {
  const { user } = useAuth();
  const isOwner = !!user && !!project && project.owner === user.id;

  const membership = useQuery({
    queryKey: ["my_membership", project?.id, user?.id],
    queryFn: async () => {
      if (!project || !user) return null;
      try {
        return await client.projectMembers.getFirstListItem(
          `project = "${project.id}" && user = "${user.id}"`,
        );
      } catch (err) {
        if (err instanceof ClientResponseError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: !!project && !!user && !isOwner,
  });

  if (!project || !user) return { role: undefined, isOwner: false, isLoading: false };

  const role = computeEffectiveRole(project, user.id, membership.data ?? undefined);
  return { role, isOwner, isLoading: !isOwner && membership.isLoading };
}
