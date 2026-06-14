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
    if (expected !== signature) return null

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

export function verifyAdminCredentials(email: string, password: string): boolean {
  const allowedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const allowedPassword = process.env.ADMIN_PASSWORD
  if (!allowedEmail || !allowedPassword) return false
  return email.trim().toLowerCase() === allowedEmail && password === allowedPassword
}
