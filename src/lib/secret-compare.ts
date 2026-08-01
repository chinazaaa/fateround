/**
 * Constant-time comparison for the app's secret tokens.
 *
 * `===` on a secret short-circuits at the first differing byte, so response time leaks how much
 * of a guess was correct. Over the public internet, behind Cloudflare and two service hops, that
 * signal is buried in noise and is not a practical attack on this app — but the comparison is
 * free to get right, and the codebase already does it for the admin password. Doing it in one
 * place and nowhere else invites the question "why there and not here" on every future review;
 * this is the answer.
 *
 * Compares SHA-256 digests rather than the raw strings, so inputs of different lengths take the
 * same path — a length check would leak the secret's length before the loop even runs.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const bytesA = new Uint8Array(digestA)
  const bytesB = new Uint8Array(digestB)
  let diff = 0
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i] ^ bytesB[i]
  return diff === 0
}

/**
 * Convenience wrapper for the common shape: a caller-supplied token vs. a value read from the
 * database, either of which may be absent. A missing value on either side is never a match —
 * and still costs a comparison, so "no token stored" and "wrong token" are indistinguishable.
 */
export async function secretMatches(supplied: string | null | undefined, stored: string | null | undefined) {
  const matched = await timingSafeEqual(supplied ?? '', stored ?? '')
  return matched && Boolean(supplied) && Boolean(stored)
}
