// Community-manager session — a separate, lower-privilege gate than the admin login.
// Mirrors src/lib/admin-session.ts (HMAC-signed cookie) but for the /input flow.
//
// The manager authenticates with an access code that the admin sets/rotates. The
// code's SHA-256 hash lives in community_settings (key = 'manager_code_hash'); the
// plaintext is never stored. Once verified, the manager gets a signed cookie.

import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { MANAGER_CODE_MIN_LENGTH } from '@/lib/manager-constants'

const COOKIE_NAME = 'manager_session'
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const MANAGER_CODE_KEY = 'manager_code_hash'

type SessionPayload = {
  role: 'manager'
  // Fingerprint of the manager code at issue time. When the admin rotates the
  // code this changes, so previously-issued tokens stop validating.
  v: string
  exp: number
}

// Reuse the admin signing secret so no new env var is required to ship this.
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

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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

export async function hashManagerCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code))
  return toHex(new Uint8Array(digest))
}

// A short, non-reversible fingerprint of the stored code hash. Embedded in the
// session token so rotating the code invalidates already-issued cookies. Derived
// (not the stored hash itself) so the cookie never carries the hash verbatim.
async function fingerprintOf(codeHash: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`manager-code-v1:${codeHash}`))
  return toHex(new Uint8Array(digest)).slice(0, 16)
}

async function currentCodeFingerprint(): Promise<string | null> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('community_settings').select('value').eq('key', MANAGER_CODE_KEY).maybeSingle()
  if (!data?.value) return null
  return fingerprintOf(data.value)
}

export function managerCookieName(): string {
  return COOKIE_NAME
}

export function managerSessionMaxAgeSeconds(): number {
  return Math.floor(SESSION_MAX_AGE_MS / 1000)
}

export async function createManagerSessionToken(): Promise<string> {
  const v = (await currentCodeFingerprint()) ?? ''
  const payload: SessionPayload = { role: 'manager', v, exp: Date.now() + SESSION_MAX_AGE_MS }
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const signature = await hmacSign(encoded, getSecret())
  return `${encoded}.${signature}`
}

export async function verifyManagerSessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null

  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) return null

  try {
    const expected = await hmacSign(encoded, getSecret())
    if (expected !== signature) return null

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as SessionPayload
    if (payload.role !== 'manager' || typeof payload.exp !== 'number') return null
    if (Date.now() > payload.exp) return null

    // Reject tokens issued under an old code: rotating the code (or clearing it)
    // changes the fingerprint, which revokes existing manager sessions.
    const currentV = await currentCodeFingerprint()
    if (!currentV || payload.v !== currentV) return null

    return payload
  } catch {
    return null
  }
}

// Constant-time-ish comparison of equal-length hex digests.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

// True when a manager access code has been configured by the admin.
export async function managerCodeIsSet(): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('community_settings').select('value').eq('key', MANAGER_CODE_KEY).maybeSingle()
  return Boolean(data?.value)
}

// Validate a submitted code against the stored hash.
export async function verifyManagerCode(code: string): Promise<boolean> {
  const trimmed = code.trim()
  if (!trimmed) return false

  const supabase = getSupabaseAdmin()
  const { data } = await supabase.from('community_settings').select('value').eq('key', MANAGER_CODE_KEY).maybeSingle()

  const storedHash = data?.value
  if (!storedHash) return false

  const candidate = await hashManagerCode(trimmed)
  return timingSafeEqualHex(candidate, storedHash)
}

// Set/rotate the manager access code (admin only). Stores only the hash.
export async function setManagerCode(code: string): Promise<void> {
  const trimmed = code.trim()
  if (trimmed.length < MANAGER_CODE_MIN_LENGTH) {
    throw new Error(`Code must be at least ${MANAGER_CODE_MIN_LENGTH} characters`)
  }

  const supabase = getSupabaseAdmin()
  const hash = await hashManagerCode(trimmed)
  const { error } = await supabase
    .from('community_settings')
    .upsert({ key: MANAGER_CODE_KEY, value: hash, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) throw error
}
