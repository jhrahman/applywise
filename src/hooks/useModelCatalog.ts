import { useEffect, useState } from "react";
import {
  bridgeGetExtensionVersion,
  bridgeListModels,
  isExtensionAvailable,
  type LiveModel,
} from "@/lib/bridge";
import { getItem, setItem, STORAGE_KEYS } from "@/lib/storage";
import type { AiProvider } from "@/types";

// How long a fetched catalogue is trusted before re-checking. Model lists
// change on the order of weeks, and a /models call costs a request against the
// user's rate limit, so an hour keeps it "real-time enough" without hammering
// the provider on every Setup visit.
const CATALOG_TTL_MS = 60 * 60 * 1000;

interface CatalogEntry {
  fetchedAt: number;
  /**
   * The extension version that produced this entry. The model fetch (including
   * whether it parses a per-model retirement date) runs entirely in the
   * extension's background worker, so a cache written by an older extension is
   * stale in a way the TTL alone can't detect — e.g. a user who updates to an
   * extension that started returning `expiresAt` would keep seeing no "going
   * away" flag for up to a full TTL, because the cached list still lacks it.
   * Refetching whenever this differs from the currently-installed version makes
   * an extension update take effect on the very next Setup visit instead.
   */
  extVersion?: string;
  models: LiveModel[];
}
type ModelCatalog = Partial<Record<AiProvider, CatalogEntry>>;

export interface ModelCatalogState {
  /** Live models for the provider, or null when unknown (not yet checked / couldn't check). */
  liveModels: LiveModel[] | null;
  checkedAt: number | null;
  loading: boolean;
  /** Why the check couldn't run (no extension, bad key, provider without a usable /models endpoint). */
  error: string | null;
}

/**
 * Tolerates an OLDER installed extension's LIST_MODELS answer — a plain
 * `string[]`, the shape before this file's LiveModel `{ id, expiresAt? }`
 * shipped. "Load unpacked" extensions never auto-update, so a user can keep
 * running an old extension build for a long time against a web app that
 * redeploys the moment this code merges — verified live, this exact mismatch
 * threw `Cannot read properties of undefined (reading 'replace')` inside
 * findLiveModel below and blanked the whole Setup page, since React has no
 * error boundary around it. Any entry that isn't a string or a `{id}` object
 * is silently dropped rather than thrown on — a missing model in the
 * availability check is a much smaller failure than a blank page.
 */
function normalizeLiveModels(raw: unknown): LiveModel[] {
  if (!Array.isArray(raw)) return [];
  const out: LiveModel[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push({ id: item });
      continue;
    }
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      const rec = item as { id: string; expiresAt?: unknown };
      out.push(typeof rec.expiresAt === "string" ? { id: rec.id, expiresAt: rec.expiresAt } : { id: rec.id });
    }
  }
  return out;
}

/** Same tolerance as normalizeLiveModels, applied to every provider's cached
 * entry — a cache written by an old extension/web-app pairing needs the same
 * guard as a fresh fetch does. */
function normalizeCatalog(raw: ModelCatalog): ModelCatalog {
  const out: ModelCatalog = {};
  for (const [provider, entry] of Object.entries(raw) as [AiProvider, CatalogEntry | undefined][]) {
    if (!entry || typeof entry.fetchedAt !== "number") continue;
    out[provider] = {
      fetchedAt: entry.fetchedAt,
      extVersion: typeof entry.extVersion === "string" ? entry.extVersion : undefined,
      models: normalizeLiveModels(entry.models),
    };
  }
  return out;
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
      setCatalog(normalizeCatalog(c));
      setCacheLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!cacheLoaded) return;
    setError(null);
    if (!enabled) return;

    let cancelled = false;
    (async () => {
      try {
        if (!(await isExtensionAvailable())) {
          if (!cancelled) setError("Model availability check needs the browser extension installed.");
          return;
        }
        // Read the installed extension version before deciding the cache is
        // fresh: an entry from an older extension must be refetched even inside
        // its TTL (see CatalogEntry.extVersion). A failed version probe degrades
        // to undefined, which only matches an equally-unknown cached version, so
        // the worst case is falling back to plain TTL freshness, never a hang.
        const extVersion = await bridgeGetExtensionVersion().catch(() => undefined);
        if (cancelled) return;

        const entry = catalog[provider];
        const fresh =
          entry != null &&
          Date.now() - entry.fetchedAt < CATALOG_TTL_MS &&
          entry.extVersion === extVersion;
        if (fresh) return; // cache still valid for this exact extension version

        setLoading(true);
        const models = normalizeLiveModels(await bridgeListModels(provider));
        if (cancelled) return;
        setCatalog((prev) => {
          const next: ModelCatalog = {
            ...prev,
            [provider]: { fetchedAt: Date.now(), extVersion, models },
          };
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

/** Matches leniently around the `:free` suffix, which some catalogs
 * (OpenRouter) include and some of our IDs carry — so a suffix mismatch never
 * mislabels a working model as gone. Shared by isModelLive and getModelExpiry
 * so both use exactly the same match rule. */
function findLiveModel(modelId: string, liveModels: LiveModel[] | null): LiveModel | null {
  if (!liveModels) return null;
  const bare = modelId.replace(/:free$/, "");
  return (
    liveModels.find((m) => {
      const mBare = m.id.replace(/:free$/, "");
      return m.id === modelId || mBare === bare;
    }) ?? null
  );
}

/**
 * Whether a model ID is present in the provider's live catalogue. Returns null
 * when the catalogue is unknown (so the UI shows nothing rather than a false
 * "retired").
 */
export function isModelLive(modelId: string, liveModels: LiveModel[] | null): boolean | null {
  if (!liveModels) return null;
  return findLiveModel(modelId, liveModels) !== null;
}

/**
 * The date (YYYY-MM-DD) this model is scheduled to stop being served, if the
 * provider publishes one (currently only OpenRouter) — null otherwise, or if
 * the catalogue is unknown. A model can be live today (isModelLive true) and
 * still have a scheduled retirement date; the two are independent checks so
 * the Setup page can show both "works right now" and "switch before <date>".
 */
export function getModelExpiry(modelId: string, liveModels: LiveModel[] | null): string | null {
  return findLiveModel(modelId, liveModels)?.expiresAt ?? null;
}
