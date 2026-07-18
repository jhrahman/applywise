import type { AiProvider } from "../types";
import { fetchTextWithTimeout } from "./client";

// Fetches a provider's *live* model catalogue so the Setup page can flag any
// preset/custom model that's no longer offered (i.e. retired). Runs in the
// background service worker, never the web page: these are cross-origin,
// authenticated calls a page can't make (CORS), and the key must stay in the
// privileged context.
//
// Most providers expose the OpenAI-style GET /models ({ data: [{ id }] }).
// Gemini and Anthropic differ in both shape and auth, so they get their own
// entries. Endpoints verified against each provider's API docs.

interface ModelsEndpoint {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
  parse: (json: unknown) => string[];
}

/** The OpenAI `{ data: [{ id }] }` shape, shared by most providers. */
function openAiShape(modelsUrl: string): ModelsEndpoint {
  return {
    url: modelsUrl,
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    parse: (j) => {
      const data = (j as { data?: unknown[] })?.data ?? [];
      return data
        .map((m) => (m as { id?: unknown }).id)
        .filter((id): id is string => typeof id === "string");
    },
  };
}

const ENDPOINTS: Record<AiProvider, ModelsEndpoint> = {
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    headers: (k) => ({ "x-goog-api-key": k }),
    // Gemini returns { models: [{ name: "models/gemini-3-flash-preview" }] };
    // strip the "models/" prefix to match the bare IDs we store.
    parse: (j) => {
      const models = (j as { models?: unknown[] })?.models ?? [];
      return models
        .map((m) => String((m as { name?: unknown }).name ?? "").replace(/^models\//, ""))
        .filter((s) => s.length > 0);
    },
  },
  openrouter: openAiShape("https://openrouter.ai/api/v1/models"),
  groq: openAiShape("https://api.groq.com/openai/v1/models"),
  cerebras: openAiShape("https://api.cerebras.ai/v1/models"),
  mistral: openAiShape("https://api.mistral.ai/v1/models"),
  cohere: openAiShape("https://api.cohere.ai/compatibility/v1/models"),
  deepseek: openAiShape("https://api.deepseek.com/models"),
  glm: openAiShape("https://api.z.ai/api/paas/v4/models"),
  openai: openAiShape("https://api.openai.com/v1/models"),
  xai: openAiShape("https://api.x.ai/v1/models"),
  // The router's own /v1/models lists every model live on at least one
  // Inference Providers host right now (id-only match is enough here — the
  // provider/pricing detail per model isn't needed for the retired-check).
  huggingface: openAiShape("https://router.huggingface.co/v1/models"),
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: (k) => ({
      "x-api-key": k,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }),
    parse: (j) => {
      const data = (j as { data?: unknown[] })?.data ?? [];
      return data
        .map((m) => (m as { id?: unknown }).id)
        .filter((id): id is string => typeof id === "string");
    },
  },
};

/**
 * Returns the provider's currently-offered model IDs. Throws a readable error
 * on a bad key, an unsupported endpoint, or a malformed/empty response — the
 * Setup page treats any throw as "couldn't verify" rather than "all retired",
 * so a listing failure never mislabels working models as gone.
 */
export async function listProviderModels(provider: AiProvider, apiKey: string): Promise<string[]> {
  const endpoint = ENDPOINTS[provider];
  const { response, body } = await fetchTextWithTimeout(
    endpoint.url,
    { method: "GET", headers: { "Content-Type": "application/json", ...endpoint.headers(apiKey) } },
    20_000
  );
  if (!response.ok) {
    throw new Error(`${provider} model list unavailable (HTTP ${response.status}): ${body.slice(0, 150)}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error(`${provider} model list returned a non-JSON response.`);
  }
  const models = endpoint.parse(json);
  if (models.length === 0) throw new Error(`${provider} model list came back empty.`);
  return models;
}
