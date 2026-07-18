import { createOpenAiCompatibleClient } from "./openai-compatible";
import { isLiteModel } from "./fallback";
import type { AiClient } from "./client";

// Cohere — a free Trial key (1,000 calls/month, 20 RPM, non-commercial). Cohere
// ships an OpenAI-compatible surface at /compatibility/v1, so it wraps the same
// way as the other providers rather than needing its native /v2/chat shape.
export function createCohereClient(apiKey: string, model: string): AiClient {
  const lite = isLiteModel("cohere", model);

  return createOpenAiCompatibleClient({
    baseUrl: "https://api.cohere.ai/compatibility/v1/chat/completions",
    apiKey,
    model,
    providerName: "Cohere",
    thoroughMatchPrompt: lite,
    // Structured output matters most for Cohere's smaller command-r models,
    // which are the ones the fallback chain drops to. Prompt-only, they skip
    // the requirementAnalysis scratchpad and guess a score (verified live: the
    // same resume+posting swung 37→50→97 across runs, and command-r7b even
    // emitted a null-`raw` salary that discarded the whole analysis). Forcing
    // the schema pins the reasoning field so the score is recomputed from real
    // verdicts (that 37 became a correct, stable 85) and the shape can't drift.
    // Cohere's validator rejects OpenAPI's `nullable`, so it needs the standard
    // JSON Schema dialect (see toStandardJsonSchema).
    useJsonSchema: true,
    jsonSchemaDialect: "standard",
  });
}
