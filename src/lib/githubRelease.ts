// The extension isn't on the Chrome Web Store or Firefox Add-ons, so there's
// no store-provided install count. GitHub Releases is the only free,
// backend-less place that tracks real per-asset download counts (public REST
// API, no auth needed for a public repo) — see .github/workflows/release-extension.yml
// for how a release + the zip asset get published on every manifest version bump.
const GITHUB_REPO = "jhrahman/applywise";
const ASSET_NAME = "applywise-extension.zip";
const CACHE_KEY = "applywise:extension-download-count";
const CACHE_TTL_MS = 15 * 60 * 1000;

export function extensionReleaseDownloadUrl(version: string): string {
  return `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${ASSET_NAME}`;
}

interface CachedCount {
  total: number;
  fetchedAt: number;
}

/**
 * Total downloads of the extension zip across every published release.
 * Cached in localStorage for CACHE_TTL_MS since GitHub's unauthenticated API
 * is rate-limited (60 req/hr per IP) and this is shared by every visitor
 * behind the same address, not just this one browser.
 */
export async function fetchTotalDownloadCount(): Promise<number | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.total;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=100`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return cached?.total ?? null;

    const releases = (await response.json()) as Array<{
      assets?: Array<{ name: string; download_count: number }>;
    }>;

    const total = releases.reduce((sum, release) => {
      const asset = release.assets?.find((a) => a.name === ASSET_NAME);
      return sum + (asset?.download_count ?? 0);
    }, 0);

    writeCache({ total, fetchedAt: Date.now() });
    return total;
  } catch {
    // Offline, or GitHub's rate limit was hit — fall back to whatever was
    // last cached rather than showing an error for a background stat.
    return cached?.total ?? null;
  }
}

function readCache(): CachedCount | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedCount;
  } catch {
    return null;
  }
}

function writeCache(value: CachedCount): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private browsing, quota) — count just refetches next time.
  }
}
