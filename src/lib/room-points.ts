import type { SupabaseClient } from '@supabase/supabase-js'
import { buildLudoStandings } from '@/lib/ludo'
import { totalScore } from '@/lib/yahtzee'
import { tallyTriviaPlayerScores } from '@/lib/trivia'
import { tallySudokuScores } from '@/lib/sudoku'
import {
  parseGameType,
  isMonopolyGame,
  isYahtzeeGame,
  isWhotGame,
  isLudoGame,
  isBingoGame,
  isCodewordsGame,
  isSudokuGame,
  isTriviaGame,
} from '@/lib/game-types'
import type { GameType, LudoPlayerState, Player, TriviaAnswer, YahtzeeCategoryPoints } from '@/types'

export const ROOM_POINTS = {
  first: 100,
  second: 60,
  third: 30,
  participation: 15,
  partyCompletion: 25,
} as const

const PLACEMENT_POINTS = [ROOM_POINTS.first, ROOM_POINTS.second, ROOM_POINTS.third] as const

type RoomPlayerRow = {
  id: string
  name: string
  room_member_id: string | null
  spectator?: boolean | null
}

type RoomMemberRow = { id: string; display_name: string }

export function isCompetitiveRoomGame(gameType: GameType): boolean {
  return (
    isMonopolyGame(gameType) ||
    isYahtzeeGame(gameType) ||
    isWhotGame(gameType) ||
    isLudoGame(gameType) ||
    isBingoGame(gameType) ||
    isCodewordsGame(gameType) ||
    isSudokuGame(gameType) ||
    isTriviaGame(gameType)
  )
}

export async function resolveRoomMemberIdForGame(
  supabase: SupabaseClient,
  gameId: string,
  memberCode?: string | null
): Promise<string | null> {
  const code = memberCode?.trim().toUpperCase()
  if (!code) return null

  const { data: roomGame } = await supabase
    .from('room_games')
    .select('room_id')
    .eq('game_id', gameId.toUpperCase())
    .maybeSingle()

  if (!roomGame) return null

  const { data: member } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', roomGame.room_id)
    .eq('member_code', code)
    .maybeSingle()

  return member?.id ?? null
}

export async function linkPlayerToRoomMember(
  supabase: SupabaseClient,
  playerId: string,
  roomMemberId: string | null
): Promise<void> {
  if (!roomMemberId) return
  await supabase.from('players').update({ room_member_id: roomMemberId }).eq('id', playerId)
}

function memberIdForPlayer(
  player: RoomPlayerRow,
  members: RoomMemberRow[]
): string | null {
  if (player.room_member_id) return player.room_member_id
  const match = members.find(
    (m) => m.display_name.toLowerCase() === player.name.toLowerCase()
  )
  return match?.id ?? null
}

async function getCompetitiveStandings(
  supabase: SupabaseClient,
  gameId: string,
  gameType: GameType,
  players: RoomPlayerRow[]
): Promise<string[]> {
  if (isYahtzeeGame(gameType)) {
    const { data: rows } = await supabase
      .from('yahtzee_player_scores')
      .select('player_id, scores')
      .eq('game_id', gameId)
    if (!rows?.length) return []
    return rows
      .map((row) => ({
        playerId: row.player_id as string,
        total: totalScore((row.scores as { categories: YahtzeeCategoryPoints }).categories),
      }))
      .sort((a, b) => b.total - a.total || a.playerId.localeCompare(b.playerId))
      .map((row) => row.playerId)
  }

  if (isMonopolyGame(gameType)) {
    const [{ data: board }, { data: states }] = await Promise.all([
      supabase.from('monopoly_boards').select('winner_player_id').eq('game_id', gameId).maybeSingle(),
      supabase.from('monopoly_player_state').select('player_id, cash').eq('game_id', gameId),
    ])
    if (!states?.length) return board?.winner_player_id ? [board.winner_player_id] : []
    const winnerId = board?.winner_player_id ?? null
    return [...states]
      .sort((a, b) => {
        if (winnerId) {
          if (a.player_id === winnerId) return -1
          if (b.player_id === winnerId) return 1
        }
        return (b.cash as number) - (a.cash as number)
      })
      .map((s) => s.player_id as string)
  }

  if (isWhotGame(gameType)) {
    const [{ data: session }, { data: hands }] = await Promise.all([
      supabase.from('whot_sessions').select('winner_player_id').eq('game_id', gameId).maybeSingle(),
      supabase.from('whot_player_hands').select('player_id, cards').eq('game_id', gameId),
    ])
    if (!hands?.length) return session?.winner_player_id ? [session.winner_player_id] : []
    const winnerId = session?.winner_player_id ?? null
    return [...hands]
      .sort((a, b) => {
        if (winnerId) {
          if (a.player_id === winnerId) return -1
          if (b.player_id === winnerId) return 1
        }
        const aCount = Array.isArray(a.cards) ? a.cards.length : 0
        const bCount = Array.isArray(b.cards) ? b.cards.length : 0
        return aCount - bCount
      })
      .map((h) => h.player_id as string)
  }

  if (isLudoGame(gameType)) {
    const [{ data: session }, { data: states }] = await Promise.all([
      supabase.from('ludo_sessions').select('winner_player_id').eq('game_id', gameId).maybeSingle(),
      supabase.from('ludo_player_state').select('*').eq('game_id', gameId),
    ])
    if (!states?.length) return session?.winner_player_id ? [session.winner_player_id] : []
    const playerRows = players.map((p) => ({ id: p.id, name: p.name })) as Player[]
    return buildLudoStandings(
      states as LudoPlayerState[],
      playerRows,
      session?.winner_player_id ?? null
    ).map((row) => row.playerId)
  }

  if (isBingoGame(gameType)) {
    const { data: claim } = await supabase
      .from('bingo_claims')
      .select('player_id')
      .eq('game_id', gameId)
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (claim?.player_id) return [claim.player_id as string]
    return []
  }

  if (isCodewordsGame(gameType)) {
    const { data: board } = await supabase
      .from('codewords_boards')
      .select('winner, turn_order')
      .eq('game_id', gameId)
      .maybeSingle()
    if (!board?.winner) return []
    const { data: roles } = await supabase
      .from('codewords_player_roles')
      .select('player_id, team')
      .eq('game_id', gameId)
      .eq('team', board.winner)
    const winners = (roles ?? []).map((r) => r.player_id as string)
    const rest = ((board.turn_order as string[]) ?? []).filter((id) => !winners.includes(id))
    return [...winners, ...rest]
  }

  if (isTriviaGame(gameType)) {
    const { data: answers } = await supabase
      .from('trivia_answers')
      .select('player_id, points, response_ms, is_correct')
      .eq('game_id', gameId)
    if (!answers?.length) return []
    const playerRows = players.map((p) => ({
      id: p.id,
      name: p.name,
      spectator: p.spectator,
    })) as Player[]
    return tallyTriviaPlayerScores(answers as TriviaAnswer[], playerRows).map((row) => row.id)
  }

  if (isSudokuGame(gameType)) {
    const { data: submissions } = await supabase
      .from('sudoku_submissions')
      .select('player_id, points_awarded')
      .eq('game_id', gameId)
    if (!submissions?.length) return []
    const playerRows = players.map((p) => ({
      id: p.id,
      name: p.name,
      spectator: p.spectator,
    }))
    return tallySudokuScores(submissions, playerRows).map((row) => row.player_id)
  }

  return []
}

