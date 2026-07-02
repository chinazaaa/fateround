import { NextResponse } from 'next/server'
import { getSupabaseAnon } from '@/lib/supabase-anon'
import { fetchGamePlayerLimits } from '@/lib/game-limits'

const supabase = getSupabaseAnon()

export async function GET() {
  const limits = await fetchGamePlayerLimits(supabase)
  return NextResponse.json({ limits })
}
