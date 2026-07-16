// Firefox exposes a native, Promise-based `browser.*` WebExtensions API.
// Chrome/Edge/Brave only expose `chrome.*` (also Promise-based in MV3 when
// no callback is passed, but that's not guaranteed for Firefox's `chrome.*`
// compatibility shim). Preferring `browser` when present — and falling back
// to `chrome` everywhere else — keeps every await-based call in this
// extension working on both without any Chromium-specific behavior change.
export const browserApi: typeof chrome =
  (globalThis as unknown as { browser?: typeof chrome }).browser ?? chrome;
