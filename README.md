# Applywise — AI Job Match Copilot

Upload your resume once, then click a button on any job posting to get a match
score, missing skills, ATS notes, salary info (converted to BDT), and
AI-generated interview questions — all computed in your own browser with your
own AI API key. Nothing is uploaded to any Applywise-owned server; there isn't
one.

**Live app:** [applywise-copilot.vercel.app](https://applywise-copilot.vercel.app/)

This repo has two parts that work together:

- **`/` (root)** — the web app (Setup + Results pages), a static React site
- **`/extension`** — the Chrome/Edge/Brave/Firefox extension that scrapes job
  postings and talks to the AI provider

---

## Quick start

This gets you from nothing to analyzing your first job posting. Takes about
5 minutes. No coding, no cloning, no installing Node — everything below
happens in the browser.

### 1. Open the app and download the extension

Go to **[applywise-copilot.vercel.app](https://applywise-copilot.vercel.app/)**.
If the extension isn't detected in your browser yet, you'll see an **"Install
the browser extension"** card at the top of the Setup page — click **Download
extension (.zip)**. (You can also grab it directly at
[applywise-copilot.vercel.app/applywise-extension.zip](https://applywise-copilot.vercel.app/applywise-extension.zip).)

This zip is always freshly built from whatever is currently deployed, so you
always get the latest version.

### 2. Load it into your browser

**Chrome / Edge / Brave:**

1. Unzip the downloaded file — you'll get a folder named `applywise-extension`
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`)
3. Toggle **Developer mode** on (top-right corner)
4. Click **Load unpacked** and select the `applywise-extension` folder
5. You should see the Applywise icon appear — pin it via the puzzle-piece
   icon in your toolbar for easy access

**Firefox:** see [Browser support](#browser-support) below — it's a slightly
different flow (`about:debugging`, select `manifest.json` directly).

### 3. Get a free Gemini API key

Applywise defaults to Google's Gemini API, which has a free tier.

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and
   sign in with a Google account
2. Click **"Create API key"**
3. Copy the key — you'll paste it into Applywise in the next step

Prefer a different free provider? Several are built in — pick one in the next
step instead of Gemini:

- **[Groq](https://console.groq.com/keys)** — a genuinely free, no-card tier on
  very fast hardware (Llama 3.3 70B, GPT-OSS 120B/20B). Note this is *not* the
  same as Grok/xAI, which is paid.
- **[Cerebras](https://cloud.cerebras.ai)** — 1M tokens/day free and extremely
  fast, but the free tier caps context at ~8k tokens, so a very long resume may
  not fit.
- **[Mistral](https://console.mistral.ai)** — a free "Experiment" tier covering
  all models, no card.
- **[OpenRouter](https://openrouter.ai/keys)** — one key reaches several free
  models (Nemotron 3, Tencent HY3, Gemma 4, GPT-OSS), though they're noticeably
  slower than Gemini's and share a daily cap.
- **[Cohere](https://dashboard.cohere.com/api-keys)** — a free Trial key
  (1,000 calls/month, non-commercial).
- **[Hugging Face](https://huggingface.co/settings/tokens)** — routed through
  Hugging Face's Inference Providers (GPT-OSS 120B, GLM-5.2, Qwen3 8B/14B/32B,
  Qwen3-4B-Instruct-2507). Free accounts get $0.10/month of credit — a small
  trial allowance, not an ongoing free tier like Gemini's.

### 4. Set up your resume and API key

Back on [applywise-copilot.vercel.app](https://applywise-copilot.vercel.app/)
(refresh the page if it was already open, so it picks up the extension):

1. Under **Resumes**, click **Upload resume** and pick a PDF (up to 3)
2. Under **AI provider**, leave it on **Gemini** and paste the API key from
   step 3
3. Click **Save settings** — you should see a checkmark confirm it saved

### 5. Try it

Go to any job posting (LinkedIn, bdjobs, Indeed, a company careers page, etc.)
and look for the **"Analyze with Applywise"** button in the bottom-right
corner of the page. Click it right away — no need to scroll down the page or
click any "see more"/"show more" description toggle first, the extension
handles that for you. After a few seconds a new tab opens with your match
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
  results page — local to this browser only. Remove one entry at a time or
  clear the whole list with a confirm step.
- **Switching AI providers**: on the Setup page, pick from Gemini, Groq,
  Cerebras, OpenRouter, Mistral, Cohere, Hugging Face, DeepSeek, GLM, OpenAI,
  Anthropic, or Grok (xAI) — free-tier/trial options are listed first. Each has its own API key
  and model list; you can add **multiple custom model IDs per provider** (not
  just one) for anything not in the preset list. The API key field links
  straight to that provider's official key-creation page, so you're never
  stuck guessing where to go. Each provider remembers its own
  API key — switch providers and back, and the key you already saved for it is
  still there, no re-entering
  required. (Note: **Groq** at groq.com is a different provider from **Grok
  (xAI)** — the former has a free tier, the latter is paid.)
- **Real-time model availability check**: the Setup page checks your selected
  provider's *live* model catalogue (fetched through the extension using your
  saved key, cached ~1 hour) and flags any preset or custom model that's no
  longer offered — both inline in the dropdown ("⚠ not in live list") and as a
  note under it, so you find out a model was retired *before* an analysis fails
  on a 404. Providers don't publish future expiry dates, so this catches
  retirement the moment a model drops from their catalogue rather than
  predicting a date. Needs the extension installed and a saved key.
- **Auto-fallback to other free models**: a single toggle in the **AI provider**
  card. When it's on and your selected model times out or hits a rate limit /
  high-demand error, Applywise works down the free models — strongest first,
  fastest last — until one answers, instead of failing the analysis. Turn it
  off to analyze with only the model you picked, which is what you want when
  comparing models: a silent hand-off would credit another model's output to
  the one you selected. Your saved model is never changed either way; the
  results page shows which model actually answered.

  It applies to the free-tier/trial-credit providers with several models to
  fall back to — **Gemini**, **Groq**, **Cerebras**, **OpenRouter**,
  **Mistral**, **Cohere**, and **Hugging Face** — and stays inert for the
  paid/single-key ones. You'll see it happen
  live: the floating "Analyze" button updates in real time
  ("gemini-3-flash-preview was busy — retrying with gemini-flash-latest…")
  instead of sitting on "Analyzing…" the whole time.

  Note that OpenRouter's free models are much slower than Gemini's (measured:
  ~12s to ~200s per analysis, depending on the model and how loaded its host
  is), so expect to wait.
- **Extension update checks**: "Load unpacked" installs can't auto-update
  (only Chrome Web Store/Firefox Add-ons installs can), so the extension
  popup checks the latest deployed version on every open and shows a banner
  — with a matching one on the Setup page — if yours is behind, so you're
  never left guessing whether a re-download is needed after a push. The
  Setup page's banner also lists a short "What's new" changelog for every
  version between yours and the latest, fetched fresh on every page load
  (`public/changelog.json`) so it reflects a just-pushed release immediately.

---

## Browser support

| Browser | Status |
|---|---|
| Chrome / Edge / Brave | Works out of the box on Windows, macOS, and Linux — same steps above, since they all run the same Chromium extension engine regardless of host OS. |
| Firefox | Supported (Firefox 121+). See below. |
| Safari | Requires converting the extension via Xcode on a Mac — not something that can be done from the downloaded zip directly. See below. |

### Firefox

1. Unzip the downloaded extension as in [Quick start](#quick-start)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…**
4. Select `manifest.json` inside the unzipped `applywise-extension` folder
   directly (not the folder itself — Firefox wants the manifest file)

Note: Firefox's "temporary add-on" loading resets when you close Firefox —
you'll need to reload it each session. For a permanent install, the extension
would need to be signed by Mozilla (via
[addons.mozilla.org](https://addons.mozilla.org)), which is a separate
publishing step not covered here.

### Safari

Safari doesn't load unpacked web extensions the way Chromium/Firefox do — it
requires packaging as a native Safari Web Extension via Xcode. If you're on a
Mac and want to try it:

1. Install Xcode (from the Mac App Store)
2. Unzip the downloaded extension, then from that folder run:
   ```bash
   xcrun safari-web-extension-converter applywise-extension
   ```
3. This generates an Xcode project — open it in Xcode and build/run
4. Enable the extension in Safari's Settings → Extensions (you may need to
   enable "Allow Unsigned Extensions" in Safari's Developer menu for local
   testing)

This step can't be completed from a non-Mac environment, so it hasn't been
tested as part of this project — treat it as a starting point.

---

## Features

- **Resume matching** — match score (0–100), matching/missing skills, missing
  ATS keywords, ATS parseability notes, and concrete improvement suggestions.
  Scoring follows an explicit enumerate-then-compute rubric (required/
  preferred skill coverage + experience fit, weighted and combined by a fixed
  formula) rather than a freeform "impression" score, so re-analyzing the
  same resume against the same posting lands close to the same score instead
  of swinging wildly between runs. ATS notes and suggestions are justified
  and highlight the specific skills/keywords they're about, instead of
  reading as an undifferentiated block of text. The prompt explicitly forbids
  naming any skill or technology that isn't actually present in your resume
  or the posting, so fast/lite models can't invent a finding (e.g. claiming
  a term appears in your resume when it doesn't) — a real defect a small
  model can otherwise fall into by copying an illustrative example instead of
  reasoning about your actual documents.
- **Robust job posting extraction, no scrolling or clicking required** — the
  title, company, location, and full description are read from the page with
  several safeguards: before reading, the extension hydrates any lazily-
  rendered sections and clicks in-place "see more"/"show more" expanders on
  your behalf, then waits for the DOM to settle, so the full description is
  captured on the very first click — you never need to manually scroll the
  page or expand anything yourself first. Text structure (`<br>`/`<li>`/`<p>`
  boundaries) is preserved so labels stay attached to their values, page
  chrome (site footers/nav bars swept in by a wide container) is stripped
  before the text ever reaches the AI, the *largest* real description block
  is chosen (not whichever markup comes first), JSON-LD and DOM sources are
  merged for the richest result, and — importantly for single-page-app
  boards like LinkedIn — the posting is re-read at the moment you click
  Analyze (not when the button first appears), so a half-loaded page or list
  preview never gets analyzed by mistake. Nothing keys off hashed CSS class
  names, which churn every deploy.
- **Job details extraction** — employment type, work mode (remote/hybrid/
  onsite), location, company, salary, required experience (e.g. "3-5 years",
  "Entry level"), and a benefits/perks list (provident fund, gratuity, gym
  membership, parental leave, festival/performance bonus, flexible hours,
  medical allowance, and the like), read directly from the posting.
  Works across languages (a posting in Japanese or Bengali still gets a
  readable English location), across boards with non-standard markup (skill
  chip widgets, overview boxes rendered outside the main description), and
  picks the AI's reading over placeholder text like "Unknown company" when
  the page's structured data is missing. Anything the posting genuinely
  doesn't state shows as "Not available" rather than being guessed.
- **Live currency conversion** — non-BDT salaries are converted to BDT using
  live exchange rates, shown alongside the original figure with the correct
  per-year/per-month/per-hour period; skipped entirely when a salary has no
  actual numbers (e.g. "Negotiable").
- **Multi-provider AI support** — Gemini, Groq, Cerebras, OpenRouter, Mistral,
  Cohere, Hugging Face, DeepSeek, GLM (Zhipu/Z.ai), OpenAI, Anthropic, and Grok
  (xAI), with free-tier/trial-credit options listed first, multiple
  custom-model-ID slots per provider as an escape hatch, and a direct link to
  each provider's own key-creation page next to the API key field. (Groq at
  groq.com is a distinct provider from Grok/xAI — the former is free, the
  latter paid. Hugging Face's free credit is a small $0.10/month trial
  allowance, not an ongoing free tier.)
- **Real-time model availability check** — the Setup page validates each preset
  and custom model against the provider's live `/models` catalogue (fetched via
  the extension with your saved key, cached ~1 hour) and flags retired ones in
  the dropdown and a status line, so a model that's been pulled is caught before
  it 404s an analysis
- **Auto-fallback across free models, with live progress** — one toggle in the
  AI provider card; when on, timeouts, rate limits, high-demand errors, and
  responses that come back unusable all move the analysis to the next model
  in the same provider (strongest first, shown in real time on the floating
  "Analyze" button) rather than failing it. Works for the providers with
  several models to fall back to (Gemini, Groq, Cerebras, OpenRouter,
  Mistral, Cohere, Hugging Face). Errors another model can't fix — a bad API key, say — still
  surface immediately instead of burning the chain. The model that actually
  answered is shown on the results page. Turn it off to pin an analysis to
  exactly one model
- **Interview prep** — up to 20 likely interview questions with suggested
  answers, generated on demand and cached so revisiting the page doesn't
  re-spend an API call
- **Multiple resume profiles** — up to 3 resumes, each labeled (e.g. "SQA",
  "SWE"); picked per-analysis when more than one is saved
- **Session history & status tracking** — past analyses stay listed locally,
  with a lightweight Saved/Applied/Interviewing/Offer/Rejected status per
  job, and smooth remove/clear-all animations
- **On/off toggle** — turn the floating "Analyze" button off globally from
  the extension popup
- **One-click extension download + update checks** — the Setup page detects
  whether the extension is installed and, if not, offers an always-current
  download built fresh on every deploy; if it's installed but out of date,
  both the popup and the Setup page flag it (unpacked installs can't
  auto-update the way store-installed ones do)
- **Cross-browser** — Chrome, Edge, Brave, and Firefox, via a shared
  `browser.*`/`chrome.*` compatibility layer

## Deferred (not in this build)

- **Chrome Web Store / Firefox Add-ons store listing** — the only way to get
  a true one-click install and genuine silent auto-updates, but requires a
  developer account (Chrome: $5 one-time fee) and a review process.
  Deliberately not pursued right now; the download-zip + "Load unpacked"
  flow plus the update-check banner (see [Features](#features)) is the
  stand-in until that changes.
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
  `chrome.storage`/`chrome.runtime`. This is a deliberately narrow trust
  boundary — see [Local development](#local-development-running-from-source)
  if you're pointing this at a different deployed URL.
- **Cross-browser API shim.** `extension/src/lib/browser-api.ts` prefers the
  native `browser.*` API (Firefox) and falls back to `chrome.*` (Chrome/Edge/
  Brave), so the same source works on both without behavior changes on
  Chromium browsers.
- **Extension packaging.** `scripts/package-extension.mjs` builds the
  extension and zips it into `public/applywise-extension.zip` as part of
  `npm run build`, so every deploy (and thus every download from the Setup
  page) ships the current source, never a stale snapshot. It also writes
  `public/extension-version.json` from `extension/manifest.json`'s own
  `version` field, which is what the popup checks against on every open (see
  [extension/README.md](extension/README.md#version-bumps-and-the-update-check)).
- **One-way progress channel.** While an analysis runs, the background
  worker pushes `ANALYZE_PROGRESS` messages to the originating tab (which
  model is being tried, whether a Gemini fallback kicked in) — a plain
  `runtime.sendMessage`/`onMessage` push with no reply expected, separate
  from the request/response messages (`ANALYZE`, `GET_RESUMES`, etc.) used
  everywhere else.

## Project structure

```
ApplyWise/
├── src/                          # Web app (Setup + Results pages)
├── extension/
│   ├── src/
│   │   ├── background/           # Service worker — AI calls, storage, tab opening
│   │   ├── content/               # content-script.js (the floating button) +
│   │   │                          # app-bridge.js (web app ⇄ extension storage bridge)
│   │   ├── popup/                 # Toolbar popup UI
│   │   └── lib/                   # Shared: types, AI clients, extraction, storage
│   ├── manifest.json
│   └── build.mjs                  # esbuild build script
├── scripts/
│   └── package-extension.mjs      # Builds + zips the extension for the Setup page download
└── applywise-project-plan.md
```

## Local development (running from source)

Only needed if you're contributing to Applywise itself, or want to run your
own deployment instead of using the hosted one. Everyday users can stop at
[Quick start](#quick-start) above.

### Prerequisites

- **Node.js 20 or newer** — check with `node -v`. Get it from
  [nodejs.org](https://nodejs.org) if you don't have it.

### Get the code and install dependencies

```bash
git clone https://github.com/jhrahman/applywise.git
cd applywise
npm install
cd extension && npm install && cd ..
```

### Run the web app

```bash
npm run dev
```

Starts the web app at `http://localhost:5173`.

### Build and load the extension

```bash
cd extension
npm run build     # one-off build to extension/dist
npm run dev       # or: watch mode, rebuilds on save
cd ..
```

Load `extension/dist` as an unpacked extension (same steps as
[Quick start](#quick-start) step 2, but point at `extension/dist` instead of
an unzipped download). By default it points at `http://localhost:5173` — see
`extension/src/lib/config.ts`.

After any extension code change, click the reload icon on the Applywise card
at `chrome://extensions`, then refresh any already-open tabs (an already-open
tab's content script won't pick up the reload automatically).

### Deploying your own copy (Vercel)

The web app is a static site — no server runtime needed, and **no
environment variables** — every user's AI API key lives in their own
browser, never on the server.

1. Push your fork to GitHub
2. In [Vercel](https://vercel.com), click **New Project** and import the repo
3. Framework preset: **Vite**. Build command: `npm run build` (this also
   builds and zips the extension — see [Architecture](#architecture)). Output
   directory: `dist`.
4. Deploy — Vercel auto-deploys on every push to your main branch after this
   initial setup

**After deploying**, point the extension at your production URL instead of
`localhost:5173`:

1. Edit `extension/src/lib/config.ts` — change `APP_URL` to your Vercel URL
2. Edit `extension/manifest.json` — add your Vercel URL to the
   `content_scripts` entry whose `matches` currently lists the `localhost`
   and `applywise-copilot.vercel.app` URLs (this is what lets the Setup page
   talk to the extension's storage — see [Architecture](#architecture))
3. Rebuild the extension (`cd extension && npm run build`) and reload it at
   `chrome://extensions`

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
- **429 rate limit error**: your AI provider's free-tier quota was hit. With
  auto-fallback on, the providers with several models (Gemini, Groq, Cerebras,
  OpenRouter, Mistral, Cohere, Hugging Face) try their other models first — if you still see this,
  all of them are limited; wait a bit or try a different provider. Some free
  tiers (Cerebras, Cohere) cap requests per minute *account-wide*, so switching
  models won't help there — wait for the window to reset. On OpenRouter
  specifically, a 429 on one model usually just means
  that model's upstream host is busy (fallback routes around it), whereas every
  free model failing at once points at the shared daily cap on free models —
  check https://openrouter.ai/activity. For other providers, try a lighter
  model on the Setup page.
- **404 "model no longer available"**: providers retire model IDs over time.
  The Setup page's real-time model check flags this ahead of time ("⚠ not in
  live list") once you've saved a key — when you see it, pick another preset, or
  choose **"＋ Add a custom model…"** and paste a currently-valid ID from your
  provider's docs/dashboard (you can keep several per provider).
- **"Failed to load extension: Manifest file is missing or unreadable"**:
  you selected the wrong folder — after unzipping the download, load the
  `applywise-extension` folder itself, not its parent.
- **Setup page doesn't detect the extension after installing it**: refresh
  the tab — the install-detection check runs once when the page loads.
- **Analysis says the description is missing / "only LinkedIn boilerplate"
  even though the job clearly has one**: make sure you're on the job's own
  page (not a search list or preview pane). Clicking Analyze re-reads the
  posting, hydrates any lazily-rendered content, and clicks "see more"-style
  expanders automatically — you shouldn't need to scroll or expand anything
  yourself. If it still comes back thin on a specific posting, that page's
  markup may be unusual (or the page is behind a login the extension can't
  see through); the strongest model (`gemini-3-flash-preview`) also tends to
  handle sparse pages best.
