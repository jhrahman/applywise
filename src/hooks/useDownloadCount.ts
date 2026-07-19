import { useEffect, useState } from "react";
import { fetchTotalDownloadCount } from "@/lib/githubRelease";

/** Total extension downloads across every GitHub release, or null until known / unavailable. */
export function useDownloadCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTotalDownloadCount().then((total) => {
      if (!cancelled) setCount(total);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return count;
}
