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
  Plus,
  X,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  ExternalLink,
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
import { useModelCatalog, isModelLive, getModelExpiry } from "@/hooks/useModelCatalog";
import { useChangelog } from "@/hooks/useChangelog";
import { useDownloadCount } from "@/hooks/useDownloadCount";
import { compareVersions } from "@/lib/version";
import { extensionReleaseDownloadUrl } from "@/lib/githubRelease";
import {
  FALLBACK_PROVIDERS,
  MODELS,
  PROVIDER_KEY_URLS,
  PROVIDER_OPTIONS,
  providerDisplayName,
} from "./setup-models";
import { getProviderApiKey, normalizeSettings } from "@/types";
import type { AiProvider, ProviderSettings, Resume } from "@/types";

const MAX_RESUMES = 3;

const DEFAULT_SETTINGS: ProviderSettings = {
  provider: "gemini",
  apiKeys: {},
  model: MODELS.gemini[0].value,
  fallbackEnabled: true,
};

export function Setup() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [settings, setSettings] = useState<ProviderSettings>(DEFAULT_SETTINGS);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Bumped after a save so the live model check re-runs against the freshly
  // saved key (the background worker reads the key from storage, not this
  // in-memory draft).
  const [modelCheckKey, setModelCheckKey] = useState(0);
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
      // Re-check model availability now that the key is actually stored.
      setModelCheckKey((k) => k + 1);
      setTimeout(() => setSaved(false), 2400);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function selectModel(model: string) {
    setSettings((s) => ({ ...s, model }));
  }

  function addCustomModel(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    setSettings((s) => {
      const existing = s.customModels?.[s.provider] ?? [];
      const list = existing.includes(trimmed) ? existing : [...existing, trimmed];
      return { ...s, model: trimmed, customModels: { ...s.customModels, [s.provider]: list } };
    });
  }

  function removeCustomModel(id: string) {
    setSettings((s) => {
      const existing = s.customModels?.[s.provider] ?? [];
      const list = existing.filter((m) => m !== id);
      const model = s.model === id ? MODELS[s.provider][0].value : s.model;
      return { ...s, model, customModels: { ...s.customModels, [s.provider]: list } };
    });
  }

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

          <ModelPicker
            provider={settings.provider}
            model={settings.model}
            customModels={settings.customModels?.[settings.provider] ?? []}
            hasKey={getProviderApiKey(settings).length > 0}
            refreshKey={modelCheckKey}
            onSelect={selectModel}
            onAddCustom={addCustomModel}
            onRemoveCustom={removeCustomModel}
          />

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <Label>API key</Label>
              <a
                href={PROVIDER_KEY_URLS[settings.provider]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-1 hover:underline"
              >
                Get a {providerDisplayName(settings.provider)} API key
                <ExternalLink size={11} className="shrink-0" />
              </a>
            </div>
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

// Sentinel option value that opens the "add a custom model" input rather than
// selecting a real model.
const ADD_CUSTOM_SENTINEL = "__add_custom_model__";

function relativeTime(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "2026-07-21" -> "Jul 21, 2026" — parsed as UTC midnight so the date shown
 * never shifts a day depending on the reader's timezone. */
function formatExpiryDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Model dropdown with (1) multiple custom model IDs per provider and (2) a
 * real-time availability check: each provider's live /models list is fetched
 * through the extension and cached ~1h, and any preset/custom model missing
 * from it is flagged as likely-retired — both inline in the dropdown and in the
 * status line below.
 */
function ModelPicker({
  provider,
  model,
  customModels,
  hasKey,
  refreshKey,
  onSelect,
  onAddCustom,
  onRemoveCustom,
}: {
  provider: AiProvider;
  model: string;
  customModels: string[];
  hasKey: boolean;
  refreshKey: number;
  onSelect: (id: string) => void;
  onAddCustom: (id: string) => void;
  onRemoveCustom: (id: string) => void;
}) {
  const { liveModels, checkedAt, loading, error } = useModelCatalog(provider, hasKey, refreshKey);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const presets = MODELS[provider];
  const presetValues = new Set(presets.map((m) => m.value));
  const providerLabel = providerDisplayName(provider);

  // A legacy single custom ID (saved before multi-custom shipped) may be the
  // selected model without being in either list — render it so the controlled
  // <select> can display it as the current value.
  const isOrphanCustom = model.length > 0 && !presetValues.has(model) && !customModels.includes(model);

  // Two independent warnings a model can carry: gone already (not in the
  // live list at all) or still live today but scheduled to disappear (the
  // provider publishes a retirement date — currently only OpenRouter does).
  // The first is strictly worse, so it wins when a model somehow has both.
  const statusMarker = (value: string) => {
    if (isModelLive(value, liveModels) === false) return " · ⚠ not in live list";
    const expiresAt = getModelExpiry(value, liveModels);
    return expiresAt ? ` · ⚠ going away ${formatExpiryDate(expiresAt)}` : "";
  };

  function commitAdd() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddCustom(trimmed);
    setDraft("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Model</Label>
      <Select
        value={model}
        onChange={(e) => {
          if (e.target.value === ADD_CUSTOM_SENTINEL) {
            setAdding(true);
            return;
          }
          onSelect(e.target.value);
        }}
      >
        {presets.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
            {statusMarker(m.value)}
          </option>
        ))}
        {customModels.length > 0 && (
          <optgroup label="Your custom models">
            {customModels.map((c) => (
              <option key={c} value={c}>
                {c} (custom){statusMarker(c)}
              </option>
            ))}
          </optgroup>
        )}
        {isOrphanCustom && (
          <option value={model}>
            {model} (custom){statusMarker(model)}
          </option>
        )}
        <option value={ADD_CUSTOM_SENTINEL}>＋ Add a custom model…</option>
      </Select>

      {adding && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--border)] p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="e.g. gemini-2.0-flash"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitAdd();
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={commitAdd}
                disabled={!draft.trim()}
                className="flex-1 sm:flex-none"
              >
                <Plus size={15} />
                Add
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAdding(false);
                  setDraft("");
                }}
                className="flex-1 sm:flex-none"
              >
                Cancel
              </Button>
            </div>
          </div>
          <p className="text-xs text-[var(--fg-dim)]">
            Paste any model ID this provider supports — it's added to the list below and selected.
            You can keep several per provider and switch between them anytime.
          </p>
        </div>
      )}

      {customModels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {customModels.map((c) => (
            <span
              key={c}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-[var(--border)] py-1 pl-2.5 pr-1 text-xs"
            >
              {(isModelLive(c, liveModels) === false || getModelExpiry(c, liveModels) !== null) && (
                <AlertTriangle size={11} className="shrink-0 text-[var(--status-warn-text)]" />
              )}
              <span className="truncate font-medium">{c}</span>
              <button
                type="button"
                onClick={() => onRemoveCustom(c)}
                aria-label={`Remove custom model ${c}`}
                className="shrink-0 rounded-full p-0.5 text-[var(--fg-dim)] transition-colors hover:text-[var(--status-bad-text)]"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <ModelCheckStatus
        providerLabel={providerLabel}
        hasKey={hasKey}
        loading={loading}
        error={error}
        checkedAt={checkedAt}
        selectedLive={isModelLive(model, liveModels)}
        expiresAt={getModelExpiry(model, liveModels)}
        model={model}
      />
    </div>
  );
}

// The status line under the model dropdown — the human-readable result of the
// real-time availability check. Deliberately quiet for the common "all good"
// case and loud only when the selected model looks retired.
function ModelCheckStatus({
  providerLabel,
  hasKey,
  loading,
  error,
  checkedAt,
  selectedLive,
  expiresAt,
  model,
}: {
  providerLabel: string;
  hasKey: boolean;
  loading: boolean;
  error: string | null;
  checkedAt: number | null;
  selectedLive: boolean | null;
  /** Retirement date for the selected model, if the provider publishes one (see getModelExpiry). */
  expiresAt: string | null;
  model: string;
}) {
  if (!hasKey) {
    return (
      <p className="text-xs text-[var(--fg-dim)]">
        Save an API key to check which models are still live on {providerLabel} in real time.
      </p>
    );
  }
  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--fg-dim)]">
        <Loader2 size={12} className="animate-spin" />
        Checking {providerLabel}'s live model list…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-xs text-[var(--fg-dim)]">
        Couldn't verify models against {providerLabel} right now — {error}
      </p>
    );
  }
  if (selectedLive === false) {
    return (
      <p
        className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium"
        style={{ color: "var(--status-warn-text)", backgroundColor: "var(--status-warn-bg)" }}
      >
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>
          "{model}" isn't in {providerLabel}'s current model list — it may have been retired or
          renamed. Pick another model, or update the ID if the provider changed it.
        </span>
      </p>
    );
  }
  // Still live today, but the provider has published a date it'll stop
  // serving this model (currently only OpenRouter does this — see
  // getModelExpiry). Shown instead of the plain "Verified live" line below,
  // not alongside it: "works, but…" is a clearer single message than a green
  // line and an amber one back to back for the same model.
  if (selectedLive === true && expiresAt != null) {
    return (
      <p
        className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium"
        style={{ color: "var(--status-warn-text)", backgroundColor: "var(--status-warn-bg)" }}
      >
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>
          "{model}" works today, but {providerLabel} will stop serving it on{" "}
          {formatExpiryDate(expiresAt)}. Switch to another model before then.
        </span>
      </p>
    );
  }
  if (selectedLive === true && checkedAt != null) {
    return (
      <p
        className="flex items-center gap-1.5 text-xs font-medium"
        style={{ color: "var(--status-good-text)" }}
      >
        <ShieldCheck size={13} className="shrink-0" />
        Verified live on {providerLabel} · checked {relativeTime(checkedAt)}
      </p>
    );
  }
  return null;
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
  const providerLabel = providerDisplayName(provider);

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
              Only available for the free-tier providers, the ones with several free models to
              fall back to. Analyses always use the model selected above.
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

