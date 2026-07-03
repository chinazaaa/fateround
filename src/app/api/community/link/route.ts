import { NextResponse } from 'next/server'
import { getSetting, WHATSAPP_INVITE_URL_KEY } from '@/lib/community-data'
import { DEFAULT_WHATSAPP_INVITE_URL } from '@/lib/community-constants'
import { hasServiceRoleKey } from '@/lib/supabase-admin'

// Public, no auth. Returns the admin-configured community invite link (the same
// WhatsApp link the admin sets in /admin/community and that the leaderboard
// uses), falling back to the default so the "Join the community" prompts always
// resolve to a working link. Read-only and safe to expose.
export async function GET() {
  if (!hasServiceRoleKey()) {
    return NextResponse.json({ whatsappInviteUrl: DEFAULT_WHATSAPP_INVITE_URL })
  }
  try {
    const url = await getSetting(WHATSAPP_INVITE_URL_KEY)
    return NextResponse.json({ whatsappInviteUrl: url || DEFAULT_WHATSAPP_INVITE_URL })
  } catch {
    // Public route — fail soft to the default rather than leaking internals.
    return NextResponse.json({ whatsappInviteUrl: DEFAULT_WHATSAPP_INVITE_URL })
  }
}
