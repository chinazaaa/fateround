import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { searchKlipyGifs, searchKlipyStickers } from '@/lib/klipy'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  // Unauthenticated proxy to a paid GIF/sticker service — backstop with a per-IP cap.
  const limited = await enforceRateLimit(req, RATE_LIMITS.join)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'gifs'
  const query = searchParams.get('q') ?? ''
  // Clamp `page` to a sane positive integer so NaN/negative/huge values never
  // reach the upstream Klipy API.
  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) ? Math.min(Math.max(Math.floor(pageRaw), 1), 1000) : 1

  try {
    const result = type === 'stickers' ? await searchKlipyStickers(query, page) : await searchKlipyGifs(query, page)

    return NextResponse.json(result)
  } catch (err) {
    const message = internalErrorMessage('klipy', err, 'Failed to fetch from Klipy')
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
