import {
  BRIDGE_SOURCE_WEB,
  isBridgeResponseMessage,
  type BridgeRequest,
  type BridgeRequestMessage,
} from "./bridge-protocol";

const DEFAULT_TIMEOUT_MS = 1500;
const NOT_INSTALLED_MESSAGE = "The Applywise extension isn't installed, or isn't running on this page.";

class BridgeTimeoutError extends Error {
  constructor(message: string = NOT_INSTALLED_MESSAGE) {
    super(message);
  }
}

/**
 * `timeoutMessage` defaults to "not installed", which is the right read for
 * every short, cheap request (PING, STORAGE_GET/SET) — if those don't answer
 * within a second or two, there's genuinely no bridge listening. It is the
 * *wrong* read for a request whose own work can legitimately run past that
 * window (see bridgeGenerateInterviewQuestions below), so callers with a
 * long-running request pass an honest message describing what a timeout there
 * actually means instead.
 */
function sendBridgeRequest<T>(
  request: BridgeRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  timeoutMessage?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();

    const timer = setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new BridgeTimeoutError(timeoutMessage));
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (!isBridgeResponseMessage(event.data)) return;
      if (event.data.requestId !== requestId) return;

      clearTimeout(timer);
      window.removeEventListener("message", handleMessage);

      if (event.data.ok) resolve(event.data.payload as T);
      else reject(new Error(event.data.error ?? "Extension bridge request failed."));
    }

    window.addEventListener("message", handleMessage);

    const message: BridgeRequestMessage = { source: BRIDGE_SOURCE_WEB, requestId, request };
    window.postMessage(message, window.location.origin);
  });
}

let extensionAvailable: boolean | null = null;

/** Cheap, cached check for whether the extension's app-bridge is present on this page. */
export async function isExtensionAvailable(): Promise<boolean> {
  if (extensionAvailable !== null) return extensionAvailable;
  try {
    await sendBridgeRequest<boolean>({ type: "PING" }, 500);
    extensionAvailable = true;
  } catch {
    extensionAvailable = false;
  }
  return extensionAvailable;
}

// If the extension gets reloaded while this tab stays open, an
// already-"available" bridge can start failing mid-session. Forget the
// cached answer so the next call re-probes instead of repeating the
// failure forever until the user manually refreshes the page.
function forgetExtensionAvailability() {
  extensionAvailable = null;
}

/** The manifest version of the extension actually installed in this browser. */
export async function bridgeGetExtensionVersion(): Promise<string> {
  return sendBridgeRequest<string>({ type: "GET_VERSION" }, 500);
}

export async function bridgeStorageGet<T>(key: string): Promise<T | null> {
  try {
    return await sendBridgeRequest<T | null>({ type: "STORAGE_GET", key });
  } catch (err) {
    forgetExtensionAvailability();
    throw err;
  }
}

export async function bridgeStorageSet(key: string, value: unknown): Promise<void> {
  try {
    await sendBridgeRequest<null>({ type: "STORAGE_SET", key, value });
  } catch (err) {
    forgetExtensionAvailability();
    throw err;
  }
}

// Generating interview questions calls the AI provider a second time, and that
// call alone is allowed up to 90s (see extension's MATCH_ANALYSIS_TIMEOUT_MS/
// fetchTextWithTimeout default) — before auto-fallback (extension/src/lib/ai/
// fallback.ts) even gets a chance to hop to a second model on a busy/rate-
// limited one. A 60s bridge timeout used to fire before that single call could
// even finish, and — because it reused the generic "not installed" message —
// told a user whose extension was working perfectly that it wasn't, which is
// simply false. 5 minutes matches the Chrome MV3 service-worker ceiling
// documented alongside OPENROUTER_TIMEOUT_MS in the extension's ai/client.ts:
// past that, the extension's own background worker is the one giving up, not
// this timer, so there's no such thing as "waiting too long" before then.
const INTERVIEW_QUESTIONS_TIMEOUT_MS = 5 * 60_000;

export async function bridgeGenerateInterviewQuestions<T>(jobId: string): Promise<T> {
  return sendBridgeRequest<T>(
    { type: "GENERATE_INTERVIEW_QUESTIONS", jobId },
    INTERVIEW_QUESTIONS_TIMEOUT_MS,
    "Generating interview questions is taking longer than usual — this can happen when free-tier AI models are busy and the extension is trying another one. Please wait a little longer, then try again if this keeps happening."
  );
}
