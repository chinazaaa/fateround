import { describe, expect, it } from 'vitest'
import type { FactsContext } from './index'
import { mahjongFacts } from './mahjong'

/**
 * The builder reads one table — `mahjong_player_state.game_counters`, the per-MATCH accumulator
 * the engine kept in play — and nothing else, so the mock is that blob per player. Every case is
 * a rule someone could write in admin: if the fold is wrong the trophy is silently unearnable,
 * indistinguishable from a typo.
 */
function db(rows: { player_id: string; game_counters: Record<string, number> | null }[]) {
  return {
    from() {
      return {
        select: () => ({ eq: () => Promise.resolve({ data: rows }) }),
      }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: 60,
  questionSource: null,
  theme: null,
  seated: ['me', 'b', 'c', 'd'],
  winners: ['me'],
}

async function factsFor(counters: Record<string, number>, ctx: FactsContext = CTX) {
  const map = await mahjongFacts(db([{ player_id: 'me', game_counters: counters }]), 'G', ctx)
  return map.get('me') ?? {}
}

describe('mahjongFacts', () => {
  it('passes lifetime tallies through with their raw match count', async () => {
    const f = await factsFor({
      mahjong_chows_called: 3,
      mahjong_pungs_called: 2,
      mahjong_kongs_called: 1,
      mahjong_hands_won: 4,
      mahjong_thirteen_orphans_wins: 2,
      mahjong_discards: 40,
    })
    expect(f.mahjong_chows_called).toBe(3)
    expect(f.mahjong_pungs_called).toBe(2)
    expect(f.mahjong_kongs_called).toBe(1)
    expect(f.mahjong_hands_won).toBe(4)
    // The gte-2 "Orphan Master" rule needs the raw count to survive, not a 0/1 flag.
    expect(f.mahjong_thirteen_orphans_wins).toBe(2)
    expect(f.mahjong_discards).toBe(40)
  })

  it('omits tallies that never happened rather than emitting a zero', async () => {
    const f = await factsFor({ mahjong_hands_won: 1 })
    expect(f.mahjong_hands_won).toBe(1)
    expect(f.mahjong_chows_called).toBeUndefined()
    expect(f.mahjong_seven_pairs_wins).toBeUndefined()
  })

  it('derives Full Circle only when all four seat bits are set', async () => {
    // Bits: east=1, south=2, west=4, north=8. Three seats (7) is not a full circle; all four (15) is.
    const three = await factsFor({ mahjong_seat_mask: 0b0111 })
    const four = await factsFor({ mahjong_seat_mask: 0b1111 })
    expect(three.mahjong_all_seats).toBeUndefined()
    expect(four.mahjong_all_seats).toBe(1)
    // The mask itself is internal bookkeeping and must never be emitted (it can't be summed).
    expect(four.mahjong_seat_mask).toBeUndefined()
  })

  it('derives Table Sweep from the best streak, not the current one', async () => {
    const short = await factsFor({ mahjong_win_streak: 1, mahjong_win_streak_max: 2 })
    const swept = await factsFor({ mahjong_win_streak: 0, mahjong_win_streak_max: 3 })
    expect(short.mahjong_table_sweep).toBeUndefined()
    expect(swept.mahjong_table_sweep).toBe(1)
    // The streak fields are internal and never emitted raw.
    expect(swept.mahjong_win_streak).toBeUndefined()
    expect(swept.mahjong_win_streak_max).toBeUndefined()
  })

  it('emits the per-ruleset win flag so all-rulesets can be assembled later', async () => {
    const f = await factsFor({ mahjong_won_hong_kong: 1, mahjong_won_riichi: 1 })
    expect(f.mahjong_won_hong_kong).toBe(1)
    expect(f.mahjong_won_riichi).toBe(1)
    expect(f.mahjong_won_mcr).toBeUndefined()
  })

  it('reads every player of one match from a single call, each on their own blob', async () => {
    const map = await mahjongFacts(
      db([
        { player_id: 'me', game_counters: { mahjong_hands_won: 3, mahjong_win_streak_max: 3 } },
        { player_id: 'rival', game_counters: { mahjong_chows_called: 1 } },
        { player_id: 'ghost', game_counters: null },
      ]),
      'G',
      CTX
    )
    // 'me' and 'rival' each did something; 'ghost' has nothing recordable and gets no entry.
    expect(map.size).toBe(2)
    expect(map.get('me')?.mahjong_table_sweep).toBe(1)
    expect(map.get('me')?.mahjong_hands_won).toBe(3)
    expect(map.get('rival')?.mahjong_chows_called).toBe(1)
    expect(map.get('rival')?.mahjong_table_sweep).toBeUndefined()
    expect(map.get('ghost')).toBeUndefined()
  })

  it('returns nothing when no player has a state row', async () => {
    const map = await mahjongFacts(db([]), 'G', CTX)
    expect(map.size).toBe(0)
  })
})
