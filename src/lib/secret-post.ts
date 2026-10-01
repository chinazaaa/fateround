/**
 * POST a secret-bearing body to a server route and report success separately from the payload.
 *
 * The RLS-hardening slices (Codewords key, Whot hands, Describe It word, Quick Draw next) all
 * need the same shim: a column is revoked from anon, and a server route hands the value back
 * only to the caller whose SECRET resolves to the right seat. They all POST rather than GET —
 * a resume/host token in a query string lands in server logs, CDN logs, browser history and
 * Referer headers — and they all have the same failure requirement below.
 *
 * WHY A RESULT TYPE, NOT `T | null`: for these routes `null` is a REAL answer ("you are not the
 * describer / not a spymaster"), so collapsing a 429, a 500 or an offline blip into `null` makes
 * a failed read indistinguishable from game state, and the caller silently renders the wrong
 * thing forever. `{ ok: false }` keeps "we do not know" separate from "there is nothing for
 * you", which is what lets callers retry (see src/hooks/useDescribeItWord.ts).
 *
 * Describe It is the first consumer; Codewords and Whot should adopt it the next time they are
 * touched (they currently inline the same fetch, with the `T | null` collapse this replaces).
 */
export type SecretPostResult<T> = { ok: true; data: T } | { ok: false }

export async function postSecretJson<T>(path: string, body: Record<string, unknown>): Promise<SecretPostResult<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false }
  }
}
