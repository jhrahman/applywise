# Applywise — AI Job Match Copilot

**Working name:** Applywise

## Goal

A client-side job-match tool: upload up to 3 resumes, browse job postings, click
the extension to get a match score, missing skills, and ATS notes — all
computed in the browser, nothing stored server-side. Bring-your-own-API-key
(Gemini free tier by default, optional paid providers). Testing and CI/CD
are out of scope for this build phase — ship first, harden later.

## Architecture

Nothing about a job seeker's resume or job history needs to leave their
browser, so the system has no backend to speak of:

- **No database.** Resume text and job/analysis history live entirely
  client-side.
- **No accounts.** No login flow — nothing to authenticate against.
- **No server-side resume storage.** Resume text lives in the
  browser/extension for the current session, persisted via
  `chrome.storage.local` / `IndexedDB` so it survives a browser restart.
- **API keys stay client-side.** Gemini key (and any optional paid
  provider key) is entered once by the user and stored in
  `chrome.storage.local`. Calls to the AI provider go directly from the
  extension/browser — never through a backend.
- **The web app is a static renderer.** It reads job + analysis data that
  the extension already computed and handed off via `chrome.storage`, and
  displays it. No server round-trip for the core loop.

**Risk to validate on day one:** confirm Gemini's REST API accepts direct
browser-origin calls (CORS + API key header) for your exact request shape.
This is generally supported for client-side use, but test it with a plain
`fetch()` before building anything on top of the assumption. If it's
blocked, the fallback is a single stateless serverless function on Vercel
that does nothing but pass the request through (still no DB, still no
accounts — a small addition, not a redesign).

## Extension → web app handoff

1. User clicks "Analyze with Applywise" on a job posting.
2. If more than one resume is saved, the extension prompts: "Which resume
   do you want to use?" — showing each saved resume's profile name (e.g.
   "SQA," "SWE"). If only one resume is saved, it's used automatically.
3. Extension scrapes job data from the page and pulls the selected
   resume's text + API key/model choice from `chrome.storage.local`.
4. Extension calls the AI provider directly, gets the structured match
   result.
5. Extension writes `{ job, analysis, resumeUsed }` into
   `chrome.storage.local` keyed by a generated id.
6. Extension opens a new tab: `applywise.app/results?job=<id>`.
7. Web app (a browser-extension-aware static page) reads that entry via
   the extension's messaging/storage API and renders it.

No fetch to any Applywise-owned server happens at any point in this flow.

## Tech stack

| Layer | Choice |
|---|---|
| Web app | Static React/Vite (or Next.js static export) — no server runtime needed |
| Styling | Tailwind CSS + shadcn/ui |
| State/persistence | `chrome.storage.local` (extension) + `IndexedDB` (web app, if needed for larger session data) |
| AI | Gemini API (free tier, default) — user can add their own key for another provider (OpenAI/Anthropic) and pick a model |
| Extension | Chrome Extension, Manifest V3, any job site via generic extractor |
| Hosting | Vercel (free tier), static export — no server runtime needed |

Since there's no backend logic left, Next.js's server features (Route
Handlers, server components hitting a DB) aren't needed. A static export
keeps hosting free and removes an entire class of "is my serverless
function within the free tier" concerns.

## Core pages (web app)

**1. Setup / Settings page**
- Upload up to 3 resumes (PDF) → each parsed to text client-side (e.g.
  `pdf.js` in the browser — no upload to any server)
- Each resume gets a profile name chosen by the user — a label like
  "SQA," "SWE," or "Broadcast Ops," not just a filename — so the picker
  step is meaningful rather than showing "resume1.pdf"
- Replace or delete any saved resume; all stored as `{ id, profileName,
  parsedText, uploadedAt }` in `chrome.storage.local`
- Enter Gemini API key (default) or switch provider + paste a different
  key, select model
- Keys saved to `chrome.storage.local`, never logged or transmitted
  anywhere except directly to the chosen AI provider's API

**2. Results page**
- If multiple resumes exist, the page (or the extension popup just
  before it opens the tab) first asks which resume's analysis to show —
  this decision actually happens in the extension at analysis time (see
  handoff flow above), but the results page also labels the analysis
  with the resume profile name used, so it's clear which CV the score
  belongs to
- Renders one job's analysis: match %, matching skills, missing skills,
  missing keywords, ATS notes, improvement suggestions
- A "Generate interview questions" button, separate from the main
  analysis — on click, calls the AI provider again with the parsed job
  description (and resume text for context), returns up to 20 likely
  interview questions with suggested answers, rendered inline on the
  same results page once ready. This is a second, on-demand AI call, not
  bundled into the initial match analysis, so users who don't want it
  never pay the extra API call/latency for it
- Session history (jobs analyzed so far) using `chrome.storage`/
  `IndexedDB` — no accounts, so history is local to this browser only,
  cleared if the user clears extension storage

That's the whole web app — 2 pages.

## Chrome extension

- Permissions scoped broadly (`<all_urls>` or a curated list), plus
  `chrome.storage`
- Extraction order per page: (1) check for `schema.org/JobPosting` JSON-LD
  in `<head>`, (2) fall back to heuristic extractor (largest text block
  near `<title>`, common class-name patterns), (3) optional manual
  per-site override list for frequently-used boards that fail both
