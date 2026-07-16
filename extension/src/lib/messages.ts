import type { JobEntry, JobPosting } from "./types";

export type ExtensionMessage =
  | { type: "GET_RESUMES" }
  | { type: "ANALYZE"; job: JobPosting; resumeId: string }
  | { type: "GENERATE_INTERVIEW_QUESTIONS"; jobId: string };

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
