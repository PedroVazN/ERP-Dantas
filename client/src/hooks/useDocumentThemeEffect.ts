import { useEffect } from "react";
import type { Theme } from "../types";

export function useDocumentThemeEffect(theme: Theme) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
}

