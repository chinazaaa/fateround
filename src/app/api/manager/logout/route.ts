import { NextResponse } from 'next/server'
import { managerCookieName } from '@/lib/manager-session'

export async function POST() {
  const res = NextResponse.json({ success: true })
  res.cookies.set(managerCookieName(), '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
