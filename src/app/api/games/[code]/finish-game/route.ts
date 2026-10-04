import { NextRequest, NextResponse } from 'next/server'
import { internalErrorMessage } from '@/lib/api-errors'
import { finishMonopolyGameEarly } from '@/lib/monopoly'
import { finishAnonymousRoomSession, finishSecretMessageBoard } from '@/lib/anonymous-messages'
import { finishCodewordsGame } from '@/lib/codewords'
import { finishScrabbleGameEarly } from '@/lib/scrabble'
import { finishWordRushGameEarly } from '@/lib/word-rush-server'
import { finishMafiaGameEarly } from '@/lib/mafia'
import { finishTrollRunGameEarly } from '@/lib/troll-run'
import { markGameFinished } from '@/lib/game-finish'
import { resolveWinners } from '@/lib/trophies/outcome'
import { awardTournamentPlacements } from '@/lib/tournament-scoring'
import {
  parseGameType,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isCodewordsGame,
  isMonopolyGame,
  isScrabbleGame,
  isWordRushGame,
  isMafiaGame,
  isTrollRunGame,
} from '@/lib/game-types'
import { hostActionSchema } from '@/lib/validation'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { parseJsonBody } from '@/lib/parse-body'
import { assertHostWith } from '@/lib/game-admin'
import { withGameNotification } from '@/lib/push-route'

async function handlePost(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data, error: bodyError } = await parseJsonBody(req, hostActionSchema)
  if (bodyError) return bodyError

  const { hostToken } = data
  const gameId = code.toUpperCase()

  const admin = getSupabaseAdmin()

  const auth = await assertHostWith(admin, gameId, hostToken, {
    allowedStatuses: ['active', 'waiting'],
    statusError: 'Game already ended',
  })
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const game = auth.game

  const gameType = parseGameType(game.game_type)
  const inLobby = game.status === 'waiting'
  const now = new Date().toISOString()

  const { error: roundError } = await admin
    .from('rounds')
    .update({ status: 'finished', ended_at: now })
    .eq('game_id', gameId)
    .eq('status', 'active')

  if (roundError)
    return NextResponse.json({ error: internalErrorMessage('games/code/finish-game', roundError) }, { status: 500 })

  if (isAnonymousMessagesGame(gameType)) {
    const { error, cleanupError } = await finishAnonymousRoomSession(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    // The game IS finished; only the post-finish data wipe failed. Reporting that as a
    // 500 tells the host their finish failed and invites a retry that can only 400
    // ("Game already ended"), so log it instead — it needs an operator, not the host.
    if (cleanupError) console.error(`games/code/finish-game: session cleanup failed for ${gameId}`, cleanupError)
    return NextResponse.json({ success: true })
  }

  if (isSecretMessageGame(gameType)) {
    const { error, cleanupError } = await finishSecretMessageBoard(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    if (cleanupError) console.error(`games/code/finish-game: inbox cleanup failed for ${gameId}`, cleanupError)
    return NextResponse.json({ success: true })
  }

  if (isCodewordsGame(gameType)) {
    const { error, cleanupError } = await finishCodewordsGame(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    if (cleanupError) console.error(`games/code/finish-game: chat cleanup failed for ${gameId}`, cleanupError)
    return NextResponse.json({ success: true })
  }

  if (isMonopolyGame(gameType) && !inLobby) {
    const { error } = await finishMonopolyGameEarly(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // Scrabble finalizes its own session (tally scores + pick a winner) when ended
  // mid-game. In the lobby there's no session yet, so fall through to markGameFinished.
  if (isScrabbleGame(gameType) && !inLobby) {
    const { error } = await finishScrabbleGameEarly(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  if (isWordRushGame(gameType) && !inLobby) {
    const { error } = await finishWordRushGameEarly(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
  }

  // Resolves mafia_sessions.phase to 'game_over' (with whichever team already controls the
  // game, if any) before the generic markGameFinished below flips games.status — otherwise
  // the finished screen shows no winning team and only already-dead players' roles reveal.
  if (isMafiaGame(gameType) && !inLobby) {
    const { error } = await finishMafiaGameEarly(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
  }

  if (isTrollRunGame(gameType) && !inLobby) {
    const { error } = await finishTrollRunGameEarly(admin, gameId)
    if (error) return NextResponse.json({ error }, { status: 500 })
  }

  // Save snapshot for rematch history
  const [votesRes, participantsRes, snapshotCountRes] = await Promise.all([
    admin.from('votes').select('*').eq('game_id', gameId),
    admin.from('participants').select('*').eq('game_id', gameId),
    admin
      .from('game_snapshots')
      .select('session_number')
      .eq('game_id', gameId)
      .order('session_number', { ascending: false })
      .limit(1),
  ])

  const snapshotVotes = votesRes.data ?? []
  const snapshotParticipants = participantsRes.data ?? []
  const lastSession = snapshotCountRes.data?.[0]?.session_number ?? 0

  // Resolve winners before the snapshot so per-session winner names survive play-again resets.
  let winnerNames: string[] = []
  try {
    const winnerIds = await resolveWinners(admin, gameId, gameType)
    if (winnerIds && winnerIds.length > 0) {
      const { data: nameRows } = await admin.from('players').select('id, name').in('id', winnerIds)
      if (nameRows) winnerNames = nameRows.map((r) => r.name as string)
    }
  } catch {
    // Best-effort — don't block game finish
  }

  if (snapshotVotes.length > 0 || winnerNames.length > 0) {
    const { error: snapErr } = await admin.from('game_snapshots').insert({
      game_id: gameId,
      session_number: lastSession + 1,
      snapshot_data: {
        votes: snapshotVotes,
        participants: snapshotParticipants,
        gameType: game.game_type,
        winnerNames,
      },
    })
    if (snapErr) console.error('Failed to save game snapshot:', snapErr.message)
  }

  const { error } = await markGameFinished(admin, gameId, now)
  if (error) return NextResponse.json({ error: internalErrorMessage('games/code/finish-game', error) }, { status: 500 })

  // Host force-ended without a natural winner → tag as an aborted finish so the
  // trophy/coin pass skips "play N games" / streak / first-mode credit. A game
  // the host ended AFTER a winner was decided keeps result_reason NULL (natural
  // finish) so those credits still apply. See ABORT_REASONS in
  // src/lib/trophies/award.ts. Best-effort.
  if (winnerNames.length === 0) {
    const { error: reasonError } = await admin
      .from('games')
      .update({ result_reason: 'host_ended' })
      .eq('id', gameId)
      .is('result_reason', null)
    if (reasonError) console.error(`finish-game: result_reason update failed for ${gameId}`, reasonError)
  }

  try {
    await awardTournamentPlacements(admin, gameId)
  } catch {
    // Tournament scoring is best-effort — never block game finish
  }

  return NextResponse.json({ success: true })
}

export const POST = withGameNotification('game_ended', handlePost)
