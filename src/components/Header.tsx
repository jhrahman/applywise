import { Link, useLocation } from "react-router-dom";
import { ArrowDownToLine, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { useExtensionVersion } from "@/hooks/useExtensionVersion";

const NAV_ITEMS = [
  { to: "/", label: "Setup" },
  { to: "/results", label: "Results" },
];

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-8 sm:py-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-8">
        <Link to="/" className="flex shrink-0 items-center gap-2 sm:gap-3">
          <img src="/logo.svg" alt="Applywise logo" width={28} height={28} className="sm:h-8 sm:w-8" />
          <span className="hidden text-lg font-bold tracking-tight xs:inline">Applywise</span>
        </Link>
        <VersionPill />
        <nav className="flex min-w-0 items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3.5 sm:py-1.5 sm:text-sm ${
                  active
                    ? "bg-accent-1/15 text-accent-1"
                    : "text-[var(--fg-dim)] hover:text-[var(--fg)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[var(--fg-dim)] transition-colors hover:text-[var(--fg)] sm:px-3.5"
      >
        {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
        <span className="hidden xs:inline">{theme === "dark" ? "Dark" : "Light"}</span>
      </button>
    </header>
  );
}

// Shows which build the user is on, and turns into a download prompt the
// moment a newer one is published. Unpacked installs never auto-update, so
// without a nudge here a user can sit on a months-old build indefinitely
// without any signal that anything changed.
function VersionPill() {
  const { installed, installedVersion, latestVersion, updateAvailable, loading } =
    useExtensionVersion();

  // Reserve nothing while probing — a pill that pops in with the wrong state
  // and then corrects itself reads as a glitch.
  if (loading) return null;

  if (updateAvailable && latestVersion) {
    return (
      <a
        href="/applywise-extension.zip"
        download
        title={`You're on v${installedVersion} — v${latestVersion} is available`}
        className="group flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-1 to-[#e8791a] px-2.5 py-1 text-xs font-bold text-[#1a1206] shadow-[0_2px_10px_rgba(232,121,26,0.35)] transition-transform hover:-translate-y-px hover:shadow-[0_4px_14px_rgba(232,121,26,0.45)] sm:px-3 sm:py-1.5"
      >
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#1a1206]"
          style={{ animation: "pulse-dot 1.6s ease-in-out infinite" }}
        />
        <span className="hidden sm:inline">New Update Available</span>
        <span className="sm:hidden">Update</span>
        <ArrowDownToLine size={12} className="shrink-0 transition-transform group-hover:translate-y-px" />
      </a>
    );
  }

  // Installed and current → show the build they're actually running. Not
  // installed → show the version they'd get, so the number still means
  // something to a first-time visitor.
  const version = installed ? installedVersion : latestVersion;
  if (!version) return null;

  return (
    <span
      title={installed ? "Installed extension version" : "Latest extension version"}
      className="hidden shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] font-semibold tabular-nums text-[var(--fg-dim)] sm:inline-flex"
    >
      {installed && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-1" />}v{version}
    </span>
  );
}
