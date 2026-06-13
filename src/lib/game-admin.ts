import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeGender, normalizePlayerGender, type ParticipantGender } from '@/lib/participants'

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

/** Host may tweak lobby/finished settings before the next game starts. */
export async function assertHostGameSettings(supabase: SupabaseClient, gameCode: string, hostToken: string) {
  const id = gameCode.toUpperCase()
  const { data: game } = await supabase.from('games').select('*').eq('id', id).maybeSingle()
  if (!game) return { error: 'Game not found', status: 404 as const, game: null, id }
  if (game.host_token !== hostToken) return { error: 'Unauthorized', status: 403 as const, game: null, id }
  if (game.status !== 'waiting' && game.status !== 'finished') {
    return { error: 'Settings can only be changed in the lobby or after the game ends', status: 400 as const, game: null, id }
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
  fallback: ParticipantGender
): ParticipantGender | null {
  if (voteGender === 'both') return normalizeGender(String(rawPollGender ?? ''))
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
