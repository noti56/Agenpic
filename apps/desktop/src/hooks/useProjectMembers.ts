import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProjectMemberRole } from "@agenpic/types";
import { ClientResponseError } from "pocketbase";
import { client } from "../lib/pocketbase";

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ["project_members", projectId],
    queryFn: () =>
      client.projectMembers.getFullList({
        filter: `project = "${projectId}"`,
        expand: "user",
        sort: "-created",
      }),
    enabled: !!projectId,
  });
}

export function useInviteMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: ProjectMemberRole }) => {
      let userId: string;
      try {
        const user = await client.users.getFirstListItem(`email = "${email}"`);
        userId = user.id;
      } catch (err) {
        if (err instanceof ClientResponseError && err.status === 404) {
          throw new Error(`No user found with email ${email}`);
        }
        throw err;
      }
      return client.projectMembers.create({ project: projectId, user: userId, role });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_members", projectId] }),
  });
}

export function useUpdateMemberRole(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: ProjectMemberRole }) =>
      client.projectMembers.update(memberId, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_members", projectId] }),
  });
}

export function useRemoveMember(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => client.projectMembers.delete(memberId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project_members", projectId] }),
  });
}
