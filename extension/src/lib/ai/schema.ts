import { z } from "zod";

const salaryInfoSchema = z
  .object({
    raw: z.string(),
    minAmount: z.number().nullable(),
    maxAmount: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.string().nullable(),
  })
  .nullable();

const jobDetailsSchema = z.object({
  company: z.string().nullable(),
  employmentType: z.string().nullable(),
  location: z.string().nullable(),
  workMode: z.string().nullable(),
  salary: salaryInfoSchema,
});

export const matchAnalysisSchema = z.object({
  matchScore: z.number().min(0).max(100),
  matchingSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  atsNotes: z.array(z.string()),
  suggestions: z.array(z.string()),
  jobDetails: jobDetailsSchema,
});

export const interviewQaSchema = z.object({
  question: z.string(),
  suggestedAnswer: z.string(),
});

export const interviewQuestionsSchema = z.array(interviewQaSchema).max(20);

// The JSON Schema shapes below are handed to providers that support
// constrained/structured output (Gemini's responseSchema, OpenAI's
// json_schema response_format), so the model is steered toward the same
// shape the zod schemas above validate at the boundary.
const salaryInfoJsonSchema = {
  type: "object",
  nullable: true,
  properties: {
    raw: { type: "string" },
    minAmount: { type: "number", nullable: true },
    maxAmount: { type: "number", nullable: true },
    currency: { type: "string", nullable: true },
    period: { type: "string", nullable: true },
  },
  required: ["raw", "minAmount", "maxAmount", "currency", "period"],
} as const;

const jobDetailsJsonSchema = {
  type: "object",
  properties: {
    company: { type: "string", nullable: true },
    employmentType: { type: "string", nullable: true },
    location: { type: "string", nullable: true },
    workMode: { type: "string", nullable: true },
    salary: salaryInfoJsonSchema,
  },
  required: ["company", "employmentType", "location", "workMode", "salary"],
} as const;

export const matchAnalysisJsonSchema = {
  type: "object",
  properties: {
    matchScore: { type: "number" },
    matchingSkills: { type: "array", items: { type: "string" } },
    missingSkills: { type: "array", items: { type: "string" } },
    missingKeywords: { type: "array", items: { type: "string" } },
    atsNotes: { type: "array", items: { type: "string" } },
    suggestions: { type: "array", items: { type: "string" } },
    jobDetails: jobDetailsJsonSchema,
  },
  required: [
    "matchScore",
    "matchingSkills",
    "missingSkills",
    "missingKeywords",
    "atsNotes",
    "suggestions",
    "jobDetails",
  ],
} as const;

export const interviewQuestionsJsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      question: { type: "string" },
      suggestedAnswer: { type: "string" },
    },
    required: ["question", "suggestedAnswer"],
  },
} as const;

/** Models occasionally wrap JSON in markdown code fences even when asked not to. */
export function extractJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}
