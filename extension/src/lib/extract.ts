import type { JobPosting } from "./types";

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return richTextFrom(div);
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) {
    return String((value as { name: unknown }).name ?? "");
  }
  return "";
}

/**
 * schema.org JobPosting.jobLocation is a Place (sometimes an array of them),
 * whose real content is usually a nested PostalAddress rather than a plain
 * "name" string — textOf() alone misses that shape entirely, which is the
 * most common reason location silently comes back empty even when the
 * posting has perfectly good structured data.
 */
function extractLocationText(value: unknown): string {
  if (Array.isArray(value)) return extractLocationText(value[0]);
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const place = value as Record<string, unknown>;
  const direct = textOf(place);
  if (direct) return direct;

  const address = place.address;
  if (typeof address === "string") return address;
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    const parts = [a.addressLocality, a.addressRegion, a.addressCountry]
      .map((p) => (typeof p === "string" ? p.trim() : ""))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(", ");
  }
  return "";
}

/** Walks a parsed JSON-LD payload (which may nest under @graph) looking for a JobPosting node. */
function findJobPostingNode(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findJobPostingNode(item);
      if (found) return found;
    }
    return null;
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const type = obj["@type"];
    const isJobPosting =
      type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
    if (isJobPosting) return obj;
    if (obj["@graph"]) return findJobPostingNode(obj["@graph"]);
  }
  return null;
}

function extractFromJsonLd(): JobPosting | null {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent || "");
    } catch {
      continue;
    }
    const node = findJobPostingNode(parsed);
    if (!node) continue;

    const title = textOf(node.title) || document.title;
    const company = textOf(node.hiringOrganization);
    const location = extractLocationText(node.jobLocation) || undefined;
    const rawDescription = textOf(node.description);
    const description = rawDescription.includes("<") ? stripHtml(rawDescription) : rawDescription;

    if (!description) continue;

    return {
      title: title || "Untitled role",
      company: company || "Unknown company",
      location,
      description,
      url: window.location.href,
    };
  }
  return null;
}

// High-confidence selectors for boards that don't publish JSON-LD but use
// a stable, purpose-built container for the description — checked first,
// and the first match wins (no "largest wins" here, since on a page with a
// job list alongside the reading pane, "largest" tends to mean "the whole
// list", not "the one job you're looking at").
const PRECISE_DESCRIPTION_SELECTORS = [
  // LinkedIn — data-testid is a QA hook LinkedIn keeps stable across rebuilds,
  // unlike its hashed CSS classes (e.g. "_206505cb"), which regenerate on
  // every deploy and aren't safe to match on at all.
  '[data-testid="expandable-text-box"]',
  ".jobs-description__content",
  ".jobs-description-content__text",
  ".jobs-box__html-content",
  "#job-details",
  // Generic boards
  '[class*="job-description"]',
  '[class*="jobDescription"]',
  '[class*="description__text"]',
  '[id*="job-description"]',
  '[id*="jobDescription"]',
  '[class*="posting-requirements"]',
];

// Headings that reliably introduce the actual job description body — used
// as a last-ditch, class-agnostic way to locate the description when a site
// (LinkedIn included) has none of the selectors above and no JSON-LD.
const DESCRIPTION_HEADING_TEXTS = ["about the job", "job description", "about this role", "role overview"];

const GENERIC_DESCRIPTION_SELECTORS = ['[class*="job-details"]', "article"];

// Hard cap regardless of source — protects against a mis-extraction (e.g. a
// wrapping container that swept in an entire job list) blowing through the
// AI provider's per-minute token quota in a single request.
const MAX_DESCRIPTION_CHARS = 8000;

// Flattened text — everything on one line. Fine for size comparisons (which
// container is biggest) but NOT for the text the AI actually reads.
function textFrom(el: Element): string {
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}

// Block-level tags whose boundaries should become line breaks, so labels stay
// attached to their values instead of running together.
const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN",
  "UL", "OL", "LI", "TABLE", "TR", "H1", "H2", "H3", "H4", "H5", "H6",
]);

