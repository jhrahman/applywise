export interface Resume {
  id: string;
  profileName: string;
  parsedText: string;
  uploadedAt: number;
  fileName: string;
}

export type AiProvider =
  | "gemini"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "glm"
  | "xai";

export interface ProviderSettings {
  provider: AiProvider;
  // Legacy single shared key. Superseded by `apiKeys` (one key per provider) so
  // switching providers no longer wipes the key you already entered. Kept
  // optional and read-only-ish for backward compatibility: settings saved
  // before `apiKeys` shipped still carry it, and normalizeSettings() migrates
  // it into `apiKeys[provider]` on load. New writes populate `apiKeys` instead.
  apiKey?: string;
  // Per-provider API keys, so each provider remembers its own key. Partial
  // because a user only fills in the providers they actually use.
  apiKeys?: Partial<Record<AiProvider, string>>;
  model: string;
  // Whether a busy/rate-limited model may fall back to other free models (see
  // extension/src/lib/ai/fallback.ts). Only meaningful for providers with a
  // free tier worth hopping across — Gemini and OpenRouter. Optional because
  // settings saved before this shipped are already in users' storage without
  // it, and must default to enabled rather than silently losing the fallback
  // they already had.
  fallbackEnabled?: boolean;
}

/**
 * The API key for the currently selected provider. Reads the per-provider map
 * first, then falls back to the legacy single `apiKey` — which, in every read
 * context, belonged to whatever provider is currently selected (it was the
 * active provider when the key was saved).
 */
export function getProviderApiKey(settings: ProviderSettings): string {
  return settings.apiKeys?.[settings.provider] ?? settings.apiKey ?? "";
}

/**
 * One-time migration applied on every load: folds the legacy single `apiKey`
 * into `apiKeys[provider]` (the provider it was saved under) so per-provider
 * lookups work uniformly, and backfills `fallbackEnabled`. Idempotent — running
 * it on already-migrated settings is a no-op.
 */
export function normalizeSettings(settings: ProviderSettings): ProviderSettings {
  const apiKeys: Partial<Record<AiProvider, string>> = { ...(settings.apiKeys ?? {}) };
  if (settings.apiKey && apiKeys[settings.provider] == null) {
    apiKeys[settings.provider] = settings.apiKey;
  }
  return {
    ...settings,
    apiKeys,
    fallbackEnabled: settings.fallbackEnabled ?? true,
  };
}

export interface JobPosting {
  title: string;
  company: string;
  location?: string;
  description: string;
  url: string;
}

export interface SalaryInfo {
  raw: string;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null; // ISO 4217 code, e.g. "USD", "BDT"
  period: string | null; // "year" | "month" | "hour" | etc.
}

export interface JobDetails {
  company: string | null; // AI-read fallback for sites that don't publish structured company data
  employmentType: string | null; // "Full-time" | "Part-time" | "Contract" | "Internship" | etc.
  location: string | null; // AI-read fallback for sites without structured location data
  workMode: string | null; // "Remote" | "Hybrid" | "Onsite"
  salary: SalaryInfo | null;
}

export interface MatchAnalysis {
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  missingKeywords: string[];
  atsNotes: string[];
  suggestions: string[];
  jobDetails: JobDetails;
}

/** Which document the question was derived from — see QUESTION_MIX in extension/src/lib/ai/prompt.ts. */
export type InterviewQuestionSource = "job" | "resume";

export interface InterviewQA {
  question: string;
  // Optional because entries generated before the 60/40 split shipped are
  // already in users' storage without it — the UI omits the badge for those
  // rather than mislabeling them.
  source?: InterviewQuestionSource;
  suggestedAnswer: string;
}

export type JobStatus = "saved" | "applied" | "interviewing" | "rejected" | "offer";

export interface JobEntry {
  id: string;
  job: JobPosting;
  analysis: MatchAnalysis;
  resumeUsed: {
    id: string;
    profileName: string;
  };
  interviewQuestions?: InterviewQA[];
  status: JobStatus;
  createdAt: number;
  modelUsed?: string; // AI model that produced this analysis, e.g. "gemini-3-flash-preview"
}
