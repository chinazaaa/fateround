import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeGender, type ParticipantGender } from '@/lib/participants'
import { normalizeResumeToken } from '@/lib/utils'

/**
 * Authorize a player action by its secret resume_token.
 *
 * This is the player-side authorization boundary for server-authoritative
 * writes (Option A). The caller MUST pass a service-role client: once anon
 * loses SELECT on players.resume_token, only the service role can match the
 * token. The resolved `player.id` is authoritative — routes must act on this
 * id, NOT on any client-supplied playerId (which is a public, forgeable value).
 *
 * The resume_token travels with the player across devices, so this preserves
 * cross-device resume: any device presenting the correct token is authorized.
 */
export async function assertPlayer(supabase: SupabaseClient, gameCode: string, resumeToken: string | null | undefined) {
  const id = gameCode.toUpperCase()
  const token = normalizeResumeToken(String(resumeToken ?? ''))
  if (token.length < 4) {
    return { error: 'Missing or invalid player code', status: 403 as const, player: null, id }
  }
  const { data: player } = await supabase
    .from('players')
    .select('*')
    .eq('game_id', id)
    .eq('resume_token', token)
    .maybeSingle()
  if (!player) return { error: 'Unauthorized', status: 403 as const, player: null, id }
  return { error: null, status: 200 as const, player, id }
}

export async function assertHostGame(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', id).maybeSingle()
  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.host_token !== hostToken) return { error: 'Unauthorized', status: 403 as const, game: null, id }
  if (game.status !== 'waiting') {
    return { error: 'Game has already started', status: 400 as const, game: null, id }
  }
  return { error: null, status: 200 as const, game, id }
}

/** Host may remove a player while the lobby is open or the game is in progress. */
export async function assertHostPlayerRemove(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', id).maybeSingle()
  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.host_token !== hostToken) return { error: 'Unauthorized', status: 403 as const, game: null, id }
  if (game.status !== 'waiting' && game.status !== 'active') {
    return {
      error: 'Players can only be removed while the lobby or game is open',
      status: 400 as const,
      game: null,
      id,
    }
  }
  return { error: null, status: 200 as const, game, id }
}

/** Host may tweak lobby/finished settings before the next game starts. */
export async function assertHostGameSettings(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', id).maybeSingle()
  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.host_token !== hostToken) return { error: 'Unauthorized', status: 403 as const, game: null, id }
  if (game.status !== 'waiting' && game.status !== 'finished') {
    return {
      error: 'Settings can only be changed in the lobby or after the game ends',
      status: 400 as const,
      game: null,
      id,
    }
  }
  return { error: null, status: 200 as const, game, id }
}

/** Host may change who can join after start — including while a game is live. */
export async function assertHostLateJoinSettings(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', id).maybeSingle()
  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.host_token !== hostToken) return { error: 'Unauthorized', status: 403 as const, game: null, id }
  if (game.status !== 'waiting' && game.status !== 'active' && game.status !== 'finished') {
    return {
      error: 'Late join settings cannot be changed for this game',
      status: 400 as const,
      game: null,
      id,
    }
  }
  return { error: null, status: 200 as const, game, id }
}

export async function findJoinerParticipant(supabase: SupabaseClient, gameId: string, playerName: string) {
  const { data } = await supabase
    .from('participants')
    .select('*')
    .eq('game_id', gameId)
    .eq('name', playerName)
    .maybeSingle()
  return data
}

export async function deleteJoinerPair(supabase: SupabaseClient, gameId: string, player: { id: string; name: string }) {
  await supabase.from('participants').delete().eq('game_id', gameId).eq('name', player.name)
  await supabase.from('players').delete().eq('id', player.id)
}

export function pollGenderForPlayer(
  voteGender: 'male' | 'female' | 'both',
  rawPollGender: string | undefined,
  fallback: ParticipantGender,
  identityGender?: ParticipantGender | null
): ParticipantGender | null {
  if (voteGender === 'both') {
    return normalizeGender(String(rawPollGender ?? '')) ?? identityGender ?? fallback
  }
  return voteGender
}

/** Which poll (men's/women's rounds) a claimed import-list name appears in. */
export function importBallotGender(
  voteGender: 'male' | 'female' | 'both',
  identityGender: ParticipantGender,
  rawPollGender?: string
): ParticipantGender {
  if (voteGender === 'both') {
    return normalizeGender(String(rawPollGender ?? '')) ?? identityGender
  }
  return identityGender
}

export async function syncImportParticipantBallot(
  supabase: SupabaseClient,
  gameId: string,
  participantId: string,
  voteGender: 'male' | 'female' | 'both',
  identityGender: ParticipantGender,
  rawPollGender?: string
) {
  const gender = importBallotGender(voteGender, identityGender, rawPollGender)
  await supabase.from('participants').update({ gender }).eq('id', participantId).eq('game_id', gameId)
}