/**
 * Like textFrom, but preserves line structure. Plain textContent collapses a
 * posting like "Salary Range<br>BDT 80,000 - 120,000 (Monthly)" or
 * "<li>Location: Dhaka, Bangladesh</li>" into one run-on line, which makes it
 * genuinely hard for the AI to tell which value belongs to which label —
 * exactly why salary / work mode / location kept coming back "Not available"
 * even when they were plainly in the posting. Turning <br> and block
 * boundaries into newlines means each label:value pair arrives as its own
 * clean line. This is what the AI receives as the job description.
 */
function richTextFrom(el: Element): string {
  let out = "";
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        // Source whitespace (indentation, wrapped lines) is noise — collapse
        // it; the real breaks come from the block/<br> handling below.
        out += (child.textContent || "").replace(/[ \t\r\n\f]+/g, " ");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName;
        if (tag === "BR" || tag === "HR") {
          out += "\n";
          continue;
        }
        const block = BLOCK_TAGS.has(tag);
        if (block) out += "\n";
        walk(child);
        if (block) out += "\n";
      }
    }
  };
  walk(el);
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Cap for widening: a real single job description (plus a small overview
// box) doesn't run past ~20k characters; past that it's almost certainly a
// container that swept in a job list or other unrelated page content.
const WIDEN_CAP_CHARS = 20_000;

/**
 * Some boards (job aggregators especially) render a "Company Name / Location
 * / Job Type" overview box as a sibling of the actual description container,
 * not a descendant — matching only the description element then loses that
 * info entirely, even though it's sitting right next to it. Climb a few
 * ancestor levels and keep the largest one that still stays under the sweep
 * cap, so a nearby overview box gets pulled in without risking a full
 * sidebar/job-list sweep. Returns the chosen element; rich text is produced
 * from it at the end so structure is preserved.
 */
// Never widen up into page-level wrappers — a job "overview box" is always a
// content container, never <main>/<body>/<html>. Climbing into those would
// let a small page (or one without much chrome) sweep in the whole document,
// including the tab title and site header.
const WIDEN_STOP_TAGS = new Set(["MAIN", "BODY", "HTML", "HEAD"]);

function widenElement(el: Element): Element {
  let cur: Element = el;
  let best = el;
  let bestLen = textFrom(el).length;
  for (let i = 0; i < 4 && cur.parentElement; i++) {
    cur = cur.parentElement;
    if (WIDEN_STOP_TAGS.has(cur.tagName)) break;
    const len = textFrom(cur).length;
    if (len > WIDEN_CAP_CHARS) break;
    if (len > bestLen) {
      best = cur;
      bestLen = len;
    }
  }
  return best;
}

/**
 * Finds the description by locating a heading like "About the job" and
 * reading the next sibling with real content — works regardless of class
 * names, since it keys off visible heading text instead.
 */
function findByHeadingText(): Element | null {
  for (const heading of document.querySelectorAll("h1, h2, h3, h4")) {
    const headingText = textFrom(heading).toLowerCase();
    if (!DESCRIPTION_HEADING_TEXTS.includes(headingText)) continue;
    let sibling = heading.nextElementSibling;
    while (sibling) {
      if (textFrom(sibling).length > 200) return sibling;
      sibling = sibling.nextElementSibling;
    }
  }
  return null;
}

/**
 * Largest element matching `selector` whose text stays under the sweep cap.
 * A LinkedIn job page can have several elements sharing the description
 * testid (a company blurb, a truncated preview, the real body) — the real
 * job description is the biggest of them, so pick that rather than whichever
 * document order happens to return first. The cap still guards against a
 * selector that accidentally matches a whole job-list wrapper.
 */
function largestMatch(selector: string): Element | null {
  let best: Element | null = null;
  let bestLen = 0;
  for (const el of document.querySelectorAll(selector)) {
    const len = textFrom(el).length;
    if (len <= WIDEN_CAP_CHARS && len > bestLen) {
      best = el;
      bestLen = len;
    }
  }
  return best;
}

/** Falls back to page text extraction when no JSON-LD is present. */
function extractHeuristic(): JobPosting | null {
  for (const selector of PRECISE_DESCRIPTION_SELECTORS) {
    const el = largestMatch(selector);
    if (el && textFrom(el).length > 200) return buildResult(richTextFrom(widenElement(el)));
  }

  const byHeading = findByHeadingText();
  if (byHeading) return buildResult(richTextFrom(widenElement(byHeading)));

  let best: Element | null = null;
  let bestLen = 0;
  for (const selector of GENERIC_DESCRIPTION_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      const len = textFrom(el).length;
      // Skip anything implausibly large — a real single job description
      // doesn't run past ~20k characters; past that it's almost certainly
      // a container that swept in surrounding page content too.
      if (len > 200 && len < 20_000 && len > bestLen) {
        best = el;
        bestLen = len;
      }
    }
  }
  if (best) return buildResult(richTextFrom(widenElement(best)));

  // Last resort: the largest small-ish <div>/<section>/<main> text block.
  for (const el of document.querySelectorAll("div, section, main")) {
    if (el.children.length > 20) continue; // skip obvious layout containers
    const len = textFrom(el).length;
    if (len > 300 && len < 20_000 && len > bestLen) {
      best = el;
      bestLen = len;
    }
  }

  return best ? buildResult(richTextFrom(widenElement(best))) : null;
}

