import { getItem, setItem, STORAGE_KEYS } from "../lib/storage";
import { APP_URL } from "../lib/config";
import { getAiClient, AiRequestError } from "../lib/ai";
import { GEMINI_FALLBACK_MODELS, isRetryableGeminiError } from "../lib/ai/gemini-fallback";
import { browserApi } from "../lib/browser-api";
import type { Resume, ProviderSettings, JobEntry, JobPosting } from "../lib/types";
import type {
  ExtensionMessage,
  GetResumesResponse,
  AnalyzeResponse,
  GenerateInterviewQuestionsResponse,
} from "../lib/messages";

const DEFAULT_SETTINGS: ProviderSettings = { provider: "gemini", apiKey: "", model: "gemini-3-flash-preview" };

browserApi.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "GET_RESUMES") {
    handleGetResumes().then(sendResponse);
    return true;
  }
  if (message.type === "ANALYZE") {
    handleAnalyze(message.resumeId, message.job).then(sendResponse);
    return true;
  }
  if (message.type === "GENERATE_INTERVIEW_QUESTIONS") {
    handleGenerateInterviewQuestions(message.jobId).then(sendResponse);
    return true;
  }
  return false;
});

/**
 * Runs `attempt` with the configured model first; on a timeout/429/high-load
 * error from Gemini, retries with the next free-tier model instead of
 * failing the whole request. Other providers (and non-retryable errors, e.g.
 * a bad API key) just run once, since switching models can't fix those.
 */
async function withGeminiFallback<T>(
  settings: ProviderSettings,
  attempt: (settings: ProviderSettings) => Promise<T>
): Promise<{ result: T; modelUsed: string }> {
  if (settings.provider !== "gemini") {
    return { result: await attempt(settings), modelUsed: settings.model };
  }

  const order = [settings.model, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== settings.model)];
  let lastErr: unknown;
  for (let i = 0; i < order.length; i++) {
    const model = order[i];
    try {
      const result = await attempt({ ...settings, model });
      return { result, modelUsed: model };
    } catch (err) {
      lastErr = err;
      const isLastAttempt = i === order.length - 1;
      if (isLastAttempt || !isRetryableGeminiError(err)) throw err;
    }
  }
  throw lastErr;
}

/** Persists the model actually used if the fallback switched away from the configured one. */
async function persistModelSwitch(settings: ProviderSettings, modelUsed: string): Promise<void> {
  if (modelUsed === settings.model) return;
  await setItem(STORAGE_KEYS.providerSettings, { ...settings, model: modelUsed });
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
    getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS),
  ]);
  return {
    resumes: resumes.map((r) => ({ id: r.id, profileName: r.profileName })),
    hasApiKey: settings.apiKey.length > 0,
  };
}

async function handleAnalyze(resumeId: string, job: JobPosting): Promise<AnalyzeResponse> {
  const [resumes, settings] = await Promise.all([
    getItem<Resume[]>(STORAGE_KEYS.resumes, []),
    getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS),
  ]);

  const resume = resumes.find((r) => r.id === resumeId);
  if (!resume) return { ok: false, error: "Selected resume was not found in storage." };
  if (!settings.apiKey) return { ok: false, error: "Add an API key on the Applywise settings page first." };

  let analysis;
  let modelUsed = settings.model;
  try {
    const result = await withGeminiFallback(settings, (s) =>
      getAiClient(s).generateMatchAnalysis(resume.parsedText, job)
    );
    analysis = result.result;
    modelUsed = result.modelUsed;
    await persistModelSwitch(settings, modelUsed);
  } catch (err) {
    return { ok: false, error: describeAiError(err) };
  }

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
    getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS),
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
    const { result, modelUsed } = await withGeminiFallback(settings, (s) =>
      getAiClient(s).generateInterviewQuestions(resume.parsedText, entry.job)
    );
    interviewQuestions = result;
    await persistModelSwitch(settings, modelUsed);
  } catch (err) {
    return { ok: false, error: describeAiError(err) };
  }

  const updatedEntry: JobEntry = { ...entry, interviewQuestions };
  const updatedHistory = history.map((e) => (e.id === jobId ? updatedEntry : e));
  await setItem(STORAGE_KEYS.jobHistory, updatedHistory);

  return { ok: true, entry: updatedEntry };
}
