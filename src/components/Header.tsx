import { Link, useLocation } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

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
