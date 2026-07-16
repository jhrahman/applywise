import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  KeyRound,
  FileWarning,
  Lightbulb,
  Sparkles,
  Briefcase,
  Building2,
  MapPin,
  Banknote,
  Trash2,
  X,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getItem, setItem, STORAGE_KEYS } from "@/lib/storage";
import { bridgeGenerateInterviewQuestions } from "@/lib/bridge";
import { convertToBdt, formatBdt } from "@/lib/currency";
import type { JobDetails, JobEntry, JobPosting, JobStatus } from "@/types";

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];

// Severity bands for the match score meter — red/amber/green is the
// industry-standard read for a "how good is this fit" score. Colors are
// theme-aware CSS custom properties (see index.css) so text stays WCAG-AA
// readable on both dark and light surfaces, not just whichever theme was
// eyeballed during development.
function scoreBand(score: number): { text: string; bg: string; label: string } {
  if (score >= 75) return { text: "var(--status-good-text)", bg: "var(--status-good-bg)", label: "Strong match" };
  if (score >= 50) return { text: "var(--status-warn-text)", bg: "var(--status-warn-bg)", label: "Partial match" };
  return { text: "var(--status-bad-text)", bg: "var(--status-bad-bg)", label: "Needs work" };
}

const TONE_VARS = {
  good: { text: "var(--status-good-text)", bg: "var(--status-good-bg)", border: "var(--status-good-border)" },
  bad: { text: "var(--status-bad-text)", bg: "var(--status-bad-bg)", border: "var(--status-bad-border)" },
  warn: { text: "var(--status-warn-text)", bg: "var(--status-warn-bg)", border: "var(--status-warn-border)" },
} as const;

