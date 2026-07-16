import { extractJobPosting } from "../lib/extract";
import { getItem, STORAGE_KEYS } from "../lib/storage";
import { browserApi } from "../lib/browser-api";
import type {
  ExtensionMessage,
  GetResumesResponse,
  AnalyzeResponse,
  AnalyzeProgressMessage,
} from "../lib/messages";
import type { JobPosting } from "../lib/types";

const STYLE = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif; }

  .fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 13px 20px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    color: #1a1206;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
    background: linear-gradient(90deg, #f5a623, #e8791a);
    box-shadow: 0 8px 24px rgba(232, 121, 26, 0.35), 0 2px 6px rgba(0,0,0,0.3);
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }
  .fab:hover {
    transform: translateY(-2px) scale(1.03);
    box-shadow: 0 12px 28px rgba(232, 121, 26, 0.45), 0 3px 8px rgba(0,0,0,0.35);
    filter: brightness(1.06);
  }
  .fab:active { transform: translateY(0) scale(0.98); }
  .fab:disabled { opacity: 0.6; cursor: default; transform: none; box-shadow: none; }

  .fab-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #1a1206;
    flex-shrink: 0;
    animation: fab-dot-pulse 1.1s ease-in-out infinite;
  }
  @keyframes fab-dot-pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1); }
  }
  .fab-text { display: inline-block; }
  .fab-text.fab-text-in { animation: fab-text-in 0.28s ease; }
  @keyframes fab-text-in {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483001;
    background: rgba(10, 11, 13, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .modal {
    width: 320px;
    max-width: calc(100vw - 32px);
    border-radius: 16px;
    padding: 20px;
    background: linear-gradient(160deg, #3a3d42 0%, #25272b 55%, #16171a 100%);
    border: 1px solid #4a4d52;
    color: #e7e5e0;
  }
  .modal h2 { margin: 0 0 4px; font-size: 17px; font-weight: 700; }
  .modal p { margin: 0 0 14px; font-size: 13px; color: #9a978f; }
  .profile-btn {
    display: block;
    width: 100%;
    text-align: left;
    padding: 11px 14px;
    margin-bottom: 8px;
    border-radius: 10px;
    border: 1px solid #4a4d52;
    background: rgba(255,255,255,0.03);
    color: #e7e5e0;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.1s ease;
  }
  .profile-btn:hover {
    border-color: #f5a623;
    background: rgba(245, 166, 35, 0.08);
    transform: translateX(2px);
  }
  .profile-btn:active { transform: translateX(2px) scale(0.98); }
  .modal-close {
    margin-top: 8px;
    width: 100%;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(245, 166, 35, 0.4);
    background: rgba(245, 166, 35, 0.1);
    color: #f5a623;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: color 0.15s ease, background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
  }
  .modal-close:hover {
    color: #1a1206;
    background: linear-gradient(90deg, #f5a623, #e8791a);
    border-color: transparent;
  }
  .modal-close:active { transform: scale(0.98); }
  .error { color: #f2a4a4; font-size: 13px; margin-top: 10px; }
`;

const CONTEXT_INVALIDATED_MESSAGE =
  "Applywise was updated or reloaded since this page opened. Refresh the page and try again.";

function isExtensionContextValid(): boolean {
  return typeof browserApi !== "undefined" && !!browserApi.runtime?.id;
}

async function sendMessage<T>(message: ExtensionMessage): Promise<T> {
  if (!isExtensionContextValid()) {
    throw new Error(CONTEXT_INVALIDATED_MESSAGE);
  }
  try {
    return await browserApi.runtime.sendMessage(message);
  } catch {
    // Most commonly thrown when the extension was reloaded after this
    // content script was injected — the runtime connection goes stale mid-page.
    throw new Error(CONTEXT_INVALIDATED_MESSAGE);
  }
}

class ApplywiseWidget {
  private host: HTMLDivElement;
  private shadow: ShadowRoot;
  private fab: HTMLButtonElement | null = null;
  private job: JobPosting | null = null;
  private enabled = true;
  private statusTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "applywise-root";
    this.shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;
    this.shadow.appendChild(style);
    document.documentElement.appendChild(this.host);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.unmountFab();
    } else {
      this.detectAndMount();
    }
  }

  detectAndMount() {
    if (!this.enabled) return;
    const job = extractJobPosting();
    if (!job) return;
    this.job = job;
    if (!this.fab) this.mountFab();
  }

  private mountFab() {
    const fab = document.createElement("button");
    fab.className = "fab";
    const dot = document.createElement("span");
    dot.className = "fab-dot";
    dot.style.display = "none";
    const text = document.createElement("span");
    text.className = "fab-text";
    text.textContent = "Analyze with Applywise";
    fab.append(dot, text);
    fab.addEventListener("click", () => this.onFabClick());
    this.shadow.appendChild(fab);
    this.fab = fab;
  }

  private unmountFab() {
    this.fab?.remove();
    this.fab = null;
  }

  /** Swaps the button's label with a small fade-in, and toggles the pulsing "busy" dot. */
  private setFabText(text: string, busy: boolean) {
    if (!this.fab) return;
    const dot = this.fab.querySelector<HTMLSpanElement>(".fab-dot");
    if (dot) dot.style.display = busy ? "inline-block" : "none";
    const span = this.fab.querySelector<HTMLSpanElement>(".fab-text");
    if (!span) return;
    span.textContent = text;
    span.classList.remove("fab-text-in");
    void span.offsetWidth; // reflow, so re-adding the class restarts the animation
    span.classList.add("fab-text-in");
  }

  /**
   * Called from the top-level ANALYZE_PROGRESS listener with real status
   * pushed from the background service worker (e.g. which AI model is being
   * tried, or that a fallback kicked in after one timed out). Ignored once
   * the button is idle again, so a late message can't stomp on it.
   */
  showProgress(text: string) {
    if (!this.fab || !this.fab.disabled) return;
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    this.setFabText(text, true);
  }

  private async onFabClick() {
    if (!this.fab || !this.job) return;
    this.fab.disabled = true;
    this.setFabText("Loading…", true);

    try {
      const { resumes, hasApiKey } = await sendMessage<GetResumesResponse>({ type: "GET_RESUMES" });

      if (resumes.length === 0) {
        this.showMessage("No resumes saved yet. Open the Applywise popup to upload one.");
        return;
      }
      if (!hasApiKey) {
        this.showMessage("No API key saved yet. Open the Applywise popup to add one.");
        return;
      }

      if (resumes.length === 1) {
        await this.runAnalysis(resumes[0].id);
        return;
      }

      this.showPicker(resumes);
    } catch (err) {
      this.showMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      if (this.fab) {
        this.fab.disabled = false;
        this.setFabText("Analyze with Applywise", false);
      }
    }
  }

  private showPicker(resumes: GetResumesResponse["resumes"]) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `<h2>Which resume?</h2><p>Pick the profile to match against this posting.</p>`;

    for (const resume of resumes) {
      const btn = document.createElement("button");
      btn.className = "profile-btn";
      btn.textContent = resume.profileName;
      btn.addEventListener("click", async () => {
        overlay.remove();
        await this.runAnalysis(resume.id);
      });
      modal.appendChild(btn);
    }

    const close = document.createElement("button");
    close.className = "modal-close";
    close.textContent = "Cancel";
    close.addEventListener("click", () => overlay.remove());
    modal.appendChild(close);

    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    this.shadow.appendChild(overlay);
  }

  private showMessage(text: string) {
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.innerHTML = `<h2>Applywise</h2><p>${text}</p>`;
    const close = document.createElement("button");
    close.className = "modal-close";
    close.textContent = "Got it";
    close.addEventListener("click", () => overlay.remove());
    modal.appendChild(close);
    overlay.appendChild(modal);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    this.shadow.appendChild(overlay);
  }

  private async runAnalysis(resumeId: string) {
    if (!this.job || !this.fab) return;
    this.fab.disabled = true;

    // Local heartbeat until the background worker's real progress messages
    // start arriving (showProgress() clears this timer the moment one does)
    // — covers the brief gap before the first ANALYZE_PROGRESS push lands.
    const statusSteps = ["Scanning job description…", "Comparing with your resume…", "Analyzing…"];
    let step = 0;
    this.setFabText(statusSteps[0], true);
    this.statusTimer = setInterval(() => {
      step = Math.min(step + 1, statusSteps.length - 1);
      this.setFabText(statusSteps[step], true);
    }, 1400);

    try {
      const response = await sendMessage<AnalyzeResponse>({
        type: "ANALYZE",
        job: this.job,
        resumeId,
      });
      if (!response.ok) this.showMessage(response.error);
    } catch (err) {
      this.showMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      if (this.statusTimer) {
        clearInterval(this.statusTimer);
        this.statusTimer = null;
      }
      if (this.fab) {
        this.fab.disabled = false;
        this.setFabText("Analyze with Applywise", false);
      }
    }
  }
}

const widget = new ApplywiseWidget();

getItem<boolean>(STORAGE_KEYS.enabled, true).then((enabled) => {
  widget.setEnabled(enabled);
});

// Popup toggle can flip this while the page is already open.
browserApi.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const change = changes[STORAGE_KEYS.enabled];
  if (change) widget.setEnabled((change.newValue as boolean | undefined) ?? true);
});

// One-way pushes from the background worker while an analysis is running —
// see AnalyzeProgressMessage. No response expected, so this listener returns
// nothing (as opposed to sendMessage()'s request/response listener in
// background.ts).
browserApi.runtime.onMessage.addListener((message: AnalyzeProgressMessage) => {
  if (message?.type === "ANALYZE_PROGRESS") widget.showProgress(message.text);
});

// Job boards like LinkedIn are SPAs — re-check after client-side navigations.
let lastUrl = window.location.href;
new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    setTimeout(() => widget.detectAndMount(), 800);
  }
}).observe(document.body, { childList: true, subtree: true });
