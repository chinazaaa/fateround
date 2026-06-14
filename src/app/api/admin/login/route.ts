import { NextRequest, NextResponse } from 'next/server'
import {
  adminCookieName,
  adminSessionMaxAgeSeconds,
  createAdminSessionToken,
  verifyAdminCredentials,
} from '@/lib/admin-session'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
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
