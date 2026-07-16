import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

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
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  const text = pages.join("\n\n").trim();
  return text.length > MAX_RESUME_CHARS ? text.slice(0, MAX_RESUME_CHARS) + " …[truncated]" : text;
}
