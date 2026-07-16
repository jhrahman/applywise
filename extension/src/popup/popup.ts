import { getItem, setItem, STORAGE_KEYS } from "../lib/storage";
import { APP_URL } from "../lib/config";
import { browserApi } from "../lib/browser-api";
import type { Resume, ProviderSettings } from "../lib/types";

const DEFAULT_SETTINGS: ProviderSettings = { provider: "gemini", apiKey: "", model: "gemini-3-flash-preview" };

/**
 * Unpacked/"Load unpacked" extensions never auto-update — only Chrome Web
 * Store/Firefox Add-ons installs do. This is the workaround: check the
 * version file the web app publishes on every deploy and flag it in storage
 * so both the popup and the Setup page can tell the user a re-download is
 * actually needed, instead of them guessing after every push.
 */
async function checkForUpdate() {
  try {
    const response = await fetch(`${APP_URL}/extension-version.json`, { cache: "no-store" });
    if (!response.ok) return;
    const { version: latestVersion } = (await response.json()) as { version?: string };
    const currentVersion = browserApi.runtime.getManifest().version;
    if (latestVersion && latestVersion !== currentVersion) {
      await setItem(STORAGE_KEYS.updateAvailable, { latestVersion });
    } else {
      await setItem(STORAGE_KEYS.updateAvailable, null);
    }
  } catch {
    // Offline or the site is unreachable — not worth surfacing an error for
    // a background version check.
  }
}

async function render() {
  const [resumes, settings, enabled, updateAvailable] = await Promise.all([
    getItem<Resume[]>(STORAGE_KEYS.resumes, []),
    getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS),
    getItem<boolean>(STORAGE_KEYS.enabled, true),
    getItem<{ latestVersion: string } | null>(STORAGE_KEYS.updateAvailable, null),
  ]);

  const updateBanner = document.getElementById("update-banner")!;
  if (updateAvailable) {
    updateBanner.textContent = `New version (${updateAvailable.latestVersion}) available — download and reload`;
    updateBanner.style.display = "block";
  } else {
    updateBanner.style.display = "none";
  }

  const resumeCountEl = document.getElementById("resume-count")!;
  resumeCountEl.textContent = `${resumes.length} / 3`;

  const apiKeyEl = document.getElementById("api-key-status")!;
  if (settings.apiKey) {
    apiKeyEl.textContent = "Connected";
    apiKeyEl.className = "ok";
  } else {
    apiKeyEl.textContent = "Not set";
    apiKeyEl.className = "warn";
  }

  const toggle = document.getElementById("enabled-toggle") as HTMLInputElement;
  const label = document.getElementById("enabled-label")!;
  toggle.checked = enabled;
  label.textContent = enabled ? "Applywise is on" : "Applywise is off";
}

document.getElementById("open-setup")?.addEventListener("click", () => {
  browserApi.tabs.create({ url: `${APP_URL}/` });
});

document.getElementById("update-banner")?.addEventListener("click", () => {
  browserApi.tabs.create({ url: `${APP_URL}/` });
});

document.getElementById("enabled-toggle")?.addEventListener("change", async (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  await setItem(STORAGE_KEYS.enabled, checked);
  document.getElementById("enabled-label")!.textContent = checked
    ? "Applywise is on"
    : "Applywise is off";
});

render();
checkForUpdate().then(render);
