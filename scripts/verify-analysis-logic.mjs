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
