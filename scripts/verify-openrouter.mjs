// Live end-to-end check of the OpenRouter provider and the fallback strategy,
// exercising the real shipped modules (ai/openrouter.ts, ai/fallback.ts) rather
// than a reimplementation — bundled with esbuild since they're TypeScript.
//
// Needs a key; it is read from the environment and never written to disk:
//   OPENROUTER_API_KEY=sk-or-... node scripts/verify-openrouter.mjs
//
// Free models are genuinely rate-limited from time to time, so a FAIL here is
// not automatically a code defect — read the message. That flakiness is the
// whole reason the fallback chain exists, and case 2 below turns it into the
// thing under test.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const aiDir = join(rootDir, "extension/src/lib/ai");
const esbuild = await import(
  pathToFileURL(join(rootDir, "extension/node_modules/esbuild/lib/main.js")).href
);

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("Set OPENROUTER_API_KEY. The key is read from the env and never stored.");
  process.exit(2);
}

const ENTRY = `
  export { createOpenRouterClient } from "./openrouter";
  export { withModelFallback, buildModelOrder, isRetryableAiError, FALLBACK_MODELS } from "./fallback";
`;

const bundled = await esbuild.build({
  stdin: { contents: ENTRY, resolveDir: aiDir, loader: "ts", sourcefile: "entry.ts" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  write: false,
});
const outPath = join(mkdtempSync(join(tmpdir(), "applywise-or-")), "ai.mjs");
writeFileSync(outPath, bundled.outputFiles[0].text);
const ai = await import(pathToFileURL(outPath).href);

const RESUME = `Md Jahidur Rahman — jahidur011@gmail.com
Technical Support Associate — Software QA & Tech Support, Jamuna Television (2022-2025)
- Wrote and executed manual test cases; logged defects in Jira and tracked them to closure.
- Documented QA runbooks and release checklists in Confluence.
- Automated regression smoke checks with Selenium and Python.
Skills: Manual testing, test case design, Selenium, Python, SQL, Jira, Confluence, Postman, REST API testing, Git.`;

const JOB = {
  title: "Software Quality Assurance Engineer",
  company: "Acme Corp",
  location: "Remote",
  description: `Requirements: 3+ years software QA; manual testing and test case design;
Selenium and Python automation; API testing (Postman); SQL; Jira and Confluence.
Preferred: CI/CD with Jenkins or GitHub Actions; performance testing with JMeter.`,
  url: "https://example.com/job/1",
};

const analyze = (settings) =>
  ai.createOpenRouterClient(settings.apiKey, settings.model).generateMatchAnalysis(RESUME, JOB);

let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `\n      ${detail}` : ""}`);
};

// -- 1. Model order: strongest first, lite last, configured model always leads.
const order = ai.buildModelOrder({
  provider: "openrouter",
  apiKey,
  model: "tencent/hy3:free",
  fallbackEnabled: true,
});
check(
  "chain leads with the configured model, then strongest-first, lite last",
  order[0] === "tencent/hy3:free" &&
    order[order.length - 1] === "openai/gpt-oss-20b:free" &&
    order.length === 6,
  order.join(" -> ")
);

// -- 2. Fallback ON, starting from a model that is reliably rate-limited
// upstream. The chain must hop off it and return a real analysis from a
// different model. This is the core promise of the feature.
{
  const attempts = [];
  const settings = {
    provider: "openrouter",
    apiKey,
    model: "google/gemma-4-31b-it:free",
    fallbackEnabled: true,
  };
  try {
    const { result, modelUsed } = await ai.withModelFallback(settings, analyze, (i) =>
      attempts.push(i.model)
    );
    check(
      "fallback ON: hops off a rate-limited model and still returns an analysis",
      modelUsed !== settings.model && typeof result.matchScore === "number",
      `tried: ${attempts.join(" -> ")}\n      answered by ${modelUsed}, score=${result.matchScore}`
    );
  } catch (err) {
    check(
      "fallback ON: hops off a rate-limited model and still returns an analysis",
      false,
      `tried: ${attempts.join(" -> ")}\n      ${err.message}`
    );
  }
}

// -- 3. Fallback OFF: exactly one model is ever called, so an explicit model
// choice is never silently answered by a different one.
{
  const attempts = [];
  const settings = {
    provider: "openrouter",
    apiKey,
    model: "google/gemma-4-31b-it:free",
    fallbackEnabled: false,
  };
  try {
    const { modelUsed } = await ai.withModelFallback(settings, analyze, (i) => attempts.push(i.model));
    check(
      "fallback OFF: only the configured model is ever called",
      attempts.length === 1 && modelUsed === settings.model,
      `tried: ${attempts.join(" -> ")}`
    );
  } catch (err) {
    // A rate-limited failure is the expected shape here: it must surface
    // rather than silently hop, even though the same error would trigger a hop
    // with the toggle on.
    check(
      "fallback OFF: only the configured model is ever called, error surfaces",
      attempts.length === 1 && ai.isRetryableAiError(err),
      `tried: ${attempts.join(" -> ")}\n      surfaced: ${err.message.slice(0, 90)}…`
    );
  }
}

// -- 4. A non-retryable error (bad key) must not burn through the whole chain.
{
  const attempts = [];
  try {
    await ai.withModelFallback(
      { provider: "openrouter", apiKey: "sk-or-v1-invalid", model: "tencent/hy3:free", fallbackEnabled: true },
      analyze,
      (i) => attempts.push(i.model)
    );
    check("bad API key fails fast instead of trying every model", false, "unexpectedly succeeded");
  } catch (err) {
    check(
      "bad API key fails fast instead of trying every model",
      attempts.length === 1,
      `tried ${attempts.length} model(s): ${err.message.slice(0, 90)}…`
    );
  }
}

console.log();
console.log(failures ? `${failures} check(s) FAILED` : "All checks passed.");
process.exit(failures ? 1 : 0);
