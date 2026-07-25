import type { SupabaseClient } from '@supabase/supabase-js'
import type { MafiaRole, MafiaPlayerState, MafiaSession, MafiaTeam, MafiaRoleEnabledFlags } from '@/types'

export const MAFIA_MIN_PLAYERS = 5
export const MAFIA_MAX_PLAYERS = 16
export const MAFIA_DEFAULT_MAX_PLAYERS = 16

const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer']

/**
 * Derives which team a role belongs to. Cursed Villager starts on 'village' — on
 * conversion its stored role is switched to 'mafia' directly (see resolveMafiaNight),
 * so this function never needs a "converted" branch.
 */
export function mafiaRoleTeam(role: MafiaRole): MafiaTeam {
  if (MAFIA_TEAM_ROLES.includes(role)) return 'mafia'
  if (role === 'jester') return 'jester'
  if (role === 'serial_killer') return 'serial_killer'
  if (role === 'arsonist') return 'arsonist'
  return 'village'
}

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

export type MafiaRoleToggles = MafiaRoleEnabledFlags

/**
 * Assign roles to players based on count and the enabled-role toggles.
 * Alpha Wolf and Wolf Cub each replace one of the base Mafia slots (they never add
 * mafia beyond the configured count) and require mafiaCount >= 2. All other optional
 * roles are additive: pushed onto the role pool only if a slot remains, same pattern
 * as the original Doctor/Detective toggles. Remaining slots are filled with Villager.
 */
