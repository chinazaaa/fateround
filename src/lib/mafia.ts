import type { SupabaseClient } from '@supabase/supabase-js'
import type { MafiaRole, MafiaPlayerState, MafiaSession, MafiaTeam, MafiaRoleEnabledFlags } from '@/types'

export const MAFIA_MIN_PLAYERS = 5
export const MAFIA_MAX_PLAYERS = 16
export const MAFIA_DEFAULT_MAX_PLAYERS = 16

const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer', 'mafia_seer']

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

export type AuraSeerAlignment = 'good' | 'evil' | 'unknown'

// Roles the Aura Seer reads as "Unknown" rather than Good — Solo killers/voters and any
// Village-aligned role that can itself kill or revive, per Wolvesville's actual rule (which
// carves out the Priest as an explicit exception, staying Good despite killing Mafia).
const AURA_SEER_UNKNOWN_ROLES: MafiaRole[] = [
  'serial_killer',
  'arsonist',
  'jester',
  'vigilante',
  'medium',
  'witch',
  'trapper',
  'red_lady',
]

/**
 * Aura Seer's actual reveal — Good/Evil/Unknown, not a plain Village/Mafia binary. A framed
 * target always reads Evil, matching the Framer's effect on the old binary check.
 */
export function auraSeerAlignment(role: MafiaRole, framed: boolean): AuraSeerAlignment {
  if (framed || MAFIA_TEAM_ROLES.includes(role)) return 'evil'
  if (AURA_SEER_UNKNOWN_ROLES.includes(role)) return 'unknown'
  return 'good'
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
/**
 * Computes this round's per-role toggles automatically — replaces the old long checklist of
 * individual host toggles with a single Classic/Advanced switch plus built-in variety:
 *
 * - A fixed set of roles is always in: Doctor, Mayor, Cupid, Medium, Mafia Seer (no toggle,
 *   no rotation).
 * - The investigator trio (Aura Seer, Seer, Detective) never all appear together — exactly 2
 *   of the 3 are picked at random each game.
 * - Classic/Advanced swap pairs: Bodyguard↔Trapper, Serial Killer↔Arsonist, Priest↔Vigilante.
 *   Detective, if it wins the investigator slot, becomes Tracker in Advanced mode.
 * - Witch, Little Girl, Red Lady, Cursed Villager, and Jester have no Classic counterpart —
 *   only available in Advanced mode.
 * - Mafia specialists: Alpha Wolf is independently ~70% likely (still needs mafiaCount >= 2 to
 *   actually apply); Wolf Cub and Framer are mutually exclusive, never both in the same game.
 *   In Classic mode, Framer always wins that slot; Advanced mode keeps it an even coin flip.
 */
export function resolveMafiaRoundToggles(advancedMode: boolean): MafiaRoleToggles {
  const investigators: MafiaRole[] = ['aura_seer', 'seer', 'detective']
  const excludedInvestigator = investigators[Math.floor(Math.random() * investigators.length)]
  const hasInvestigator = (role: MafiaRole) => role !== excludedInvestigator

  const alphaWolfIn = Math.random() < 0.7
  const wolfCubOrFramer: MafiaRole = !advancedMode || Math.random() < 0.5 ? 'framer' : 'wolf_cub'

  return {
    doctor_enabled: true,
    mayor_enabled: true,
    cupid_enabled: true,
    cursed_villager_enabled: advancedMode,
    jester_enabled: advancedMode,
    medium_enabled: true,
    mafia_seer_enabled: true,
    aura_seer_enabled: hasInvestigator('aura_seer'),
    seer_enabled: hasInvestigator('seer'),
    detective_enabled: hasInvestigator('detective') && !advancedMode,
    tracker_enabled: hasInvestigator('detective') && advancedMode,
    bodyguard_enabled: !advancedMode,
    trapper_enabled: advancedMode,
    serial_killer_enabled: !advancedMode,
    arsonist_enabled: advancedMode,
    priest_enabled: !advancedMode,
    vigilante_enabled: advancedMode,
    witch_enabled: advancedMode,
    little_girl_enabled: advancedMode,
    red_lady_enabled: advancedMode,
    alpha_wolf_enabled: alphaWolfIn,
    wolf_cub_enabled: wolfCubOrFramer === 'wolf_cub',
    framer_enabled: wolfCubOrFramer === 'framer',
  }
}

export function assignMafiaRoles(
  playerIds: string[],
  toggles: MafiaRoleToggles,
  mafiaCountOverride?: number,
  lastRoleByPlayerId?: Record<string, MafiaRole>
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

  // Core village roles (appear every game when enabled) — Aura Seer and Detective are not
  // exposed as host toggles at all (like Doctor), so they're always in the pool given room.
  pushIfRoom('doctor', toggles.doctor_enabled)
  pushIfRoom('aura_seer', toggles.aura_seer_enabled)
  pushIfRoom('detective', toggles.detective_enabled)
  pushIfRoom('bodyguard', toggles.bodyguard_enabled)
  pushIfRoom('medium', toggles.medium_enabled)
  pushIfRoom('priest', toggles.priest_enabled)
  pushIfRoom('witch', toggles.witch_enabled)
  pushIfRoom('little_girl', toggles.little_girl_enabled)
  pushIfRoom('trapper', toggles.trapper_enabled)
  pushIfRoom('red_lady', toggles.red_lady_enabled)

  // Round 1: one Solo, one Special
  pushIfRoom('arsonist', toggles.arsonist_enabled)
  pushIfRoom('cupid', toggles.cupid_enabled)

  // Round 2: more village + mafia specialist
  pushIfRoom('vigilante', toggles.vigilante_enabled)
  pushIfRoom('framer', toggles.framer_enabled)
  pushIfRoom('seer', toggles.seer_enabled)
  pushIfRoom('mafia_seer', toggles.mafia_seer_enabled)

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

  // Fairness pass: nobody should keep landing the same role two rounds running by pure
  // chance (most noticeable with rare roles like Mafia, Detective, Aura Seer). Best-effort —
  // repeatedly try to swap a repeat-holder's role with another player's, preferring a swap
  // that clears both players' repeats, until no more repeats can be resolved this way. Small
  // rosters with few distinct roles may not fully clear (e.g. 2 players cycling 2 roles).
  if (lastRoleByPlayerId) {
    const maxAttempts = playerIds.length * 4
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const repeatIds = playerIds.filter((id) => lastRoleByPlayerId[id] && assignments[id] === lastRoleByPlayerId[id])
      if (repeatIds.length === 0) break
      const id = repeatIds[Math.floor(Math.random() * repeatIds.length)]
      // A valid swap partner must actually change this player's role, must resolve this
      // player's repeat (their incoming role must differ from their own last role), and must
      // not itself create a fresh repeat for the partner (their last role shouldn't be what
      // they'd receive, i.e. this player's current role).
      const candidates = playerIds.filter(
        (otherId) =>
          otherId !== id &&
          assignments[otherId] !== assignments[id] &&
          assignments[otherId] !== lastRoleByPlayerId[id] &&
          lastRoleByPlayerId[otherId] !== assignments[id]
      )
      if (candidates.length === 0) continue
      // Prefer a partner who is themselves a repeat (clears two repeats in one swap).
      const repeatCandidates = candidates.filter((otherId) => repeatIds.includes(otherId))
      const pool = repeatCandidates.length > 0 ? repeatCandidates : candidates
      const swapWith = pool[Math.floor(Math.random() * pool.length)]
      const tmp = assignments[id]
      assignments[id] = assignments[swapWith]
      assignments[swapWith] = tmp
    }
  }

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
  cause: 'mafia_kill' | 'serial_kill' | 'vigilante_kill' | 'arson' | 'witch_kill' | 'trap_kill' | 'red_lady_death'
}

