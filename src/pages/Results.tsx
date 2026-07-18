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
  Clock,
  Gift,
  Trash2,
  X,
  Cpu,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Reveal } from "@/components/ui/reveal";
import { useCountUp } from "@/hooks/useCountUp";
import { getItem, setItem, STORAGE_KEYS } from "@/lib/storage";
import { bridgeGenerateInterviewQuestions } from "@/lib/bridge";
import { convertToBdt, formatBdt } from "@/lib/currency";
import type {
  InterviewQA,
  InterviewQuestionSource,
  JobDetails,
  JobEntry,
  JobPosting,
  JobStatus,
} from "@/types";

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

/**
 * Entrance choreography, in milliseconds, gathered here because the timings
 * only make sense relative to each other — scattered across the components
 * they'd be impossible to reason about or re-tune.
 *
 * This page opens in a fresh tab the moment an analysis finishes, so it's the
 * payoff for a wait the user just sat through. Everything therefore lands
 * top-to-bottom in reading order: the cards arrive as whole objects first, then
 * the verdict fills in inside the hero card. That ordering is the point — the
 * eye is led down the page instead of being asked to re-scan a screen that
 * appeared all at once.
 *
 * Two rules keep it from becoming a wait of its own:
 *  - Nothing the user needs is gated behind the animation. Every card is
 *    readable by ~460ms; the later steps only add detail that's already legible
 *    underneath.
 *  - The cascade stays under a second. Longer and a stagger stops reading as
 *    polish and starts reading as a slow page.
 */
const REVEAL = {
  pageHeader: 0,
  heroCard: 60,
  interviewCard: 130,
  sidebar: 200,
  // The score counts rather than fades, so it starts while the hero card is
  // still arriving. It isn't subject to the compounding problem below, and
  // holding it back would park a static "0 /100" in front of the user for a
  // quarter of a second — long enough to read as a real score of zero before
  // it starts moving. By the time the card is legible the number is climbing.
  score: 180,
  // These *do* fade, so they wait for the hero card's own entrance to land
  // (60 + 400ms) and the card fills in after arriving whole. Firing earlier
  // fades a child in through a parent that's still fading — the two opacities
  // multiply, and the result looks muddy rather than layered.
  chips: 480,
  chipStagger: 60,
  notes: 660,
  noteStagger: 60,
} as const;

