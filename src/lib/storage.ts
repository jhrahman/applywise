// Storage abstraction for the web app. Resumes, provider settings, and job
// history are shared with the extension via the app-bridge content script
// (chrome.storage.local under the hood) so both surfaces see the same data.
// Falls back to localStorage when the extension isn't installed/running on
// this page, so the web app remains testable standalone.
//
// Theme is deliberately per-surface (not bridged) — see the project plan.

import { bridgeStorageGet, bridgeStorageSet, isExtensionAvailable } from "./bridge";

function localGet<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getItem<T>(key: string, fallback: T): Promise<T> {
  if (await isExtensionAvailable()) {
    try {
      const value = await bridgeStorageGet<T>(key);
      return value ?? fallback;
    } catch (err) {
      console.warn("Applywise: extension bridge read failed, falling back to localStorage.", err);
    }
  }
  return localGet(key, fallback);
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  if (await isExtensionAvailable()) {
    try {
      await bridgeStorageSet(key, value);
      return;
    } catch (err) {
      console.warn("Applywise: extension bridge write failed, falling back to localStorage.", err);
    }
  }
  localStorage.setItem(key, JSON.stringify(value));
}

export function getItemLocal<T>(key: string, fallback: T): T {
  return localGet(key, fallback);
}

export function setItemLocal<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export const STORAGE_KEYS = {
  resumes: "applywise:resumes",
  providerSettings: "applywise:providerSettings",
  theme: "applywise:theme",
  jobHistory: "applywise:jobHistory",
  updateAvailable: "applywise:updateAvailable",
} as const;
