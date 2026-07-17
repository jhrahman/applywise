import { z } from "zod";
import { AiResponseFormatError } from "./client";
import type { InterviewQA, MatchAnalysis } from "../types";

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

/**
 * Models routinely echo an enum back with different casing or padding
 * ("Found", "REQUIRED", " found ") — especially the ones with no structured
 * output, which only have the prompt's word for the expected spelling. Every
 * enum below pairs with `.catch()`, which turns an unrecognised value into a
 * default *silently*, so without this the difference between "found" and
 * "Found" is the difference between a 100 and a 25 with nothing logged.
 * Normalise first; let `.catch()` handle only genuinely unusable values.
 */
function normalizeEnumToken(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase() : value;
}

export const interviewQaSchema = z.object({
  question: z.string(),
  // Which side of the pair the question was built from — drives the 60/40
  // job-vs-resume mix (see QUESTION_MIX in prompt.ts) and the badges in the
  // results UI. `.catch` rather than a hard requirement: a model that omits
  // or misspells this tag shouldn't cost the user all 20 questions, and "job"
  // is the safe default since it's the majority side of the split.
  source: z.preprocess(normalizeEnumToken, z.enum(["job", "resume"])).catch("job"),
  suggestedAnswer: z.string(),
});

export const interviewQuestionsSchema = z.array(interviewQaSchema).max(20);

/** Zod's own message is a JSON blob; keep the first couple of issues readable. */
function describeZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * The interview-questions counterpart to parseMatchAnalysis — use this at every
 * provider boundary rather than interviewQuestionsSchema.parse(), so a
 * malformed response is a retryable AiResponseFormatError instead of a raw
 * ZodError the fallback chain can't recognise.
 */
export function parseInterviewQuestions(raw: unknown): InterviewQA[] {
  const parsed = interviewQuestionsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AiResponseFormatError(
      `Couldn't parse the AI response: ${describeZodIssues(parsed.error)}`
    );
  }
  return parsed.data;
}

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

// The one input to the score formula that cannot be derived from the
// requirement verdicts — whether the candidate's overall experience/seniority
// meets the posting's ask. The model used to fold this straight into
// matchScore; making it an explicit field is what lets computeMatchScore()
// below reproduce the number in code instead of trusting the model's mental
// arithmetic (see the drift measurement in that function's comment).
const experienceFitJsonSchema = {
  type: "number",
  description:
    "Fill this in immediately after requirementAnalysis, before matchScore. 1 if the resume's experience/seniority clearly meets the posting's ask, 0.5 if unclear either way, 0 if clearly below (e.g. posting wants 5+ years, resume shows under 2).",
} as const;

// The score's guard against a strong skills overlap in the WRONG profession.
// requiredCoverage rewards matched requirements, but a sparse posting for a
// different occupation (a waiter role, say) can still show a high coverage off
// incidental overlap like "customer service" — leaving the headline score
// implying a fit the candidate plainly doesn't have. roleAlignment captures
// "is this even the right kind of job", and computeMatchScore() uses it to gate
// the coverage-based score so a wrong-occupation match lands low regardless.
const roleAlignmentJsonSchema = {
  type: "number",
  description:
    "Fill this in immediately after experienceFit, before matchScore. How well the candidate's overall profession/field matches the KIND of role this posting is for, independent of any incidental skill overlap. 1 = same field/occupation (the resume is clearly for this type of role). 0.5 = a different but genuinely adjacent field with real transferable overlap (e.g. QA engineer vs software developer, sysadmin vs DevOps). 0 = a fundamentally different occupation where any overlap is incidental (e.g. a software/IT resume against a waiter, nurse, driver, or accountant posting). Be decisive: if the resume and posting are clearly different professions, use 0 even when a generic skill like 'customer service' or 'communication' appears in both.",
} as const;

