// Always running inside the extension, so storage.local is available directly.
import { browserApi } from "./browser-api";

export async function getItem<T>(key: string, fallback: T): Promise<T> {
  const result = await browserApi.storage.local.get(key);
  return (result[key] as T) ?? fallback;
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  await browserApi.storage.local.set({ [key]: value });
}

export const STORAGE_KEYS = {
  resumes: "applywise:resumes",
  providerSettings: "applywise:providerSettings",
  theme: "applywise:theme",
  jobHistory: "applywise:jobHistory",
  enabled: "applywise:enabled",
} as const;