function buildResult(rawText: string): JobPosting {
  return {
    title: document.title || "Untitled role",
    company: "Unknown company",
    description: rawText,
    url: window.location.href,
  };
}

function truncate(text: string): string {
  return text.length > MAX_DESCRIPTION_CHARS
    ? text.slice(0, MAX_DESCRIPTION_CHARS) + " …[truncated]"
    : text;
}

// Some boards (bdjobs.com and similar) render required skills as a row of
// pill/tag buttons in a dedicated "Skills" widget, entirely separate from
// the prose description container — plain textContent extraction of that
// container misses them since they live elsewhere in the DOM. "apphighlight"
// is bdjobs.com's own Angular directive attribute marking these tags; the
// rest are generic patterns other boards tend to use for the same widget.
const SKILL_CHIP_SELECTORS = [
  "[apphighlight]",
  '[class*="skill-tag"]',
  '[class*="skills-tag"]',
  '[class*="skill_tag"]',
  '[data-testid*="skill"]',
];

function extractSkillChips(): string[] {
  const seen = new Set<string>();
  for (const selector of SKILL_CHIP_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      const text = textFrom(el);
      if (text && text.length < 60) seen.add(text);
    }
  }
  return [...seen];
}

/**
 * Folds any skill chips not already mentioned in the prose description into
 * an explicit "Required skills" line so the AI reads them directly, instead
 * of silently losing a widget that plain textContent extraction skipped.
 */
function appendSkillsLine(description: string, chips: string[]): string {
  if (chips.length === 0) return description;
  const lowerDescription = description.toLowerCase();
  const missing = chips.filter((chip) => !lowerDescription.includes(chip.toLowerCase()));
  if (missing.length === 0) return description;
  return `${description}\n\nRequired skills: ${missing.join(", ")}`;
}

// LinkedIn ships CSS-in-JS with hashed, build-specific class names (e.g.
// "_206505cb") that churn constantly — matching on them is a losing game.
// These signals are structural instead and much more stable: a real link to
// a company page, the "posted X ago" timestamp that always sits next to the
// location, and the "check-small" icon LinkedIn uses to mark the workplace
// type / employment type pills next to the apply button.
const LINKEDIN_AGO_PATTERN = /\b\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/i;
const LINKEDIN_WORK_MODE_WORDS = /^(remote|hybrid|on-site|onsite)$/i;
const LINKEDIN_EMPLOYMENT_TYPE_WORDS =
  /^(full-time|part-time|contract|internship|temporary|volunteer|other)$/i;

interface LinkedInMeta {
  company: string | null;
  location: string | null;
  employmentType: string | null;
  workMode: string | null;
}

