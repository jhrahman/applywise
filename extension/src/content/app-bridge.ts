// Runs only on the Applywise web app's own origin (see manifest.json
// content_scripts matches) — bridges window.postMessage from the page to
// extension storage/messaging APIs, which a plain webpage cannot reach
// directly. Never inject this on arbitrary pages: it would let any site
// read resumes and API keys out of extension storage.

import { getItem, setItem } from "../lib/storage";
import { browserApi } from "../lib/browser-api";
import {
  BRIDGE_SOURCE_EXTENSION,
  isBridgeRequestMessage,
  type BridgeRequest,
  type BridgeResponseMessage,
} from "../lib/bridge-protocol";
import type { ExtensionMessage, GenerateInterviewQuestionsResponse } from "../lib/messages";

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  if (!isBridgeRequestMessage(event.data)) return;

  const { requestId, request } = event.data;

  handleRequest(request)
    .then((payload) => respond({ requestId, ok: true, payload }))
    .catch((err) =>
      respond({ requestId, ok: false, error: err instanceof Error ? err.message : String(err) })
    );
});

function respond(partial: Omit<BridgeResponseMessage, "source">) {
  const message: BridgeResponseMessage = { source: BRIDGE_SOURCE_EXTENSION, ...partial };
  window.postMessage(message, window.location.origin);
}

async function handleRequest(request: BridgeRequest): Promise<unknown> {
  switch (request.type) {
    case "PING":
      return true;
    case "STORAGE_GET":
      return getItem(request.key, null);
    case "STORAGE_SET":
      await setItem(request.key, request.value);
      return null;
    case "GENERATE_INTERVIEW_QUESTIONS": {
      const message: ExtensionMessage = {
        type: "GENERATE_INTERVIEW_QUESTIONS",
        jobId: request.jobId,
      };
      const response: GenerateInterviewQuestionsResponse = await browserApi.runtime.sendMessage(message);
      if (!response.ok) throw new Error(response.error);
      return response.entry;
    }
  }
}
