import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/parse-body'
import {
  adminCookieName,
  adminSessionMaxAgeSeconds,
  createAdminSessionToken,
  verifyAdminCredentials,
} from '@/lib/admin-session'

// Permissive shape: email/password optional so the handler's own credential check still
// owns the 401; the schema only turns a malformed/non-object body into a clean 400
// instead of the previous 500.
const loginSchema = z.object({ email: z.string().optional(), password: z.string().optional() }).passthrough()

export async function POST(req: NextRequest) {
  const { data: body, error: bodyError } = await parseJsonBody(req, loginSchema)
  if (bodyError) return bodyError
  try {
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!verifyAdminCredentials(email, password)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await createAdminSessionToken(email.trim().toLowerCase())
    const res = NextResponse.json({ success: true })
    res.cookies.set(adminCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: adminSessionMaxAgeSeconds(),
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
