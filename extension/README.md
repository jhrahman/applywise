# Applywise extension

Manifest V3 extension (Chrome/Edge/Brave/Firefox). Content script detects job
postings, injects an "Analyze with Applywise" button, and calls the
configured AI provider directly from the background service worker — no
Applywise-owned backend.

See the [root README](../README.md) for end-user setup instructions. This
file covers developer/build details.

## Cross-browser notes

- `src/lib/browser-api.ts` prefers the native `browser.*` API (Firefox) and
  falls back to `chrome.*` (Chrome/Edge/Brave) — every file imports from
  here rather than referencing `chrome.*` directly, so the same source works
  on both without Chromium-specific behavior changes.
- `manifest.json` includes `browser_specific_settings.gecko` for Firefox
  (`strict_min_version: "121.0"`, the version Firefox added `service_worker`
  background support in).
- Safari isn't buildable from this repo — it needs Xcode's
  `safari-web-extension-converter` on macOS. See the root README's Browser
  support section.

## Build

```
npm install
npm run build     # one-off build to dist/
npm run dev        # watch mode
```

Then load `extension/dist` as an unpacked extension via
`chrome://extensions` → "Load unpacked".

`src/lib/config.ts` points `APP_URL` at the web app (defaults to
`http://localhost:5173` for local dev — update it to the deployed Vercel
URL before shipping, and also update the `app-bridge.js` `matches` array in
`manifest.json` to include that same production origin).

## Version bumps and the update check

"Load unpacked" installs never auto-update — that's only available to
extensions installed from the Chrome Web Store / Firefox Add-ons, which
isn't where this ships from (see root README's
[Deferred](../README.md#deferred-not-in-this-build) section for why). To
make that less painful, every deploy publishes `public/extension-version.json`
(written by `scripts/package-extension.mjs` from this file's own `version`
field), and the popup fetches it on every open, comparing it against
`chrome.runtime.getManifest().version`. A mismatch shows an "update
available" banner in the popup and on the Setup page.

**This means `manifest.json`'s `version` needs a bump whenever you change
anything under `extension/`** — otherwise an installed copy that's actually
stale won't know it. Web-app-only changes (`src/` at the repo root) don't
need a bump; they take effect the moment Vercel redeploys, no extension
action required.

## Job posting extraction (esp. LinkedIn)

`src/lib/extract.ts` pulls the job title, company, location, and full
description out of the page. The parts that matter for reliability:

- **No manual scrolling or "see more" clicking required**
  (`prepareJobDom`). Many boards render the description lazily (content
  mounts only once scrolled into view) and/or truncate it behind a "see
  more"/"show more" control — previously, only scrolling the page by hand
  made an analysis see the full text, because that scroll was doing the
  extractor's hydration work for it. `prepareJobDom()` now does that
  programmatically before every extraction: a fast, self-restoring scroll
  sweep hydrates lazy content (your scroll position is unaffected), then it
  clicks in-place expanders (`aria-expanded="false"`, "see more"/"show
  more"/"read more" labels — never "see less", never a real navigation
  link), across a few passes since expanding one section can reveal
  another, waiting for the DOM to settle (mutation-quiet detection) between
  passes. Entirely best-effort: any failure here just falls through to
  extraction on whatever is already in the DOM, exactly as before.
- **Page chrome stripped before reading** (`richContentOf`). A widened
  container sometimes nests the site's own footer/nav (e.g. bdjobs' Angular
  rebuild wraps a "Download Employer App" / partner-logos footer inside an
  `<app-footer>` custom element that a text sweep can catch). Before reading
  text, the extracted subtree is cloned and footer/nav/script/style nodes
  (and `role="contentinfo"|"navigation"|"banner"`) are removed from the
  clone — the live page is never mutated. Deliberately does **not** strip
  `<header>`/`<aside>`, since some aggregators legitimately render the
  salary/location/company overview box in one of those.
