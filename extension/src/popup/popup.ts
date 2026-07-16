import { getItem, setItem, STORAGE_KEYS } from "../lib/storage";
import { APP_URL } from "../lib/config";
import { browserApi } from "../lib/browser-api";
import type { Resume, ProviderSettings } from "../lib/types";

const DEFAULT_SETTINGS: ProviderSettings = { provider: "gemini", apiKey: "", model: "gemini-3-flash-preview" };

async function render() {
  const [resumes, settings, enabled] = await Promise.all([
    getItem<Resume[]>(STORAGE_KEYS.resumes, []),
    getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS),
    getItem<boolean>(STORAGE_KEYS.enabled, true),
  ]);

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

document.getElementById("enabled-toggle")?.addEventListener("change", async (e) => {
  const checked = (e.target as HTMLInputElement).checked;
  await setItem(STORAGE_KEYS.enabled, checked);
  document.getElementById("enabled-label")!.textContent = checked
    ? "Applywise is on"
    : "Applywise is off";
});

render();
