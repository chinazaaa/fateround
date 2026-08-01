const COOKIE_NAME = 'admin_session'
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

type SessionPayload = {
  email: string
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

/**
 * Constant-time string comparison (audit finding M5). `===` on a secret short-circuits at the
 * first differing byte, which leaks its prefix through response timing. Compares the SHA-256
 * digests so inputs of different lengths still take the same path.
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const va = new Uint8Array(da)
  const vb = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
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

export function adminCookieName(): string {
  return COOKIE_NAME
}

export function adminSessionMaxAgeSeconds(): number {
  return Math.floor(SESSION_MAX_AGE_MS / 1000)
}

export async function createAdminSessionToken(email: string): Promise<string> {
  const payload: SessionPayload = {
    email,
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
    if (!(await timingSafeEqual(expected, signature))) return null

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as SessionPayload
    if (!payload.email || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null

    const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    if (!allowedEmail || payload.email.toLowerCase() !== allowedEmail) return null

    return payload
  } catch {
    return null
  }
}

export async function verifyAdminCredentials(email: string, password: string): Promise<boolean> {
  const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const allowedPassword = process.env.ADMIN_PASSWORD
  if (!allowedEmail || !allowedPassword) return false
  // Compare BOTH in constant time, and evaluate both regardless of the first result, so the
  // response time doesn't reveal whether the email was the one that matched.
  const emailOk = await timingSafeEqual(email.trim().toLowerCase(), allowedEmail)
  const passwordOk = await timingSafeEqual(password, allowedPassword)
  return emailOk && passwordOk
}