export function assignMafiaRoles(
  playerIds: string[],
  toggles: MafiaRoleToggles,
  mafiaCountOverride?: number
): Record<string, MafiaRole> {
  const playerCount = playerIds.length
  const mafiaCount =
    mafiaCountOverride && mafiaCountOverride > 0 ? mafiaCountOverride : Math.max(1, Math.floor(playerCount / 4))

  const roles: MafiaRole[] = []
  for (let i = 0; i < mafiaCount; i++) {
    roles.push('mafia')
  }

  // Alpha Wolf / Wolf Cub each convert one base mafia slot into a specialist wolf role.
  if (toggles.alpha_wolf_enabled && mafiaCount >= 2) {
    const idx = roles.indexOf('mafia')
    if (idx !== -1) roles[idx] = 'alpha_wolf'
  }
  if (toggles.wolf_cub_enabled && mafiaCount >= 2) {
    const idx = roles.indexOf('mafia')
    if (idx !== -1) roles[idx] = 'wolf_cub'
  }

  const pushIfRoom = (role: MafiaRole, enabled: boolean) => {
    if (enabled && roles.length < playerCount) roles.push(role)
  }

  // Core village roles (appear every game when enabled)
  pushIfRoom('doctor', toggles.doctor_enabled)
  pushIfRoom('detective', toggles.detective_enabled)
  pushIfRoom('bodyguard', toggles.bodyguard_enabled)
  pushIfRoom('medium', toggles.medium_enabled)
  pushIfRoom('priest', toggles.priest_enabled)
  pushIfRoom('witch', toggles.witch_enabled)
  pushIfRoom('little_girl', toggles.little_girl_enabled)
  pushIfRoom('trapper', toggles.trapper_enabled)

  // Round 1: one Solo, one Special
  pushIfRoom('arsonist', toggles.arsonist_enabled)
  pushIfRoom('cupid', toggles.cupid_enabled)

  // Round 2: more village + mafia specialist
  pushIfRoom('vigilante', toggles.vigilante_enabled)
  pushIfRoom('framer', toggles.framer_enabled)

  // Round 3: another Solo, another Special, more village
  pushIfRoom('serial_killer', toggles.serial_killer_enabled)
  pushIfRoom('cursed_villager', toggles.cursed_villager_enabled)
  pushIfRoom('mayor', toggles.mayor_enabled)
  pushIfRoom('tracker', toggles.tracker_enabled)

  // Round 4: remaining Solo
  pushIfRoom('jester', toggles.jester_enabled)

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
 * Check if the game has ended and return the winning team, or null.
 * Priority: Serial Killer / Arsonist solo win (last one standing alone) > Mafia parity
 * win > Village win. Jester's lynch-win is checked separately by the caller via
 * checkJesterWin, since it needs "who was just lynched" context this function doesn't have.
 * Lovers is an overlay, not a blocking condition — callers should check
 * checkLoversWin independently once any win condition below fires.
 */
export function checkMafiaWinCondition(players: Pick<MafiaPlayerState, 'role' | 'is_alive'>[]): MafiaTeam | null {
  const alivePlayers = players.filter((p) => p.is_alive)
  const aliveMafia = alivePlayers.filter((p) => MAFIA_TEAM_ROLES.includes(p.role)).length
  const aliveSerialKiller = alivePlayers.filter((p) => p.role === 'serial_killer').length
  const aliveArsonist = alivePlayers.filter((p) => p.role === 'arsonist').length
  const aliveOthers = alivePlayers.length - aliveMafia - aliveSerialKiller - aliveArsonist

  if (aliveSerialKiller > 0 && aliveMafia === 0 && aliveArsonist === 0 && aliveOthers === 0) return 'serial_killer'
  if (aliveArsonist > 0 && aliveMafia === 0 && aliveSerialKiller === 0 && aliveOthers === 0) return 'arsonist'
  if (aliveMafia === 0 && aliveSerialKiller === 0 && aliveArsonist === 0) return 'village'
  if (aliveMafia >= aliveOthers + aliveSerialKiller + aliveArsonist) return 'mafia'
  return null
}

/**
 * Jester wins alone if they are the player just lynched by the day vote. Checked
 * separately from checkMafiaWinCondition because it needs the just-lynched player id.
 */
export function checkJesterWin(
  justLynchedPlayerId: string | null,
  players: Pick<MafiaPlayerState, 'player_id' | 'role'>[]
): boolean {
  if (!justLynchedPlayerId) return false
  const lynched = players.find((p) => p.player_id === justLynchedPlayerId)
  return lynched?.role === 'jester'
}

/**
 * True if both Lovers are still alive — surfaced by the caller as an additional
 * 'lovers' win overlay once any other win condition has fired, without blocking
 * the game from ending on its normal condition.
 */
export function checkLoversWin(players: Pick<MafiaPlayerState, 'is_alive' | 'is_lover'>[]): boolean {
  const aliveLovers = players.filter((p) => p.is_lover && p.is_alive).length
  const totalLovers = players.filter((p) => p.is_lover).length
  return totalLovers === 2 && aliveLovers === 2
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
 * Majority vote (>50% of alive players) with ties/no-majority resulting in no lynch,
 * matching Wolvesville's voting behavior. Replaces the old plain-plurality day vote.
 */
function resolveMajorityVote(votes: string[], aliveCount: number): string | null {
  if (votes.length === 0 || aliveCount === 0) return null
  const counts: Record<string, number> = {}
  for (const v of votes) counts[v] = (counts[v] || 0) + 1
  const maxCount = Math.max(...Object.values(counts))
  const leaders = Object.keys(counts).filter((k) => counts[k] === maxCount)
  if (leaders.length !== 1) return null
  if (maxCount * 2 <= aliveCount) return null
  return leaders[0]
}

export interface MafiaNightDeath {
  playerId: string
  cause: 'mafia_kill' | 'serial_kill' | 'vigilante_kill' | 'arson' | 'witch_kill' | 'trap_kill'
}

// Order the Trapper's trap kills the weakest-first: a plain Mafia foot soldier before any
// specialist, and the Alpha (team leader) last of all.
const MAFIA_WEAKNESS_ORDER: MafiaRole[] = ['mafia', 'wolf_cub', 'framer', 'alpha_wolf']

function pickWeakestMafia(playerStates: MafiaPlayerState[]): string | null {
  for (const role of MAFIA_WEAKNESS_ORDER) {
    const found = playerStates.find((p) => p.is_alive && p.role === role)
    if (found) return found.player_id
  }
  return null
}

export interface MafiaNightResolution {
  mafiaTarget: string | null
  doctorTarget: string | null
  detectiveTarget: string | null
  bodyguardTarget: string | null
  trackerTarget: string | null
  trackerVisited: string | null
  framedPlayerId: string | null
  serialKillerTarget: string | null
  arsonistDouseTarget: string | null
  arsonistDouseTarget2: string | null
  arsonistIgnited: boolean
  mediumRevivePlayerId: string | null
  deaths: MafiaNightDeath[]
  bodyguardSacrificePlayerId: string | null
  bodyguardHitsTaken: number
  cursedConvertedPlayerId: string | null
  wolfCubDiedThisNight: boolean
  witchHealTarget: string | null
  witchKillTarget: string | null
  witchHealActuallySaved: boolean
  littleGirlOpenedEyes: boolean
  littleGirlOutcome: 'none' | 'detected' | 'caught' | null
  littleGirlDetectedMafiaId: string | null
  trapperActivated: boolean
  trapperBlockedPlayerIds: string[]
  trapperKilledMafiaId: string | null
}

/**
 * Resolves all night actions and computes who dies, who converts, and info-role results.
 */
export function resolveMafiaNight(
  session: Pick<
    MafiaSession,
    | 'doctor_enabled'
    | 'detective_enabled'
    | 'bodyguard_enabled'
    | 'tracker_enabled'
    | 'framer_enabled'
    | 'serial_killer_enabled'
    | 'arsonist_enabled'
    | 'medium_enabled'
    | 'witch_enabled'
    | 'little_girl_enabled'
    | 'trapper_enabled'
    | 'wolf_cub_revenge_pending'
  >,
  playerStates: MafiaPlayerState[]
): MafiaNightResolution {
  const aliveOfRole = (r: MafiaRole) => playerStates.find((p) => p.role === r && p.is_alive)

  // Mafia team kill consensus: Alpha Wolf's vote counts twice.
  const mafiaVotes: string[] = []
  playerStates.forEach((p) => {
    if (!p.is_alive || !p.night_action_target_player_id) return
    if (p.role === 'mafia' || p.role === 'wolf_cub') mafiaVotes.push(p.night_action_target_player_id)
    if (p.role === 'alpha_wolf') {
      mafiaVotes.push(p.night_action_target_player_id)
      mafiaVotes.push(p.night_action_target_player_id)
    }
  })
  const mafiaTarget = plurality(mafiaVotes)

  // Wolf Cub revenge: if pending (set because a wolf-cub-associated death happened
  // previously), the mafia team also gets the runner-up target this night.
  let bonusMafiaTarget: string | null = null
  if (session.wolf_cub_revenge_pending && mafiaTarget && mafiaVotes.length > 0) {
    const counts: Record<string, number> = {}
    mafiaVotes.forEach((v) => (counts[v] = (counts[v] || 0) + 1))
    const runnerUp = Object.keys(counts)
      .filter((k) => k !== mafiaTarget)
      .sort((a, b) => counts[b] - counts[a])[0]
    bonusMafiaTarget = runnerUp ?? null
  }

  const doctorPlayer = session.doctor_enabled ? aliveOfRole('doctor') : undefined
  const doctorTarget = doctorPlayer?.night_action_target_player_id ?? null

  const bodyguardPlayer = session.bodyguard_enabled ? aliveOfRole('bodyguard') : undefined
  const bodyguardTarget = bodyguardPlayer?.night_action_target_player_id ?? null

  const detectivePlayer = session.detective_enabled ? aliveOfRole('detective') : undefined
  const detectiveTarget = detectivePlayer?.night_action_target_player_id ?? null

  const trackerPlayer = session.tracker_enabled ? aliveOfRole('tracker') : undefined
  const trackerTarget = trackerPlayer?.night_action_target_player_id ?? null
  const trackerVisited = trackerTarget
    ? (playerStates.find((p) => p.player_id === trackerTarget)?.night_action_target_player_id ?? null)
    : null

  const framerPlayer = session.framer_enabled ? aliveOfRole('framer') : undefined
  const framedPlayerId = framerPlayer?.night_action_target_player_id ?? null

  const mediumPlayer = session.medium_enabled ? aliveOfRole('medium') : undefined
  const mediumRevivePlayerId =
    mediumPlayer && !mediumPlayer.medium_revive_used && mediumPlayer.night_action_target_player_id
      ? mediumPlayer.night_action_target_player_id
      : null

  const serialKillerPlayer = session.serial_killer_enabled ? aliveOfRole('serial_killer') : undefined
  const serialKillerTarget = serialKillerPlayer?.night_action_target_player_id ?? null

  // Arsonist ignite is signaled by self-targeting; otherwise douse up to 2 players.
  const arsonistPlayer = session.arsonist_enabled ? aliveOfRole('arsonist') : undefined
  const arsonistIgnited = !!arsonistPlayer && arsonistPlayer.night_action_target_player_id === arsonistPlayer.player_id
  const arsonistDouseTarget =
    arsonistPlayer && !arsonistIgnited ? (arsonistPlayer.night_action_target_player_id ?? null) : null
  const arsonistDouseTarget2 =
    arsonistPlayer && !arsonistIgnited ? (arsonistPlayer.night_action_target_player_id_2 ?? null) : null

  // Witch: heal potion protects like the Doctor (only actually consumed if it saves someone —
  // see witchHealActuallySaved below), kill potion is an unblockable poison. Both once per game;
  // the kill potion additionally can't be used night 1 (enforced at submission in the API route).
  const witchPlayer = session.witch_enabled ? aliveOfRole('witch') : undefined
  const witchHealTarget =
    witchPlayer && !witchPlayer.witch_heal_used ? (witchPlayer.night_action_target_player_id_2 ?? null) : null
  const witchKillTarget =
    witchPlayer && !witchPlayer.witch_kill_used ? (witchPlayer.night_action_target_player_id ?? null) : null

  // Little Girl: an opt-in "open eyes" action (self-target signals she chose to peek this
  // night) — 75% see nothing, 20% identify a random living Mafia-team member, 5% get caught
  // and killed for spying.
  const littleGirlPlayer = session.little_girl_enabled ? aliveOfRole('little_girl') : undefined
  const littleGirlOpenedEyes =
    !!littleGirlPlayer && littleGirlPlayer.night_action_target_player_id === littleGirlPlayer.player_id
  let littleGirlOutcome: MafiaNightResolution['littleGirlOutcome'] = null
  let littleGirlDetectedMafiaId: string | null = null
  if (littleGirlOpenedEyes) {
    const roll = Math.random()
    if (roll < 0.05) {
      littleGirlOutcome = 'caught'
    } else if (roll < 0.25) {
      const aliveMafiaTeam = playerStates.filter((p) => p.is_alive && MAFIA_TEAM_ROLES.includes(p.role))
      if (aliveMafiaTeam.length > 0) {
        littleGirlOutcome = 'detected'
        littleGirlDetectedMafiaId = aliveMafiaTeam[Math.floor(Math.random() * aliveMafiaTeam.length)].player_id
      } else {
        littleGirlOutcome = 'none'
      }
    } else {
      littleGirlOutcome = 'none'
    }
  }

  // Trapper: each night either sets a trap on a player (self-target isn't a valid trap choice —
  // that signals "activate" instead, see the API route) accumulating up to 3, or activates all
  // currently-set traps at once (self-target). Trapped players can't be killed at night while
  // active; a Mafia kill on a trapped player is blocked AND kills the Mafia's weakest living
  // member instead, while any other attacker is simply blocked (they survive). Traps are
  // consumed (cleared) once activated, whether or not anything actually triggered them.
  const trapperPlayer = session.trapper_enabled ? aliveOfRole('trapper') : undefined
  const trapperActivated = !!trapperPlayer && trapperPlayer.night_action_target_player_id === trapperPlayer.player_id
  const trapperTrappedIds = trapperActivated ? (trapperPlayer?.trapper_trap_player_ids ?? []) : []
  const trapperBlockedPlayerIds: string[] = []
  let trapperKilledMafiaId: string | null = null

  const deaths: MafiaNightDeath[] = []
  const deadIds = new Set<string>()
  const addDeath = (playerId: string, cause: MafiaNightDeath['cause']) => {
    if (deadIds.has(playerId)) return
    deadIds.add(playerId)
    deaths.push({ playerId, cause })
  }
  let bodyguardSacrificePlayerId: string | null = null
  let bodyguardHitsTaken = bodyguardPlayer?.bodyguard_hits_taken ?? 0
  let cursedConvertedPlayerId: string | null = null

  const bodyguardAbsorb = (cause: MafiaNightDeath['cause']) => {
    if (!bodyguardPlayer) return false
    bodyguardHitsTaken++
    if (bodyguardHitsTaken >= 2) {
      bodyguardSacrificePlayerId = bodyguardPlayer.player_id
      addDeath(bodyguardPlayer.player_id, cause)
    }
    return true
  }

  let witchHealActuallySaved = false

  const applyAttack = (targetId: string | null, cause: 'mafia_kill' | 'serial_kill' | 'vigilante_kill') => {
    if (!targetId) return
    if (doctorTarget === targetId) return
    if (witchHealTarget === targetId) {
      witchHealActuallySaved = true
      return
    }
    if (trapperActivated && trapperTrappedIds.includes(targetId)) {
      trapperBlockedPlayerIds.push(targetId)
      if (cause === 'mafia_kill' && !trapperKilledMafiaId) {
        trapperKilledMafiaId = pickWeakestMafia(playerStates)
      }
      return
    }
    if (cause === 'mafia_kill') {
      const targetState = playerStates.find((p) => p.player_id === targetId)
      if (targetState?.role === 'arsonist') return
      if (targetState?.role === 'cursed_villager') {
        cursedConvertedPlayerId = targetId
        return
      }
    }
    // Bodyguard auto-protects self + protects chosen target
    if (bodyguardPlayer && (bodyguardTarget === targetId || targetId === bodyguardPlayer.player_id)) {
      bodyguardAbsorb(cause)
      return
    }
    addDeath(targetId, cause)
  }

  applyAttack(mafiaTarget, 'mafia_kill')
  applyAttack(bonusMafiaTarget, 'mafia_kill')
  applyAttack(serialKillerTarget, 'serial_kill')

  if (trapperKilledMafiaId) {
    addDeath(trapperKilledMafiaId, 'trap_kill')
  }

  // Witch kill potion is an unblockable poison — resolved directly, bypassing doctor/bodyguard.
  if (witchKillTarget) {
    addDeath(witchKillTarget, 'witch_kill')
  }

  // Little Girl caught spying — killed directly, independent of doctor/bodyguard protection.
  if (littleGirlOutcome === 'caught' && littleGirlPlayer) {
    addDeath(littleGirlPlayer.player_id, 'mafia_kill')
  }

  // Ignite kills everyone doused so far, bypassing doctor/bodyguard (fire, not an attack roll).
  if (arsonistIgnited) {
    playerStates.filter((p) => p.is_alive && p.doused_by_arsonist).forEach((p) => addDeath(p.player_id, 'arson'))
  }

  const wolfCubDiedThisNight = deaths.some(
    (d) => playerStates.find((p) => p.player_id === d.playerId)?.role === 'wolf_cub'
  )

  return {
    mafiaTarget,
    doctorTarget,
    detectiveTarget,
    bodyguardTarget,
    trackerTarget,
    trackerVisited,
    framedPlayerId,
    serialKillerTarget,
    arsonistDouseTarget,
    arsonistDouseTarget2,
    arsonistIgnited,
    mediumRevivePlayerId,
    deaths,
    bodyguardSacrificePlayerId,
    bodyguardHitsTaken,
    cursedConvertedPlayerId,
    wolfCubDiedThisNight,
    witchHealTarget,
    witchKillTarget,
    witchHealActuallySaved,
    littleGirlOpenedEyes,
    littleGirlOutcome,
    littleGirlDetectedMafiaId,
    trapperActivated,
    trapperBlockedPlayerIds,
    trapperKilledMafiaId,
  }
}

/**
 * Resolves the day vote and returns who gets eliminated. Mayor's vote counts twice.
 * Requires a strict majority of alive players (ties/no-majority → no lynch).
 */
export function resolveMafiaDayVote(playerStates: MafiaPlayerState[]): string | null {
  const aliveCount = playerStates.filter((p) => p.is_alive).length
  const votes: string[] = []
  playerStates.forEach((p) => {
    if (!p.is_alive || !p.day_vote_target_player_id) return
    votes.push(p.day_vote_target_player_id)
    if (p.role === 'mayor') votes.push(p.day_vote_target_player_id)
  })
  return resolveMajorityVote(votes, aliveCount)
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
    .select(
      'mafia_doctor_enabled, mafia_detective_enabled, mafia_bodyguard_enabled, mafia_mayor_enabled, mafia_vigilante_enabled, mafia_tracker_enabled, mafia_alpha_wolf_enabled, mafia_wolf_cub_enabled, mafia_framer_enabled, mafia_jester_enabled, mafia_serial_killer_enabled, mafia_arsonist_enabled, mafia_cupid_enabled, mafia_cursed_villager_enabled, mafia_medium_enabled, mafia_priest_enabled, mafia_witch_enabled, mafia_little_girl_enabled, mafia_trapper_enabled, mafia_count, mafia_anonymous_votes'
    )
    .eq('id', gameId)
    .single()

  if (gameError || !gameData) {
    console.error('[mafia] failed to load game settings', { gameId, gameError })
    return { error: 'Failed to load game settings' }
  }

  const toggles: MafiaRoleToggles = {
    doctor_enabled: gameData.mafia_doctor_enabled !== false,
    detective_enabled: gameData.mafia_detective_enabled !== false,
    bodyguard_enabled: gameData.mafia_bodyguard_enabled !== false,
    mayor_enabled: gameData.mafia_mayor_enabled !== false,
    vigilante_enabled: gameData.mafia_vigilante_enabled !== false,
    tracker_enabled: gameData.mafia_tracker_enabled !== false,
    alpha_wolf_enabled: gameData.mafia_alpha_wolf_enabled !== false,
    wolf_cub_enabled: gameData.mafia_wolf_cub_enabled !== false,
    framer_enabled: gameData.mafia_framer_enabled !== false,
    jester_enabled: gameData.mafia_jester_enabled !== false,
    serial_killer_enabled: gameData.mafia_serial_killer_enabled !== false,
    arsonist_enabled: gameData.mafia_arsonist_enabled !== false,
    cupid_enabled: gameData.mafia_cupid_enabled !== false,
    cursed_villager_enabled: gameData.mafia_cursed_villager_enabled !== false,
    medium_enabled: gameData.mafia_medium_enabled !== false,
    priest_enabled: gameData.mafia_priest_enabled !== false,
    witch_enabled: gameData.mafia_witch_enabled !== false,
    little_girl_enabled: gameData.mafia_little_girl_enabled !== false,
    trapper_enabled: gameData.mafia_trapper_enabled !== false,
  }
  const anonymousVotes = gameData.mafia_anonymous_votes === true
  const resolvedMafiaCount =
    gameData.mafia_count != null && gameData.mafia_count > 0
      ? gameData.mafia_count
      : Math.max(1, Math.floor(playerIds.length / 4))

  // 2. Assign roles
  const roleAssignments = assignMafiaRoles(playerIds, toggles, resolvedMafiaCount)

  // Seat numbers must be a fixed, permanent order (the player who was #1 stays #1 all game),
  // so they're assigned here once from real join order — not derived later from query order,
  // since mafia_player_states rows are all inserted in one statement and so share an identical
  // created_at, making that order (and any index-derived number) unstable between requests.
  const { data: joinOrderPlayers } = await admin
    .from('players')
    .select('id')
    .eq('game_id', gameId)
    .order('joined_at', { ascending: true })
  const seatNumberByPlayerId = new Map((joinOrderPlayers ?? []).map((p, index) => [p.id, index + 1]))

  // 3. Create player states
  const playerStateRows = playerIds.map((pid, index) => ({
    game_id: gameId,
    player_id: pid,
    role: roleAssignments[pid],
    is_alive: true,
    seat_number: seatNumberByPlayerId.get(pid) ?? index + 1,
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
    ...toggles,
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

/**
 * A friendly heads-up in Town Discussion when someone joins mid-game — they're dropped into
 * an in-progress town with no seat/role of their own (Mafia doesn't assign roles after the
 * game has started), so a warm, unambiguous "you weren't missed anything, just settle in"
 * note matters more here than a terse system line.
 */
export async function announceMafiaLateJoin(admin: SupabaseClient, gameId: string, playerName: string): Promise<void> {
  const { count } = await admin.from('players').select('id', { count: 'exact', head: true }).eq('game_id', gameId)
  const joinNumber = count ?? 1
  await admin.from('mafia_chat_messages').insert({
    game_id: gameId,
    sender_player_id: 'system',
    sender_name: '📢',
    message: `👋 Player ${joinNumber} ${playerName} just joined! Welcome — feel free to jump into the discussion, no rush getting settled in.`,
    scope: 'day',
  })
}

/**
 * Ends a Mafia game early (host "End game"), independent of the normal night/vote win
 * checks in advance/route.ts. Without this, the generic finish-game fallthrough only flips
 * games.status to 'finished' — mafia_sessions.phase never reaches 'game_over', so the
 * finished screen shows no winning team and only already-eliminated players' roles reveal
 * (everyone still alive stays hidden, since role reveal is gated on is_alive/game_over).
 * If one team already effectively controls the game at the moment of ending, that's surfaced
 * as the winner; otherwise there's honestly no winner yet, and the screen should say so.
 */
export async function finishMafiaGameEarly(admin: SupabaseClient, gameId: string): Promise<{ error?: string | null }> {
  const [{ data: mafiaSession }, { data: playerStates }] = await Promise.all([
    admin.from('mafia_sessions').select('*').eq('game_id', gameId).maybeSingle(),
    admin.from('mafia_player_states').select('*').eq('game_id', gameId),
  ])

  if (!mafiaSession || !playerStates) {
    // No session yet (still in the lobby) — nothing Mafia-specific to resolve.
    return { error: null }
  }

  const session = mafiaSession as MafiaSession
  const states = playerStates as MafiaPlayerState[]

  if (session.phase === 'game_over') {
    return { error: null }
  }

  const winTeam = checkMafiaWinCondition(states)
  const winningTeam = checkLoversWin(states) ? 'lovers' : winTeam

  const { error } = await admin
    .from('mafia_sessions')
    .update({ phase: 'game_over', phase_deadline: null, winning_team: winningTeam })
    .eq('game_id', gameId)

  if (error) {
    console.error('Failed to end Mafia game early:', error)
    return { error: 'Failed to end game' }
  }

  await admin.from('mafia_chat_messages').insert({
    game_id: gameId,
    sender_player_id: 'system',
    sender_name: '📢',
    message: '🏁 The host ended the game early.',
    scope: 'day',
  })

  return { error: null }
}

export async function clearMafiaSessionData(admin: SupabaseClient, gameId: string): Promise<{ error?: string | null }> {
  try {
    const [{ error: e1 }, { error: e2 }, { error: e3 }] = await Promise.all([
      admin.from('mafia_sessions').delete().eq('game_id', gameId),
      admin.from('mafia_player_states').delete().eq('game_id', gameId),
      admin.from('mafia_chat_messages').delete().eq('game_id', gameId),
    ])

    if (e1 || e2 || e3) {
      const err = e1 || e2 || e3
      console.error('Failed to clear mafia session data:', err)
      return { error: 'Failed to clear mafia session data' }
    }

    return { error: null }
  } catch (err) {
    console.error('Error clearing mafia session:', err)
    return { error: 'Error clearing mafia session data' }
  }
}