// Universal reasoning schema: matchAnalysisJsonSchema with the
// requirementAnalysis scratchpad prepended (declared first, so field-order
// puts it before matchScore). Standard JSON Schema only — safe to hand to
// OpenAI's json_schema response_format as well as Gemini.
export const matchAnalysisThoroughJsonSchema = {
  type: "object",
  properties: {
    requirementAnalysis: requirementAnalysisJsonSchema,
    experienceFit: experienceFitJsonSchema,
    roleAlignment: roleAlignmentJsonSchema,
    ...matchAnalysisJsonSchema.properties,
  },
  required: [
    "requirementAnalysis",
    "experienceFit",
    "roleAlignment",
    ...matchAnalysisJsonSchema.required,
  ],
} as const;

// Gemini-only variant: adds propertyOrdering, a Gemini-specific Schema field
// that guarantees generation order (belt-and-suspenders over declaration
// order). Kept out of the universal schema above because it's not a standard
// JSON Schema keyword and shouldn't be sent to other providers' validators.
export const matchAnalysisThoroughGeminiJsonSchema = {
  ...matchAnalysisThoroughJsonSchema,
  propertyOrdering: [
    "requirementAnalysis",
    "experienceFit",
    "roleAlignment",
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
      source: {
        type: "string",
        enum: ["job", "resume"],
        description:
          'Either "job" (built from the posting\'s skills, responsibilities, or requirements) or "resume" (built from the candidate\'s own listed experience). Across the whole array, 60% must be "job" and 40% "resume".',
      },
      suggestedAnswer: { type: "string" },
    },
    required: ["question", "source", "suggestedAnswer"],
  },
} as const;

// The scratchpad the model filled in before scoring. Parsed leniently and
// separately from matchAnalysisSchema: if a model returns a malformed
// scratchpad we still want the rest of the analysis, we just fall back to its
// self-reported score.
const requirementEntrySchema = z.object({
  requirement: z.string(),
  // See normalizeEnumToken: these two feed computeMatchScore directly, so a
  // casing mismatch here silently rewrites the headline number.
  kind: z.preprocess(normalizeEnumToken, z.enum(["required", "preferred"])).catch("required"),
  status: z.preprocess(normalizeEnumToken, z.enum(["found", "missing"])).catch("missing"),
});

const scratchpadSchema = z.object({
  requirementAnalysis: z.array(requirementEntrySchema).min(1),
  // Models sometimes emit 0/0.5/1 as a string, or omit it entirely.
  experienceFit: z.coerce.number().min(0).max(1).catch(1),
  // Defaults to 1 (no role penalty) when a model omits it, so an older/lite
  // model that doesn't emit the field scores exactly as it did before rather
  // than being silently penalised.
  roleAlignment: z.coerce.number().min(0).max(1).catch(1),
});

/**
 * Step 4 of ANALYSIS_METHOD, done in code.
 *
 * The prompt tells every model to derive matchScore arithmetically from its
 * own requirementAnalysis. Measured against the live API, the flagship models
 * do exactly that (reported score == this formula, drift 0), but the lite
 * models — which the fallback chain silently drops to when a preferred model
 * is rate-limited or overloaded — produce *identical verdicts* and then report
 * a score 16 points higher, i.e. they skip the arithmetic and guess. That made
 * the headline number depend on which model happened to answer: 57 on
 * gemini-flash-latest vs 73 on gemini-3.1-flash-lite for the same resume and
 * posting. Recomputing here from the verdicts cut the cross-model spread from
 * 16 points to 3.
 *
 * The model's own matchScore is kept only as a fallback for responses that
 * lack a usable scratchpad.
 *
 * roleAlignment gates the whole thing (default 1 = no effect). skillScore
 * measures how well the skills and seniority line up; roleAlignment measures
 * whether it's even the right kind of job, and multiplies the result by
 * 0.3..1.0. So a resume that covers a wrong-occupation posting's few generic
 * requirements (skillScore high) but is from a different profession
 * (roleAlignment 0) is pulled down to ~30% of that score — which is the whole
 * point: a Software QA resume must not read as a strong match for a waiter
 * role just because both mention "customer service". A same-field resume
 * (roleAlignment 1) is unaffected, preserving every existing score.
 */
