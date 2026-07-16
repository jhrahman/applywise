# Applywise — AI Job Match Copilot

Upload your resume once, then click a button on any job posting to get a match
score, missing skills, ATS notes, salary info (converted to BDT), and
AI-generated interview questions — all computed in your own browser with your
own AI API key. Nothing is uploaded to any Applywise-owned server; there isn't
one.

This repo has two parts that work together:

- **`/` (root)** — the web app (Setup + Results pages), a static React site
- **`/extension`** — the Chrome/Edge/Brave/Firefox extension that scrapes job
  postings and talks to the AI provider

---

## Quick start

This gets you from a fresh clone to analyzing your first job posting.
Takes about 10 minutes. No coding required past this point.

### 1. Prerequisites

- **Node.js 20 or newer** — check with `node -v` in a terminal. If you don't
  have it, get it from [nodejs.org](https://nodejs.org).
- **A Chromium-based browser** — Chrome, Edge, or Brave. (Firefox and Safari
  are also supported — see [Browser support](#browser-support) below — but
  start with Chrome/Edge/Brave first since it's the simplest path.)

### 2. Get the code

```bash
git clone <this-repo-url>
cd ApplyWise
```

(Or download the ZIP from GitHub and extract it, if you're not using git.)

### 3. Get a free Gemini API key

Applywise defaults to Google's Gemini API, which has a free tier.

1. Go to [aistudio.google.com](https://aistudio.google.com) and sign in with
   a Google account
2. Click **"Get API key"** → **"Create API key"**
3. Copy the key somewhere safe — you'll paste it into Applywise in step 7

### 4. Install dependencies

```bash
npm install
cd extension
npm install
cd ..
```

### 5. Build the extension

```bash
cd extension
npm run build
cd ..
```

This creates `extension/dist` — the folder you'll load into your browser.

### 6. Load the extension into your browser

**Chrome / Edge / Brave:**

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
2. Toggle **Developer mode** on (top-right corner)
3. Click **Load unpacked**
4. Select the `extension/dist` folder (not `extension` itself)
5. You should see the Applywise icon appear — pin it via the puzzle-piece
   icon in your toolbar for easy access

**Firefox:** see [Browser support](#browser-support) below.

### 7. Start the web app and set up your resume

```bash
npm run dev
```

This starts the web app at `http://localhost:5173`. Leave this terminal
running — the extension talks to this page.

1. Open `http://localhost:5173` in your browser (or click the Applywise
   toolbar icon → **Open Setup**)
2. Under **Resumes**, click **Upload resume** and pick a PDF (up to 3)
3. Under **AI provider**, paste the Gemini API key from step 3
4. Click **Save settings** — you should see a checkmark confirm it saved

### 8. Try it

Go to any job posting (LinkedIn, Indeed, a company careers page, etc.) and
look for the **"Analyze with Applywise"** button in the bottom-right corner
of the page. Click it — after a few seconds a new tab opens with your match
score, skills breakdown, and job details.

That's it. You're done with setup.

---

## Day-to-day use

- **Multiple resumes**: upload up to 3, each with a profile name (e.g. "SQA",
  "SWE"). If you have more than one saved, the extension asks which one to
  use each time you analyze a posting.
- **Turning it off**: click the Applywise toolbar icon — there's an on/off
  toggle that hides the floating button on every page until you turn it back
  on.
- **Interview prep**: on the results page, click "Generate interview
  questions" for up to 20 likely questions with suggested answers, generated
  on demand (not part of the initial analysis, so you don't pay the extra API
  call unless you want it).
- **Session history**: past analyses stay listed in the sidebar of the
  results page — local to this browser only, cleared if you clear extension
  storage.

---

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge / Brave | Works out of the box on Windows, macOS, and Linux — same steps above, since they all run the same Chromium extension engine regardless of host OS. |
| Firefox | Supported (Firefox 121+). See below. |
| Safari | Requires converting the extension via Xcode on a Mac — not something that can be built from this repo directly. See below. |

### Firefox

1. Build the extension the same way (`cd extension && npm run build`)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…**
4. Select `extension/dist/manifest.json` directly (not the folder — Firefox
   wants the manifest file itself)

Note: Firefox's "temporary add-on" loading resets when you close Firefox —
you'll need to reload it each session during development. For a permanent
install, the extension would need to be signed by Mozilla (via
[addons.mozilla.org](https://addons.mozilla.org)), which is a separate
publishing step not covered here.

### Safari

Safari doesn't load unpacked web extensions the way Chromium/Firefox do — it
requires packaging as a native Safari Web Extension via Xcode. If you're on a
Mac and want to try it:

1. Install Xcode (from the Mac App Store)
2. From the `extension/dist` folder, run:
   ```bash
   xcrun safari-web-extension-converter extension/dist
   ```
3. This generates an Xcode project — open it in Xcode and build/run
4. Enable the extension in Safari's Settings → Extensions (you may need to
   enable "Allow Unsigned Extensions" in Safari's Developer menu for local
   testing)

This step can't be completed from a non-Mac environment, so it hasn't been
tested as part of this project — treat it as a starting point.

---

## Deploying the web app (Vercel)

The web app is a static site — no server runtime needed.

1. Push this repo to GitHub
2. In [Vercel](https://vercel.com), click **New Project** and import the repo
3. Framework preset: **Vite**. Build command: `npm run build`. Output
   directory: `dist`.
4. Deploy — Vercel will auto-deploy on every push to your main branch after
   this initial setup

**After deploying**, point the extension at your production URL instead of
`localhost:5173`:

1. Edit `extension/src/lib/config.ts` — change `APP_URL` to your Vercel URL
2. Edit `extension/manifest.json` — add your Vercel URL to the
   `content_scripts` entry whose `matches` currently lists
   `http://localhost:5173/*` (this is what lets the Setup page talk to the
   extension's storage — see [Architecture](#architecture))
3. Rebuild the extension (`cd extension && npm run build`) and reload it at
   `chrome://extensions`

---

## Features

- **Resume matching** — match score (0–100), matching/missing skills, missing
  ATS keywords, ATS parseability notes, and concrete improvement suggestions
- **Job details extraction** — employment type, work mode (remote/hybrid/
  onsite), location, and salary, read from the posting (works across
  languages — a posting in Japanese or Bengali still gets a readable English
  location). Anything the posting doesn't state shows as "Not available"
  rather than being guessed.
- **Live currency conversion** — non-BDT salaries are converted to BDT using
  live exchange rates, shown alongside the original figure
- **Interview prep** — up to 20 likely interview questions with suggested
  answers, generated on demand and cached so revisiting the page doesn't
  re-spend an API call
- **Multiple resume profiles** — up to 3 resumes, each labeled (e.g. "SQA",
  "SWE"); picked per-analysis when more than one is saved
- **Bring-your-own API key** — Gemini (free tier default), OpenAI, or
  Anthropic; pick a preset model or type a custom model ID if a provider
  retires one
- **Session history & status tracking** — past analyses stay listed locally,
  with a lightweight Saved/Applied/Interviewing/Offer/Rejected status per job
- **On/off toggle** — turn the floating "Analyze" button off globally from
  the extension popup

## Deferred (not in this build)

- Cover letter generator
- Manual per-site scraping overrides beyond the generic extractor
- Cross-device history sync (would need accounts + a backend — contradicts
  the "no server" design)
- Automated test suite / CI

---

## Architecture

- **No database, no accounts, no backend.** Resume text, API keys, and job
  history all live in `chrome.storage.local` (the extension) or `localStorage`
  (the web app, when used standalone without the extension installed).
- **The extension does all AI calls.** Both the initial match analysis and
  the "Generate interview questions" follow-up run in the extension's
  background service worker — a privileged context, not subject to a
  webpage's CORS restrictions. The web app never calls the AI provider
  directly.
- **Web app ⇄ extension bridge.** The web app runs on its own origin and has
  no direct access to `chrome.storage` (that's extension-only). A second
  content script (`app-bridge.js`), injected *only* on the web app's own
  origin, relays `window.postMessage` calls from the page to
  `chrome.storage`/`chrome.runtime`. This is why the manifest's
  `content_scripts` matches list needs updating when you deploy to a new URL
  (see [Deploying](#deploying-the-web-app-vercel) above) — it's a trust
  boundary, kept intentionally narrow.
- **Cross-browser API shim.** `extension/src/lib/browser-api.ts` prefers the
  native `browser.*` API (Firefox) and falls back to `chrome.*` (Chrome/Edge/
  Brave), so the same source works on both without behavior changes on
  Chromium browsers.

## Project structure

```
ApplyWise/
├── src/                  # Web app (Setup + Results pages)
├── extension/
│   ├── src/
│   │   ├── background/   # Service worker — AI calls, storage, tab opening
│   │   ├── content/      # content-script.js (the floating button) +
│   │   │                 # app-bridge.js (web app ⇄ extension storage bridge)
│   │   ├── popup/        # Toolbar popup UI
│   │   └── lib/          # Shared: types, AI clients, extraction, storage
│   ├── manifest.json
│   └── build.mjs         # esbuild build script
└── applywise-project-plan.md
```

## Development

```bash
# Web app
npm run dev        # dev server at localhost:5173
npm run build       # production build

# Extension (from extension/)
npm run dev          # watch mode, rebuilds on save
npm run build         # one-off build to dist/
```

After any extension code change, click the reload icon on the Applywise card
at `chrome://extensions`, then refresh any already-open tabs (an already-open
tab's content script won't pick up the reload automatically).

## Privacy & security notes

- Your AI provider API key lives in `chrome.storage.local` — per-browser-
  profile, not synced or encrypted beyond what Chrome/Firefox provide by
  default. That's normal for a personal tool, but worth knowing.
- Job descriptions are scraped, untrusted content. Prompts sent to the AI
  provider wall off scraped text with explicit delimiters and an instruction
  to treat it as data, not commands — basic prompt-injection hygiene.
- No cross-device sync. Everything lives in one browser's local storage;
  switching browsers or computers starts fresh.

## Troubleshooting

- **"Extension context invalidated" / blank error after clicking Analyze**:
  you reloaded the extension while a job tab was already open. Refresh that
  tab.
- **429 rate limit error**: your AI provider's free-tier quota was hit. Try a
  lighter model on the Setup page, or wait — quotas usually reset within a
  minute to a day.
- **404 "model no longer available"**: providers retire model IDs over time.
  On the Setup page, switch **Model** to **"Custom model ID…"** and paste a
  currently-valid ID from your provider's docs/dashboard.
- **"Failed to load extension: Manifest file is missing or unreadable"**:
  you selected the wrong folder — load `extension/dist`, not `extension`.
