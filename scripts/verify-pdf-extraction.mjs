// Verifies the resume PDF text extractor against a PDF that reproduces the
// real bug: words split into separate text items at ligature/kerning seams,
// exactly as the reported CV was ("Con fl uence", "jahidu r011@gmail.com").
//
// The fixture is generated here rather than committed as a binary so the
// geometry under test is explicit and auditable: every run is placed at an
// absolute Tm, with intra-word seams at a gap of exactly 0 and real word
// breaks at a true Helvetica space advance.
//
// The split is forced with a font switch (`Tf`), not merely by using separate
// Tj operators: pdf.js concatenates consecutive same-font runs back into one
// item, so contiguous Tj's alone do NOT reproduce the bug. A font change makes
// it flush the item mid-word, which is what real CVs hit — ligature glyphs are
// routinely drawn from a second subsetted font, splitting "Confluence" into
// "Con" + "fl" + "uence" across F1/F2/F1.
//
// Run against the built-in fixture:
//   node scripts/verify-pdf-extraction.mjs
// Or against a real resume, to see the old/new extraction side by side:
//   node scripts/verify-pdf-extraction.mjs "path/to/resume.pdf"

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "vite";

// ---------------------------------------------------------------- fixture --

// Standard AFM advance widths (units/1000em) for the glyphs used below.
// Exact widths are what make a zero-gap seam truly zero.
const WIDTHS = {
  1: {
    // Helvetica
    " ": 278, "@": 1015, ".": 278, "-": 333, _digit: 556,
    C: 722, E: 667, S: 667, W: 944,
    a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222,
    j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333,
    s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  },
  2: {
    // Times-Roman
    " ": 250, "@": 921, ".": 250, "-": 333, _digit: 500,
    C: 667, E: 611, S: 556, W: 944,
    a: 444, b: 500, c: 444, d: 500, e: 444, f: 333, g: 500, h: 500, i: 278,
    j: 278, k: 500, l: 278, m: 778, n: 500, o: 500, p: 500, q: 500, r: 333,
    s: 389, t: 278, u: 500, v: 500, w: 722, x: 500, y: 500, z: 444,
  },
};

const advance = (text, size, font = 1) => {
  const table = WIDTHS[font];
  return (
    [...text].reduce(
      (sum, ch) => sum + (table[ch] ?? (/\d/.test(ch) ? table._digit : table._digit)),
      0
    ) / 1000 * size
  );
};

const FONT_SIZE = 12;

// Each line is a list of runs. A run marked `space: true` is preceded by a
// real word gap (one space advance); every other run butts directly against
// its predecessor with zero gap — the ligature/kerning seam case. `f: 2` draws
// the run from the second font, forcing pdf.js to emit it as its own item.
const LINES = [
  [{ t: "Con" }, { t: "fl", f: 2 }, { t: "uence" }, { t: "administration", space: true }],
  [{ t: "jahidu" }, { t: "r011@gmail.com", f: 2 }],
  [{ t: "e" }, { t: "ffi", f: 2 }, { t: "ciency" }, { t: "gains", space: true }],
  [
    { t: "work" }, { t: "fl", f: 2 }, { t: "ows" },
    { t: "signi", space: true }, { t: "fi", f: 2 }, { t: "cantly" },
  ],
];

const EXPECTED = [
  "Confluence administration",
  "jahidur011@gmail.com",
  "efficiency gains",
  "workflows significantly",
];

function buildContentStream() {
  const ops = ["BT"];
  let y = 720;
  for (const runs of LINES) {
    let x = 72;
    for (const run of runs) {
      const font = run.f ?? 1;
      if (run.space) x += advance(" ", FONT_SIZE, font);
      ops.push(
        `/F${font} ${FONT_SIZE} Tf`,
        `1 0 0 1 ${x.toFixed(3)} ${y} Tm`,
        `(${run.t}) Tj`
      );
      x += advance(run.t, FONT_SIZE, font);
    }
    y -= 24;
  }
  ops.push("ET");
  return ops.join("\n");
}