export function computeMatchScore(
  requirements: { kind: "required" | "preferred"; status: "found" | "missing" }[],
  experienceFit: number,
  roleAlignment = 1
): number {
  const coverage = (list: typeof requirements) =>
    list.length === 0 ? 1 : list.filter((r) => r.status === "found").length / list.length;

  const required = requirements.filter((r) => r.kind === "required");
  const preferred = requirements.filter((r) => r.kind === "preferred");
  const skillScore = coverage(required) * 75 + coverage(preferred) * 15 + experienceFit * 10;

  const alignment = Math.min(1, Math.max(0, roleAlignment));
  const score = skillScore * (0.3 + 0.7 * alignment);
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Parses a match-analysis response and replaces the model's self-reported
 * matchScore with one computed from its own requirement verdicts. Use this
 * instead of matchAnalysisSchema.parse() at every provider boundary so the
 * score means the same thing no matter which model produced it.
 */
export function parseMatchAnalysis(raw: unknown): MatchAnalysis {
  const parsed = matchAnalysisSchema.safeParse(raw);
  if (!parsed.success) {
    // JSON, but not the shape we asked for. Same reasoning as a parse failure:
    // it's this model's quirk, so let the chain try another one.
    throw new AiResponseFormatError(
      `Couldn't parse the AI response: ${describeZodIssues(parsed.error)}`
    );
  }
  const analysis = parsed.data;
  const scratchpad = scratchpadSchema.safeParse(raw);

  // No usable scratchpad (a model ignored the field, or returned it empty) —
  // nothing to recompute from, so keep what the model reported.
  if (!scratchpad.success) return analysis;

  return {
    ...analysis,
    matchScore: computeMatchScore(
      scratchpad.data.requirementAnalysis,
      scratchpad.data.experienceFit,
      scratchpad.data.roleAlignment
    ),
  };
}

/**
 * Reads the JSON value out of a model's reply.
 *
 * Asking for JSON does not reliably get *only* JSON. Providers with structured
 * output honour it, but the prompt-only ones (DeepSeek/GLM/xAI, and the
 * OpenRouter free models that don't advertise `structured_outputs`) routinely
 * top-and-tail the payload with prose — "Here is the analysis:", a trailing
 * "Hope this helps!", a stray <think> block — even when told not to. Parsing
 * the whole reply blindly fails on all of those.
 *
 * So: try the cheap paths first, then fall back to locating the payload.
 */
export function extractJsonPayload(raw: string): unknown {
  for (const candidate of jsonCandidates(raw)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next candidate — a brace inside prose can start a run that
      // isn't really JSON, and that's expected rather than exceptional.
    }
  }
  throw new AiResponseFormatError(
    `Couldn't parse the AI response: no JSON found in "${raw.trim().slice(0, 120)}…"`
  );
}

/** Ordered best-guess payloads, cheapest and most likely first. */
function* jsonCandidates(raw: string): Generator<string> {
  // Reasoning models sometimes inline their scratchpad. Drop it before
  // scanning, or braces *inside* the reasoning get picked up as the payload.
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ").trim();

  // 1. The whole reply — the overwhelmingly common case.
  yield text;

  // 2. Fenced blocks, in order. A model that reasons in one fence and answers
  //    in another means the first fence isn't necessarily the payload, so try
  //    each rather than only the first match.
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    yield match[1].trim();
  }

  // 3. Anything that looks like the start of a JSON value, scanned to its own
  //    balanced end. Covers prose on either side, with or without fences.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      const balanced = scanBalanced(text, i);
      if (balanced) yield balanced;
    }
  }
}

/**
 * Returns the substring from `start` to the matching close bracket, or null if
 * it never balances.
 *
 * Tracks string literals and escapes rather than just counting brackets: a
 * resume quoted inside the JSON can easily contain a `}` (or a `\"`), and a
 * naive count would cut the payload short at that character.
 */
function scanBalanced(text: string, start: number): string | null {
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}
