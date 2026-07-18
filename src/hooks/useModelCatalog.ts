import { useEffect, useState } from "react";
import { bridgeListModels, isExtensionAvailable } from "@/lib/bridge";
import { getItem, setItem, STORAGE_KEYS } from "@/lib/storage";
import type { AiProvider } from "@/types";

// How long a fetched catalogue is trusted before re-checking. Model lists
// change on the order of weeks, and a /models call costs a request against the
// user's rate limit, so an hour keeps it "real-time enough" without hammering
// the provider on every Setup visit.
const CATALOG_TTL_MS = 60 * 60 * 1000;

interface CatalogEntry {
  fetchedAt: number;
  models: string[];
}
type ModelCatalog = Partial<Record<AiProvider, CatalogEntry>>;

export interface ModelCatalogState {
  /** Live model IDs for the provider, or null when unknown (not yet checked / couldn't check). */
  liveModels: string[] | null;
  checkedAt: number | null;
  loading: boolean;
  /** Why the check couldn't run (no extension, bad key, provider without a usable /models endpoint). */
  error: string | null;
}

/**
 * Keeps a per-provider cache of the provider's live model catalogue so the
 * Setup page can flag retired models in real time. The actual fetch runs in the
 * extension's background worker (see bridgeListModels) because the page can't
 * call provider APIs directly (CORS); results are cached in storage with a TTL
 * so switching back and forth doesn't re-hit the provider.
 *
 * `enabled` gates the whole thing — pass false when the current provider has no
 * saved key, since the check is authenticated. `refreshKey` lets the caller
 * force a re-check (e.g. right after saving a new key).
 */
export function useModelCatalog(
  provider: AiProvider,
  enabled: boolean,
  refreshKey: number
): ModelCatalogState {
  const [catalog, setCatalog] = useState<ModelCatalog>({});
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getItem<ModelCatalog>(STORAGE_KEYS.modelCatalog, {}).then((c) => {
      setCatalog(c);
      setCacheLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!cacheLoaded) return;
    setError(null);
    if (!enabled) return;

    const entry = catalog[provider];
    if (entry && Date.now() - entry.fetchedAt < CATALOG_TTL_MS) return; // still fresh

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (!(await isExtensionAvailable())) {
          if (!cancelled) setError("Model availability check needs the browser extension installed.");
          return;
        }
        const models = await bridgeListModels(provider);
        if (cancelled) return;
        setCatalog((prev) => {
          const next: ModelCatalog = { ...prev, [provider]: { fetchedAt: Date.now(), models } };
          setItem(STORAGE_KEYS.modelCatalog, next);
          return next;
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't check the model list.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `catalog` is intentionally omitted: including it would re-run the effect
    // on our own setCatalog and loop. The freshness read is a point-in-time
    // check, which is exactly what we want here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, enabled, cacheLoaded, refreshKey]);

  const entry = catalog[provider];
  return {
    liveModels: entry?.models ?? null,
    checkedAt: entry?.fetchedAt ?? null,
    loading,
    error,
  };
}

/**
 * Whether a model ID is present in the provider's live catalogue. Returns null
 * when the catalogue is unknown (so the UI shows nothing rather than a false
 * "retired"). Matches leniently around the `:free` suffix, which some catalogs
 * (OpenRouter) include and some of our IDs carry — so a suffix mismatch never
 * mislabels a working model as gone.
 */
export function isModelLive(modelId: string, liveModels: string[] | null): boolean | null {
  if (!liveModels) return null;
  const bare = modelId.replace(/:free$/, "");
  return liveModels.some((m) => {
    const mBare = m.replace(/:free$/, "");
    return m === modelId || mBare === bare;
  });
}
