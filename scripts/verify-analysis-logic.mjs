// Guards the scoring pipeline in ai/schema.ts — the part that turns a model's
// requirement verdicts into the headline matchScore. No API key or network
// needed; it feeds the parser hand-built responses.
//
// Worth having as a test rather than trusting review: every enum in that file
// is paired with `.catch()`, so a value the parser doesn't recognise is
// swallowed and replaced with a default instead of throwing. A regression here
// produces a plausible-looking wrong number and no error at all.
//
// Run: node scripts/verify-analysis-logic.mjs
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const esbuild = await import(
  pathToFileURL(join(rootDir, "extension/node_modules/esbuild/lib/main.js")).href
);

const out = await esbuild.build({
  stdin: {
    contents: `
      export { parseMatchAnalysis, parseInterviewQuestions, computeMatchScore, extractJsonPayload } from "./schema";
      export { AiResponseFormatError } from "./client";
    `,
    resolveDir: join(rootDir, "extension/src/lib/ai"),
    loader: "ts",
    sourcefile: "__verify_entry_schema.ts",
  },
  bundle: true, platform: "node", format: "esm", target: "node20", write: false,
});
const p = join(mkdtempSync(join(tmpdir(), "applywise-schema-")), "schema.mjs");
writeFileSync(p, out.outputFiles[0].text);
const {
  parseMatchAnalysis, parseInterviewQuestions, computeMatchScore, extractJsonPayload,
  AiResponseFormatError,
} = await import(pathToFileURL(p).href);

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

const shell = {
  matchScore: 90,
  matchingSkills: [], missingSkills: [], missingKeywords: [], atsNotes: [], suggestions: [],
  jobDetails: { company: null, employmentType: null, location: null, workMode: null, salary: null },
};
const reqs = (kind, status, n = 2) =>
  Array.from({ length: n }, (_, i) => ({ requirement: `r${i}`, kind, status, resumeEvidence: "x" }));

// --- the score is recomputed from the verdicts, not taken from the model ----
check(
  parseMatchAnalysis({ ...shell, requirementAnalysis: reqs("required", "found"), experienceFit: 1 })
    .matchScore === 100,
  "all requirements found + experience fits => 100 (model's own 90 is overridden)"
);
check(
  parseMatchAnalysis({ ...shell, requirementAnalysis: reqs("required", "missing"), experienceFit: 0 })
    .matchScore === 15,
  "no requirement met, experience below => 15 (preferred list empty counts as covered)"
);

