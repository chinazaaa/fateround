import { describe, expect, it } from 'vitest'
import type { UnoCard } from '@/types'
import type { FactsContext } from './index'
import { unoFacts } from './uno'

/**
 * The builder reads one table — `uno_player_hands`, selecting (player_id, stats, cards) — and
 * nothing else, so the mock is just the round's accumulator rows plus each final hand. Every case
 * is a rule someone could write in admin: a wrong derivation makes the trophy silently unearnable.
 */
function db(rows: { player_id: string; stats: Record<string, number> | null; cards?: UnoCard[] | null }[]) {
  return {
    from() {
      return {
        select: () => ({ eq: () => Promise.resolve({ data: rows }) }),
      }
    },
  } as never
}

const CTX: FactsContext = {
  timerSeconds: 0,
  questionSource: null,
  theme: null,
  seated: ['me', 'b', 'c', 'd'],
  winners: [],
}

async function factsFor(stats: Record<string, number>, ctx: FactsContext = CTX, cards: UnoCard[] = []) {
  const map = await unoFacts(db([{ player_id: 'me', stats, cards }]), 'G', ctx)
  return map.get('me') ?? {}
}

const num = (color: UnoCard['color'], value: number): UnoCard => ({
  id: `${color}-${value}`,
  color,
  kind: 'number',
  value,
})

