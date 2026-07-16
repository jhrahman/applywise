export interface Resume {
  id: string;
  profileName: string;
  parsedText: string;
  uploadedAt: number;
  fileName: string;
}

export type AiProvider = "gemini" | "openai" | "anthropic" | "deepseek" | "glm" | "xai";

export interface ProviderSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

export interface JobPosting {
  title: string;
  company: string;
  location?: string;
  description: string;
  url: string;
}

export interface SalaryInfo {
  raw: string;
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null; // ISO 4217 code, e.g. "USD", "BDT"
  period: string | null; // "year" | "month" | "hour" | etc.
}

export interface JobDetails {
  company: string | null; // AI-read fallback for sites that don't publish structured company data
  employmentType: string | null; // "Full-time" | "Part-time" | "Contract" | "Internship" | etc.
  location: string | null; // AI-read fallback for sites without structured location data
  workMode: string | null; // "Remote" | "Hybrid" | "Onsite"
  salary: SalaryInfo | null;
}

export interface MatchAnalysis {
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  missingKeywords: string[];
  atsNotes: string[];
  suggestions: string[];
  jobDetails: JobDetails;
}

export interface InterviewQA {
  question: string;
  suggestedAnswer: string;
}

export type JobStatus = "saved" | "applied" | "interviewing" | "rejected" | "offer";

export interface JobEntry {
  id: string;
  job: JobPosting;
  analysis: MatchAnalysis;
  resumeUsed: {
    id: string;
    profileName: string;
  };
  interviewQuestions?: InterviewQA[];
  status: JobStatus;
  createdAt: number;
  modelUsed?: string; // AI model that produced this analysis, e.g. "gemini-3-flash-preview"
}
