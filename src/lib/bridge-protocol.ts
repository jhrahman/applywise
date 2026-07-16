// window.postMessage protocol between the web app page and the extension's
// app-bridge content script. Mirrors extension/src/lib/bridge-protocol.ts —
// kept in sync by hand since the two are separate build systems.

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

export function isBridgeResponseMessage(data: unknown): data is BridgeResponseMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).source === BRIDGE_SOURCE_EXTENSION
  );
}
