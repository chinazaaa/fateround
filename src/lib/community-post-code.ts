// The weekly "post code" that in-app game winners enter to self-report a win on
// the community leaderboard. This is SEPARATE from the manager access code:
//
//   - manager code  -> full entry powers at /input (add/remove anyone's wins).
//     Held by the community manager only.
//   - post code     -> lets a winner add only their OWN win for today. Broadcast
//     to the whole WhatsApp group and rotated weekly, so its blast radius is
//     small if it leaks.
//
// Only the SHA-256 hash is stored (key = 'post_code_hash' in community_settings);
// the plaintext is never persisted. There is no session/cookie — the code is
// verified on each submit, with a failure delay on the public endpoint.

import { getSetting, setSetting } from '@/lib/community-data'
import { POST_CODE_MIN_LENGTH } from '@/lib/manager-constants'

const POST_CODE_KEY = 'post_code_hash'

// Normalize before hashing so entry is forgiving: case and stray spaces don't
// matter ("Naza", "naza", " NAZA " all match). Applied identically on set and
// verify so the hashes line up. Winners type this every time, so lenience wins.
// Exported so callers (route/UI) validate length against the SAME canonical form
// setPostCode uses — otherwise "A A A" passes a raw check then throws here.
export function normalizePostCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, '')
}

async function hashCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Constant-time-ish comparison of equal-length hex digests.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// True when a post code has been configured by the admin.
export async function postCodeIsSet(): Promise<boolean> {
  return Boolean(await getSetting(POST_CODE_KEY))
}

// Validate a submitted code against the stored hash.
export async function verifyPostCode(code: string): Promise<boolean> {
  const normalized = normalizePostCode(code)
  if (!normalized) return false
  const storedHash = await getSetting(POST_CODE_KEY)
  if (!storedHash) return false
  const candidate = await hashCode(normalized)
  return timingSafeEqualHex(candidate, storedHash)
}

// Set/rotate the weekly post code (admin only). Stores only the hash.
export async function setPostCode(code: string): Promise<void> {
  const normalized = normalizePostCode(code)
  if (normalized.length < POST_CODE_MIN_LENGTH) {
    throw new Error(`Code must be at least ${POST_CODE_MIN_LENGTH} characters`)
  }
  await setSetting(POST_CODE_KEY, await hashCode(normalized))
}
