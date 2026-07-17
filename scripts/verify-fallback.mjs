// Drives the fallback chain (ai/fallback.ts) against stubbed attempts, so the
// decision logic can be checked exactly and without a network or an API key:
// which model is tried, in what order, and when the chain stops.
//
// scripts/verify-openrouter.mjs proves the same thing against the live API but
// can only test the failures the API happens to be producing that day. This
// covers the ones that matter and are hard to provoke on demand — above all a
// model returning an unusable body, which used to abort the whole analysis on
// the first model instead of moving to the next.
//
// Run: node scripts/verify-fallback.mjs
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
      export { withModelFallback, isRetryableAiError, buildModelOrder } from "./fallback";
      export { AiRequestError, AiResponseFormatError } from "./client";
    `,
    resolveDir: join(rootDir, "extension/src/lib/ai"),
    loader: "ts",
    sourcefile: "__verify_entry_fallback.ts",
  },
  bundle: true, platform: "node", format: "esm", target: "node20", write: false,
});
const p = join(mkdtempSync(join(tmpdir(), "applywise-fallback-")), "fallback.mjs");
writeFileSync(p, out.outputFiles[0].text);
const { withModelFallback, isRetryableAiError, AiRequestError, AiResponseFormatError } =
  await import(pathToFileURL(p).href);

let failures = 0;
const check = (ok, msg, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${detail ? `\n      ${detail}` : ""}`);
};

const settings = (over = {}) => ({
  provider: "openrouter", apiKey: "k", model: "tencent/hy3:free", fallbackEnabled: true, ...over,
});

/** Runs the chain, recording every model tried. `behaviour` decides each outcome. */
async function run(s, behaviour) {
  const tried = [];
  try {
    const { result, modelUsed } = await withModelFallback(
      s,
      async (attemptSettings) => {
        tried.push(attemptSettings.model);
        return behaviour(attemptSettings.model, tried.length);
      },
      () => {}
    );
    return { tried, result, modelUsed };
  } catch (err) {
    return { tried, err };
  }
}

const RATE_LIMITED = () => { throw new AiRequestError("OpenRouter rate limit reached (429). busy"); };

// --- the regression this file exists for ------------------------------------
// A prompt-only model answering "Here is the analysis: {...}" used to throw a
// bare SyntaxError, which the chain didn't recognise as retryable — so it gave
// up on model 1 of 6 even though model 2 would have answered fine.
{
  const { tried, modelUsed, err } = await run(settings(), (_m, n) => {
    if (n === 1) throw new AiResponseFormatError("Couldn't parse the AI response: no JSON found");
    return { matchScore: 70 };
  });
  check(
    !err && tried.length === 2 && modelUsed === "nvidia/nemotron-3-ultra-550b-a55b:free",
    "an unparseable response hops to the next model instead of failing the analysis",
    `tried: ${tried.join(" -> ")}`
  );
}
check(
  isRetryableAiError(new AiResponseFormatError("x")),
  "AiResponseFormatError is classified retryable"
);

// A schema-shaped failure (valid JSON, wrong fields) behaves the same way.
{
  const { tried, err } = await run(settings(), (_m, n) => {
    if (n <= 2) throw new AiResponseFormatError("Couldn't parse the AI response: matchScore: expected number");
    return { matchScore: 70 };
  });
  check(!err && tried.length === 3, "consecutive malformed responses keep walking the chain", `tried ${tried.length}`);
}

// --- order and exhaustion ---------------------------------------------------
{
  const { tried, err } = await run(settings(), RATE_LIMITED);
  check(
    !!err && tried.length === 6,
    "every model is tried before giving up, lite last",
    `tried: ${tried.join(" -> ")}`
  );
  check(
    tried[0] === "tencent/hy3:free" && tried.at(-1) === "openai/gpt-oss-20b:free",
    "configured model leads; smallest model is the last resort"
  );
  check(err instanceof AiRequestError, "the final error surfaces to the caller");
}

// --- the toggle -------------------------------------------------------------
{
  const { tried, err } = await run(settings({ fallbackEnabled: false }), RATE_LIMITED);
  check(
    !!err && tried.length === 1,
    "toggle off: a retryable error still stops at the configured model",
    `tried: ${tried.join(" -> ")}`
  );
}
{
  const { tried, modelUsed } = await run(settings({ fallbackEnabled: false }), () => ({ matchScore: 70 }));
  check(
    tried.length === 1 && modelUsed === "tencent/hy3:free",
    "toggle off: a success is attributed to the model the user picked"
  );
}

// --- providers with nothing to fall back to ---------------------------------
{
  const { tried } = await run(
    settings({ provider: "anthropic", model: "claude-sonnet-5" }),
    RATE_LIMITED
  );
  check(tried.length === 1, "paid provider never hops (no free models to hop to)", `tried: ${tried.join(", ")}`);
}

// --- errors that another model can't fix ------------------------------------
{
  const { tried } = await run(settings(), () => {
    throw new AiRequestError("OpenRouter API error 401: User not found.");
  });
  check(tried.length === 1, "a bad API key fails fast rather than burning the chain");
}

// --- a model the user typed by hand still leads -----------------------------
{
  const { tried, modelUsed } = await run(settings({ model: "some/custom-model" }), (_m, n) => {
    if (n === 1) throw new AiRequestError("OpenRouter rate limit reached (429). busy");
    return { matchScore: 70 };
  });
  check(
    tried[0] === "some/custom-model" && tried.length === 2 && modelUsed !== "some/custom-model",
    "a custom model ID leads the chain, then falls back to the known list",
    `tried: ${tried.join(" -> ")}`
  );
}

console.log();
console.log(failures ? `${failures} check(s) FAILED` : "All checks passed.");
process.exit(failures ? 1 : 0);
