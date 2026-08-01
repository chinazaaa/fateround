import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { searchKlipyGifs, searchKlipyStickers } from '@/lib/klipy'
import { enforceRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  // Unauthenticated by design (the GIF picker is open to every player), but each call spends
  // Klipy quota on our key — so it needs a flood backstop (audit finding M2).
  const limited = await enforceRateLimit(req, RATE_LIMITS.klipy)
  if (limited) return limited

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'gifs'
  const query = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  try {
    const result = type === 'stickers' ? await searchKlipyStickers(query, page) : await searchKlipyGifs(query, page)

    return NextResponse.json(result)
  } catch (err) {
    const message = internalErrorMessage('klipy', err, 'Failed to fetch from Klipy')
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
