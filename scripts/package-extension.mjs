// Builds the browser extension and zips it into public/applywise-extension.zip
// so the Setup page's "Download extension" button always ships whatever was
// last pushed — this runs as part of `npm run build`, so a fresh zip is
// produced on every Vercel deploy, never a stale one baked in ahead of time.
import { execSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ZipArchive } from "archiver";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const extensionDir = path.join(rootDir, "extension");
const extensionDistDir = path.join(extensionDir, "dist");
const publicDir = path.join(rootDir, "public");
const zipPath = path.join(publicDir, "applywise-extension.zip");

function run(command, cwd) {
  console.log(`$ ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

if (!existsSync(path.join(extensionDir, "node_modules"))) {
  run("npm install", extensionDir);
}
run("npm run build", extensionDir);

if (!existsSync(extensionDistDir)) {
  throw new Error(`Extension build did not produce ${extensionDistDir}`);
}

mkdirSync(publicDir, { recursive: true });
rmSync(zipPath, { force: true });

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });

  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);

  // Nest everything under one folder so unzipping doesn't spill loose files
  // into the user's Downloads — they select "applywise-extension" as the
  // unpacked folder, mirroring the extension/dist README instructions.
  archive.directory(extensionDistDir, "applywise-extension");
  archive.finalize();
});

console.log(`Packaged extension -> ${path.relative(rootDir, zipPath)}`);
