import { useEffect, useState } from "react";
import { bridgeGetExtensionVersion, isExtensionAvailable } from "@/lib/bridge";
import { isUpdateAvailable } from "@/lib/version";

export interface ExtensionVersionState {
  /** Version installed in this browser, or null when the extension isn't present. */
  installedVersion: string | null;
  /** Newest published version, from the version file the build step writes. */
  latestVersion: string | null;
  /** True only when the extension is installed AND a strictly newer build is published. */
  updateAvailable: boolean;
  /** Whether the extension is installed here. Null while the bridge probe is in flight. */
  installed: boolean | null;
  loading: boolean;
}

const INITIAL: ExtensionVersionState = {
  installedVersion: null,
  latestVersion: null,
  updateAvailable: false,
  installed: null,
  loading: true,
};

// The web app checks for itself rather than reading a flag the popup wrote,
// because the popup only runs its check when the user actually opens it — a
// user who never clicks the toolbar icon would otherwise never be told an
// update exists, which is the exact case this feature is for. Both surfaces
// now check independently against the same published version file.
export function useExtensionVersion(): ExtensionVersionState {
  const [state, setState] = useState<ExtensionVersionState>(INITIAL);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const [installed, latestVersion] = await Promise.all([
        isExtensionAvailable(),
        fetchLatestVersion(),
      ]);

      // Only ask the extension its version if the bridge answered the ping —
      // otherwise this just waits out the timeout for a known-absent extension.
      const installedVersion = installed ? await fetchInstalledVersion() : null;
      if (cancelled) return;

      setState({
        installed,
        installedVersion,
        latestVersion,
        updateAvailable:
          installedVersion !== null &&
          latestVersion !== null &&
          isUpdateAvailable(installedVersion, latestVersion),
        loading: false,
      });
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch("/extension-version.json", { cache: "no-store" });
    if (!response.ok) return null;
    const { version } = (await response.json()) as { version?: string };
    return version ?? null;
  } catch {
    // Offline, or the file isn't deployed yet — the version pill just stays
    // quiet rather than showing an error for a background check.
    return null;
  }
}

async function fetchInstalledVersion(): Promise<string | null> {
  try {
    return await bridgeGetExtensionVersion();
  } catch {
    return null;
  }
}
