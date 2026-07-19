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

export interface LiveModel {
  id: string;
  /**
   * ISO date (YYYY-MM-DD) the provider will stop serving this model, if it
   * publishes one. Verified live against each provider's own /models
   * response: OpenRouter (`expiration_date`) and Mistral (`deprecation`) both
   * genuinely expose one; Gemini, Groq, and Cohere's endpoints carry nothing
   * comparable (checked live, 2026-07). Cerebras/DeepSeek/GLM/OpenAI/xAI/
   * Hugging Face/Anthropic haven't been checked (no test key available) — see
   * EXPIRY_HORIZON_MS below before adding a new one blindly from docs alone,
   * since a misread field name would silently no-op rather than error.
   */
  expiresAt?: string;
}

interface ModelsEndpoint {
  url: string;
  headers: (apiKey: string) => Record<string, string>;
  parse: (json: unknown) => LiveModel[];
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
        .filter((id): id is string => typeof id === "string")
        .map((id) => ({ id }));
    },
  };
}

// Both OpenRouter and Mistral set a retirement-ish field on models with no
// real near-term plan too (verified live: OpenRouter uses far-future
// placeholders like "2098-12-31"; a formality rather than a genuine signal),
// so surfacing every non-null date as "going away" would be actively
// misleading on those. Only a date inside this horizon is treated as real —
// verified live, a model genuinely retiring soon reports a near date instead
// (OpenRouter's tencent/hy3:free: "2026-07-21"; Mistral's
// magistral-medium-latest: "2026-07-31").
const EXPIRY_HORIZON_MS = 2 * 365 * 24 * 60 * 60 * 1000;

/** True when `raw` parses to a date within EXPIRY_HORIZON_MS from now — the
 * shared "is this a real signal, not a far-future placeholder" gate used by
 * every provider that publishes a retirement-ish field. */
function isNearTermDate(raw: string | null): raw is string {
  if (raw === null) return false;
  const parsed = Date.parse(raw);
  return !Number.isNaN(parsed) && parsed - Date.now() < EXPIRY_HORIZON_MS;
}

/** Builds the `{ id, expiresAt? }` entry with the key genuinely absent (not
 * present-but-undefined) when there's no real retirement date — matches
 * LiveModel's optional field exactly, which a plain `expiresAt: x ?? undefined`
 * would not (TS treats "always present, possibly undefined" differently from
 * "optional"). ISO date only (first 10 chars) even when the source is a full
 * timestamp (Mistral's `deprecation` is `"...T12:00:00Z"`), so every provider
 * feeds the same YYYY-MM-DD shape into formatExpiryDate downstream. */
function liveModel(id: string, rawDate: string | null): LiveModel {
  return isNearTermDate(rawDate) ? { id, expiresAt: rawDate.slice(0, 10) } : { id };
}

/** OpenRouter's /models shape — same envelope as openAiShape, but each entry
 * can also carry a real retirement date the other providers don't expose. */
function openRouterShape(): ModelsEndpoint {
  return {
    url: "https://openrouter.ai/api/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    parse: (j) => {
      const data = (j as { data?: unknown[] })?.data ?? [];
      return data
        .map((m) => {
          const rec = m as { id?: unknown; expiration_date?: unknown };
          if (typeof rec.id !== "string") return null;
          return liveModel(rec.id, typeof rec.expiration_date === "string" ? rec.expiration_date : null);
        })
        .filter((m): m is LiveModel => m !== null);
    },
  };
}

/** Mistral's /models shape — same envelope as openAiShape, but each entry can
 * carry a real `deprecation` timestamp (verified live: e.g.
 * magistral-medium-latest deprecates 2026-07-31, replacement
 * mistral-medium-3-5 — that replacement suggestion isn't surfaced yet, just
 * the date, same as every other provider here). */
function mistralShape(): ModelsEndpoint {
  return {
    url: "https://api.mistral.ai/v1/models",
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
    parse: (j) => {
      const data = (j as { data?: unknown[] })?.data ?? [];
      return data
        .map((m) => {
          const rec = m as { id?: unknown; deprecation?: unknown };
          if (typeof rec.id !== "string") return null;
          return liveModel(rec.id, typeof rec.deprecation === "string" ? rec.deprecation : null);
        })
        .filter((m): m is LiveModel => m !== null);
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
        .filter((s) => s.length > 0)
        .map((id) => ({ id }));
    },
  },
  openrouter: openRouterShape(),
  groq: openAiShape("https://api.groq.com/openai/v1/models"),
  cerebras: openAiShape("https://api.cerebras.ai/v1/models"),
  mistral: mistralShape(),
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
        .filter((id): id is string => typeof id === "string")
        .map((id) => ({ id }));
    },
  },
};

/**
 * Returns the provider's currently-offered models (plus a retirement date for
 * the rare provider/model that publishes one). Throws a readable error on a
 * bad key, an unsupported endpoint, or a malformed/empty response — the Setup
 * page treats any throw as "couldn't verify" rather than "all retired", so a
 * listing failure never mislabels working models as gone.
 */
export async function listProviderModels(provider: AiProvider, apiKey: string): Promise<LiveModel[]> {
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
