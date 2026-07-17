import {
  BRIDGE_SOURCE_WEB,
  isBridgeResponseMessage,
  type BridgeRequest,
  type BridgeRequestMessage,
} from "./bridge-protocol";

const DEFAULT_TIMEOUT_MS = 1500;

class BridgeTimeoutError extends Error {
  constructor() {
    super("The Applywise extension isn't installed, or isn't running on this page.");
  }
}

function sendBridgeRequest<T>(request: BridgeRequest, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();

    const timer = setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(new BridgeTimeoutError());
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

export async function bridgeGenerateInterviewQuestions<T>(jobId: string): Promise<T> {
  return sendBridgeRequest<T>({ type: "GENERATE_INTERVIEW_QUESTIONS", jobId }, 60_000);
}
