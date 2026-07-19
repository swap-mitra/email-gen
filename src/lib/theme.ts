export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "email-gen-theme";

/**
 * Executed inline, before hydration, so the correct theme is applied to
 * <html data-theme> before first paint — avoids a flash of the wrong theme.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var t=s==="light"||s==="dark"?s:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
