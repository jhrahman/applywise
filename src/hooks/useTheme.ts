import { useCallback, useEffect, useState } from "react";
import { getItemLocal, setItemLocal, STORAGE_KEYS } from "@/lib/storage";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getItemLocal<Theme>(STORAGE_KEYS.theme, "dark"));

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setItemLocal(STORAGE_KEYS.theme, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme };
}
