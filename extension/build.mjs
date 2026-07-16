import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

cpSync("manifest.json", "dist/manifest.json");
cpSync("icons", "dist/icons", { recursive: true });
cpSync("src/popup/popup.html", "dist/popup.html");

const shared = {
  outdir: "dist",
  bundle: true,
  target: "chrome110",
  sourcemap: true,
  logLevel: "info",
};

// MV3 background service workers support "type": "module".
const backgroundOptions = {
  ...shared,
  entryPoints: { background: "src/background/background.ts" },
  format: "esm",
};

// Content scripts and popup pages run as classic scripts.
const classicOptions = {
  ...shared,
  entryPoints: {
    "content-script": "src/content/content-script.ts",
    "app-bridge": "src/content/app-bridge.ts",
    popup: "src/popup/popup.ts",
  },
  format: "iife",
};

if (watch) {
  const [bgCtx, classicCtx] = await Promise.all([
    esbuild.context(backgroundOptions),
    esbuild.context(classicOptions),
  ]);
  await Promise.all([bgCtx.watch(), classicCtx.watch()]);
  console.log("Watching for changes...");
} else {
  await Promise.all([esbuild.build(backgroundOptions), esbuild.build(classicOptions)]);
}