- Injected button: "Analyze with Applywise" — appears on any page where
  a job posting is detected
- On click: if multiple resumes are saved, prompts for which profile to
  use; reads that resume's text + API key from storage, calls the AI
  provider directly, writes result to storage, opens the results tab

## UI/UX and branding

**Theme**
- Default: dark ash — a charcoal-to-near-black gradient background
  (`#3a3d42 → #25272b → #16171a`), soft off-white text (`#e7e5e0`), teal
  accent (`#5dcaa5 → #1d9e75`) for interactive elements and the match
  checkmark motif
- Light mode: toggle available, warm off-white background (`#f4f3f0 →
  #ffffff`), same teal accent for continuity
- Theme preference stored client-side (`localStorage` for the web app,
  `chrome.storage.local` for the extension) — persists across sessions,
  no server involved
- Font: Plus Jakarta Sans (Google Fonts) — a rounded geometric sans that
  reads soft without losing a professional edge; weights 400/500/600/700

**Logo**
- A monogram interlocking A and W into a single mark, with a small teal
  checkmark badge referencing the "match" concept — see
  `applywise-logo.svg`. Used in the extension icon, the web app header,
  and the extension popup.

**Analyzing animation**
- Every AI action (scraping, sending to the model, parsing the result)
  gets a visible state, not a blank wait: a pulsing accent dot next to a
  short status line ("Scanning job description," "Comparing with your
  resume"), a sweeping progress bar in the teal accent gradient, and
  results revealing one row at a time as they resolve, rather than
  popping in all at once. See `applywise-theme-preview.html` for a working
  reference of the gradient, toggle, and animation together.


## AI workflow

1. User uploads up to 3 resumes in Setup, each with a profile name →
   text extracted and cached locally.
2. User picks a provider/model (Gemini free tier by default).
3. On a LinkedIn job page, click "Analyze with Applywise."
4. Extension sends resume text + job description to the AI provider,
   wrapped with clear delimiters so scraped job text is treated as data,
   not instructions (prompt-injection hygiene — job descriptions are
   untrusted scraped content).
5. Structured JSON result written to local storage, results tab opens.
6. Optionally, user clicks "Generate interview questions" on the results
   page — a second AI call using the same job description + resume,
   returning up to 20 questions with suggested answers, appended to the
   same job's stored entry once it resolves.

## Build order

**Phase 1 — Web app shell**
- Static React/Vite app, Tailwind + shadcn/ui
- Setup page: up to 3 resume uploads, profile naming, client-side PDF
  text extraction
- API key/model input, stored via extension messaging (or `localStorage`
  as a fallback if testing the web app standalone before the extension
  exists)

**Phase 2 — Extension core**
- Manifest V3 skeleton, broad permissions for job-site detection
- Content script: JSON-LD/`schema.org` extraction first, heuristic
  fallback second, per-site override list as a stretch
- "Analyze with Applywise" button injected into the page
- Storage plumbing: read resume/key, write job+analysis result

**Phase 3 — AI integration**
- Direct client-side call to Gemini (validate CORS behavior first)
- Prompt template with delimited job-description block
- JSON response parsing/validation (don't trust free-form text —
  validate shape before rendering)
- Provider abstraction so swapping in OpenAI/Anthropic later is a
  small change, not a rewrite

**Phase 4 — Results page + session history**
- Results page reads `{job, analysis}` from storage, renders it
- "Generate interview questions" button — on-demand second AI call,
  up to 20 Q&A pairs, rendered once resolved and cached on the job entry
  so it doesn't re-call the API if the user revisits the page
- Simple session history list (jobs analyzed this session)
- Basic status field per job (Saved/Applied/etc.) if you still want
  light tracking — stored locally, no backend

**Phase 5 — Deploy + demo**
- Push the web app to a GitHub repo, connect it to Vercel (free tier) —
  Vercel auto-deploys on every push to the main branch, no manual deploy
  step needed after the initial connection
- Package and load the extension unpacked for demo (Chrome Web Store
  publishing is optional, $5 one-time fee if you want it listed)
- README, screenshots, short walkthrough video/GIF

## Deferred (not in this build)

- Cover letter generator
- Manual per-site scraping overrides beyond the generic extractor (add
  only for boards you personally use often and that fail JSON-LD/heuristic)
- Cross-device persistence (would require accounts + a backend — directly
  contradicts the "no server" goal, so only revisit if priorities change)
- Playwright E2E tests, CI/CD via GitHub Actions
- LinkedIn profile review, resume version comparison, salary insights,
  weekly analytics

## Trade-offs worth knowing

- **No cross-device history.** Since everything lives in one browser's
  extension storage, switching browsers/computers loses job history.
  Fine for a portfolio demo; a real product would eventually need
  accounts + a backend to solve this.
- **API key exposure surface.** The user's own key lives in
  `chrome.storage.local`, which is per-browser-profile and not
  synced/encrypted beyond what Chrome provides by default. Reasonable
  for a personal tool; mention this plainly in your README so users
  know it's their responsibility, not a security gap you're hiding.
- **CORS dependency.** The entire "no backend" architecture rests on
  the AI provider allowing direct browser calls. Confirm this first
  before committing further design decisions to it.
