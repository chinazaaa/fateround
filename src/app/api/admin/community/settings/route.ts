import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { assertAdminRequest } from '@/lib/admin-api'
import { getSetting, setSetting, WHATSAPP_INVITE_URL_KEY } from '@/lib/community-data'
import { hasServiceRoleKey } from '@/lib/supabase-admin'

function serviceGuard() {
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is required.' }, { status: 503 })
  }
  return null
}

export async function GET(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = serviceGuard()
  if (blocked) return blocked
  return NextResponse.json({ whatsappInviteUrl: await getSetting(WHATSAPP_INVITE_URL_KEY) })
}

// Set or clear the community WhatsApp invite URL shown on the public leaderboard.
export async function POST(req: NextRequest) {
  if (!(await assertAdminRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const blocked = serviceGuard()
  if (blocked) return blocked

  const body = await req.json().catch(() => ({}))
  const raw = typeof body.whatsappInviteUrl === 'string' ? body.whatsappInviteUrl.trim() : ''

  // Empty clears the link. Otherwise require a well-formed http(s) URL so we
  // never render an unsafe href on the public page.
  if (raw) {
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      return NextResponse.json({ error: 'Enter a valid URL (starting with https://)' }, { status: 400 })
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return NextResponse.json({ error: 'Link must start with https://' }, { status: 400 })
    }
  }

  try {
    await setSetting(WHATSAPP_INVITE_URL_KEY, raw || null)
    return NextResponse.json({ success: true, whatsappInviteUrl: raw || null })
  } catch (err) {
    return NextResponse.json(
      { error: internalErrorMessage('admin/community/settings', err, 'Failed to save') },
      { status: 500 }
    )
  }
}