/**
 * Social proof next to the download CTA — GitHub's public release-asset API
 * is the only free, backend-less source of a real download count for an
 * extension that isn't on a web store (see src/lib/githubRelease.ts). Stays
 * quiet (renders nothing) until a number is actually known, rather than
 * showing a loading placeholder for a background stat nobody's waiting on.
 */
function DownloadCountBadge() {
  const count = useDownloadCount();
  if (count === null || count <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-semibold tabular-nums text-[var(--fg-dim)]">
      <Download size={12} className="shrink-0 text-accent-1" />
      {count.toLocaleString()} downloads
    </span>
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
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={latestVersion ? extensionReleaseDownloadUrl(latestVersion) : "/applywise-extension.zip"}
            download
            className="w-fit"
          >
            <Button>
              <Download size={16} />
              Download extension{latestVersion ? ` v${latestVersion}` : ""} (.zip)
            </Button>
          </a>
          <DownloadCountBadge />
        </div>
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
      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <a href={extensionReleaseDownloadUrl(latestVersion)} download className="w-fit">
              <Button className="relative isolate overflow-hidden">
                <span
                  aria-hidden="true"
                  className="update-shine pointer-events-none absolute -inset-y-1/2 left-[-40%] -z-10 w-[30%] bg-gradient-to-r from-transparent via-white/70 to-transparent"
                  style={{ animation: "update-shine 3s ease-in-out infinite" }}
                />
                <Download size={16} />
                Download v{latestVersion} (.zip)
              </Button>
            </a>
            <DownloadCountBadge />
          </div>
          <p className="mt-3 text-xs text-[var(--fg-dim)]">
            After unzipping, reload it at your browser's extensions page (
            <code>chrome://extensions</code>) using the reload icon on the Applywise card, or
            re-run "Load unpacked" pointing at the new folder.
          </p>
        </div>
        <Changelog installedVersion={installedVersion} latestVersion={latestVersion} />
      </CardContent>
    </Card>
  );
}

