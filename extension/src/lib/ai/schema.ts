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

// Chain-of-thought captured *inside* the structured output. A strict JSON
// schema with responseMimeType=application/json (Gemini) or a json_schema
// response_format (OpenAI) gives a model no room to reason before it commits
// to a value — so it tends to emit matchScore near the top of the object as a
// first-impression guess, which is the root cause of the same resume+posting
// scoring wildly differently between runs. Making the model fill this
// scratchpad FIRST forces the enumerate-then-judge work to be generated
// before the score, so the score is conditioned on the actual
// requirement-by-requirement analysis. This is applied to *all* models now,
// not just lite ones — strong models are more stable but still benefit. The
// zod schema doesn't include this field, so it's stripped on parse; it exists
// purely to steer generation, never reaching the UI.
const requirementAnalysisJsonSchema = {
  type: "array",
  description:
    "Fill this out FIRST, before any other field. One entry per distinct requirement, skill, tool, or qualification stated anywhere in the job posting. Do not summarize or group — list them individually.",
  items: {
    type: "object",
    properties: {
      requirement: { type: "string", description: "The individual requirement, exactly as the posting frames it." },
      kind: {
        type: "string",
        description: 'Either "required" (must-have) or "preferred" (nice-to-have). If the posting does not distinguish, use "required".',
      },
      resumeEvidence: {
        type: "string",
        nullable: true,
        description:
          "The specific words/experience in the resume that satisfy this requirement, or null if the resume shows no real evidence of it. Do not invent evidence or assume unrelated experience counts.",
      },
      status: {
        type: "string",
        description: 'Either "found" (resumeEvidence is present and genuinely satisfies it) or "missing".',
      },
    },
    required: ["requirement", "kind", "resumeEvidence", "status"],
  },
} as const;

// Universal reasoning schema: matchAnalysisJsonSchema with the
// requirementAnalysis scratchpad prepended (declared first, so field-order
// puts it before matchScore). Standard JSON Schema only — safe to hand to
// OpenAI's json_schema response_format as well as Gemini.
export const matchAnalysisThoroughJsonSchema = {
  type: "object",
  properties: {
    requirementAnalysis: requirementAnalysisJsonSchema,
    ...matchAnalysisJsonSchema.properties,
  },
  required: ["requirementAnalysis", ...matchAnalysisJsonSchema.required],
} as const;

// Gemini-only variant: adds propertyOrdering, a Gemini-specific Schema field
// that guarantees generation order (belt-and-suspenders over declaration
// order). Kept out of the universal schema above because it's not a standard
// JSON Schema keyword and shouldn't be sent to other providers' validators.
export const matchAnalysisThoroughGeminiJsonSchema = {
  ...matchAnalysisThoroughJsonSchema,
  propertyOrdering: [
    "requirementAnalysis",
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
