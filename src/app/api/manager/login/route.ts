import { NextRequest, NextResponse } from 'next/server'
import {
  createManagerSessionToken,
  managerCodeIsSet,
  managerCookieName,
  managerSessionMaxAgeSeconds,
  verifyManagerCode,
} from '@/lib/manager-session'

// Fixed delay applied to every failed attempt. Combined with the long minimum
// code length, this throttles brute-forcing the public login endpoint (a serial
// attacker is capped to a couple of guesses/second).
const FAILED_ATTEMPT_DELAY_MS = 600

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const code = typeof body.code === 'string' ? body.code : ''

    if (!(await managerCodeIsSet())) {
      return NextResponse.json({ error: 'No access code has been set yet. Ask the admin to set one.' }, { status: 503 })
    }

    if (!(await verifyManagerCode(code))) {
      await delay(FAILED_ATTEMPT_DELAY_MS)
      return NextResponse.json({ error: 'Invalid access code' }, { status: 401 })
    }

    const token = await createManagerSessionToken()
    const res = NextResponse.json({ success: true })
    res.cookies.set(managerCookieName(), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: managerSessionMaxAgeSeconds(),
    })
    return res
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