// --- jobDetails: new experienceRequired / benefits fields are resilient -----
// A prompt-only model that omits them (the `shell` above has neither) must
// still parse — `.catch` degrades them to "not stated" rather than throwing an
// AiResponseFormatError that would burn a fallback attempt.
{
  const parsed = parseMatchAnalysis({
    ...shell,
    requirementAnalysis: reqs("required", "found"),
    experienceFit: 1,
  });
  check(parsed.jobDetails.experienceRequired === null, "missing experienceRequired defaults to null");
  check(Array.isArray(parsed.jobDetails.benefits) && parsed.jobDetails.benefits.length === 0, "missing benefits defaults to []");
}
{
  const parsed = parseMatchAnalysis({
    ...shell,
    jobDetails: { ...shell.jobDetails, experienceRequired: "3-5 years", benefits: ["Provident fund", "Gym membership"] },
    requirementAnalysis: reqs("required", "found"),
    experienceFit: 1,
  });
  check(parsed.jobDetails.experienceRequired === "3-5 years", "experienceRequired passes through when stated");
  check(parsed.jobDetails.benefits.join(",") === "Provident fund,Gym membership", "benefits pass through when stated");
}
{
  // A wrong-typed benefits value (model emitted a string, not an array) must
  // not fail the whole analysis — it degrades to [].
  const parsed = parseMatchAnalysis({
    ...shell,
    jobDetails: { ...shell.jobDetails, benefits: "Provident fund, Gym" },
    requirementAnalysis: reqs("required", "found"),
    experienceFit: 1,
  });
  check(Array.isArray(parsed.jobDetails.benefits) && parsed.jobDetails.benefits.length === 0, "wrong-typed benefits degrades to [] instead of throwing");
}
{
  // A "Negotiable"/unspecified salary that a weaker model returns as an object
  // with raw:null (verified live: Cohere's command-r7b does this every time)
  // must NOT crash the whole analysis. Before salaryInfoSchema got .catch(null)
  // this threw an AiResponseFormatError and discarded every other field the
  // model got right. It must degrade to salary:null instead.
  const parsed = parseMatchAnalysis({
    ...shell,
    jobDetails: {
      ...shell.jobDetails,
      salary: { raw: null, minAmount: null, maxAmount: null, currency: null, period: null },
    },
    requirementAnalysis: reqs("required", "found"),
    experienceFit: 1,
  });
  check(parsed.jobDetails.salary === null, "salary object with raw:null degrades to null instead of throwing away the whole analysis");
  check(parsed.matchScore === 100, "…and the rest of the analysis (score, skills, notes) survives intact");
}
{
  // A well-formed salary must still pass through untouched — the catch only
  // rescues malformed ones.
  const parsed = parseMatchAnalysis({
    ...shell,
    jobDetails: {
      ...shell.jobDetails,
      salary: { raw: "$90k-$110k / year", minAmount: 90000, maxAmount: 110000, currency: "USD", period: "year" },
    },
    requirementAnalysis: reqs("required", "found"),
    experienceFit: 1,
  });
  check(parsed.jobDetails.salary?.raw === "$90k-$110k / year", "a well-formed salary still passes through unchanged");
}

// --- casing/padding must not change the score ------------------------------
// A model writing "Found" instead of "found" used to hit `.catch("missing")`,
// inverting every verdict and dropping a perfect candidate from 100 to 25 —
// silently, since `.catch` never throws.
for (const [label, kind, status] of [
  ["Capitalised", "Required", "Found"],
  ["UPPERCASE", "REQUIRED", "FOUND"],
  ["padded", " required ", " found "],
]) {
  const score = parseMatchAnalysis({
    ...shell, requirementAnalysis: reqs(kind, status), experienceFit: 1,
  }).matchScore;
  check(score === 100, `${label} verdicts score the same as lowercase (got ${score}, want 100)`);
}

// --- a genuinely unusable verdict still falls back safely -------------------
check(
  parseMatchAnalysis({
    ...shell, requirementAnalysis: reqs("required", "banana"), experienceFit: 1,
  }).matchScore === 25,
  "an unrecognisable status is still treated as missing (fail-safe, not fail-open)"
);

// --- no scratchpad => keep the model's own score ----------------------------
check(
  parseMatchAnalysis({ ...shell }).matchScore === 90,
  "response without a scratchpad keeps the model's self-reported score"
);
check(
  parseMatchAnalysis({ ...shell, requirementAnalysis: [], experienceFit: 1 }).matchScore === 90,
  "empty scratchpad keeps the model's self-reported score"
);

// --- formula shape ----------------------------------------------------------
check(
  computeMatchScore([{ kind: "required", status: "found" }, { kind: "preferred", status: "missing" }], 1) === 85,
  "required coverage weighs more than preferred (75/15/10 split)"
);
check(computeMatchScore([], 1) === 100, "a posting with no parsed requirements doesn't crash");

