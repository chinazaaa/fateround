import { describe, it, expect, vi } from 'vitest'
import {
  assignMafiaRoles,
  resolveMafiaNight,
  resolveMafiaDayVote,
  checkMafiaWinCondition,
  checkJesterWin,
  checkLoversWin,
  auraSeerAlignment,
  resolveMafiaRoundToggles,
  type MafiaRoleToggles,
} from '@/lib/mafia'
import type { MafiaPlayerState, MafiaSession, MafiaRole } from '@/types'

const ALL_ENABLED: MafiaRoleToggles = {
  doctor_enabled: true,
  detective_enabled: true,
  aura_seer_enabled: true,
  bodyguard_enabled: true,
  mayor_enabled: true,
  vigilante_enabled: true,
  tracker_enabled: true,
  alpha_wolf_enabled: true,
  wolf_cub_enabled: true,
  framer_enabled: true,
  jester_enabled: true,
  serial_killer_enabled: true,
  arsonist_enabled: true,
  cupid_enabled: true,
  cursed_villager_enabled: true,
  medium_enabled: true,
  priest_enabled: true,
  witch_enabled: true,
  little_girl_enabled: true,
  trapper_enabled: true,
  seer_enabled: true,
  mafia_seer_enabled: true,
}
const NONE_ENABLED: MafiaRoleToggles = Object.fromEntries(
  Object.keys(ALL_ENABLED).map((k) => [k, false])
) as unknown as MafiaRoleToggles

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`)
}

function makeState(overrides: Partial<MafiaPlayerState>): MafiaPlayerState {
  return {
    id: overrides.player_id ?? 'id',
    game_id: 'G',
    player_id: 'p1',
    role: 'villager',
    is_alive: true,
    death_day: null,
    death_cause: null,
    night_action_target_player_id: null,
    night_action_target_player_id_2: null,
    day_vote_target_player_id: null,
    doused_by_arsonist: false,
    vigilante_shots_used: 0,
    vigilante_reveal_used: false,
    medium_revive_used: false,
    revived_by_medium: false,
    bodyguard_hits_taken: 0,
    priest_holy_water_used: false,
    witch_heal_used: false,
    witch_kill_used: false,
    trapper_trap_player_ids: [],
    is_lover: false,
    lover_partner_player_id: null,
    seat_number: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const NIGHT_SESSION_BASE: Pick<
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
  | 'wolf_cub_revenge_pending'
> = {
  doctor_enabled: true,
  aura_seer_enabled: true,
  bodyguard_enabled: true,
  tracker_enabled: true,
  framer_enabled: true,
  serial_killer_enabled: true,
  arsonist_enabled: true,
  medium_enabled: true,
  witch_enabled: true,
  little_girl_enabled: true,
  trapper_enabled: true,
  seer_enabled: true,
  mafia_seer_enabled: true,
  wolf_cub_revenge_pending: false,
}

describe('resolveMafiaRoundToggles', () => {
  it('always includes the fixed core roles', () => {
    for (const advanced of [false, true]) {
      const toggles = resolveMafiaRoundToggles(advanced)
      expect(toggles.doctor_enabled).toBe(true)
      expect(toggles.mayor_enabled).toBe(true)
      expect(toggles.cupid_enabled).toBe(true)
      expect(toggles.cursed_villager_enabled).toBe(true)
      expect(toggles.jester_enabled).toBe(true)
      expect(toggles.medium_enabled).toBe(true)
      expect(toggles.mafia_seer_enabled).toBe(true)
    }
  })

  it('never enables all three investigators at once, always exactly two', () => {
    for (let i = 0; i < 25; i++) {
      const toggles = resolveMafiaRoundToggles(false)
      const investigatorCount = [toggles.aura_seer_enabled, toggles.seer_enabled, toggles.detective_enabled].filter(
        Boolean
      ).length
      expect(investigatorCount).toBe(2)
    }
  })

  it('swaps Bodyguard/Serial Killer/Priest for Trapper/Arsonist/Vigilante in Advanced mode', () => {
    const classic = resolveMafiaRoundToggles(false)
    expect(classic.bodyguard_enabled).toBe(true)
    expect(classic.trapper_enabled).toBe(false)
    expect(classic.serial_killer_enabled).toBe(true)
    expect(classic.arsonist_enabled).toBe(false)
    expect(classic.priest_enabled).toBe(true)
    expect(classic.vigilante_enabled).toBe(false)
    expect(classic.witch_enabled).toBe(false)
    expect(classic.little_girl_enabled).toBe(false)

    const advanced = resolveMafiaRoundToggles(true)
    expect(advanced.bodyguard_enabled).toBe(false)
    expect(advanced.trapper_enabled).toBe(true)
    expect(advanced.serial_killer_enabled).toBe(false)
    expect(advanced.arsonist_enabled).toBe(true)
    expect(advanced.priest_enabled).toBe(false)
    expect(advanced.vigilante_enabled).toBe(true)
    expect(advanced.witch_enabled).toBe(true)
    expect(advanced.little_girl_enabled).toBe(true)
  })

  it('Detective becomes Tracker in Advanced mode, never both, and still exactly 2 investigators', () => {
    for (let i = 0; i < 25; i++) {
      const toggles = resolveMafiaRoundToggles(true)
      expect(toggles.detective_enabled).toBe(false)
      const investigatorSlotCount = [toggles.aura_seer_enabled, toggles.seer_enabled, toggles.tracker_enabled].filter(
        Boolean
      ).length
      expect(investigatorSlotCount).toBe(2)
    }
  })

  it('never enables both Wolf Cub and Framer in the same game', () => {
    for (let i = 0; i < 25; i++) {
      const toggles = resolveMafiaRoundToggles(false)
      expect(toggles.wolf_cub_enabled && toggles.framer_enabled).toBe(false)
    }
  })
})

describe('assignMafiaRoles', () => {
  it('fills all 24 roles when everything is enabled and slots allow', () => {
    const playerIds = ids(24)
    const assignments = assignMafiaRoles(playerIds, ALL_ENABLED, 4)
    const roles = new Set(Object.values(assignments))
    // mafiaCount=4 with alpha_wolf+wolf_cub each converting one base mafia slot leaves 2 plain 'mafia'
    expect(roles.has('alpha_wolf')).toBe(true)
    expect(roles.has('wolf_cub')).toBe(true)
    expect(roles.has('mafia')).toBe(true)
    const optionalRoles: MafiaRole[] = [
      'doctor',
      'aura_seer',
      'detective',
      'bodyguard',
      'medium',
      'mayor',
      'vigilante',
      'tracker',
      'framer',
      'jester',
      'serial_killer',
      'arsonist',
      'cupid',
      'cursed_villager',
      'priest',
      'witch',
      'little_girl',
      'trapper',
      'seer',
      'mafia_seer',
    ]
    for (const role of optionalRoles) {
      expect(roles.has(role)).toBe(true)
    }
    expect(Object.keys(assignments)).toHaveLength(24)
  })

  it('does not assign alpha_wolf or wolf_cub when mafiaCount < 2', () => {
    const playerIds = ids(6)
    const assignments = assignMafiaRoles(playerIds, ALL_ENABLED, 1)
    const roles = Object.values(assignments)
    expect(roles).not.toContain('alpha_wolf')
    expect(roles).not.toContain('wolf_cub')
    expect(roles).toContain('mafia')
  })

  it('falls back to villagers when everything is disabled', () => {
    const playerIds = ids(5)
    const assignments = assignMafiaRoles(playerIds, NONE_ENABLED, 1)
    const roles = Object.values(assignments)
    expect(roles.filter((r) => r === 'mafia')).toHaveLength(1)
    expect(roles.filter((r) => r === 'villager')).toHaveLength(4)
  })

  it('swaps away from repeating the exact same role for the same player on the next round', () => {
    const playerIds = ids(5)
    // Force the RNG so the shuffle is deterministic, then find who it hands mafia to.
    const originalRandom = Math.random
    Math.random = () => 0
    try {
      const withoutAvoid = assignMafiaRoles(playerIds, NONE_ENABLED, 1)
      const repeatMafiaId = Object.keys(withoutAvoid).find((id) => withoutAvoid[id] === 'mafia')!
      expect(repeatMafiaId).toBeDefined()

      const withAvoid = assignMafiaRoles(playerIds, NONE_ENABLED, 1, { [repeatMafiaId]: 'mafia' })
      expect(withAvoid[repeatMafiaId]).not.toBe('mafia')
      expect(Object.values(withAvoid).filter((r) => r === 'mafia')).toHaveLength(1)
    } finally {
      Math.random = originalRandom
    }
  })

  it('the fairness pass never changes the overall role composition', () => {
    const playerIds = ids(3)
    const lastRoles = assignMafiaRoles(playerIds, NONE_ENABLED, 1)
    const assignments = assignMafiaRoles(playerIds, NONE_ENABLED, 1, lastRoles)
    expect(Object.values(assignments).filter((r) => r === 'mafia')).toHaveLength(1)
    expect(Object.values(assignments).filter((r) => r === 'villager')).toHaveLength(2)
  })
})

describe('resolveMafiaNight — Seer / Mafia Seer', () => {
  it('reveals the Seer and Mafia Seer targets', () => {
    const seer = makeState({ id: 's', player_id: 's', role: 'seer', night_action_target_player_id: 'v1' })
    const mafiaSeer = makeState({
      id: 'ms',
      player_id: 'ms',
      role: 'mafia_seer',
      night_action_target_player_id: 'v2',
    })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const v2 = makeState({ id: 'v2', player_id: 'v2', role: 'doctor' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [seer, mafiaSeer, v1, v2])
    expect(result.seerTarget).toBe('v1')
    expect(result.mafiaSeerTarget).toBe('v2')
  })

  it('Mafia Seer does not count toward the Mafia kill vote unless resigned', () => {
    const mafiaSeer = makeState({
      id: 'ms',
      player_id: 'ms',
      role: 'mafia_seer',
      night_action_target_player_id: 'v1', // this is a seer pick, not a kill vote
    })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [mafiaSeer, v1])
    expect(result.mafiaTarget).toBeNull()
    expect(result.deaths).toEqual([])
  })
})

describe('resolveMafiaNight', () => {
  it('bodyguard absorbs first hit when protecting the mafia kill target', () => {
    const bodyguard = makeState({ id: 'bg', player_id: 'bg', role: 'bodyguard', night_action_target_player_id: 'v1' })
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const victim = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [bodyguard, mafia, victim])
    expect(result.bodyguardSacrificePlayerId).toBeNull()
    expect(result.bodyguardHitsTaken).toBe(1)
    expect(result.deaths).toEqual([])
  })

  it('bodyguard dies on second hit', () => {
    const bodyguard = makeState({
      id: 'bg',
      player_id: 'bg',
      role: 'bodyguard',
      night_action_target_player_id: 'v1',
      bodyguard_hits_taken: 1,
    })
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const victim = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [bodyguard, mafia, victim])
    expect(result.bodyguardSacrificePlayerId).toBe('bg')
    expect(result.bodyguardHitsTaken).toBe(2)
    expect(result.deaths).toEqual([{ playerId: 'bg', cause: 'mafia_kill' }])
  })

  it('produces independent mafia-kill and serial-kill deaths the same night', () => {
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const sk = makeState({ id: 'sk', player_id: 'sk', role: 'serial_killer', night_action_target_player_id: 'v2' })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const v2 = makeState({ id: 'v2', player_id: 'v2', role: 'villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, sk, v1, v2])
    const ids = result.deaths.map((d) => d.playerId).sort()
    expect(ids).toEqual(['v1', 'v2'])
    expect(result.deaths.find((d) => d.playerId === 'v1')?.cause).toBe('mafia_kill')
    expect(result.deaths.find((d) => d.playerId === 'v2')?.cause).toBe('serial_kill')
  })

  it('converts Cursed Villager to mafia instead of killing them', () => {
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'cv' })
    const cursed = makeState({ id: 'cv', player_id: 'cv', role: 'cursed_villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, cursed])
    expect(result.cursedConvertedPlayerId).toBe('cv')
    expect(result.deaths).toHaveLength(0)
  })

  it('witch heal potion blocks the mafia kill (only consumed if it actually saves) and kill potion is unblockable', () => {
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const witch = makeState({
      id: 'w',
      player_id: 'w',
      role: 'witch',
      night_action_target_player_id: 'v2',
      night_action_target_player_id_2: 'v1',
    })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const v2 = makeState({ id: 'v2', player_id: 'v2', role: 'villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, witch, v1, v2])
    const ids = result.deaths.map((d) => d.playerId).sort()
    expect(ids).toEqual(['v2'])
    expect(result.deaths.find((d) => d.playerId === 'v2')?.cause).toBe('witch_kill')
    expect(result.witchHealActuallySaved).toBe(true)

    // A heal on a player who wasn't attacked should NOT report as consumed.
    const witchWhiff = makeState({ id: 'w', player_id: 'w', role: 'witch', night_action_target_player_id_2: 'v2' })
    const whiffResult = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, witchWhiff, v1, v2])
    expect(whiffResult.witchHealActuallySaved).toBe(false)
  })

  it('trapper blocks the mafia kill only once activated and kills the weakest living mafia member', () => {
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const alpha = makeState({ id: 'a1', player_id: 'a1', role: 'alpha_wolf' })
    const trapper = makeState({
      id: 't',
      player_id: 't',
      role: 'trapper',
      night_action_target_player_id: 't', // self-target = activate
      trapper_trap_player_ids: ['v1'],
    })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, alpha, trapper, v1])
    expect(result.deaths.map((d) => d.playerId).sort()).toEqual(['m1'])
    expect(result.deaths.find((d) => d.playerId === 'm1')?.cause).toBe('trap_kill')
    expect(result.trapperActivated).toBe(true)
    expect(result.trapperBlockedPlayerIds).toEqual(['v1'])
    expect(result.trapperKilledMafiaId).toBe('m1')
  })

  it('trapper set (not activated) does not protect anyone that night', () => {
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const trapper = makeState({ id: 't', player_id: 't', role: 'trapper', night_action_target_player_id: 'v1' })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, trapper, v1])
    expect(result.trapperActivated).toBe(false)
    expect(result.deaths.map((d) => d.playerId)).toEqual(['v1'])
  })

  it('little girl only peeks if she opens her eyes, with a 20% detect / 5% caught split', () => {
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const littleGirl = makeState({
      id: 'lg',
      player_id: 'lg',
      role: 'little_girl',
      night_action_target_player_id: 'lg', // self-target = open eyes
    })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })

    const nothingRoll = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const nothingResult = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, littleGirl, v1])
    expect(nothingResult.littleGirlOpenedEyes).toBe(true)
    expect(nothingResult.littleGirlOutcome).toBe('none')
    expect(nothingResult.deaths.map((d) => d.playerId)).not.toContain('lg')
    nothingRoll.mockRestore()

    const detectRoll = vi.spyOn(Math, 'random').mockReturnValue(0.1)
    const detectResult = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, littleGirl, v1])
    expect(detectResult.littleGirlOutcome).toBe('detected')
    expect(detectResult.littleGirlDetectedMafiaId).toBe('m1')
    detectRoll.mockRestore()

    const caughtRoll = vi.spyOn(Math, 'random').mockReturnValue(0.01)
    const caughtResult = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, littleGirl, v1])
    expect(caughtResult.littleGirlOutcome).toBe('caught')
    expect(caughtResult.deaths.map((d) => d.playerId)).toContain('lg')
    caughtRoll.mockRestore()

    // Didn't open her eyes — no outcome at all.
    const passiveGirl = makeState({ id: 'lg', player_id: 'lg', role: 'little_girl' })
    const passiveResult = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, passiveGirl, v1])
    expect(passiveResult.littleGirlOpenedEyes).toBe(false)
    expect(passiveResult.littleGirlOutcome).toBeNull()
  })

  it('sets wolfCubDiedThisNight when the wolf cub is killed', () => {
    const mafia = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'wc' })
    const cub = makeState({ id: 'wc', player_id: 'wc', role: 'wolf_cub' })
    // A second mafia-team member must vote too so the plurality points at the cub's killer,
    // but here we simulate the cub having been voted (e.g. lynched earlier) by making it the mafia kill target directly.
    const result = resolveMafiaNight(NIGHT_SESSION_BASE, [mafia, cub])
    expect(result.deaths.map((d) => d.playerId)).toContain('wc')
    expect(result.wolfCubDiedThisNight).toBe(true)
  })

  it('applies the wolf cub revenge bonus kill to the runner-up vote', () => {
    const m1 = makeState({ id: 'm1', player_id: 'm1', role: 'mafia', night_action_target_player_id: 'v1' })
    const m2 = makeState({ id: 'm2', player_id: 'm2', role: 'mafia', night_action_target_player_id: 'v1' })
    const m3 = makeState({ id: 'm3', player_id: 'm3', role: 'mafia', night_action_target_player_id: 'v2' })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const v2 = makeState({ id: 'v2', player_id: 'v2', role: 'villager' })
    const result = resolveMafiaNight({ ...NIGHT_SESSION_BASE, wolf_cub_revenge_pending: true }, [m1, m2, m3, v1, v2])
    const ids = result.deaths.map((d) => d.playerId).sort()
    expect(ids).toEqual(['v1', 'v2'])
  })
})

describe('resolveMafiaDayVote', () => {
  it('lynches only on a strict majority, no lynch on a tie', () => {
    const a = makeState({ id: 'a', player_id: 'a', day_vote_target_player_id: 'x' })
    const b = makeState({ id: 'b', player_id: 'b', day_vote_target_player_id: 'y' })
    expect(resolveMafiaDayVote([a, b])).toBeNull()
  })

  it('lynches the majority target', () => {
    const a = makeState({ id: 'a', player_id: 'a', day_vote_target_player_id: 'x' })
    const b = makeState({ id: 'b', player_id: 'b', day_vote_target_player_id: 'x' })
    const c = makeState({ id: 'c', player_id: 'c', day_vote_target_player_id: 'y' })
    expect(resolveMafiaDayVote([a, b, c])).toBe('x')
  })

  it('no lynch when the leader falls short of a strict majority', () => {
    const a = makeState({ id: 'a', player_id: 'a', day_vote_target_player_id: 'x' })
    const b = makeState({ id: 'b', player_id: 'b', day_vote_target_player_id: 'y' })
    const c = makeState({ id: 'c', player_id: 'c', day_vote_target_player_id: 'z' })
    const d = makeState({ id: 'd', player_id: 'd', day_vote_target_player_id: null })
    expect(resolveMafiaDayVote([a, b, c, d])).toBeNull()
  })

  it("doubles the mayor's vote toward the majority", () => {
    const mayor = makeState({ id: 'mayor', player_id: 'mayor', role: 'mayor', day_vote_target_player_id: 'x' })
    const b = makeState({ id: 'b', player_id: 'b', day_vote_target_player_id: 'y' })
    const c = makeState({ id: 'c', player_id: 'c', day_vote_target_player_id: 'y' })
    // Without the mayor's double vote this would be a 2-1 for 'y' (2/3 = majority for y);
    // with mayor's double vote it's x:2, y:2 → tie → no lynch.
    expect(resolveMafiaDayVote([mayor, b, c])).toBeNull()
  })
})

describe('checkJesterWin', () => {
  it('is true only when the just-lynched player is the jester', () => {
    const jester = makeState({ id: 'j', player_id: 'j', role: 'jester', is_alive: false })
    const villager = makeState({ id: 'v', player_id: 'v', role: 'villager', is_alive: false })
    expect(checkJesterWin('j', [jester, villager])).toBe(true)
    expect(checkJesterWin('v', [jester, villager])).toBe(false)
    expect(checkJesterWin(null, [jester, villager])).toBe(false)
  })
})

describe('auraSeerAlignment', () => {
  it('reads Mafia team as evil', () => {
    expect(auraSeerAlignment('mafia', false)).toBe('evil')
    expect(auraSeerAlignment('alpha_wolf', false)).toBe('evil')
    expect(auraSeerAlignment('wolf_cub', false)).toBe('evil')
    expect(auraSeerAlignment('framer', false)).toBe('evil')
  })

  it('reads solo killers/voters and kill-or-revive village roles as unknown', () => {
    expect(auraSeerAlignment('serial_killer', false)).toBe('unknown')
    expect(auraSeerAlignment('arsonist', false)).toBe('unknown')
    expect(auraSeerAlignment('jester', false)).toBe('unknown')
    expect(auraSeerAlignment('vigilante', false)).toBe('unknown')
    expect(auraSeerAlignment('medium', false)).toBe('unknown')
    expect(auraSeerAlignment('witch', false)).toBe('unknown')
    expect(auraSeerAlignment('trapper', false)).toBe('unknown')
  })

  it('reads everyone else as good, including the Priest despite killing Mafia', () => {
    expect(auraSeerAlignment('villager', false)).toBe('good')
    expect(auraSeerAlignment('doctor', false)).toBe('good')
    expect(auraSeerAlignment('priest', false)).toBe('good')
    expect(auraSeerAlignment('bodyguard', false)).toBe('good')
    expect(auraSeerAlignment('detective', false)).toBe('good')
  })

  it('a framed target always reads evil regardless of their real role', () => {
    expect(auraSeerAlignment('villager', true)).toBe('evil')
    expect(auraSeerAlignment('serial_killer', true)).toBe('evil')
  })
})

describe('checkLoversWin', () => {
  it('is true only when both lovers are alive', () => {
    const a = makeState({ id: 'a', player_id: 'a', is_lover: true, is_alive: true })
    const b = makeState({ id: 'b', player_id: 'b', is_lover: true, is_alive: true })
    expect(checkLoversWin([a, b])).toBe(true)
    const bDead = { ...b, is_alive: false }
    expect(checkLoversWin([a, bDead])).toBe(false)
  })

  it('is false when there are no lovers', () => {
    const a = makeState({ id: 'a', player_id: 'a' })
    expect(checkLoversWin([a])).toBe(false)
  })
})

describe('checkMafiaWinCondition priority', () => {
  it('village wins when no mafia or solo killers remain alive', () => {
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const v2 = makeState({ id: 'v2', player_id: 'v2', role: 'doctor' })
    expect(checkMafiaWinCondition([v1, v2])).toBe('village')
  })

  it('mafia wins at parity with villagers', () => {
    const m = makeState({ id: 'm', player_id: 'm', role: 'mafia' })
    const v = makeState({ id: 'v', player_id: 'v', role: 'villager' })
    expect(checkMafiaWinCondition([m, v])).toBe('mafia')
  })

  it('serial killer wins as the last one standing alone', () => {
    const sk = makeState({ id: 'sk', player_id: 'sk', role: 'serial_killer' })
    const deadVillager = makeState({ id: 'v', player_id: 'v', role: 'villager', is_alive: false })
    expect(checkMafiaWinCondition([sk, deadVillager])).toBe('serial_killer')
  })

  it('returns null mid-game when no win condition is met', () => {
    const m = makeState({ id: 'm', player_id: 'm', role: 'mafia' })
    const v1 = makeState({ id: 'v1', player_id: 'v1', role: 'villager' })
    const v2 = makeState({ id: 'v2', player_id: 'v2', role: 'villager' })
    expect(checkMafiaWinCondition([m, v1, v2])).toBeNull()
  })
})
