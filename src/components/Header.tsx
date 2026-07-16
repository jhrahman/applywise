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
    <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 sm:px-8">
      <div className="flex items-center gap-8">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.svg" alt="Applywise logo" width={32} height={32} />
          <span className="text-lg font-bold tracking-tight">Applywise</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
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
        className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/5 px-3.5 py-1.5 text-xs font-medium text-[var(--fg-dim)] transition-colors hover:text-[var(--fg)]"
      >
        {theme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
        {theme === "dark" ? "Dark" : "Light"}
      </button>
    </header>
  );
}
