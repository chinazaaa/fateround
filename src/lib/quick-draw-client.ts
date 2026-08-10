/**
 * Fetch the Quick Draw (guess mode) secret prompt through the server route rather than reading
 * the table.
 *
 * `quick_draw_guess_sessions.current_word` is not anon-selectable since 20260807140000 — it used
 * to ship to every guesser's browser and was merely hidden in the UI. The route returns the word
 * only when the caller's secret (resume token, or host token for a seated host) resolves to the
 * current drawer; everyone else gets `null`, which is a normal, non-error answer.
 *
 * Returns null on any transport failure too — the caller shows the loading placeholder rather
 * than an empty prompt.
 */
export async function fetchQuickDrawWord(
  gameCode: string,
  auth?: { resumeToken?: string | null; hostToken?: string | null }
): Promise<string | null> {
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
    if (!res.ok) return null
    const data = (await res.json()) as { word?: string | null }
    return data.word ?? null
  } catch {
    return null
  }
}
