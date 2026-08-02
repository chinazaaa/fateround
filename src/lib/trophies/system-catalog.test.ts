import { describe, expect, it } from 'vitest'
import { GAME_TYPE_CONFIG, gameTypeLabel } from '@/lib/game-types'
import { buildCatalogForGame, criteriaUsesLiveMeasures } from './catalog'
import { isKnownCounter } from './counters'
import { parseCriteria } from './criteria'
import { hasWinnerSource } from './outcome'
import { buildSystemCatalog, gamesWithSystemTrophies } from './system-catalog'
import type { GameType } from '@/types'

/**
 * The system catalog is hand-authored data whose failure mode is silence.
 *
 * A trophy naming a counter nothing emits does not error: it saves, it seeds, it appears in the
 * catalog and on the player's profile, and it is simply never earned. Nobody finds out. These
 * assertions are the only thing between an authoring slip and a trophy that is permanently
 * unearnable — and because ids are `ON DELETE RESTRICT` once earned, a bad one is hard to undo.
 */
describe('system catalog', () => {
  const catalog = buildSystemCatalog()

  it('has trophies for every game that claims a set', () => {
    expect(catalog.length).toBeGreaterThan(0)
    for (const game of gamesWithSystemTrophies()) {
      expect(
        catalog.filter((t) => t.game_type === game).length,
        `${game} is listed in the catalog but contributes no trophies`
      ).toBeGreaterThan(0)
    }
  })

  it('names only counters that exist in the vocabulary', () => {
    const bad = catalog
      .map((t) => ({ id: t.id, counter: (t.criteria as { counter?: string })?.counter }))
      .filter((t) => !t.counter || !isKnownCounter(t.counter))
    expect(bad, 'unregistered counter — these trophies could never be earned').toEqual([])
  })

  it('only measures things something actually emits', () => {
    // Belt and braces over the check above: `criteriaUsesLiveMeasures` is the same gate the admin
    // API applies to hand-written rules, so system trophies are held to the rule admin is.
    for (const t of catalog) {
      const { ok, unknown } = criteriaUsesLiveMeasures(t.criteria)
      expect(ok, `${t.id} uses ${unknown.join(', ')}`).toBe(true)
    }
  })

  it('produces criteria the evaluator accepts', () => {
    for (const t of catalog) {
      expect(parseCriteria(t.criteria), `${t.id} has criteria the DSL rejects`).toBeTruthy()
    }
  })

  it('scopes every rule to its own game', () => {
    // A rule that forgot its gameType would count EVERY game — "win 5 chess games" satisfied by
    // five Trivia wins. Silent and very wrong.
    for (const t of catalog) {
      expect((t.criteria as { gameType?: string }).gameType, `${t.id} is not scoped to a game`).toBe(t.game_type)
    }
  })

  it('has unique ids that never collide with the generic catalog', () => {
    const ids = catalog.map((t) => t.id)
    expect(new Set(ids).size, 'duplicate id inside the system catalog').toBe(ids.length)

    const generic = new Set(
      (Object.keys(GAME_TYPE_CONFIG) as GameType[])
        .flatMap((g) => buildCatalogForGame(g, gameTypeLabel(g) ?? g, hasWinnerSource(g)))
        .map((t) => t.id)
    )
    // Both catalogs seed into ONE table, so a shared id would silently overwrite one with the
    // other. The `.sys.` segment is what keeps them apart.
    expect(
      ids.filter((id) => generic.has(id)),
      'id collides with the generic catalog'
    ).toEqual([])
  })

  it('is coherent enough to display', () => {
    for (const t of catalog) {
      expect(t.title.length, `${t.id} has no title`).toBeGreaterThan(0)
      expect(t.description.length, `${t.id} has no description`).toBeGreaterThan(0)
      expect(t.points, `${t.id} has negative points`).toBeGreaterThanOrEqual(0)
      expect(['bronze', 'silver', 'gold', 'platinum']).toContain(t.tier)
    }
  })

  it('sorts tiers in order — no gold trophy ranked after a platinum one', () => {
    // sortOrder drives display order, so a gold entry with a higher sortOrder than a platinum
    // one renders below it. Caught two Yahtzee golds that had been appended under the platinum
    // header. Checked per game, since sortOrder is only meaningful within a game's own list.
    const RANK = { bronze: 0, silver: 1, gold: 2, platinum: 3 }
    const byGame = new Map<string, typeof catalog>()
    for (const t of catalog) {
      const list = byGame.get(t.game_type ?? '') ?? []
      list.push(t)
      byGame.set(t.game_type ?? '', list)
    }
    for (const [game, list] of byGame) {
      const bySort = [...list].sort((a, b) => a.sort_order - b.sort_order)
      const ranks = bySort.map((t) => RANK[t.tier as keyof typeof RANK])
      for (let i = 1; i < ranks.length; i += 1) {
        expect(
          ranks[i],
          `${game}: ${bySort[i].id} (${bySort[i].tier}) is sorted after a higher tier`
        ).toBeGreaterThanOrEqual(ranks[i - 1])
      }
    }
  })
})
