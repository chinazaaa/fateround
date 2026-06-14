import { NextResponse } from 'next/server'
import { adminCookieName } from '@/lib/admin-session'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(adminCookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