// How many version groups to show before collapsing the rest into a count —
// keeps someone many releases behind from scrolling a wall of history instead
// of the handful of updates that actually matter to them right now.
const CHANGELOG_VISIBLE_VERSIONS = 3;

/**
 * "What's new since your installed version" — fetched fresh on every page
 * load (see useChangelog) rather than baked into the JS bundle, so pushing a
 * new entry to public/changelog.json shows up immediately on next visit, no
 * extension update or app redeploy wait required on the reader's end.
 */
function Changelog({
  installedVersion,
  latestVersion,
}: {
  installedVersion: string;
  latestVersion: string;
}) {
  const { entries } = useChangelog();

  if (entries === null) return null; // still loading, or the file wasn't reachable — stay quiet

  const newSinceInstall = entries
    .filter((e) => compareVersions(e.version, installedVersion) > 0)
    .sort((a, b) => compareVersions(b.version, a.version));

  if (newSinceInstall.length === 0) return null;

  const visible = newSinceInstall.slice(0, CHANGELOG_VISIBLE_VERSIONS);
  const hiddenCount = newSinceInstall.length - visible.length;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-2)] p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
        <Sparkles size={13} className="shrink-0 text-accent-1" />
        What's new
      </div>
      <div className="flex flex-col gap-3">
        {visible.map((entry) => (
          <div key={entry.version}>
            <span
              className={cn(
                "mb-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                entry.version === latestVersion
                  ? "bg-accent-1/15 text-accent-1"
                  : "border border-[var(--border)] text-[var(--fg-dim)]"
              )}
            >
              v{entry.version}
            </span>
            <ul className="flex flex-col gap-1">
              {entry.changes.map((change, i) => (
                <li key={i} className="flex gap-2 text-sm leading-snug text-[var(--fg)]">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent-1" />
                  <span className="min-w-0 flex-1">{change}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <p className="mt-3 text-xs text-[var(--fg-dim)]">
          +{hiddenCount} more update{hiddenCount === 1 ? "" : "s"} since your version.
        </p>
      )}
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
