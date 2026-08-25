import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProjectRecord } from "@agenpic/types";
import { client } from "../lib/pocketbase";
import { useProjectMembers } from "./useProjectMembers";
import type { RosterEntry } from "../components/map/officeLayout";

/**
 * Owner + members, deduped, for laying out one office room per developer on
 * the presence map (see officeLayout.ts). Distinct from live presence:
 * this is "who has access to the project," not "who's online right now" —
 * a member's room exists whether or not they're currently connected.
 */
export function useProjectRoster(project: ProjectRecord | undefined): RosterEntry[] {
  const { data: members } = useProjectMembers(project?.id);
  const { data: owner } = useQuery({
    queryKey: ["user", project?.owner],
    queryFn: () => client.users.getOne(project!.owner),
    enabled: !!project?.owner,
  });

  return useMemo(() => {
    const roster: RosterEntry[] = [];
    if (owner) roster.push({ userId: owner.id, name: owner.name || owner.email });
    for (const m of members ?? []) {
      const u = m.expand?.user;
      if (u && u.id !== owner?.id) roster.push({ userId: u.id, name: u.name || u.email });
    }
    return roster;
  }, [owner, members]);
}
