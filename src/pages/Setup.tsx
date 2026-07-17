import { useEffect, useRef, useState } from "react";
import {
  Trash2,
  Upload,
  Loader2,
  CheckCircle2,
  Download,
  Puzzle,
  RefreshCw,
  Monitor,
  ArrowRight,
  Shuffle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AnimatedCheckmark } from "@/components/ui/animated-checkmark";
import { extractTextFromPdf } from "@/lib/pdf";
import { getItem, setItem, STORAGE_KEYS } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { useExtensionVersion } from "@/hooks/useExtensionVersion";
import { FALLBACK_PROVIDERS, MODELS, PROVIDER_OPTIONS } from "./setup-models";
import { getProviderApiKey, normalizeSettings } from "@/types";
import type { AiProvider, ProviderSettings, Resume } from "@/types";

const MAX_RESUMES = 3;

const DEFAULT_SETTINGS: ProviderSettings = {
  provider: "gemini",
  apiKeys: {},
  model: MODELS.gemini[0].value,
  fallbackEnabled: true,
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
  const {
    installed: extensionInstalled,
    installedVersion,
    latestVersion,
    updateAvailable,
  } = useExtensionVersion();

  useEffect(() => {
    Promise.all([
      getItem<Resume[]>(STORAGE_KEYS.resumes, []),
      getItem<ProviderSettings>(STORAGE_KEYS.providerSettings, DEFAULT_SETTINGS),
    ]).then(([storedResumes, storedSettings]) => {
      setResumes(storedResumes);
      // normalizeSettings migrates the legacy single `apiKey` into the
      // per-provider `apiKeys` map (so switching providers no longer wipes the
      // key you entered) and defaults `fallbackEnabled` to on for settings
      // saved before that toggle shipped — reading `undefined` as "off" would
      // quietly take away behavior those users already rely on.
      setSettings(normalizeSettings(storedSettings));
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
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--fg-dim)]">
          <Monitor size={13} className="shrink-0 text-accent-1" />
          Best experienced on a desktop browser — that's where the extension lives.
        </div>
      </div>

      {extensionInstalled === false && <InstallExtensionCard latestVersion={latestVersion} />}
      {updateAvailable && (
        <UpdateAvailableCard latestVersion={latestVersion!} installedVersion={installedVersion!} />
      )}

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
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Input
                  value={resume.profileName}
                  onChange={(e) => handleRename(resume.id, e.target.value)}
                  className="h-8 max-w-xs"
                />
                <span className="truncate text-xs text-[var(--fg-dim)]">{resume.fileName}</span>
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
          {uploadError && <p className="text-sm text-[var(--status-bad-text)]">{uploadError}</p>}
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
              value={getProviderApiKey(settings)}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  apiKeys: { ...settings.apiKeys, [settings.provider]: e.target.value },
                })
              }
            />
            <p className="text-xs text-[var(--fg-dim)]">
              Saved per provider — each provider keeps its own key, so switching between them
              restores the key you already entered.
            </p>
          </div>

          <FallbackToggle
            provider={settings.provider}
            enabled={settings.fallbackEnabled ?? true}
            onChange={(fallbackEnabled) => setSettings({ ...settings, fallbackEnabled })}
          />

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
          {saveError && <p className="text-sm text-[var(--status-bad-text)]">{saveError}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The one global switch over the whole fallback strategy. On, a busy or
 * rate-limited model hands off to the next free one so an analysis still
 * completes; off, only the selected model is ever called — which is what you
 * want when comparing models, since a silent hand-off would attribute another
 * model's output to the one you picked.
 *
 * It stays visible for every provider (it's a global setting, and hiding it
 * would make it look like it had vanished) but is inert for the paid and
 * trial-credit ones, which have no free models to fall back to.
 */
function FallbackToggle({
  provider,
  enabled,
  onChange,
}: {
  provider: AiProvider;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const supported = FALLBACK_PROVIDERS.includes(provider);
  const providerLabel = provider === "openrouter" ? "OpenRouter" : "Gemini";

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-[var(--border)] px-4 py-3",
        !supported && "opacity-60"
      )}
    >
      <Shuffle size={16} className="mt-0.5 shrink-0 text-accent-1" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Label className="cursor-default">Auto-fallback to other free models</Label>
        <p className="text-xs text-[var(--fg-dim)]">
          {supported ? (
            <>
              If your chosen model is busy or rate-limited, keep trying other free{" "}
              {providerLabel} models — strongest first, fastest last — until one answers. Turn
              off to analyze with only the model selected above.
            </>
          ) : (
            <>
              Only available for Gemini and OpenRouter, the providers with free models to fall
              back to. Analyses always use the model selected above.
            </>
          )}
        </p>
      </div>
      <Switch
        checked={supported && enabled}
        onCheckedChange={onChange}
        disabled={!supported}
        aria-label="Auto-fallback to other free models"
      />
    </div>
  );
}