export function Results() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job");

  const [history, setHistory] = useState<JobEntry[] | null>(null);
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);

  useEffect(() => {
    getItem<JobEntry[]>(STORAGE_KEYS.jobHistory, []).then(setHistory);
  }, []);

  const entry = history?.find((e) => e.id === jobId) ?? null;

  async function updateStatus(status: JobStatus) {
    if (!history || !entry) return;
    const updated = history.map((e) => (e.id === entry.id ? { ...e, status } : e));
    setHistory(updated);
    await setItem(STORAGE_KEYS.jobHistory, updated);
  }

  async function removeEntry(id: string) {
    if (!history) return;
    const updated = history.filter((e) => e.id !== id);
    setHistory(updated);
    await setItem(STORAGE_KEYS.jobHistory, updated);
  }

  async function clearHistory() {
    setHistory([]);
    await setItem(STORAGE_KEYS.jobHistory, []);
  }

  async function handleGenerateInterviewQuestions() {
    if (!entry) return;
    setInterviewError(null);
    setInterviewLoading(true);
    try {
      const updatedEntry = await bridgeGenerateInterviewQuestions<JobEntry>(entry.id);
      setHistory((prev) => (prev ? prev.map((e) => (e.id === entry.id ? updatedEntry : e)) : prev));
    } catch (err) {
      setInterviewError(err instanceof Error ? err.message : "Failed to generate questions.");
    } finally {
      setInterviewLoading(false);
    }
  }

  if (history === null) {
    return (
      <div className="flex items-center gap-3 text-sm text-[var(--fg-dim)]">
        <span className="h-2 w-2 animate-pulse rounded-full bg-accent-1" />
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <div>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Match results</h1>
        <p className="text-sm text-[var(--fg-dim)]">
          Results open here once the extension finishes analyzing a job posting.
        </p>
      </div>

      {!entry ? (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>No analysis loaded yet</CardTitle>
            <CardDescription>
              Click "Analyze with Applywise" on a job posting to see your match score, missing
              skills, and ATS notes here.
            </CardDescription>
          </CardHeader>
          <CardContent />
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <JobResultCard entry={entry} onStatusChange={updateStatus} />
            <InterviewQuestionsCard
              entry={entry}
              loading={interviewLoading}
              error={interviewError}
              onGenerate={handleGenerateInterviewQuestions}
            />
          </div>
          <div className="flex flex-col gap-6 lg:sticky lg:top-6">
            {history.length > 0 && (
              <SessionHistory
                history={history}
                activeId={entry.id}
                onRemove={removeEntry}
                onClearAll={clearHistory}
              />
            )}
          </div>
        </div>
      )}

      {!entry && history.length > 0 && (
        <SessionHistory history={history} onRemove={removeEntry} onClearAll={clearHistory} />
      )}
    </div>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const band = scoreBand(clamped);
  return (
    <div className="flex items-center gap-5">
      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-bold tracking-tight tabular-nums" style={{ color: band.text }}>
          {clamped}
        </span>
        <span className="text-lg font-semibold text-[var(--fg-dim)]">/100</span>
      </div>
      <div className="flex-1">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">Match score</span>
          <span className="text-xs font-semibold" style={{ color: band.text }}>
            {band.label}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full" style={{ background: band.bg }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${clamped}%`, background: band.text }}
          />
        </div>
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  items,
  icon,
  tone,
  delay,
}: {
  label: string;
  items: string[];
  icon: React.ReactNode;
  tone: keyof typeof TONE_VARS;
  delay: number;
}) {
  if (items.length === 0) return null;
  const v = TONE_VARS[tone];

  return (
    <div
      className="opacity-0"
      style={{ animation: "reveal-row 0.5s ease forwards", animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{ color: v.text, background: v.bg, borderColor: v.border }}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function BulletList({
  label,
  items,
  icon,
  delay,
}: {
  label: string;
  items: string[];
  icon: React.ReactNode;
  delay: number;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className="opacity-0"
      style={{ animation: "reveal-row 0.5s ease forwards", animationDelay: `${delay}ms` }}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
        {icon}
        {label}
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-relaxed">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--fg-dim)]" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DetailTile({
  icon,
  label,
  value,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
}) {
  const unavailable = value === "Not available";
  return (
    <div className="rounded-xl border border-[var(--border)] p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
        {icon}
        {label}
      </div>
      <div
        className={
          unavailable ? "text-sm italic text-[var(--fg-dim)]" : "text-sm font-semibold text-[var(--fg)]"
        }
      >
        {value}
      </div>
      {secondary && <div className="mt-0.5 text-xs text-[var(--fg-dim)]">{secondary}</div>}
    </div>
  );
}

function useSalaryInBdt(jobDetails: JobDetails) {
  const [converted, setConverted] = useState<{ min: number | null; max: number | null } | "unavailable" | null>(
    null
  );

  useEffect(() => {
    const salary = jobDetails.salary;
    setConverted(null);
    if (!salary?.currency || salary.currency.toUpperCase() === "BDT") return;
    if (salary.minAmount == null && salary.maxAmount == null) return;

    let cancelled = false;
    (async () => {
      const [min, max] = await Promise.all([
        salary.minAmount != null ? convertToBdt(salary.minAmount, salary.currency!) : Promise.resolve(null),
        salary.maxAmount != null ? convertToBdt(salary.maxAmount, salary.currency!) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setConverted(min === null && max === null ? "unavailable" : { min, max });
    })();

    return () => {
      cancelled = true;
    };
  }, [jobDetails.salary]);

  return converted;
}

const PERIOD_ABBREVIATIONS: Record<string, string> = {
  year: "yr",
  month: "mo",
  hour: "hr",
  day: "day",
  project: "project",
};

function periodSuffix(period: string | null): string {
  if (!period) return "";
  return ` /${PERIOD_ABBREVIATIONS[period.toLowerCase()] ?? period}`;
}

function formatBdtSecondary(
  salary: NonNullable<JobDetails["salary"]>,
  converted: ReturnType<typeof useSalaryInBdt>
): string | undefined {
  // Nothing numeric to convert — e.g. raw is "Negotiable" or "Competitive"
  // with no figures attached. Converting is meaningless here, not just
  // unavailable, so skip straight to no secondary line at all.
  if (salary.minAmount == null && salary.maxAmount == null) return undefined;
  if (salary.currency?.toUpperCase() === "BDT") return undefined;
  if (converted === null) return "Converting to BDT…";
  if (converted === "unavailable") return "BDT conversion unavailable right now";
  const { min, max } = converted;
  const suffix = periodSuffix(salary.period);
  if (min != null && max != null && min !== max) {
    return `≈ ${formatBdt(min)} – ${formatBdt(max)} BDT${suffix}`;
  }
  const single = min ?? max;
  return single != null ? `≈ ${formatBdt(single)} BDT${suffix}` : undefined;
}

function JobDetailsGrid({ job, jobDetails }: { job: JobPosting; jobDetails: JobDetails }) {
  const converted = useSalaryInBdt(jobDetails);
  const salary = jobDetails.salary;
  const location = job.location ?? jobDetails.location ?? "Not available";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <DetailTile
        icon={<Briefcase size={12} />}
        label="Employment type"
        value={jobDetails.employmentType ?? "Not available"}
      />
      <DetailTile
        icon={<Building2 size={12} />}
        label="Work mode"
        value={jobDetails.workMode ?? "Not available"}
      />
      <DetailTile icon={<MapPin size={12} />} label="Location" value={location} />
      <DetailTile
        icon={<Banknote size={12} />}
        label="Salary"
        value={salary?.raw ?? "Not available"}
        secondary={salary ? formatBdtSecondary(salary, converted) : undefined}
      />
    </div>
  );
}

function StatusBadge({
  status,
  onChange,
}: {
  status: JobStatus;
  onChange: (status: JobStatus) => void;
}) {
  return (
    <select
      value={status}
      onChange={(e) => onChange(e.target.value as JobStatus)}
      className="cursor-pointer rounded-full border border-[var(--border)] bg-transparent px-2.5 py-1 text-xs font-medium text-[var(--fg-dim)] outline-none transition-colors hover:border-accent-1 hover:text-[var(--fg)]"
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function JobResultCard({
  entry,
  onStatusChange,
}: {
  entry: JobEntry;
  onStatusChange: (status: JobStatus) => void;
}) {
  const { job, analysis, resumeUsed } = entry;
  const headerLocation = job.location ?? analysis.jobDetails?.location;
  // The scraper falls back to a literal "Unknown company" placeholder when it
  // can't find structured company data — prefer the AI's read of the posting
  // text in that case, since aggregator sites often only state the company
  // name inside an overview box, not in page metadata.
  const headerCompany =
    job.company && job.company !== "Unknown company" ? job.company : analysis.jobDetails?.company ?? job.company;
  return (
    <Card>
      <CardHeader>
        {entry.modelUsed && (
          <div
            className="mb-3 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
            style={{
              color: "var(--status-good-text)",
              backgroundColor: "var(--status-good-bg)",
              borderColor: "var(--status-good-border)",
            }}
          >
            <Cpu size={12} />
            Analyzed with {entry.modelUsed}
          </div>
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{job.title}</CardTitle>
            <CardDescription>
              {headerCompany}
              {headerLocation ? ` · ${headerLocation}` : ""} · matched against{" "}
              <span className="text-[var(--fg)]">{resumeUsed.profileName}</span>
            </CardDescription>
          </div>
          <StatusBadge status={entry.status} onChange={onStatusChange} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <JobDetailsGrid
          job={job}
          jobDetails={
            analysis.jobDetails ?? {
              company: null,
              employmentType: null,
              location: null,
              workMode: null,
              salary: null,
            }
          }
        />

        <ScoreMeter score={analysis.matchScore} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <ChipGroup
            label="Matching skills"
            items={analysis.matchingSkills}
            icon={<CheckCircle2 size={13} />}
            tone="good"
            delay={100}
          />
          <ChipGroup
            label="Missing skills"
            items={analysis.missingSkills}
            icon={<XCircle size={13} />}
            tone="bad"
            delay={200}
          />
          <ChipGroup
            label="Missing keywords"
            items={analysis.missingKeywords}
            icon={<KeyRound size={13} />}
            tone="warn"
            delay={300}
          />
        </div>

        <div className="flex flex-col gap-5 border-t border-[var(--border)] pt-5">
          <BulletList
            label="ATS notes"
            items={analysis.atsNotes}
            icon={<FileWarning size={13} />}
            delay={400}
          />
          <BulletList
            label="Suggestions"
            items={analysis.suggestions}
            icon={<Lightbulb size={13} />}
            delay={500}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function InterviewQuestionsCard({
  entry,
  loading,
  error,
  onGenerate,
}: {
  entry: JobEntry;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interview prep</CardTitle>
        <CardDescription>
          Generate up to 20 likely interview questions with suggested answers, based on this
          resume and job posting.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!entry.interviewQuestions && (
          <div>
            <Button onClick={onGenerate} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? "Generating…" : "Generate interview questions"}
            </Button>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </div>
        )}

        {entry.interviewQuestions && (
          <div className="flex flex-col gap-3">
            {entry.interviewQuestions.map((qa, i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--border)] p-4 opacity-0"
                style={{ animation: "reveal-row 0.4s ease forwards", animationDelay: `${i * 60}ms` }}
              >
                <p className="mb-1.5 text-sm font-semibold">{qa.question}</p>
                <p className="text-sm text-[var(--fg-dim)]">{qa.suggestedAnswer}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Exit animation timing for session-history rows — deliberately slower than
// a snappy UI transition would use, since removal is destructive and the
// user asked for the row to visibly "leave" rather than vanish instantly.
const ROW_EXIT_MS = 420;
const ROW_EXIT_STAGGER_MS = 90;

function SessionHistory({
  history,
  activeId,
  onRemove,
  onClearAll,
}: {
  history: JobEntry[];
  activeId?: string;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);

  function handleRemove(id: string) {
    setRemovingIds((prev) => new Set(prev).add(id));
    setTimeout(() => onRemove(id), ROW_EXIT_MS);
  }

  function handleClearAll() {
    setConfirmingClear(false);
    setClearingAll(true);
    const total = ROW_EXIT_MS + Math.max(0, history.length - 1) * ROW_EXIT_STAGGER_MS;
    setTimeout(() => {
      onClearAll();
      setClearingAll(false);
    }, total);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Session history</CardTitle>
            <CardDescription>Jobs analyzed on this browser.</CardDescription>
          </div>
          {!confirmingClear ? (
            <button
              type="button"
              onClick={() => setConfirmingClear(true)}
              disabled={clearingAll || history.length === 0}
              className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--fg-dim)] transition-colors hover:border-red-400/50 hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
            >
              <Trash2 size={12} />
              Clear all
            </button>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5 text-xs">
              <span className="text-[var(--fg-dim)]">Clear all?</span>
              <button type="button" onClick={handleClearAll} className="rounded-full bg-red-500/90 px-2.5 py-1 font-semibold text-white transition-colors hover:bg-red-500">
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingClear(false)}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 font-medium text-[var(--fg-dim)] transition-colors hover:text-[var(--fg)]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {history.map((e, i) => {
          const isRemoving = clearingAll || removingIds.has(e.id);
          return (
            <div
              key={e.id}
              className="grid transition-[grid-template-rows,opacity,transform] ease-in-out"
              style={{
                gridTemplateRows: isRemoving ? "0fr" : "1fr",
                opacity: isRemoving ? 0 : 1,
                transform: isRemoving ? "translateX(16px) scale(0.97)" : "translateX(0) scale(1)",
                transitionDuration: `${ROW_EXIT_MS}ms`,
                transitionDelay: clearingAll ? `${i * ROW_EXIT_STAGGER_MS}ms` : "0ms",
              }}
            >
              <div className="overflow-hidden">
                <div className="group relative pb-2">
                  <a
                    href={`#/results?job=${e.id}`}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 pr-8 text-sm transition-colors ${
                      e.id === activeId
                        ? "border-accent-1 bg-accent-1/5"
                        : "border-[var(--border)] hover:bg-white/5"
                    }`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{e.job.title}</span>
                      <span className="truncate text-xs text-[var(--fg-dim)]">{e.job.company}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-accent-1">
                      {e.analysis.matchScore}%
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={(evt) => {
                      evt.preventDefault();
                      handleRemove(e.id);
                    }}
                    aria-label={`Remove ${e.job.title} from history`}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--fg-dim)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
