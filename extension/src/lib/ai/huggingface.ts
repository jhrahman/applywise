import { createOpenAiCompatibleClient } from "./openai-compatible";
import { isLiteModel } from "./fallback";
import type { AiClient } from "./client";

// Hugging Face's Inference Providers router — a single OpenAI-compatible
// endpoint that auto-selects the fastest live host for whatever model ID is
// requested (no ":provider" suffix needed; see
// huggingface.co/docs/inference-providers/index). Billed against the user's
// HF account credit rather than a provider-specific key.
const BASE_URL = "https://router.huggingface.co/v1/chat/completions";

// Qwen3's dense "thinking" releases (8B/14B/32B, without the -Instruct-2507
// suffix) and gpt-oss reason before answering by default, the same way
// Groq's gpt-oss does (see groq.ts) — the hidden reasoning tokens can exhaust
// a small completion cap before the JSON answer is emitted. The -2507
// "Instruct" Qwen3 releases ship non-thinking by default, so they're excluded.
const REASONING_MODEL_PATTERN = /gpt-oss|Qwen3-(?:8B|14B|32B)$/i;

export function createHuggingFaceClient(apiKey: string, model: string): AiClient {
  const lite = isLiteModel("huggingface", model);
  const isReasoning = REASONING_MODEL_PATTERN.test(model);

  return createOpenAiCompatibleClient({
    baseUrl: BASE_URL,
    apiKey,
    model,
    providerName: "Hugging Face",
    thoroughMatchPrompt: lite,
    maxTokens: isReasoning ? 8192 : undefined,
  });
}
