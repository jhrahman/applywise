import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { extractPageText, isTextItem, tidyResumeText } from "./pdf-text";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// A real resume is a page or two of text. This is a generous ceiling that
// still protects the AI provider call from an oversized/malformed PDF
// blowing through a per-minute token quota in one request.
const MAX_RESUME_CHARS = 20_000;

export async function extractTextFromPdf(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // Normalization (the default) folds ligature codepoints like "ﬂ" into
    // plain "fl" — necessary but not sufficient on its own, since it can't do
    // anything about a word split across separate text items. See pdf-text.ts.
    const content = await page.getTextContent();
    pages.push(extractPageText(content.items.filter(isTextItem)));
  }

  const text = tidyResumeText(pages);
  return text.length > MAX_RESUME_CHARS ? text.slice(0, MAX_RESUME_CHARS) + " …[truncated]" : text;
}