function buildPdf() {
  const content = buildContentStream();
  // F2 must be a *differently named* font, not just a second font object:
  // pdf.js only flushes its accumulated item when font.name actually changes
  // (see buildTextContentItem in pdf.worker.mjs), which is what makes a real
  // resume's ligature subset break a word into separate items.
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

// ------------------------------------------------------------------ runner --

const scratch = mkdtempSync(join(tmpdir(), "applywise-pdf-"));

// Compile the real pdf-text.ts so this exercises shipped code, not a copy.
await build({
  configFile: false,
  logLevel: "error",
  build: {
    lib: { entry: "src/lib/pdf-text.ts", formats: ["es"], fileName: () => "pdf-text.mjs" },
    outDir: scratch,
    emptyOutDir: false,
    minify: false,
    rollupOptions: { external: [/^pdfjs-dist/] },
  },
});
const { extractPageText, isTextItem, tidyResumeText } = await import(
  pathToFileURL(join(scratch, "pdf-text.mjs")).href
);

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
).href;

const realPdf = process.argv[2];
const pdfPath = realPdf ?? join(scratch, "fixture.pdf");
if (!realPdf) writeFileSync(pdfPath, buildPdf());

const doc = await pdfjsLib.getDocument({
  data: new Uint8Array(readFileSync(pdfPath)),
  useSystemFonts: false,
  standardFontDataUrl: pathToFileURL(
    join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/")
  ).href,
}).promise;

const oldPages = [];
const newPages = [];
let itemCount = 0;
for (let n = 1; n <= doc.numPages; n++) {
  const content = await (await doc.getPage(n)).getTextContent();
  const items = content.items.filter(isTextItem);
  itemCount += items.length;
  // The old implementation, verbatim from git history, for a side-by-side.
  oldPages.push(content.items.map((i) => ("str" in i ? i.str : "")).join(" "));
  newPages.push(extractPageText(items));
}
const oldText = oldPages.join("\n\n").trim();
const newText = tidyResumeText(newPages);

console.log(`${realPdf ? "resume" : "fixture"}: ${pdfPath}`);
console.log(`${doc.numPages} page(s), ${itemCount} text items\n`);

if (realPdf) {
  // Safety invariant: with all whitespace removed the two must be identical.
  // That proves the new extractor only ever *moves* whitespace — it never drops
  // a character or fuses two words into one, which is the main risk of joining
  // items with nothing instead of a space.
  const strip = (s) => s.replace(/\s+/g, "");
  console.log(
    strip(oldText) === strip(newText)
      ? "Character-identical to the old output ignoring whitespace — nothing dropped or fused."
      : "WARNING: new output differs from old beyond whitespace — inspect before trusting."
  );

  // Show every token the old code split but the new code keeps whole.
  const newTokens = new Set(newText.split(/\s+/).filter(Boolean));
  const repaired = [...newTokens].filter((t) => t.length > 3 && !oldText.includes(t)).sort();
  console.log(`\nTokens the OLD extractor broke, now intact (${repaired.length}):`);
  for (const t of repaired.slice(0, 40)) console.log("  " + JSON.stringify(t));
  if (repaired.length > 40) console.log(`  …and ${repaired.length - 40} more`);

  console.log("\n--- NEW extracted text ---");
  console.log(newText);
  process.exit(0);
}

let failed = 0;
for (const expected of EXPECTED) {
  const ok = newText.includes(expected);
  const regressed = oldText.includes(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${JSON.stringify(expected)}` +
      (ok && !regressed ? "   (old output missed this)" : "")
  );
}

console.log();
if (failed) {
  console.log(`${failed}/${EXPECTED.length} expectations FAILED`);
  process.exit(1);
}
console.log(`All ${EXPECTED.length} expectations passed.`);
