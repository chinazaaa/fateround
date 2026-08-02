import { describe, expect, it } from 'vitest'
import type { MafiaRole } from '@/types'
import type { FactsContext } from './index'
import { mafiaFacts } from './mafia'

/**
 * The builder reads exactly two tables — the round's player states and the session's winning team.
 * Every case here is a rule an admin could write, so a wrong derivation is a silently unearnable
 * trophy, indistinguishable from a typo.
 */
type Row = {
  player_id: string
  role: MafiaRole
  is_alive: boolean
  death_cause?: string | null
  is_lover?: boolean | null
  bodyguard_hits_taken?: number | null
}

function db(rows: Row[], winningTeam: string | null) {
  const filled = rows.map((r) => ({
    death_cause: null,
    is_lover: false,
    bodyguard_hits_taken: 0,
    ...r,
  }))
  return {
    from(table: string) {
      if (table === 'mafia_sessions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: { winning_team: winningTeam } }) }),
          }),
        }
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: filled }) }) }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: 45,
  questionSource: null,
  theme: null,
  seated: ['me', 'b', 'c', 'd', 'e'],
  winners: [],
}

/** The facts map for a whole round. */
async function factsFor(rows: Row[], winningTeam: string | null, ctx: FactsContext = CTX) {
  return mafiaFacts(db(rows, winningTeam), 'G', ctx)
}

/** A five-seat baseline: one mafia, four village, nobody dead, no winner yet. */
const BASE: Row[] = [
  { player_id: 'me', role: 'mafia', is_alive: true },
  { player_id: 'b', role: 'villager', is_alive: true },
  { player_id: 'c', role: 'doctor', is_alive: true },
  { player_id: 'd', role: 'seer', is_alive: true },
  { player_id: 'e', role: 'cupid', is_alive: true },
]

