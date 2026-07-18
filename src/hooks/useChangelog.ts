import { useEffect, useState } from "react";

export interface ChangelogEntry {
  version: string;
  changes: string[];
}

/**
 * Fetches the published changelog fresh on every call (`cache: "no-store"`,
 * same as useExtensionVersion's version file) rather than relying on whatever
 * the current JS bundle shipped with — the web app redeploys on every push, so
 * this is what makes "what's new" reflect a just-pushed release immediately,
 * without waiting on a user's browser to fetch a new bundle.
 */
export function useChangelog(): { entries: ChangelogEntry[] | null } {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/changelog.json", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { entries?: ChangelogEntry[] } | null) => {
        if (!cancelled) setEntries(data?.entries ?? null);
      })
      .catch(() => {
        if (!cancelled) setEntries(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { entries };
}