function extractLinkedInMeta(): LinkedInMeta {
  let company: string | null = null;
  const companyLink = document.querySelector<HTMLAnchorElement>(
    'a[href*="linkedin.com/company/"], a[href^="/company/"]'
  );
  if (companyLink) {
    const text = textFrom(companyLink);
    if (text && text.length < 100) company = text;
  }

  // The location sits beside a "posted X ago" timestamp, separated by "·"
  // bullets (e.g. "Dhaka, Bangladesh · 3 months ago · Over 100 people
  // clicked apply") — find that line and take the segment before the first
  // bullet, since that's consistently the location across LinkedIn's layouts.
  let location: string | null = null;
  for (const el of document.querySelectorAll("p, span, div")) {
    if (el.children.length > 8) continue;
    const text = textFrom(el);
    if (text.length > 150 || !LINKEDIN_AGO_PATTERN.test(text)) continue;
    const first = text.split("·")[0]?.trim();
    if (first && first.length < 80 && !LINKEDIN_AGO_PATTERN.test(first) && !/applicant|clicked apply|applied/i.test(first)) {
      location = first;
      break;
    }
  }

  // Workplace-type ("Hybrid"/"Remote"/"On-site") and employment-type
  // ("Full-time"/"Part-time"/…) pills both use the same check-mark icon —
  // classify each by matching its label text against the known word sets
  // rather than trusting any particular class name.
  let employmentType: string | null = null;
  let workMode: string | null = null;
  for (const svg of document.querySelectorAll('svg[id="check-small"]')) {
    const container = svg.closest("a") ?? svg.parentElement;
    if (!container) continue;
    const spans = container.querySelectorAll("span");
    const label = spans.length > 0 ? textFrom(spans[spans.length - 1]) : "";
    if (!label) continue;
    if (!workMode && LINKEDIN_WORK_MODE_WORDS.test(label)) workMode = label;
    else if (!employmentType && LINKEDIN_EMPLOYMENT_TYPE_WORDS.test(label)) employmentType = label;
  }

  return { company, location, employmentType, workMode };
}

function applyLinkedInMeta(job: JobPosting): JobPosting {
  const meta = extractLinkedInMeta();

  const company = !job.company || job.company === "Unknown company" ? meta.company ?? job.company : job.company;
  const location = job.location ?? meta.location ?? undefined;

  const extraLines: string[] = [];
  if (meta.employmentType) extraLines.push(`Employment type: ${meta.employmentType}`);
  if (meta.workMode) extraLines.push(`Workplace type: ${meta.workMode}`);
  const description = extraLines.length > 0 ? `${job.description}\n\n${extraLines.join("\n")}` : job.description;

  return { ...job, company, location, description };
}

/**
 * Take the richer description of the two sources, but keep whichever source
 * has real metadata. LinkedIn's JSON-LD (when present at all) is sometimes a
 * thin summary while the DOM has the full "About the job" body; other boards
 * have clean JSON-LD but a messy DOM. Picking the longer description and
 * preferring non-placeholder company/location/title gets the best of both.
 */
function mergeExtractions(jsonLd: JobPosting | null, heuristic: JobPosting | null): JobPosting | null {
  if (!jsonLd) return heuristic;
  if (!heuristic) return jsonLd;
  const richer = heuristic.description.length > jsonLd.description.length ? heuristic : jsonLd;
  const realCompany = jsonLd.company && jsonLd.company !== "Unknown company" ? jsonLd.company : null;
  const realTitle = jsonLd.title && jsonLd.title !== "Untitled role" ? jsonLd.title : null;
  return {
    ...richer,
    title: realTitle ?? richer.title,
    company: realCompany ?? richer.company,
    location: jsonLd.location ?? richer.location,
  };
}

export function extractJobPosting(): JobPosting | null {
  const skillChips = extractSkillChips();
  let base = mergeExtractions(extractFromJsonLd(), extractHeuristic());
  if (!base) return null;

  base = { ...base, description: appendSkillsLine(base.description, skillChips) };
  if (window.location.hostname.includes("linkedin.com")) base = applyLinkedInMeta(base);

  return { ...base, description: truncate(base.description) };
}
