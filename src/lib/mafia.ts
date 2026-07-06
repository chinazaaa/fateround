import type { SupabaseClient } from '@supabase/supabase-js'
import type { MafiaRole, MafiaPlayerState, MafiaSession, MafiaTeam } from '@/types'
import { markGameFinished } from '@/lib/game-finish'

export const MAFIA_MIN_PLAYERS = 5
export const MAFIA_MAX_PLAYERS = 16
export const MAFIA_DEFAULT_MAX_PLAYERS = 16

/**
 * Shuffle helper
 */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Assign roles to players based on count and config
 */
export function assignMafiaRoles(
  playerIds: string[],
  doctorEnabled: boolean,
  detectiveEnabled: boolean,
  mafiaCountOverride?: number
): Record<string, MafiaRole> {
  const playerCount = playerIds.length
  // Default: 1 mafia per 4 players (1 for 5-7, 2 for 8-11, 3 for 12+)
  const mafiaCount =
    mafiaCountOverride && mafiaCountOverride > 0 ? mafiaCountOverride : Math.max(1, Math.floor(playerCount / 4))

  const roles: MafiaRole[] = []
  // Add Mafia
  for (let i = 0; i < mafiaCount; i++) {
    roles.push('mafia')
  }
  // Add Doctor
  if (doctorEnabled && roles.length < playerCount) {
    roles.push('doctor')
  }
  // Add Detective
  if (detectiveEnabled && roles.length < playerCount) {
    roles.push('detective')
  }
  // Fill the rest with Villagers
  while (roles.length < playerCount) {
    roles.push('villager')
  }

  const shuffledRoles = shuffle(roles)
  const assignments: Record<string, MafiaRole> = {}
  playerIds.forEach((id, index) => {
    assignments[id] = shuffledRoles[index]
  })

  return assignments
}

/**
 * Check if the game has ended and return the winning team, or null
 */
export function checkMafiaWinCondition(players: Pick<MafiaPlayerState, 'role' | 'is_alive'>[]): MafiaTeam | null {
  const alivePlayers = players.filter((p) => p.is_alive)
  const aliveMafia = alivePlayers.filter((p) => p.role === 'mafia').length
  const aliveVillage = alivePlayers.length - aliveMafia

  if (aliveMafia === 0) return 'village'
  if (aliveMafia >= aliveVillage) return 'mafia'
  return null
}

/**
 * Find the plurality element in an array of strings
 */
function plurality(arr: string[]): string | null {
  if (arr.length === 0) return null
  const counts: Record<string, number> = {}
  let maxCount = 0
  for (const el of arr) {
    counts[el] = (counts[el] || 0) + 1
    if (counts[el] > maxCount) maxCount = counts[el]
  }
  const leaders = Object.keys(counts).filter((k) => counts[k] === maxCount)
  // Tie → no winner
  if (leaders.length > 1) return null
  return leaders[0]
}

/**
 * Resolves the night actions and computes who dies and detective results
 */
export function resolveMafiaNight(
  session: Pick<MafiaSession, 'doctor_enabled' | 'detective_enabled'>,
  playerStates: MafiaPlayerState[]
) {
  // 1. Mafia kill target (plurality vote of alive mafia)
  const mafiaVotes = playerStates
    .filter((p) => p.role === 'mafia' && p.is_alive && p.night_action_target_player_id)
    .map((p) => p.night_action_target_player_id as string)

  const mafiaTarget = plurality(mafiaVotes)

  // 2. Doctor save target
  const doctorPlayer = playerStates.find((p) => p.role === 'doctor' && p.is_alive)
  const doctorTarget = session.doctor_enabled && doctorPlayer ? doctorPlayer.night_action_target_player_id : null

  // 3. Detective target
  const detectivePlayer = playerStates.find((p) => p.role === 'detective' && p.is_alive)
  const detectiveTarget =
    session.detective_enabled && detectivePlayer ? detectivePlayer.night_action_target_player_id : null

  // Resolve death
  const saved = mafiaTarget !== null && mafiaTarget === doctorTarget
  const killedPlayerId = saved ? null : mafiaTarget

  return {
    mafiaTarget,
    doctorTarget,
    detectiveTarget,
    killedPlayerId,
  }
}

/**
 * Resolves the day vote and returns who gets eliminated
 */
export function resolveMafiaDayVote(playerStates: MafiaPlayerState[]): string | null {
  const votes = playerStates
    .filter((p) => p.is_alive && p.day_vote_target_player_id)
    .map((p) => p.day_vote_target_player_id as string)

  return plurality(votes)
}

/**
 * Initialize a Mafia game by assigning roles and creating the session/player states.
 */
export async function initializeMafiaGame(
  admin: SupabaseClient,
  gameId: string,
  playerIds: string[]
): Promise<{ error?: string | null }> {
  // 1. Fetch game config
  const { data: gameData, error: gameError } = await admin
    .from('games')
    .select('mafia_doctor_enabled, mafia_detective_enabled, mafia_count, mafia_anonymous_votes')
    .eq('id', gameId)
    .single()

  if (gameError || !gameData) {
    return { error: 'Failed to load game settings' }
  }

  const doctorEnabled = gameData.mafia_doctor_enabled !== false
  const detectiveEnabled = gameData.mafia_detective_enabled !== false
  const anonymousVotes = gameData.mafia_anonymous_votes === true
  // Resolve once using the same logic as assignMafiaRoles so the session row stays consistent
  const resolvedMafiaCount =
    gameData.mafia_count != null && gameData.mafia_count > 0
      ? gameData.mafia_count
      : Math.max(1, Math.floor(playerIds.length / 4))

  // 2. Assign roles
  const roleAssignments = assignMafiaRoles(playerIds, doctorEnabled, detectiveEnabled, resolvedMafiaCount)

  // 3. Create player states
  const playerStateRows = playerIds.map((pid) => ({
    game_id: gameId,
    player_id: pid,
    role: roleAssignments[pid],
    is_alive: true,
  }))

  const { error: playerStateError } = await admin.from('mafia_player_states').insert(playerStateRows)

  if (playerStateError) {
    console.error('Failed to initialize mafia player states:', playerStateError)
    return { error: 'Failed to initialize player roles' }
  }

  // 4. Create session
  const { error: sessionError } = await admin.from('mafia_sessions').insert({
    game_id: gameId,
    phase: 'role_reveal',
    phase_deadline: new Date(Date.now() + 10 * 1000).toISOString(),
    day_number: 1,
    doctor_enabled: doctorEnabled,
    detective_enabled: detectiveEnabled,
    mafia_count: resolvedMafiaCount,
    anonymous_votes: anonymousVotes,
  })

  if (sessionError) {
    console.error('Failed to initialize mafia session:', sessionError)
    // Clean up orphaned player state rows
    await admin.from('mafia_player_states').delete().eq('game_id', gameId)
    return { error: 'Failed to initialize game session' }
  }

  return { error: null }
}