const INSTALL_STEPS = [
  "Unzip the downloaded file.",
  'Open your browser\'s extensions page (chrome://extensions, edge://extensions, or brave://extensions) and enable "Developer mode".',
  'Click "Load unpacked" and select the unzipped "applywise-extension" folder.',
];

// A webpage can't silently install a browser extension — that's blocked by
// every major browser for security reasons. Downloading a pre-built, always
// up-to-date zip plus three short steps is the closest thing to one-click
// until this ships on the Chrome Web Store / Firefox Add-ons.
function InstallExtensionCard({ latestVersion }: { latestVersion: string | null }) {
  return (
    <Card
      className="border-accent-1/40"
      style={{ backgroundColor: "var(--status-good-bg)" }}
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-1/15 text-accent-1">
            <Puzzle size={18} />
          </div>
          <div>
            <CardTitle>Install the browser extension</CardTitle>
            <CardDescription>
              Analyze job postings straight from LinkedIn, bdjobs, and other sites in one click.
              Not detected in this browser yet — grab the latest build below.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <a href="/applywise-extension.zip" download className="w-fit">
          <Button>
            <Download size={16} />
            Download extension{latestVersion ? ` v${latestVersion}` : ""} (.zip)
          </Button>
        </a>
        <ol className="flex flex-col gap-1.5 text-sm text-[var(--fg-dim)]">
          {INSTALL_STEPS.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="font-semibold text-accent-1">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-xs text-[var(--fg-dim)]">
          Using Firefox? Open <code>about:debugging#/runtime/this-firefox</code> instead, click{" "}
          <strong>Load Temporary Add-on</strong>, and select{" "}
          <code>manifest.json</code> inside the unzipped folder.
        </p>
      </CardContent>
    </Card>
  );
}

// "Load unpacked" extensions never auto-update (only Chrome Web Store/Firefox
// Add-ons installs do), so both this page and the popup check a published
// version file and flag a mismatch — the closest thing to a nudge that a
// re-download is actually needed, instead of the user guessing after every
// push that touches extension/ code.
function UpdateAvailableCard({
  latestVersion,
  installedVersion,
}: {
  latestVersion: string;
  installedVersion: string;
}) {
  return (
    <Card
      className="border-accent-1/40"
      style={{ backgroundColor: "var(--status-warn-bg)" }}
    >
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-1/15 text-accent-1">
            <RefreshCw size={18} />
          </div>
          <div className="min-w-0">
            <CardTitle>New update available</CardTitle>
            <CardDescription>
              Unpacked installs don't auto-update — download the latest build and reload it to
              pick up recent fixes.
            </CardDescription>
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold tabular-nums">
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[var(--fg-dim)]">
                v{installedVersion}
              </span>
              <ArrowRight size={13} className="shrink-0 text-[var(--fg-dim)]" />
              <span className="rounded-full bg-accent-1/15 px-2 py-0.5 text-accent-1">
                v{latestVersion}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <a href="/applywise-extension.zip" download className="w-fit">
          <Button>
            <Download size={16} />
            Download v{latestVersion} (.zip)
          </Button>
        </a>
        <p className="mt-3 text-xs text-[var(--fg-dim)]">
          After unzipping, reload it at your browser's extensions page (
          <code>chrome://extensions</code>) using the reload icon on the Applywise card, or
          re-run "Load unpacked" pointing at the new folder.
        </p>
      </CardContent>
    </Card>
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
