// window.postMessage protocol between the web app page and the app-bridge
// content script. Kept intentionally narrow: raw key/value storage access
// plus one privileged action (interview questions) that must run in the
// background service worker, where the AI provider call actually happens.

export const BRIDGE_SOURCE_WEB = "applywise-web";
export const BRIDGE_SOURCE_EXTENSION = "applywise-extension";

export type BridgeRequest =
  | { type: "STORAGE_GET"; key: string }
  | { type: "STORAGE_SET"; key: string; value: unknown }
  | { type: "GENERATE_INTERVIEW_QUESTIONS"; jobId: string }
  | { type: "PING" };

export interface BridgeRequestMessage {
  source: typeof BRIDGE_SOURCE_WEB;
  requestId: string;
  request: BridgeRequest;
}

export interface BridgeResponseMessage {
  source: typeof BRIDGE_SOURCE_EXTENSION;
  requestId: string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

export function isBridgeRequestMessage(data: unknown): data is BridgeRequestMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).source === BRIDGE_SOURCE_WEB
  );
}
