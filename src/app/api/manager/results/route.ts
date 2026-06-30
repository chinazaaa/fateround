import { NextRequest, NextResponse } from 'next/server'
import { assertManagerRequest } from '@/lib/manager-api'
import { deleteResult, getDayWinners, upsertResult } from '@/lib/community-data'
import { isValidDateStr, watToday } from '@/lib/community-dates'

// GET ?date=YYYY-MM-DD — the day's games with their current winner (defaults to today, WAT).
export async function GET(req: NextRequest) {
  const session = await assertManagerRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dateParam = req.nextUrl.searchParams.get('date')
  const date = isValidDateStr(dateParam) ? dateParam : watToday()
  try {
    const games = await getDayWinners(date)
    return NextResponse.json({ date, games })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}

// POST { gameId, date, playerName } — record/overwrite the winner for one game on one day.
export async function POST(req: NextRequest) {
  const session = await assertManagerRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const gameId = typeof body.gameId === 'string' ? body.gameId : ''
  const date = typeof body.date === 'string' ? body.date : ''
  const playerName = typeof body.playerName === 'string' ? body.playerName.trim() : ''

  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  if (!isValidDateStr(date)) return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })
  if (!playerName) return NextResponse.json({ error: 'Winner name is required' }, { status: 400 })

  try {
    await upsertResult(gameId, date, playerName)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save' }, { status: 500 })
  }
}

// DELETE ?gameId=&date= — clear a game's winner for a day.
export async function DELETE(req: NextRequest) {
  const session = await assertManagerRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gameId = req.nextUrl.searchParams.get('gameId') ?? ''
  const date = req.nextUrl.searchParams.get('date') ?? ''
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  if (!isValidDateStr(date)) return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })

  try {
    await deleteResult(gameId, date)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to clear' }, { status: 500 })
  }
}