- **Structure-preserving text** (`richTextFrom`). Plain `element.textContent`
  collapses `<br>` / `<li>` / `<p>` boundaries into one run-on line, so
  "Salary Range" and "BDT 80,000…" or "Location:" and its value blur
  together and the AI can't tell labels from values. `richTextFrom` turns
  block boundaries into newlines so each label:value pair is its own line.
  This applies to both the DOM path and the JSON-LD path (`stripHtml`).
- **Largest match, not first match** (`largestMatch`). A LinkedIn page can
  have several elements sharing the description testid (a company blurb, a
  preview, the real body); the real one is the biggest, so we pick that
  rather than whichever comes first in document order. A sweep cap keeps it
  from grabbing a whole job-list wrapper.
- **Richer of two sources** (`mergeExtractions`). JSON-LD and the DOM
  heuristic both run; we take the longer description but keep whichever
  source has real (non-placeholder) company/title/location.
- **Re-extraction at click time**, not detect time (`content-script.ts`'s
  `captureFreshJob`). This is the big one: LinkedIn is an SPA that renders /
  swaps the job body *after* the floating button mounts, so the snapshot
  taken in `detectAndMount` was often a half-loaded page or a list preview —
  the cause of analyses that saw "only navigation/boilerplate" text. On
  click, `prepareJobDom()` runs first, then we re-read the DOM and poll
  briefly (up to ~1.5s) for a substantial description before sending,
  keeping the richest read.
- **Class-name-independent by design.** LinkedIn ships hashed CSS classes
  (e.g. `_206505cb`) that churn every deploy, so nothing matches on them —
  extraction keys off `data-testid`, the "About the job" heading text, and
  structural signals (block boundaries, a real company-page link) instead.
  The same principle extends to skill-chip detection
  (`extractSkillChips`/`isSkillChip`): a directive like bdjobs'
  `[apphighlight]` gets applied to headings and action buttons as well as
  real skill pills by that site's own Angular rebuild, so chips are filtered
  by shape (short, no block-level children) and label (rejecting
  "Apply"/"See more"/"Login"-style furniture) rather than trusted outright.

## Live progress during analysis

The floating "Analyze" button doesn't just say "Analyzing…" for the whole
request — `background.ts` pushes one-way `ANALYZE_PROGRESS` messages to the
originating tab as the analysis proceeds (which model is being tried, and
"X was busy — retrying with Y…" if a Gemini fallback kicks in — see
`withGeminiFallback`'s `onAttempt` callback). `content-script.ts` listens for
these via a plain `runtime.onMessage` listener (distinct from the
request/response `sendMessage()` calls used elsewhere) and fades in the new
text via `ApplywiseWidget.showProgress()`. A local interval-based "heartbeat"
covers the brief gap before the first real message arrives, then gets
cleared the moment one does.

## Web app ⇄ extension bridge

The web app runs on its own origin (localhost in dev, Vercel in prod) and
therefore has no direct access to `chrome.storage` — that API only exists
inside extension contexts (background, popup, content scripts). To share
resumes/settings/job history between the Setup page and the extension, a
second content script (`app-bridge.ts`) is injected **only** on the web
app's own origin (see `manifest.json`'s `content_scripts[1].matches` — keep
this list tight; it's effectively a trust boundary). It relays
`window.postMessage` requests from the page to `chrome.storage.local` and,
for `GENERATE_INTERVIEW_QUESTIONS`, forwards to the background service
worker via `chrome.runtime.sendMessage`.

Net effect: **every AI provider call — the initial match analysis and the
"Generate interview questions" follow-up — runs inside the background
service worker**, never from an ordinary webpage. Background service
workers are extension-privileged and not subject to a webpage's CORS
restrictions, so the CORS risk flagged in the project plan doesn't apply to
either call, regardless of the provider's CORS policy. Anthropic's client
still sends `anthropic-dangerous-direct-browser-access: true` out of an
abundance of caution (it's Anthropic's documented opt-in for direct-fetch
callers), but strictly speaking the privileged context sidesteps the
concern that header exists for.
