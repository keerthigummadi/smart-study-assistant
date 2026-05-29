import { useEffect } from "react";
import { useTheme } from "@/hooks/use-theme";

// Initializes theme from storage on mount (no-op render)
export function ThemeInit() {
  const { theme } = useTheme();
  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
  }, [theme]);
  return null;
}
