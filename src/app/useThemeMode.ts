import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "spending-diary.theme";

export type ThemeMode = "light" | "dark";

function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  return "light";
}

export function useThemeMode() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getPreferredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.body.dataset.theme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  return {
    themeMode,
    toggleThemeMode: () => setThemeMode((current) => (current === "dark" ? "light" : "dark")),
    setThemeMode,
  };
}