// The hero metric, and the one number the whole page exists to deliver — so it
// gets the only animation on the page that draws attention to itself rather
// than just easing content in. Long enough to register as counting; short
// enough that nobody waits on it to read the number.
const SCORE_COUNT_MS = 650;

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
      <Reveal delay={REVEAL.pageHeader}>
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Match results</h1>
        <p className="text-sm text-[var(--fg-dim)]">
          Results open here once the extension finishes analyzing a job posting.
        </p>
      </Reveal>

      {!entry ? (
        <Reveal delay={REVEAL.heroCard} variant="block">
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
        </Reveal>
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <Reveal delay={REVEAL.heroCard} variant="block">
              <JobResultCard entry={entry} onStatusChange={updateStatus} />
            </Reveal>
            <Reveal delay={REVEAL.interviewCard} variant="block">
              <InterviewQuestionsCard
                entry={entry}
                loading={interviewLoading}
                error={interviewError}
                onGenerate={handleGenerateInterviewQuestions}
              />
            </Reveal>
          </div>
          {/* The sidebar arrives last: it's reference material, not the answer
              the user opened this tab for. */}
          <div className="flex flex-col gap-6 lg:sticky lg:top-6">
            {history.length > 0 && (
              <Reveal delay={REVEAL.sidebar} variant="block">
                <SessionHistory
                  history={history}
                  activeId={entry.id}
                  onRemove={removeEntry}
                  onClearAll={clearHistory}
                />
              </Reveal>
            )}
          </div>
        </div>
      )}

      {!entry && history.length > 0 && (
        <Reveal delay={REVEAL.sidebar} variant="block">
          <SessionHistory history={history} onRemove={removeEntry} onClearAll={clearHistory} />
        </Reveal>
      )}
    </div>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  // Colour and label come from the final score, never the in-flight one: a
  // count-up from 0 crosses every band on its way, and re-colouring as it went
  // would flash red-amber-green on every strong match.
  const band = scoreBand(clamped);
  const shown = useCountUp(clamped, { delay: REVEAL.score, duration: SCORE_COUNT_MS });

  return (
    <div className="flex flex-col gap-4 xs:flex-row xs:items-center xs:gap-5">
      <div className="flex items-baseline gap-1">
        <span
          // tabular-nums keeps every digit the same width, so a number counting
          // up to 100 doesn't jitter its own layout on each frame.
          className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl"
          style={{ color: band.text }}
        >
          {shown}
        </span>
        <span className="text-lg font-semibold text-[var(--fg-dim)]">/100</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">Match score</span>
          <span className="text-xs font-semibold" style={{ color: band.text }}>
            {band.label}
          </span>
        </div>
        {/* The bar is driven off the same counted value as the digits rather
            than a CSS transition of its own — two clocks would visibly drift. */}
        <div
          className="h-2.5 overflow-hidden rounded-full"
          style={{ background: band.bg }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Match score: ${clamped} out of 100 — ${band.label}`}
        >
          <div className="h-full rounded-full" style={{ width: `${shown}%`, background: band.text }} />
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
    <Reveal delay={delay}>
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
    </Reveal>
  );
}

// Escapes a user/AI-supplied string so it can be dropped into a RegExp as a
// literal — skill and keyword names routinely contain regex metacharacters
// (C++, C#, Node.js, ASP.NET), which would otherwise corrupt the pattern.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface HighlightSegment {
  text: string;
  emphasize: boolean;
}

/**
 * Splits a note into plain / emphasized segments. Emphasis is derived, not
 * requested from the model: we mark the exact skills and keywords the analysis
 * already surfaced (matching/missing/keywords) plus any quoted phrase the model
 * called out. This makes the load-bearing words in a wall of ATS prose jump
 * out without depending on a model reliably emitting formatting markup.
 */
function splitHighlights(text: string, terms: string[]): HighlightSegment[] {
  // Quoted phrases first (both straight and curly quotes), then the known
  // terms longest-first so "React Native" wins over a bare "React".
  const cleanTerms = Array.from(new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 2))).sort(
    (a, b) => b.length - a.length
  );
  const patterns = ['"[^"]+"', "“[^”]+”", ...cleanTerms.map(escapeRegExp)];
  const re = new RegExp(patterns.join("|"), "gi");

  const segments: HighlightSegment[] = [];
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), emphasize: false });
    segments.push({ text: m[0], emphasize: true });
    last = m.index + m[0].length;
    if (m.index === re.lastIndex) re.lastIndex++; // guard against a zero-length match looping
  }
  if (last < text.length) segments.push({ text: text.slice(last), emphasize: false });
  return segments;
}

function HighlightedNote({ text, terms }: { text: string; terms: string[] }) {
  const segments = splitHighlights(text, terms);
  return (
    <>
      {segments.map((seg, i) =>
        seg.emphasize ? (
          <mark
            key={i}
            className="rounded-[3px] bg-accent-1/15 px-0.5 font-semibold text-[var(--fg)]"
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

function BulletList({
  label,
  items,
  icon,
  delay,
  emptyState,
  highlightTerms = [],
}: {
  label: string;
  items: string[];
  icon: React.ReactNode;
  delay: number;
  // Shown instead of hiding the section when the list is legitimately empty.
  // For ATS notes an empty list is a *result* ("nothing wrong found"), and
  // silently dropping the section makes that indistinguishable from the
  // analysis never having run.
  emptyState?: string;
  // Terms to emphasize inside each bullet — the skills/keywords this analysis
  // already flagged. Empty is fine (quoted phrases still get emphasized).
  highlightTerms?: string[];
}) {
  if (items.length === 0 && !emptyState) return null;
  return (
    <Reveal delay={delay}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
        {icon}
        {label}
      </div>
      {items.length === 0 ? (
        <p
          className="flex items-center gap-1.5 text-sm"
          style={{ color: "var(--status-good-text)" }}
        >
          <CheckCircle2 size={14} className="shrink-0" />
          {emptyState}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-1" />
              {/* Justified so the multi-line notes read as tidy paragraphs
                  rather than ragged fragments; hyphenation keeps justify from
                  opening ugly rivers of whitespace on narrow columns. */}
              <span className="min-w-0 flex-1 text-justify hyphens-auto text-[var(--fg)]">
                <HighlightedNote text={item} terms={highlightTerms} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Reveal>
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
    <div className="min-w-0 rounded-xl border border-[var(--border)] p-3.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div
        className={
          // break-words so a long, space-less salary/location string wraps
          // inside its cell instead of overflowing the 2-col mobile grid.
          unavailable
            ? "break-words text-sm italic text-[var(--fg-dim)]"
            : "break-words text-sm font-semibold text-[var(--fg)]"
        }
      >
        {value}
      </div>
      {secondary && <div className="mt-0.5 break-words text-xs text-[var(--fg-dim)]">{secondary}</div>}
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
      <DetailTile
        icon={<Clock size={12} />}
        label="Experience"
        value={jobDetails.experienceRequired ?? "Not available"}
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

// Perks the posting states, rendered as their own rounded-pill row — a list,
// unlike the single-value tiles above, so it gets a chip group rather than a
// DetailTile. Hidden entirely when the posting names no benefits (or for
// history entries saved before this field existed), since an empty "Benefits"
// header reads as missing data rather than a clean result.
function BenefitsRow({ benefits }: { benefits: string[] }) {
  if (benefits.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--fg-dim)]">
        <Gift size={13} />
        Benefits &amp; perks
      </div>
      <div className="flex flex-wrap gap-1.5">
        {benefits.map((b) => (
          <span
            key={b}
            className="rounded-full border border-[var(--border)] bg-accent-1/5 px-2.5 py-1 text-xs font-semibold text-[var(--fg)]"
          >
            {b}
          </span>
        ))}
      </div>
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
  // The words worth emphasizing inside the ATS notes and suggestions are
  // exactly the skills and keywords this analysis already surfaced above.
  const highlightTerms = [
    ...analysis.matchingSkills,
    ...analysis.missingSkills,
    ...analysis.missingKeywords,
  ];
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
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
              experienceRequired: null,
              location: null,
              workMode: null,
              salary: null,
              benefits: [],
            }
          }
        />

        <BenefitsRow benefits={analysis.jobDetails?.benefits ?? []} />

        <ScoreMeter score={analysis.matchScore} />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <ChipGroup
            label="Matching skills"
            items={analysis.matchingSkills}
            icon={<CheckCircle2 size={13} />}
            tone="good"
            delay={REVEAL.chips}
          />
          <ChipGroup
            label="Missing skills"
            items={analysis.missingSkills}
            icon={<XCircle size={13} />}
            tone="bad"
            delay={REVEAL.chips + REVEAL.chipStagger}
          />
          <ChipGroup
            label="Missing keywords"
            items={analysis.missingKeywords}
            icon={<KeyRound size={13} />}
            tone="warn"
            delay={REVEAL.chips + REVEAL.chipStagger * 2}
          />
        </div>

        <div className="flex flex-col gap-5 border-t border-[var(--border)] pt-5">
          <BulletList
            label="ATS notes"
            items={analysis.atsNotes}
            icon={<FileWarning size={13} />}
            delay={REVEAL.notes}
            emptyState="No ATS parsing or keyword-matching issues found."
            highlightTerms={highlightTerms}
          />
          <BulletList
            label="Suggestions"
            items={analysis.suggestions}
            icon={<Lightbulb size={13} />}
            delay={REVEAL.notes + REVEAL.noteStagger}
            highlightTerms={highlightTerms}
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
          Up to 20 questions predicted for this role — weighted 60% toward the job posting's
          skills and responsibilities, 40% toward your resume — each with a suggested answer.
        </CardDescription>
        {entry.interviewQuestions && <QuestionMixSummary questions={entry.interviewQuestions} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!entry.interviewQuestions && (
          <div>
            <Button onClick={onGenerate} disabled={loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? "Generating…" : "Generate interview questions"}
            </Button>
            {error && <p className="mt-2 text-sm text-[var(--status-bad-text)]">{error}</p>}
          </div>
        )}

        {entry.interviewQuestions && (
          <div className="flex flex-col gap-3">
            {entry.interviewQuestions.map((qa, i) => (
              // Timed off its own index rather than the REVEAL table: this list
              // appears when the user clicks Generate, which is a separate
              // moment from the page opening. Capped so a full 20 questions
              // don't take 1.2s to finish arriving.
              <Reveal
                key={i}
                delay={Math.min(i, 8) * 50}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <div className="mb-1.5 flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-justify hyphens-auto">{qa.question}</p>
                  <SourceBadge source={qa.source} />
                </div>
                <p className="text-sm text-justify hyphens-auto text-[var(--fg-dim)]">
                  {qa.suggestedAnswer}
                </p>
              </Reveal>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// The question mix is a promise the card makes ("60% from the posting"), so
// show the counts the model actually returned rather than asking the user to
// take it on faith. Also makes a model that ignored the ratio visible instead
// of silently shipping 20 resume-walkthrough questions.
function QuestionMixSummary({ questions }: { questions: InterviewQA[] }) {
  const total = questions.length;
  const fromJob = questions.filter((qa) => qa.source === "job").length;
  const fromResume = questions.filter((qa) => qa.source === "resume").length;

  // Pre-split entries carry no source tag — nothing meaningful to summarize.
  if (fromJob + fromResume === 0) return null;

  const jobPercent = Math.round((fromJob / total) * 100);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
      <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5" style={SOURCE_STYLES.job}>
        <Briefcase size={11} className="shrink-0" />
        {fromJob} from the job posting
      </span>
      <span className="flex items-center gap-1.5 rounded-full px-2 py-0.5" style={SOURCE_STYLES.resume}>
        <FileText size={11} className="shrink-0" />
        {fromResume} from your CV
      </span>
      <span className="text-[var(--fg-dim)]">{jobPercent}% role-focused</span>
    </div>
  );
}

const SOURCE_STYLES = {
  job: { color: "var(--status-good-text)", backgroundColor: "var(--status-good-bg)" },
  resume: { color: "var(--status-warn-text)", backgroundColor: "var(--status-warn-bg)" },
} as const;

function SourceBadge({ source }: { source?: InterviewQuestionSource }) {
  if (!source) return null;

  const isJob = source === "job";
  return (
    <span
      className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap"
      style={SOURCE_STYLES[source]}
      title={
        isJob
          ? "Predicted from the job posting's skills, responsibilities, and requirements"
          : "Predicted from your resume's experience and projects"
      }
    >
      {isJob ? <Briefcase size={10} className="shrink-0" /> : <FileText size={10} className="shrink-0" />}
      {isJob ? "Job posting" : "Your CV"}
    </span>
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
              className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--fg-dim)] transition-colors hover:border-[var(--status-bad-border)] hover:text-[var(--status-bad-text)] disabled:pointer-events-none disabled:opacity-40"
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--fg-dim)] opacity-0 transition-opacity hover:text-[var(--status-bad-text)] group-hover:opacity-100"
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
