import { NextRequest, NextResponse } from 'next/server'
import { searchKlipyGifs, searchKlipyStickers } from '@/lib/klipy'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'gifs'
  const query = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? '1')

  try {
    const result = type === 'stickers' ? await searchKlipyStickers(query, page) : await searchKlipyGifs(query, page)

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch from Klipy'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
