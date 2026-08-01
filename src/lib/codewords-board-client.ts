import type { CodewordsBoard } from '@/types'

/**
 * Fetch the Codewords board through the server route rather than reading the table.
 *
 * `codewords_boards.key` is not anon-selectable since 20260803170000 (audit finding H2), so a
 * direct client read now returns a board without the key — or errors on `select('*')`. The
 * route decides who is entitled to the real key (host, spymasters, or anyone once the game has
 * finished) and hands everyone else a masked copy.
 *
 * Returns null when there is no board yet, or on any transport failure — callers treat that the
 * same way they treated a missing row before.
 */
export async function fetchCodewordsBoard(
  gameCode: string,
  auth?: { hostToken?: string | null; resumeToken?: string | null }
): Promise<CodewordsBoard | null> {
  try {
    // POST so the token travels in the body. A GET query string would put it in access logs,
    // CDN logs and browser history (flagged in review on PR #736).
    const res = await fetch('/api/codewords/board', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameCode: gameCode.toUpperCase(),
        hostToken: auth?.hostToken ?? undefined,
        resumeToken: auth?.resumeToken ?? undefined,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { board?: CodewordsBoard | null }
    return data.board ?? null
  } catch {
    return null
  }
}
