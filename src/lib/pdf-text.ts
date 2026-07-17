// Pure text-assembly logic for the PDF extractor, kept free of any pdfjs
// runtime import (and therefore of the worker/`?url` asset import) so it can
// be exercised directly by scripts/verify-pdf-extraction.mjs.

import type { TextItem } from "pdfjs-dist/types/src/display/api";

// A PDF stores no spaces or line breaks — only glyphs at coordinates. pdf.js
// reports them as text items split wherever the generator repositioned the
// cursor, which happens *inside* words: at ligatures ("Con|fl|uence",
// "e|ffi|ciency"), at kerning pairs, and at font switches. Joining items with
// a space therefore invents spaces that were never in the resume, which is
// what broke keyword matching — an ATS looking for "Confluence" or the email
// "jahidur011@gmail.com" never finds them once they're sliced apart.
//
// So the split points carry no meaning and can't be trusted; only the
// geometry can. Items are concatenated with nothing between them, and a space
// is inserted only where the glyphs are actually far enough apart on the page
// to be separate words. A ligature seam has a gap of ~0, a real word break has
// a gap near the font's space width, so the two are cleanly distinguishable.
//
// Threshold is a fraction of the font size rather than a fixed number of PDF
// units, since it has to hold for a 7pt footer and a 20pt heading alike. A
// space glyph is typically ~0.25–0.35em wide; 0.2em sits below that (so real
// spaces are caught even in tightly-set text) and well above a ligature seam.
const SPACE_GAP_RATIO = 0.2;

// Two items belong to the same line if their baselines are within this
// fraction of the font size. Superscripts and slight baseline jitter stay on
// the line; a genuine new line moves a full line-height and doesn't.
const SAME_LINE_RATIO = 0.5;

interface Placed {
  endX: number;
  baselineY: number;
  fontSize: number;
  endsWithSpace: boolean;
}

export function isTextItem(item: unknown): item is TextItem {
  return typeof item === "object" && item !== null && "str" in item;
}

/**
 * Font size in page units. transform is [a, b, c, d, e, f]; for rotated or
 * skewed text the vertical scale is the magnitude of the (c, d) column, which
 * reduces to `d` for the common upright case.
 */
function fontSizeOf(item: TextItem): number {
  const [, , c, d] = item.transform;
  const size = Math.hypot(c, d);
  return size > 0 ? size : item.height || 10;
}

export function extractPageText(items: TextItem[]): string {
  let out = "";
  let prev: Placed | null = null;

  for (const item of items) {
    // pdf.js emits zero-width marker items purely to signal line ends.
    if (!item.str) {
      if (item.hasEOL) {
        out += "\n";
        prev = null;
      }
      continue;
    }

    const x = item.transform[4];
    const baselineY = item.transform[5];
    const fontSize = fontSizeOf(item);

    if (prev) {
      const sameLine = Math.abs(baselineY - prev.baselineY) <= prev.fontSize * SAME_LINE_RATIO;
      if (!sameLine) {
        out += "\n";
      } else if (!prev.endsWithSpace && !/^\s/.test(item.str)) {
        // A missing/zero width (some generators omit it) collapses this to
        // `x - prevX`, which is positive for any following glyph — so the
        // degenerate case falls back to inserting a space, i.e. the old
        // behavior, rather than fusing two words together.
        const gap = x - prev.endX;
        if (gap > Math.max(prev.fontSize, fontSize) * SPACE_GAP_RATIO) out += " ";
      }
    }

    out += item.str;
    prev = {
      endX: x + item.width,
      baselineY,
      fontSize,
      endsWithSpace: /\s$/.test(item.str),
    };

    if (item.hasEOL) {
      out += "\n";
      prev = null;
    }
  }

  return out;
}

/** Trailing spaces and runs of blank lines from page layout are noise to the model. */
export function tidyResumeText(pages: string[]): string {
  return pages
    .join("\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