describe('unoFacts', () => {
  it('emits lifetime tallies as their real round totals', async () => {
    const f = await factsFor({
      uno_uno_calls: 2,
      uno_skips: 3,
      uno_reverses: 1,
      uno_draw_twos: 2,
      uno_wilds: 1,
      uno_wild_draw_fours: 1,
      uno_catches: 1,
      uno_draw2_stacked: 1,
      uno_challenges_won: 1,
      uno_bluff_survived: 1,
    })
    expect(f.uno_uno_calls).toBe(2)
    expect(f.uno_skips).toBe(3)
    expect(f.uno_reverses).toBe(1)
    expect(f.uno_draw_twos).toBe(2)
    expect(f.uno_wilds).toBe(1)
    expect(f.uno_wild_draw_fours).toBe(1)
    expect(f.uno_catches).toBe(1)
    expect(f.uno_draw2_stacked).toBe(1)
    expect(f.uno_challenges_won).toBe(1)
    expect(f.uno_bluff_survived).toBe(1)
  })

  it('fires the per-game flags at their thresholds and not below', async () => {
    const at = await factsFor({
      uno_turns_taken: 4,
      uno_color_changes: 5,
      uno_cards_drawn: 5,
      uno_reverses: 2,
      uno_rainbow: 1,
      uno_skips: 1,
      uno_draw_twos: 1,
      uno_wilds: 1,
    })
    expect(at.uno_color_changes_5_games).toBe(1)
    expect(at.uno_drew_5_games).toBe(1)
    expect(at.uno_two_reverses_games).toBe(1)
    expect(at.uno_rainbow_games).toBe(1)
    expect(at.uno_action_hero_games).toBe(1)

    const below = await factsFor({
      uno_turns_taken: 4,
      uno_color_changes: 4,
      uno_cards_drawn: 4,
      uno_reverses: 1,
      uno_skips: 1, // missing draw2 + wild → no Action Hero
    })
    expect(below.uno_color_changes_5_games).toBeUndefined()
    expect(below.uno_drew_5_games).toBeUndefined()
    expect(below.uno_two_reverses_games).toBeUndefined()
    expect(below.uno_rainbow_games).toBeUndefined()
    expect(below.uno_action_hero_games).toBeUndefined()
  })

  it('withholds every win flag from a player the context does not name a winner', async () => {
    const f = await factsFor({
      uno_turns_taken: 5,
      uno_cards_drawn: 0,
      uno_peak_hand_size: 13,
      uno_out_wild: 1,
    })
    expect(f.uno_quickfire_wins).toBeUndefined()
    expect(f.uno_comeback_wins).toBeUndefined()
    expect(f.uno_wild_finish_wins).toBeUndefined()
    expect(f.uno_flawless_wins).toBeUndefined()
  })

  it('awards the win flags to a named winner', async () => {
    const f = await factsFor(
      {
        uno_turns_taken: 6,
        uno_cards_drawn: 0,
        uno_forced_hits: 0,
        uno_peak_hand_size: 12,
        uno_skips: 1,
        uno_reverses: 1,
        uno_draw_twos: 1,
        uno_wilds: 1,
        uno_wild_draw_fours: 1,
        uno_out_wd4: 1,
      },
      { ...CTX, seated: ['me', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], winners: ['me'] }
    )
    expect(f.uno_quickfire_wins).toBe(1) // 6 turns <= 8
    expect(f.uno_comeback_wins).toBe(1) // peak 12
    expect(f.uno_full_lobby_wins).toBe(1) // eight seated
    expect(f.uno_untouchable_wins).toBe(1) // no penalty draws, 3+
    expect(f.uno_flawless_wins).toBe(1) // drew nothing, 3+
    expect(f.uno_full_circle_wins).toBe(1) // every action type + WD4
    expect(f.uno_wd4_finish_wins).toBe(1) // out on a Wild Draw Four
    expect(f.uno_wild_finish_wins).toBeUndefined() // out card wasn't a plain wild flag
  })

  it('distinguishes a wild finish from a wild-draw-four finish', async () => {
    const wild = await factsFor({ uno_turns_taken: 4, uno_out_wild: 1 }, { ...CTX, winners: ['me'] })
    expect(wild.uno_wild_finish_wins).toBe(1)
    expect(wild.uno_wd4_finish_wins).toBeUndefined()
  })

  it('Colour Blind fires only for a timed win holding a single colour', async () => {
    const oneColor = await factsFor({ uno_turns_taken: 20 }, { ...CTX, winners: ['me'] }, [
      num('red', 3),
      num('red', 8),
    ])
    expect(oneColor.uno_one_color_wins).toBe(1)
    const twoColors = await factsFor({ uno_turns_taken: 20 }, { ...CTX, winners: ['me'] }, [
      num('red', 3),
      num('blue', 8),
    ])
    expect(twoColors.uno_one_color_wins).toBeUndefined()
    // A normal empty-hand win holds nothing → does not fire.
    const emptied = await factsFor({ uno_turns_taken: 6 }, { ...CTX, winners: ['me'] }, [])
    expect(emptied.uno_one_color_wins).toBeUndefined()
  })

  it('gates Never Drawn, Untouchable and Flawless to three or more players', async () => {
    const heads = await factsFor(
      { uno_turns_taken: 5, uno_cards_drawn: 0, uno_forced_hits: 0 },
      { ...CTX, seated: ['me', 'b'], winners: ['me'] }
    )
    expect(heads.uno_never_drawn_games).toBeUndefined()
    expect(heads.uno_untouchable_wins).toBeUndefined()
    expect(heads.uno_flawless_wins).toBeUndefined()

    const table = await factsFor(
      { uno_turns_taken: 5, uno_cards_drawn: 0, uno_forced_hits: 0 },
      { ...CTX, seated: ['me', 'b', 'c'], winners: ['me'] }
    )
    expect(table.uno_never_drawn_games).toBe(1)
    expect(table.uno_untouchable_wins).toBe(1)
    expect(table.uno_flawless_wins).toBe(1)
  })

  it('withholds Never Drawn from a player who was forced to draw', async () => {
    const f = await factsFor(
      { uno_turns_taken: 5, uno_forced_hits: 1 },
      { ...CTX, seated: ['me', 'b', 'c'], winners: ['me'] }
    )
    expect(f.uno_never_drawn_games).toBeUndefined()
  })

  it('never calls a player who took no turn anything — an empty bag is no entry', async () => {
    const map = await unoFacts(db([{ player_id: 'me', stats: {}, cards: [] }]), 'G', {
      ...CTX,
      seated: ['me', 'b', 'c'],
    })
    expect(map.get('me')).toBeUndefined()
  })

  it('reads every player of one round from a single call', async () => {
    const map = await unoFacts(
      db([
        { player_id: 'me', stats: { uno_turns_taken: 6, uno_skips: 3, uno_out_wild: 1 }, cards: [] },
        { player_id: 'rival', stats: { uno_catches: 1 }, cards: [] },
        { player_id: 'ghost', stats: null, cards: [] },
      ]),
      'G',
      { ...CTX, seated: ['me', 'rival'], winners: ['me'] }
    )
    expect(map.size).toBe(2) // ghost's null bag yields no entry
    expect(map.get('me')?.uno_skips).toBe(3)
    expect(map.get('me')?.uno_wild_finish_wins).toBe(1)
    // The loser is credited for what they did, but wins nothing.
    expect(map.get('rival')?.uno_catches).toBe(1)
    expect(map.get('rival')?.uno_wild_finish_wins).toBeUndefined()
    expect(map.get('ghost')).toBeUndefined()
  })

  it('returns nothing when there are no hand rows', async () => {
    const map = await unoFacts(db([]), 'G', CTX)
    expect(map.size).toBe(0)
  })
})
