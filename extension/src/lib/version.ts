// Version comparison for the "is a newer build published?" check. Mirrors
// src/lib/version.ts in the web app — kept in sync by hand since the two are
// separate build systems (same arrangement as bridge-protocol.ts).
//
// A plain `latest !== current` string check was the original approach, but it
// reports "update available" when the installed build is *newer* than what's
// deployed — which is exactly what a developer running a local unpacked build
// sees. Comparing numerically means only a genuinely newer published version
// triggers the nudge.

/** Returns >0 if a is newer than b, <0 if older, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.trim().split(".").map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** True only when `latest` is strictly newer than `current`. */
export function isUpdateAvailable(current: string, latest: string): boolean {
  return compareVersions(latest, current) > 0;
}
