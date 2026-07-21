import { apiUrl } from '@/lib/config'
import type { WstQuotePoolEntry } from '@/components/games/poll/poll-types'

/**
 * Poll-suite network helpers (confessions + WST quote pool). Kept local to the
 * poll views so the shared game-api.ts stays untouched (parallel-safety).
 */

async function send<T>(path: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

/** Leave an anonymous hot take attached to a round (poster stays anonymous). */
export function postConfession(gameId: string, resumeToken: string, roundId: string | null, text: string) {
  return send<{ success: boolean }>('/api/confessions', 'POST', {
    resumeToken,
    gameId: gameId.toUpperCase(),
    roundId: roundId ?? null,
    text,
  })
}

/**
 * Add or edit a Who Said This question (player path): a quote plus 2–4 answer options and the
 * index of the correct one. Trivia-style — mirrors web `useWstQuotePool.handleSubmitPoolQuote`.
 */
export function postWstQuote(
  gameId: string,
  resumeToken: string,
  quoteText: string,
  options: string[],
  correctIndex: number,
  quoteId?: string
) {
  return send<{ success: boolean; entry?: WstQuotePoolEntry }>('/api/wst-quotes', 'POST', {
    resumeToken,
    gameId: gameId.toUpperCase(),
    quoteText,
    options,
    correctIndex,
    ...(quoteId ? { quoteId } : {}),
  })
}

/** Remove one of your own quote-pool entries. */
export function deleteWstQuote(gameId: string, resumeToken: string, quoteId: string) {
  return send<{ success: boolean }>('/api/wst-quotes', 'DELETE', {
    resumeToken,
    gameId: gameId.toUpperCase(),
    quoteId,
  })
}