// Order the Trapper's trap kills the weakest-first: a plain Mafia foot soldier before any
// specialist, and the Alpha (team leader) last of all.
const MAFIA_WEAKNESS_ORDER: MafiaRole[] = ['mafia', 'wolf_cub', 'mafia_seer', 'framer', 'alpha_wolf']

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
  auraSeerTarget: string | null
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
  wolfCubRevengeTargetId: string | null
  witchHealTarget: string | null
  witchKillTarget: string | null
  witchHealActuallySaved: boolean
  littleGirlOpenedEyes: boolean
  littleGirlOutcome: 'none' | 'detected' | 'caught' | null
  littleGirlDetectedMafiaId: string | null
  trapperActivated: boolean
  trapperBlockedPlayerIds: string[]
  trapperKilledMafiaId: string | null
  seerTarget: string | null
  mafiaSeerTarget: string | null
  redLadyTarget: string | null
  /** True if the Red Lady died this night — either the player she visited was attacked, or
   *  they turned out to be Mafia/a Solo killer. */
  redLadyDied: boolean
}

/**
 * Resolves all night actions and computes who dies, who converts, and info-role results.
 */
export function resolveMafiaNight(
  session: Pick<
    MafiaSession,
    | 'doctor_enabled'
    | 'aura_seer_enabled'
    | 'bodyguard_enabled'
    | 'tracker_enabled'
    | 'framer_enabled'
    | 'serial_killer_enabled'
    | 'arsonist_enabled'
    | 'medium_enabled'
    | 'witch_enabled'
    | 'little_girl_enabled'
    | 'trapper_enabled'
    | 'seer_enabled'
    | 'mafia_seer_enabled'
    | 'red_lady_enabled'
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

  const doctorPlayer = session.doctor_enabled ? aliveOfRole('doctor') : undefined
  const doctorTarget = doctorPlayer?.night_action_target_player_id ?? null

  const bodyguardPlayer = session.bodyguard_enabled ? aliveOfRole('bodyguard') : undefined
  const bodyguardTarget = bodyguardPlayer?.night_action_target_player_id ?? null

  const auraSeerPlayer = session.aura_seer_enabled ? aliveOfRole('aura_seer') : undefined
  const auraSeerTarget = auraSeerPlayer?.night_action_target_player_id ?? null

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

  // Seer / Mafia Seer: reveal a target's exact role each night, reusable (no "used" flag).
  // Mafia Seer's own kill-vote exclusion is structural (their night_action_target_player_id
  // is never read by the mafiaVotes loop above) — resigning converts their stored role to
  // 'mafia' immediately at submission time, so a resigned player simply stops being found by
  // aliveOfRole('mafia_seer') from that point on.
  const seerPlayer = session.seer_enabled ? aliveOfRole('seer') : undefined
  const seerTarget = seerPlayer?.night_action_target_player_id ?? null
  const mafiaSeerPlayer = session.mafia_seer_enabled ? aliveOfRole('mafia_seer') : undefined
  const mafiaSeerTarget = mafiaSeerPlayer?.night_action_target_player_id ?? null

  // Red Lady — visits another player each night. While out visiting, she's not home, so any
  // attack aimed at her that night finds nobody (see applyAttack below). But visiting is a
  // gamble: if the player she visited was attacked that night, or turns out to be Mafia or a
  // Solo killer, she dies from what she witnessed — resolved after all attacks below.
  const redLadyPlayer = session.red_lady_enabled ? aliveOfRole('red_lady') : undefined
  const redLadyTarget = redLadyPlayer?.night_action_target_player_id ?? null

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
    // Red Lady isn't home while out visiting someone — an attack aimed at her finds nobody.
    if (redLadyTarget && redLadyPlayer && targetId === redLadyPlayer.player_id) return
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
  applyAttack(serialKillerTarget, 'serial_kill')

  // Red Lady dies from what she witnessed if her visit target was attacked tonight (win or
  // lose, doctor-saved or not — she still saw the attack happen) or turns out to be Mafia or
  // a Solo killer (Serial Killer/Arsonist) themselves.
  let redLadyDied = false
  if (redLadyPlayer && redLadyTarget) {
    const visitedState = playerStates.find((p) => p.player_id === redLadyTarget)
    const visitedWasAttacked = redLadyTarget === mafiaTarget || redLadyTarget === serialKillerTarget
    const visitedIsDangerous =
      !!visitedState &&
      (MAFIA_TEAM_ROLES.includes(visitedState.role) ||
        visitedState.role === 'serial_killer' ||
        visitedState.role === 'arsonist')
    if (visitedWasAttacked || visitedIsDangerous) {
      addDeath(redLadyPlayer.player_id, 'red_lady_death')
      redLadyDied = true
    }
  }

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

  // Junior Mafia revenge: if the wolf_cub died this night, their pre-selected revenge
  // target dies with them. If they never picked one, a random alive non-mafia player is
  // chosen (excluding anyone already dying this night).
  let wolfCubRevengeTargetId: string | null = null
  if (wolfCubDiedThisNight) {
    const cubState = playerStates.find((p) => p.role === 'wolf_cub')
    const alreadyDeadIds = new Set(deaths.map((d) => d.playerId))
    const MAFIA_ROLES = new Set(['mafia', 'alpha_wolf', 'wolf_cub', 'framer', 'mafia_seer'])
    if (cubState?.wolf_cub_revenge_target_player_id) {
      const target = playerStates.find((p) => p.player_id === cubState.wolf_cub_revenge_target_player_id)
      if (target && target.is_alive && !alreadyDeadIds.has(target.player_id)) {
        wolfCubRevengeTargetId = target.player_id
      }
    }
    if (!wolfCubRevengeTargetId) {
      const validTargets = playerStates.filter(
        (p) => p.is_alive && !alreadyDeadIds.has(p.player_id) && !MAFIA_ROLES.has(p.role)
      )
      if (validTargets.length > 0) {
        wolfCubRevengeTargetId = validTargets[Math.floor(Math.random() * validTargets.length)].player_id
      }
    }
    if (wolfCubRevengeTargetId) {
      addDeath(wolfCubRevengeTargetId, 'mafia_kill')
    }
  }

  return {
    mafiaTarget,
    doctorTarget,
    auraSeerTarget,
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
    wolfCubRevengeTargetId,
    witchHealTarget,
    witchKillTarget,
    witchHealActuallySaved,
    littleGirlOpenedEyes,
    littleGirlOutcome,
    littleGirlDetectedMafiaId,
    trapperActivated,
    trapperBlockedPlayerIds,
    trapperKilledMafiaId,
    seerTarget,
    mafiaSeerTarget,
    redLadyTarget,
    redLadyDied,
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
    .select('mafia_advanced_mode, mafia_count, mafia_anonymous_votes, mafia_last_roles')
    .eq('id', gameId)
    .single()

  if (gameError || !gameData) {
    console.error('[mafia] failed to load game settings', { gameId, gameError })
    return { error: 'Failed to load game settings' }
  }

  // Role selection is fully automatic now — a single Classic/Advanced switch plus built-in
  // variety (investigator trio, Mafia specialist rotation) replaces the old per-role checklist.
  const toggles: MafiaRoleToggles = resolveMafiaRoundToggles(gameData.mafia_advanced_mode === true)
  const anonymousVotes = gameData.mafia_anonymous_votes === true
  const resolvedMafiaCount =
    gameData.mafia_count != null && gameData.mafia_count > 0
      ? gameData.mafia_count
      : Math.max(1, Math.floor(playerIds.length / 4))

  // 2. Assign roles — bias away from repeating anyone's exact same role from last round in
  // this room, so Play Again doesn't keep handing the same person Mafia, Detective, etc.
  const lastRoleByPlayerId = (gameData.mafia_last_roles ?? undefined) as Record<string, MafiaRole> | undefined
  const roleAssignments = assignMafiaRoles(playerIds, toggles, resolvedMafiaCount, lastRoleByPlayerId)

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

  // Remember this round's full role map for the next Play Again's fairness check above.
  await admin.from('games').update({ mafia_last_roles: roleAssignments }).eq('id', gameId)

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

/**
 * Resolves the Junior Mafia (wolf_cub) revenge kill when they die mid-game (priest, vigilante,
 * or any other instant-death cause). Kills their pre-selected revenge target or a random
 * non-mafia villager. Mutates `playerStates` in place and writes to the DB.
 *
 * Returns the revenge target player id (or null if none could be found).
 */
export async function resolveWolfCubRevenge(
  admin: SupabaseClient,
  gameId: string,
  playerStates: MafiaPlayerState[],
  wolfCubState: MafiaPlayerState,
  dayNumber: number,
  insertSystemMessage: (msg: string, scope?: string) => Promise<void>,
  playerLabel: (pid: string) => string
): Promise<string | null> {
  const MAFIA_ROLES = new Set(['mafia', 'alpha_wolf', 'wolf_cub', 'framer', 'mafia_seer'])
  let revengeId = wolfCubState.wolf_cub_revenge_target_player_id
  if (revengeId) {
    const target = playerStates.find((p) => p.player_id === revengeId)
    if (!target || !target.is_alive) revengeId = null
  }
  if (!revengeId) {
    const valid = playerStates.filter((p) => p.is_alive && !MAFIA_ROLES.has(p.role))
    if (valid.length > 0) revengeId = valid[Math.floor(Math.random() * valid.length)].player_id
  }
  if (!revengeId) return null

  await admin
    .from('mafia_player_states')
    .update({ is_alive: false, death_day: dayNumber, death_cause: 'mafia_kill', revived_by_medium: false })
    .eq('game_id', gameId)
    .eq('player_id', revengeId)
  await admin.from('players').update({ is_eliminated: true }).eq('game_id', gameId).eq('id', revengeId)
  const ri = playerStates.findIndex((p) => p.player_id === revengeId)
  if (ri !== -1) playerStates[ri].is_alive = false

  await insertSystemMessage(`💀 The Junior Mafia dragged ${playerLabel(revengeId)} down with them!`)
  return revengeId
}
