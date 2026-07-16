import { useEffect, useRef, useState } from "react";
import { Trash2, Upload, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { extractTextFromPdf } from "@/lib/pdf";
import { getItem, setItem, STORAGE_KEYS } from "@/lib/storage";
import type { AiProvider, ProviderSettings, Resume } from "@/types";

const MAX_RESUMES = 3;

// Model IDs below are verified against each provider's own docs (see chat
// history / commit notes) rather than guessed — providers retire IDs over
// time though, so if one 404s, switch to "Custom model ID" on this page and
// grab the current one from the provider's own dashboard/docs.
const MODELS: Record<AiProvider, { label: string; value: string }[]> = {
  // Ongoing free tier (rate-limited, no card required).
  gemini: [
    { label: "Gemini 3 Flash Preview — confirmed working", value: "gemini-3-flash-preview" },
    { label: "Gemini 3.1 Flash Lite — fast, cost-efficient", value: "gemini-3.1-flash-lite" },
    { label: "Gemini 3.5 Flash — flagship", value: "gemini-3.5-flash" },
    { label: "Gemini 3.1 Pro Preview — strongest reasoning", value: "gemini-3.1-pro-preview" },
    { label: "Gemini Flash Latest — always points at newest Flash", value: "gemini-flash-latest" },
    { label: "Gemini Flash Lite Latest — always points at newest Flash Lite", value: "gemini-flash-lite-latest" },
    { label: "Gemini Pro Latest — always points at newest Pro", value: "gemini-pro-latest" },
  ],
  // New-account trial credits (not an ongoing free tier), then pay-as-you-go.
  deepseek: [
    { label: "DeepSeek V4 Flash — fast, cheap", value: "deepseek-v4-flash" },
    { label: "DeepSeek V4 Pro — flagship reasoning", value: "deepseek-v4-pro" },
  ],
  glm: [
    { label: "GLM-5 Turbo — fast, cost-efficient", value: "glm-5-turbo" },
    { label: "GLM-5.2 — flagship, coding/agentic", value: "glm-5.2" },
    { label: "GLM-4.6 — previous generation", value: "glm-4.6" },
  ],
  // Paid API key required, no free tier.
  openai: [
    { label: "GPT-5.6 Luna — cost-sensitive", value: "gpt-5.6-luna" },
    { label: "GPT-5.6 Terra — balanced", value: "gpt-5.6-terra" },
    { label: "GPT-5.6 Sol — flagship reasoning", value: "gpt-5.6-sol" },
  ],
  anthropic: [
    { label: "Claude Haiku 4.5 — fast, economical", value: "claude-haiku-4-5-20251001" },
    { label: "Claude Sonnet 5 — agentic default", value: "claude-sonnet-5" },
    { label: "Claude Opus 4.8 — flagship", value: "claude-opus-4-8" },
  ],
  xai: [
    { label: "Grok Code Fast 1 — fast, coding-focused", value: "grok-code-fast-1" },
    { label: "Grok 4.5 — flagship", value: "grok-4.5" },
  ],
};

const PROVIDER_OPTIONS: { value: AiProvider; label: string }[] = [
  { value: "gemini", label: "Gemini — free tier" },
  { value: "deepseek", label: "DeepSeek — free trial credits" },
  { value: "glm", label: "GLM (Zhipu / Z.ai) — free trial credits" },
  { value: "openai", label: "OpenAI — paid" },
  { value: "anthropic", label: "Anthropic — paid" },
  { value: "xai", label: "Grok (xAI) — paid" },
];

const DEFAULT_SETTINGS: ProviderSettings = {
  provider: "gemini",
  apiKey: "",
  model: MODELS.gemini[0].value,
};

const CUSTOM_MODEL = "__custom__";

export function Setup() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [settings, setSettings] = useState<ProviderSettings>(DEFAULT_SETTINGS);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      getItem<Resume[]>(STORAGE_KEYS.resumes, []),
      getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS),
    ]).then(([storedResumes, storedSettings]) => {
      setResumes(storedResumes);
      setSettings(storedSettings);
      setLoaded(true);
    });
  }, []);

  async function persistResumes(next: Resume[]) {
    setResumes(next);
    await setItem(STORAGE_KEYS.resumes, next);
  }

  async function persistSettings(next: ProviderSettings) {
    setSettings(next);
    await setItem(STORAGE_KEYS.providerSettings, next);
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setUploadError(null);

    if (file.type !== "application/pdf") {
      setUploadError("Only PDF resumes are supported.");
      return;
    }
    if (resumes.length >= MAX_RESUMES) {
      setUploadError(`You can save up to ${MAX_RESUMES} resumes. Delete one first.`);
      return;
    }

    setUploading(true);
    try {
      const parsedText = await extractTextFromPdf(file);
      const profileName = suggestProfileName(file.name, resumes);
      const resume: Resume = {
        id: crypto.randomUUID(),
        profileName,
        parsedText,
        uploadedAt: Date.now(),
        fileName: file.name,
      };
      await persistResumes([...resumes, resume]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Failed to parse PDF.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRename(id: string, profileName: string) {
    await persistResumes(resumes.map((r) => (r.id === id ? { ...r, profileName } : r)));
  }

  async function handleDelete(id: string) {
    await persistResumes(resumes.filter((r) => r.id !== id));
  }

  async function handleProviderChange(provider: AiProvider) {
    await persistSettings({ ...settings, provider, model: MODELS[provider][0].value });
  }

  async function handleSaveSettings() {
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      await persistSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const isCustomModel = !MODELS[settings.provider].some((m) => m.value === settings.model);

  if (!loaded) return null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Set up Applywise</h1>
        <p className="text-sm text-[var(--fg-dim)]">
          Everything below stays in your browser — nothing is uploaded to a server.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumes</CardTitle>
          <CardDescription>
            Upload up to {MAX_RESUMES} resumes (PDF). Give each a profile name like "SQA" or
            "SWE" so the extension can ask which one to use.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {resumes.map((resume) => (
            <div
              key={resume.id}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3"
            >
              <CheckCircle2 size={16} className="shrink-0 text-accent-1" />
              <div className="flex flex-1 flex-col gap-1">
                <Input
                  value={resume.profileName}
                  onChange={(e) => handleRename(resume.id, e.target.value)}
                  className="h-8 max-w-xs"
                />
                <span className="text-xs text-[var(--fg-dim)]">{resume.fileName}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(resume.id)}>
                <Trash2 size={16} />
              </Button>
            </div>
          ))}

          {resumes.length < MAX_RESUMES && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Upload size={16} />
                )}
                {uploading ? "Parsing PDF…" : "Upload resume"}
              </Button>
            </div>
          )}
          {uploadError && <p className="text-sm text-red-400">{uploadError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
          <CardDescription>
            Your key is stored locally and sent only to the provider you choose — never to an
            Applywise server.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Provider</Label>
            <Select
              value={settings.provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Model</Label>
            <Select
              value={isCustomModel ? CUSTOM_MODEL : settings.model}
              onChange={(e) => {
                if (e.target.value === CUSTOM_MODEL) {
                  setSettings({ ...settings, model: "" });
                } else {
                  setSettings({ ...settings, model: e.target.value });
                }
              }}
            >
              {MODELS[settings.provider].map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
              <option value={CUSTOM_MODEL}>Custom model ID…</option>
            </Select>
            {isCustomModel && (
              <>
                <Input
                  placeholder="e.g. gemini-2.0-flash"
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                />
                <p className="text-xs text-[var(--fg-dim)]">
                  Provider IDs change over time — grab the current one from your provider's model
                  list (e.g. aistudio.google.com for Gemini) if a preset stops working.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>API key</Label>
            <Input
              type="password"
              placeholder="Paste your API key"
              value={settings.apiKey}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving && <Loader2 size={16} className="animate-spin" />}
              {saving ? "Saving…" : "Save settings"}
            </Button>
            {saved && (
              <span
                className="flex items-center gap-1.5 text-sm font-semibold text-accent-1 opacity-0"
                style={{ animation: "check-pop 0.4s ease forwards" }}
              >
                <AnimatedCheckmark />
                Saved
              </span>
            )}
          </div>
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function suggestProfileName(fileName: string, existing: Resume[]): string {
  const base = fileName.replace(/\.pdf$/i, "").slice(0, 24) || "Resume";
  let candidate = base;
  let i = 2;
  while (existing.some((r) => r.profileName === candidate)) {
    candidate = `${base} (${i})`;
    i += 1;
  }
  return candidate;
}
