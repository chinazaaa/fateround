export type Theme = 'light' | 'dark'

export const THEME_COOKIE = 'kmk-theme'

export function parseThemeCookie(value: string | undefined | null): Theme {
  return value === 'dark' ? 'dark' : 'light'
}

/** Client-side: persist theme for SSR on the next request. */
export function setThemeCookie(theme: Theme) {
  try {
    document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;SameSite=Lax`
  } catch {
    /* cookie write blocked (e.g. Edge tracking prevention) — non-fatal */
  }
}
