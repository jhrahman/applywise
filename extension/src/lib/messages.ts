import type { AiProvider, JobEntry, JobPosting } from "./types";
import type { LiveModel } from "./ai/list-models";

export type ExtensionMessage =
  | { type: "GET_RESUMES" }
  | { type: "ANALYZE"; job: JobPosting; resumeId: string }
  | { type: "GENERATE_INTERVIEW_QUESTIONS"; jobId: string }
  | { type: "LIST_MODELS"; provider: AiProvider };

export type ListModelsResponse =
  | { ok: true; models: LiveModel[] }
  | { ok: false; error: string };

export interface GetResumesResponse {
  resumes: { id: string; profileName: string }[];
  hasApiKey: boolean;
}

export type AnalyzeResponse =
  | { ok: true; jobId: string }
  | { ok: false; error: string };

export type GenerateInterviewQuestionsResponse =
  | { ok: true; entry: JobEntry }
  | { ok: false; error: string };

// Pushed from the background service worker to the originating tab while an
// analysis is in flight (not a request/response — no reply expected). Lets
// the floating widget show real progress (which model is being tried, and
// whether a fallback kicked in) instead of a generic "Analyzing…" the whole
// time.
export interface AnalyzeProgressMessage {
  type: "ANALYZE_PROGRESS";
  text: string;
}
