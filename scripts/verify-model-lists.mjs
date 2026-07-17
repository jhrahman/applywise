// The Setup page's model dropdown (src/pages/Setup.tsx) and the fallback chain
// (extension/src/lib/ai/fallback.ts) are separate packages that must agree:
// the chain may only ever hop to models the user could have picked, and a model
// offered as free-tier should be in the chain. Comments saying "keep in sync"
// don't survive contact with a model refresh, so this asserts it.
//
// Run: node scripts/verify-model-lists.mjs   (no API key or network needed)
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const esbuild = await import(
  pathToFileURL(join(rootDir, "extension/node_modules/esbuild/lib/main.js")).href
);
const scratch = mkdtempSync(join(tmpdir(), "applywise-models-"));

async function load(name, contents, resolveDir) {
  const out = await esbuild.build({
    // sourcefile must not collide with the module it re-exports, or esbuild
    // resolves the import back to this shim and reports an import cycle.
    stdin: { contents, resolveDir, loader: "ts", sourcefile: `__verify_entry_${name}.ts` },
    bundle: true, platform: "node", format: "esm", target: "node20", write: false,
    // setup-models.ts imports types via the app's "@/..." alias (tsconfig
    // paths), which esbuild doesn't read.
    alias: { "@": join(rootDir, "src") },
  });
  const p = join(scratch, `${name}.mjs`);
  writeFileSync(p, out.outputFiles[0].text);
  return import(pathToFileURL(p).href);
}

const { FALLBACK_MODELS } = await load(
  "fallback",
  `export { FALLBACK_MODELS } from "./fallback";`,
  join(rootDir, "extension/src/lib/ai")
);

// Setup.tsx is a React module; pull the two plain data exports out of it via a
// tiny shim rather than importing the component (and all of React) here.
const setup = await load(
  "setup",
  `export { MODELS, FALLBACK_PROVIDERS } from "./setup-models";`,
  join(rootDir, "src/pages")
);

let failures = 0;
const check = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};

// Every provider with a fallback chain must be advertised as one in the UI.
check(
  [...setup.FALLBACK_PROVIDERS].sort().join(",") === Object.keys(FALLBACK_MODELS).sort().join(","),
  `UI fallback providers match the chain registry ` +
    `(ui: ${[...setup.FALLBACK_PROVIDERS].sort()}; chain: ${Object.keys(FALLBACK_MODELS).sort()})`
);

for (const [provider, tiers] of Object.entries(FALLBACK_MODELS)) {
  const offered = new Set((setup.MODELS[provider] ?? []).map((m) => m.value));
  const chain = [...tiers.preferred, ...tiers.lite];

  const notOffered = chain.filter((m) => !offered.has(m));
  check(
    notOffered.length === 0,
    `${provider}: every model in the chain is selectable on Setup` +
      (notOffered.length ? ` — missing from dropdown: ${notOffered.join(", ")}` : "")
  );

  const notInChain = [...offered].filter((m) => !chain.includes(m));
  check(
    notInChain.length === 0,
    `${provider}: every model on Setup is in the chain` +
      (notInChain.length ? ` — absent from chain: ${notInChain.join(", ")}` : "")
  );

  const dupes = chain.filter((m, i) => chain.indexOf(m) !== i);
  check(dupes.length === 0, `${provider}: no model appears twice in the chain${dupes.length ? ` — ${dupes}` : ""}`);
}

console.log();
console.log(failures ? `${failures} check(s) FAILED` : "All checks passed.");
process.exit(failures ? 1 : 0);
