/**
 * Fetch the Quick Draw (guess mode) secret prompt through the server route rather than reading
 * the table.
 *
 * `quick_draw_guess_sessions.current_word` is not anon-selectable since 20260807140000 — it used
 * to ship to every guesser's browser and was merely hidden in the UI. The route returns the word
 * only when the caller's secret (resume token, or host token for a seated host) resolves to the
 * current drawer; everyone else gets `null`, which is a normal, non-error answer.
 *
 * A transport failure is NOT that answer, so it is reported separately: `{ ok: false }` never
 * collapses into `{ ok: true, word: null }`. A failed read must never be mistaken for real game
 * state ("you are not the drawer") — the caller retries instead of settling on an empty prompt.
 */
export type QuickDrawWordResult =
  | { ok: true; word: string | null }
  /** `retryable` false = the server gave a settled answer (bad code, wrong game type); retrying it forever is pointless. */
  | { ok: false; retryable: boolean }

export async function fetchQuickDrawWord(
  gameCode: string,
  auth?: { resumeToken?: string | null; hostToken?: string | null }
): Promise<QuickDrawWordResult> {
  try {
    // POST so the token travels in the body. A GET query string would put it in access logs,
    // CDN logs and browser history.
    const res = await fetch('/api/quick-draw/my-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        resumeToken: auth?.resumeToken ?? undefined,
        hostToken: auth?.hostToken ?? undefined,
      }),
    })
    if (!res.ok) return { ok: false, retryable: isRetryableStatus(res.status) }
    const data = (await res.json()) as { word?: string | null }
    return { ok: true, word: data.word ?? null }
  } catch {
    // Network blip, abort, unparseable body — all transient as far as the caller is concerned.
    return { ok: false, retryable: true }
  }
}

/**
 * 429 (the shared handsFetch bucket), 408 and 5xx (cold start, deploy, blip) clear on their own.
 * Every other 4xx is the server's settled answer about this request and will not.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

/**
 * Backoff for re-reading the prompt: quick first retries so a blip is invisible to the drawer,
 * then a steady 8s floor for as long as the turn lasts, because a drawer with no prompt cannot
 * play at all. Mirrored in apps/mobile/hooks/useQuickDrawWord.ts.
 */
export const QUICK_DRAW_WORD_RETRY_DELAYS_MS = [400, 1200, 3000, 8000]
