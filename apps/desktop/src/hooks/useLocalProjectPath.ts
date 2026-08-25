import { useCallback, useEffect, useState } from "react";
import { getLocalProjectPath, setLocalProjectPath } from "../lib/localProjectPaths";

export function useLocalProjectPath(projectId: string | undefined) {
  const [path, setPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!projectId);

  useEffect(() => {
    if (!projectId) {
      setPath(null);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    getLocalProjectPath(projectId).then((stored) => {
      if (!cancelled) {
        setPath(stored);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const save = useCallback(
    async (newPath: string) => {
      if (!projectId) return;
      await setLocalProjectPath(projectId, newPath);
      setPath(newPath);
    },
    [projectId],
  );

  return { path, isLoading, setPath: save };
}
