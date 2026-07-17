import { createOpenAiCompatibleClient } from "./openai-compatible";
import { isLiteModel } from "./fallback";
import { APP_URL } from "../config";
import { OPENROUTER_TIMEOUT_MS, type AiClient } from "./client";

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

// Structured output (`response_format: json_schema`) is per-model on
// OpenRouter, not per-provider: it depends on what the upstream host supports,
// and the catalog reports it per model under `supported_parameters`. Sending
// the field to a model that lacks it risks a 400 rather than a graceful
// downgrade, so only models that advertise `structured_outputs` get it.
// Everything else falls back to the prompt's own JSON instructions plus
// fence-stripping and zod validation at the boundary — the same path
// DeepSeek/GLM/xAI already take.
//
// Verified against https://openrouter.ai/api/v1/models. Re-check when adding a
// model; a wrong guess here fails closed (a 400) rather than silently.
const STRUCTURED_OUTPUT_MODELS = new Set([
  "openai/gpt-oss-20b:free",
  "google/gemma-4-26b-a4b-it:free",
  "tencent/hy3:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
]);

export function createOpenRouterClient(apiKey: string, model: string): AiClient {
  // Mirrors the Gemini client: lite models get the anti-skim "thorough" prompt
  // and a longer timeout, since they skim more and sit at the end of the
  // fallback chain where a timeout means total failure.
  const lite = isLiteModel("openrouter", model);

  return createOpenAiCompatibleClient({
    baseUrl: BASE_URL,
    apiKey,
    model,
    providerName: "OpenRouter",
    useJsonSchema: STRUCTURED_OUTPUT_MODELS.has(model),
    thoroughMatchPrompt: lite,
    // One cap for every model here, unlike Gemini's lite/full split: on the
    // free tier the lite models aren't reliably the fast ones (measured:
    // gpt-oss-20b 105s vs nemotron-super-120b 55s), so there's nothing for a
    // split to track.
    timeoutMs: OPENROUTER_TIMEOUT_MS,
    // OpenRouter uses these purely for its public leaderboard attribution.
    // They carry no user data and are safe to send; the API key stays in the
    // Authorization header and never leaves the browser except to OpenRouter.
    extraHeaders: {
      "HTTP-Referer": APP_URL,
      "X-Title": "Applywise",
    },
  });
}