describe('mafiaFacts', () => {
  it('flags Mafia-side participation and survival with no winner yet', async () => {
    const map = await factsFor(BASE, null)
    expect(map.get('me')?.mafia_mafia_games).toBe(1)
    expect(map.get('me')?.mafia_survivor_games).toBe(1)
    // A villager is not "Made Man".
    expect(map.get('b')?.mafia_mafia_games).toBeUndefined()
    expect(map.get('b')?.mafia_survivor_games).toBe(1)
    // No winning team → not a single win counter anywhere.
    for (const id of ['me', 'b', 'c', 'd', 'e']) {
      expect(map.get(id)?.mafia_village_wins).toBeUndefined()
      expect(map.get(id)?.mafia_mafia_wins).toBeUndefined()
    }
  })

  it('credits the whole town on a Village win, including the fallen', async () => {
    const rows: Row[] = [
      { player_id: 'me', role: 'villager', is_alive: false, death_cause: 'mafia_kill' },
      { player_id: 'b', role: 'doctor', is_alive: true },
      { player_id: 'x', role: 'mafia', is_alive: false, death_cause: 'village_vote' },
    ]
    const map = await factsFor(rows, 'village', { ...CTX, seated: ['me', 'b', 'x'] })
    // A dead villager on the winning side still earns the win — matches the winner resolver.
    expect(map.get('me')?.mafia_village_wins).toBe(1)
    expect(map.get('b')?.mafia_village_wins).toBe(1)
    // The lynched mafioso is not a village winner, but IS flagged as lynched.
    expect(map.get('x')?.mafia_village_wins).toBeUndefined()
    expect(map.get('x')?.mafia_lynched_games).toBe(1)
    expect(map.get('x')?.mafia_mafia_wins).toBeUndefined()
  })

  it('awards Clean Sweep only when every mafioso survived a Mafia win', async () => {
    const allAlive: Row[] = [
      { player_id: 'm1', role: 'mafia', is_alive: true },
      { player_id: 'm2', role: 'alpha_wolf', is_alive: true },
      { player_id: 'v', role: 'villager', is_alive: false, death_cause: 'mafia_kill' },
    ]
    const map = await factsFor(allAlive, 'mafia', { ...CTX, seated: ['m1', 'm2', 'v'] })
    expect(map.get('m1')?.mafia_mafia_wins).toBe(1)
    expect(map.get('m1')?.mafia_clean_sweep_wins).toBe(1)
    expect(map.get('m2')?.mafia_clean_sweep_wins).toBe(1)
    // The dead villager gets neither.
    expect(map.get('v')?.mafia_clean_sweep_wins).toBeUndefined()

    // One mafioso down → the win stands, the clean sweep does not.
    const oneDown: Row[] = [
      { player_id: 'm1', role: 'mafia', is_alive: true },
      { player_id: 'm2', role: 'framer', is_alive: false, death_cause: 'village_vote' },
      { player_id: 'v', role: 'villager', is_alive: false, death_cause: 'mafia_kill' },
    ]
    const map2 = await factsFor(oneDown, 'mafia', { ...CTX, seated: ['m1', 'm2', 'v'] })
    expect(map2.get('m1')?.mafia_mafia_wins).toBe(1)
    expect(map2.get('m1')?.mafia_clean_sweep_wins).toBeUndefined()
  })

  it('awards the solo-role wins to exactly their one player', async () => {
    const jester = await factsFor(
      [
        { player_id: 'me', role: 'jester', is_alive: false, death_cause: 'village_vote' },
        { player_id: 'b', role: 'villager', is_alive: true },
      ],
      'jester',
      { ...CTX, seated: ['me', 'b'] }
    )
    expect(jester.get('me')?.mafia_jester_wins).toBe(1)
    expect(jester.get('me')?.mafia_lynched_games).toBe(1)
    expect(jester.get('b')?.mafia_jester_wins).toBeUndefined()

    const sk = await factsFor([{ player_id: 'me', role: 'serial_killer', is_alive: true }], 'serial_killer', {
      ...CTX,
      seated: ['me'],
    })
    expect(sk.get('me')?.mafia_serial_killer_wins).toBe(1)
    expect(sk.get('me')?.mafia_arsonist_wins).toBeUndefined()

    const arso = await factsFor([{ player_id: 'me', role: 'arsonist', is_alive: true }], 'arsonist', {
      ...CTX,
      seated: ['me'],
    })
    expect(arso.get('me')?.mafia_arsonist_wins).toBe(1)
  })

  it('reads Lovers off the overlay, not off role membership', async () => {
    const rows: Row[] = [
      { player_id: 'me', role: 'villager', is_alive: true, is_lover: true },
      { player_id: 'b', role: 'mafia', is_alive: true, is_lover: true },
      { player_id: 'c', role: 'doctor', is_alive: false, death_cause: 'mafia_kill' },
    ]
    const lovers = await factsFor(rows, 'lovers', { ...CTX, seated: ['me', 'b', 'c'] })
    expect(lovers.get('me')?.mafia_lovers_wins).toBe(1)
    expect(lovers.get('b')?.mafia_lovers_wins).toBe(1)
    // A lover is NOT auto-credited a village/mafia win under the lovers overlay.
    expect(lovers.get('me')?.mafia_village_wins).toBeUndefined()
    expect(lovers.get('b')?.mafia_mafia_wins).toBeUndefined()
    // The non-lover earns nothing.
    expect(lovers.get('c')?.mafia_lovers_wins).toBeUndefined()

    // Same lover on an ordinary Village win must NOT trip the lovers counter.
    const village = await factsFor(rows, 'village', { ...CTX, seated: ['me', 'b', 'c'] })
    expect(village.get('me')?.mafia_lovers_wins).toBeUndefined()
    expect(village.get('me')?.mafia_village_wins).toBe(1)
  })

  it('flags Last Villager only when a lone town survivor remains', async () => {
    const lone: Row[] = [
      { player_id: 'me', role: 'villager', is_alive: true },
      { player_id: 'x', role: 'mafia', is_alive: true },
      { player_id: 'y', role: 'doctor', is_alive: false, death_cause: 'mafia_kill' },
    ]
    const map = await factsFor(lone, null, { ...CTX, seated: ['me', 'x', 'y'] })
    expect(map.get('me')?.mafia_last_villager).toBe(1)

    // Two living villagers → nobody is the last one.
    const two: Row[] = [
      { player_id: 'me', role: 'villager', is_alive: true },
      { player_id: 'z', role: 'doctor', is_alive: true },
      { player_id: 'x', role: 'mafia', is_alive: true },
    ]
    const map2 = await factsFor(two, null, { ...CTX, seated: ['me', 'z', 'x'] })
    expect(map2.get('me')?.mafia_last_villager).toBeUndefined()
  })

  it('flags the Bodyguard only when they actually took a hit', async () => {
    const rows: Row[] = [
      { player_id: 'bg', role: 'bodyguard', is_alive: true, bodyguard_hits_taken: 1 },
      { player_id: 'bg2', role: 'bodyguard', is_alive: true, bodyguard_hits_taken: 0 },
      // A non-bodyguard row with a stray value must never trip the flag.
      { player_id: 'v', role: 'villager', is_alive: true, bodyguard_hits_taken: 5 },
    ]
    const map = await factsFor(rows, null, { ...CTX, seated: ['bg', 'bg2', 'v'] })
    expect(map.get('bg')?.mafia_bodyguard_hits).toBe(1)
    expect(map.get('bg2')?.mafia_bodyguard_hits).toBeUndefined()
    expect(map.get('v')?.mafia_bodyguard_hits).toBeUndefined()
  })

  it('flags Big Game at twelve and Full House at sixteen', async () => {
    const seated12 = Array.from({ length: 12 }, (_, i) => `p${i}`)
    const map12 = await factsFor([{ player_id: 'p0', role: 'mafia', is_alive: true }], null, {
      ...CTX,
      seated: seated12,
    })
    expect(map12.get('p0')?.mafia_big_game_12).toBe(1)
    expect(map12.get('p0')?.mafia_full_house_16).toBeUndefined()

    const seated16 = Array.from({ length: 16 }, (_, i) => `p${i}`)
    const map16 = await factsFor([{ player_id: 'p0', role: 'mafia', is_alive: true }], null, {
      ...CTX,
      seated: seated16,
    })
    expect(map16.get('p0')?.mafia_big_game_12).toBe(1)
    expect(map16.get('p0')?.mafia_full_house_16).toBe(1)
  })

  it('returns nothing when there are no player states', async () => {
    const map = await factsFor([], 'village')
    expect(map.size).toBe(0)
  })
})
