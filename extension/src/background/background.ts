import { getItem, setItem, STORAGE_KEYS } from "../lib/storage";
import { APP_URL } from "../lib/config";
import { getAiClient, AiRequestError } from "../lib/ai";
import { withModelFallback, type AttemptInfo } from "../lib/ai/fallback";
import { browserApi } from "../lib/browser-api";
import type { Resume, ProviderSettings, JobEntry, JobPosting } from "../lib/types";
import type {
  ExtensionMessage,
  GetResumesResponse,
  AnalyzeResponse,
  AnalyzeProgressMessage,
  GenerateInterviewQuestionsResponse,
} from "../lib/messages";

const DEFAULT_SETTINGS: ProviderSettings = {
  provider: "gemini",
  apiKey: "",
  model: "gemini-3-flash-preview",
  fallbackEnabled: true,
};

/** Single place settings are read, so the fallback default is applied uniformly. */
function loadSettings(): Promise<ProviderSettings> {
  return getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS);
}

browserApi.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === "GET_RESUMES") {
    handleGetResumes().then(sendResponse);
    return true;
  }
  if (message.type === "ANALYZE") {
    handleAnalyze(message.resumeId, message.job, sender.tab?.id).then(sendResponse);
    return true;
  }
  if (message.type === "GENERATE_INTERVIEW_QUESTIONS") {
    handleGenerateInterviewQuestions(message.jobId).then(sendResponse);
    return true;
  }
  return false;
});

/** Pushes a one-way status update to the tab that triggered the analysis — best-effort, never blocks on failure. */
function sendProgress(tabId: number | undefined, text: string): void {
  if (tabId == null) return;
  const message: AnalyzeProgressMessage = { type: "ANALYZE_PROGRESS", text };
  browserApi.tabs.sendMessage(tabId, message).catch(() => {});
}

/** Turns an AttemptInfo into a human-readable status line for the floating widget. */
function describeAttempt(info: AttemptInfo): string {
  if (info.attemptNumber > 1) {
    return `${info.model} still busy — retrying (${info.attemptNumber}/${info.maxAttempts})…`;
  }
  if (info.usingLiteFallback) {
    return info.previousModel
      ? `${info.previousModel} still busy — no full-power models left, trying ${info.model} as a last resort…`
      : `Trying ${info.model}…`;
  }
  if (info.previousModel) {
    return `${info.previousModel} was unavailable — trying ${info.model}…`;
  }
  return `Analyzing with ${info.model}…`;
}

function describeAiError(err: unknown): string {
  return err instanceof AiRequestError
    ? err.message
    : err instanceof Error
      ? `Couldn't parse the AI response: ${err.message}`
      : "The AI call failed for an unknown reason.";
}

async function handleGetResumes(): Promise<GetResumesResponse> {
  const [resumes, settings] = await Promise.all([
    getItem<Resume[]>(STORAGE_KEYS.resumes, []),
    loadSettings(),
  ]);
  return {
    resumes: resumes.map((r) => ({ id: r.id, profileName: r.profileName })),
    hasApiKey: settings.apiKey.length > 0,
  };
}

async function handleAnalyze(
  resumeId: string,
  job: JobPosting,
  tabId?: number
): Promise<AnalyzeResponse> {
  const [resumes, settings] = await Promise.all([
    getItem<Resume[]>(STORAGE_KEYS.resumes, []),
    loadSettings(),
  ]);

  const resume = resumes.find((r) => r.id === resumeId);
  if (!resume) return { ok: false, error: "Selected resume was not found in storage." };
  if (!settings.apiKey) return { ok: false, error: "Add an API key on the Applywise settings page first." };

  let analysis;
  let modelUsed = settings.model;
  try {
    const result = await withModelFallback(
      settings,
      (s) => getAiClient(s).generateMatchAnalysis(resume.parsedText, job),
      (info) => sendProgress(tabId, describeAttempt(info))
    );
    analysis = result.result;
    // Record which model actually produced this analysis for the results
    // badge, but do NOT write it back to settings — the user's configured
    // model (a strong one by default) must stay the starting point every
    // time, so good models always lead and lite stays a last resort.
    modelUsed = result.modelUsed;
  } catch (err) {
    return { ok: false, error: describeAiError(err) };
  }

  sendProgress(tabId, "Finalizing your results…");

  const entry: JobEntry = {
    id: crypto.randomUUID(),
    job,
    analysis,
    resumeUsed: { id: resume.id, profileName: resume.profileName },
    status: "saved",
    createdAt: Date.now(),
    modelUsed,
  };

  const history = await getItem<JobEntry[]>(STORAGE_KEYS.jobHistory, []);
  await setItem(STORAGE_KEYS.jobHistory, [entry, ...history]);

  await browserApi.tabs.create({ url: `${APP_URL}/#/results?job=${entry.id}` });

  return { ok: true, jobId: entry.id };
}

async function handleGenerateInterviewQuestions(
  jobId: string
): Promise<GenerateInterviewQuestionsResponse> {
  const history = await getItem<JobEntry[]>(STORAGE_KEYS.jobHistory, []);
  const entry = history.find((e) => e.id === jobId);
  if (!entry) return { ok: false, error: "That job entry no longer exists in your history." };

  // Cached from a previous click — no need to spend another API call.
  if (entry.interviewQuestions) return { ok: true, entry };

  const [resumes, settings] = await Promise.all([
    getItem<Resume[]>(STORAGE_KEYS.resumes, []),
    loadSettings(),
  ]);

  const resume = resumes.find((r) => r.id === entry.resumeUsed.id);
  if (!resume) {
    return {
      ok: false,
      error: `The "${entry.resumeUsed.profileName}" resume used for this analysis is no longer saved.`,
    };
  }
  if (!settings.apiKey) return { ok: false, error: "Add an API key on the Applywise settings page first." };

  let interviewQuestions;
  try {
    const { result } = await withModelFallback(settings, (s) =>
      getAiClient(s).generateInterviewQuestions(resume.parsedText, entry.job)
    );
    interviewQuestions = result;
  } catch (err) {
    return { ok: false, error: describeAiError(err) };
  }

  const updatedEntry: JobEntry = { ...entry, interviewQuestions };
  const updatedHistory = history.map((e) => (e.id === jobId ? updatedEntry : e));
  await setItem(STORAGE_KEYS.jobHistory, updatedHistory);

  return { ok: true, entry: updatedEntry };
}