// --- roleAlignment gates a wrong-occupation match ---------------------------
// The waiter-vs-QA case: a sparse posting whose few generic requirements the
// resume happens to cover (high skillScore) must NOT score high when the
// resume is for a different profession. roleAlignment 0 multiplies by 0.3.
check(
  computeMatchScore([{ kind: "required", status: "found" }], 1, 1) === 100,
  "same-field role (alignment 1) is unaffected — existing scores preserved"
);
check(
  computeMatchScore([{ kind: "required", status: "found" }], 1, 0) === 30,
  "wrong-occupation match (alignment 0) is gated down to ~30% (100 -> 30)"
);
check(
  computeMatchScore([{ kind: "required", status: "found" }], 1, 0.5) === 65,
  "adjacent/transferable field (alignment 0.5) is moderately reduced (100 -> 65)"
);
check(
  computeMatchScore([{ kind: "required", status: "found" }], 1) === 100,
  "roleAlignment defaults to 1 when omitted (backward compatible)"
);
// End to end through the parser: the scratchpad carries roleAlignment.
check(
  parseMatchAnalysis({
    ...shell, requirementAnalysis: reqs("required", "found"), experienceFit: 1, roleAlignment: 0,
  }).matchScore === 30,
  "parser applies roleAlignment from the scratchpad (all-found + wrong field => 30, not 100)"
);
check(
  parseMatchAnalysis({
    ...shell, requirementAnalysis: reqs("required", "found"), experienceFit: 1,
  }).matchScore === 100,
  "a scratchpad without roleAlignment still scores as before (defaults to 1)"
);

// --- response envelope ------------------------------------------------------
// Asking for JSON doesn't reliably get only JSON: the prompt-only models
// (DeepSeek/GLM/xAI and the OpenRouter free models without structured output)
// wrap it in prose. Each shape below was produced or observed in practice.
const PAYLOAD = '{"matchScore":70}';
const envelopes = [
  ["bare JSON", PAYLOAD],
  ["fenced json", "```json\n" + PAYLOAD + "\n```"],
  ["unlabelled fence", "```\n" + PAYLOAD + "\n```"],
  ["prose before", "Here is the analysis you asked for:\n" + PAYLOAD],
  ["prose before and after", "Sure! Result:\n" + PAYLOAD + "\nHope that helps!"],
  ["prose then fence", "Here you go:\n```json\n" + PAYLOAD + "\n```\nLet me know."],
  ["<think> block first", "<think>Resume mentions {braces}.</think>\n" + PAYLOAD],
  ["prose containing a brace", "Note: use {curly} carefully.\nAnswer: " + PAYLOAD],
];
for (const [label, raw] of envelopes) {
  let ok = false;
  try { ok = extractJsonPayload(raw).matchScore === 70; } catch { ok = false; }
  check(ok, `extracts payload — ${label}`);
}

// A closing brace inside a string must not end the scan early.
check(
  extractJsonPayload('Answer: {"atsNotes":["uses } and \\" oddly"],"matchScore":70}').matchScore === 70,
  "braces and escaped quotes inside strings don't truncate the payload"
);
check(
  extractJsonPayload('Questions:\n[{"question":"q","source":"job","suggestedAnswer":"a"}]').length === 1,
  "array payloads (interview questions) extract from prose too"
);
check(
  parseInterviewQuestions([{ question: "q", source: "Resume", suggestedAnswer: "a" }])[0].source === "resume",
  "interview question source tolerates casing drift"
);

// --- unusable responses are typed so the fallback chain can retry them ------
const throws = (fn) => { try { fn(); return null; } catch (e) { return e; } };
check(
  throws(() => extractJsonPayload("I'm sorry, I can't help with that.")) instanceof AiResponseFormatError,
  "a reply with no JSON at all throws AiResponseFormatError"
);
check(
  throws(() => parseMatchAnalysis({ matchScore: "not a number" })) instanceof AiResponseFormatError,
  "JSON in the wrong shape throws AiResponseFormatError (match analysis)"
);
check(
  throws(() => parseInterviewQuestions([{ question: 5 }])) instanceof AiResponseFormatError,
  "JSON in the wrong shape throws AiResponseFormatError (interview questions)"
);
check(
  /Couldn't parse the AI response/.test(throws(() => extractJsonPayload("nope")).message),
  "the error message stays readable for the UI"
);

console.log();
console.log(failures ? `${failures} check(s) FAILED` : "All checks passed.");
process.exit(failures ? 1 : 0);