export async function awardRoomGamePoints(
  supabase: SupabaseClient,
  gameId: string
): Promise<void> {
  const id = gameId.toUpperCase()

  const { data: roomGame } = await supabase
    .from('room_games')
    .select('id, room_id, points_awarded_at')
    .eq('game_id', id)
    .maybeSingle()

  if (!roomGame || roomGame.points_awarded_at) return

  const { data: game } = await supabase
    .from('games')
    .select('game_type, status')
    .eq('id', id)
    .maybeSingle()

  if (!game || game.status !== 'finished') return

  const [{ data: players }, { data: members }] = await Promise.all([
    supabase.from('players').select('id, name, room_member_id, spectator').eq('game_id', id),
    supabase.from('room_members').select('id, display_name').eq('room_id', roomGame.room_id),
  ])

  const memberRows = members ?? []
  const playerToMember = new Map<string, string>()

  for (const player of players ?? []) {
    if (player.spectator === true) continue
    const memberId = memberIdForPlayer(player as RoomPlayerRow, memberRows)
    if (memberId) playerToMember.set(player.id, memberId)
  }

  const awards = new Map<string, number>()
  const gameType = parseGameType(game.game_type)

  if (playerToMember.size > 0) {
    if (isCompetitiveRoomGame(gameType)) {
      const standings = await getCompetitiveStandings(
        supabase,
        id,
        gameType,
        (players ?? []) as RoomPlayerRow[]
      )
      const rankedMembers = new Set<string>()

      if (standings.length > 0) {
        standings.forEach((playerId, index) => {
          const memberId = playerToMember.get(playerId)
          if (!memberId || rankedMembers.has(memberId)) return
          rankedMembers.add(memberId)
          const points = PLACEMENT_POINTS[index] ?? ROOM_POINTS.participation
          awards.set(memberId, (awards.get(memberId) ?? 0) + points)
        })
      }

      for (const memberId of new Set(playerToMember.values())) {
        if (rankedMembers.has(memberId)) continue
        awards.set(memberId, (awards.get(memberId) ?? 0) + ROOM_POINTS.participation)
      }

      if (standings.length === 0) {
        for (const memberId of new Set(playerToMember.values())) {
          awards.set(memberId, ROOM_POINTS.partyCompletion)
        }
      }
    } else {
      for (const memberId of new Set(playerToMember.values())) {
        awards.set(memberId, ROOM_POINTS.partyCompletion)
      }
    }
  }

  for (const [memberId, points] of awards) {
    const { data: member } = await supabase
      .from('room_members')
      .select('room_points, games_played')
      .eq('id', memberId)
      .single()

    await supabase
      .from('room_members')
      .update({
        room_points: (member?.room_points ?? 0) + points,
        games_played: (member?.games_played ?? 0) + 1,
      })
      .eq('id', memberId)
  }

  await supabase
    .from('room_games')
    .update({ points_awarded_at: new Date().toISOString() })
    .eq('id', roomGame.id)
}
