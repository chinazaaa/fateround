import { postSecretJson } from '@/lib/secret-post'

/**
 * Fetch the Describe It secret word through the server route rather than reading the table.
 *
 * `describe_it_sessions.current_word` is not anon-selectable since 20260807130000 — it used to
 * ship to every guesser's browser and was merely hidden in the UI. The route returns the word
 * only when the caller's secret (resume token, or host token for a seated host) resolves to the
 * current describer; everyone else gets `null`, which is a normal, non-error answer.
 *
 * RESULT, NOT `string | null`: `null` means "you are not the describer" and is real state, so a
 * transport failure must NOT be reported the same way. It returns `{ ok: false }` instead, so
 * the caller can retry rather than sit on a wrong answer for the rest of the turn (review on
 * PR #866: a single 429 or 500 used to lock the describer out until the word rotated).
 */
export async function fetchDescribeItWord(
  gameCode: string,
  auth?: { resumeToken?: string | null; hostToken?: string | null }
): Promise<{ ok: true; word: string | null } | { ok: false }> {
  const res = await postSecretJson<{ word?: string | null }>('/api/describe-it/my-word', {
    gameCode: gameCode.toUpperCase(),
    resumeToken: auth?.resumeToken ?? undefined,
    hostToken: auth?.hostToken ?? undefined,
  })
  if (!res.ok) return { ok: false }
  return { ok: true, word: res.data.word ?? null }
}
