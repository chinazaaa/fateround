const COOKIE_NAME = 'admin_session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type SessionPayload = {
  email: string
  // Fingerprint of ADMIN_PASSWORD at issue time. Rotating the password changes
  // this, so previously-issued tokens stop validating (password = kill switch).
  // Optional so pre-fingerprint tokens parse; verify still requires a match.
  v?: string
  exp: number
}

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured')
  return secret
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return toBase64Url(new Uint8Array(signature))
}

// Constant-time comparison of two equal-length strings. Bails on length only —
// callers feed it fixed-length HMAC digests, so length never leaks the secret.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// Constant-time equality for arbitrary secrets (email/password). Both sides are
// HMAC'd to a fixed-length digest first, so neither the length nor the content
// of the inputs leaks through comparison timing.
async function constantTimeEqualSecret(a: string, b: string): Promise<boolean> {
  const secret = getSecret()
  const [ha, hb] = await Promise.all([hmacSign(a, secret), hmacSign(b, secret)])
  return timingSafeEqualHex(ha, hb)
}

// Short, non-reversible fingerprint of the current ADMIN_PASSWORD. Embedded in
// issued tokens so rotating the password invalidates them. HMAC'd with the
// session secret so a leaked cookie can't be offline-dictionary-attacked back
// to the password.
async function currentPasswordFingerprint(): Promise<string | null> {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) return null
  const sig = await hmacSign(`admin-password-v1:${pw}`, getSecret())
  return sig.slice(0, 22)
}

export function adminCookieName(): string {
  return COOKIE_NAME
}

export function adminSessionMaxAgeSeconds(): number {
  return Math.floor(SESSION_MAX_AGE_MS / 1000)
}

export async function createAdminSessionToken(email: string): Promise<string> {
  const payload: SessionPayload = {
    email,
    v: (await currentPasswordFingerprint()) ?? '',
    exp: Date.now() + SESSION_MAX_AGE_MS,
  }
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await hmacSign(encoded, getSecret())
  return `${encoded}.${signature}`
}

export async function verifyAdminSessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null

  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null

  try {
    const expected = await hmacSign(encoded, getSecret())
    if (!timingSafeEqualHex(expected, signature)) return null

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as SessionPayload
    if (!payload.email || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null

    const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    if (!allowedEmail || payload.email.toLowerCase() !== allowedEmail) return null

    // Reject tokens issued under an old password: rotating (or clearing)
    // ADMIN_PASSWORD changes the fingerprint, which revokes existing sessions.
    const currentV = await currentPasswordFingerprint()
    if (!currentV || payload.v !== currentV) return null

    return payload
  } catch {
    return null
  }
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const allowedPassword = process.env.ADMIN_PASSWORD
  if (!allowedEmail || !allowedPassword) return false
  // Compute BOTH comparisons before combining them so neither the email match
  // nor the password length short-circuits (and thus leaks) via timing.
  const [emailOk, passwordOk] = await Promise.all([
    constantTimeEqualSecret(email.trim().toLowerCase(), allowedEmail),
    constantTimeEqualSecret(password, allowedPassword),
  ])
  return emailOk && passwordOk
}
