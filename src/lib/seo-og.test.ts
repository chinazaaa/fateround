import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { GAME_LANDING_OG_BY_SLUG, gameLandingOgPath, OG_IMAGE } from './seo'
import { GAME_TYPE_TO_SLUG } from './game-landing'
import { DAILY_CHALLENGE_GAME_TYPES, DAILY_GAME_TYPE_TO_SLUG } from './daily-challenge'
import { GAME_TYPE_CONFIG } from './game-types'
import type { GameType } from '@/types'

/**
 * Guard for the "OG card silently falls back to the generic site image" bug class.
 *
 * `GAME_LANDING_OG_BY_SLUG` is keyed by LANDING SLUG, but the keys read like game types,
 * so a slug rename leaves a key that looks right and resolves to nothing. That is exactly
 * what happened to Estate Kings: `GAME_TYPE_TO_SLUG.monopoly` became `estate-kings` while
 * the map kept `monopoly`, so `/games/estate-kings` and every Monopoly join link shipped
 * the generic card while `/og/monopoly.png` sat unreferenced. Troll Run and Wordle simply
 * never got an entry, and `ping-pong` outlived the game itself pointing at a missing file.
 *
 * Both directions are checked: no entry may point at a missing file, and no landing or
 * daily-challenge slug may be left without art.
 */

const PUBLIC_DIR = join(process.cwd(), 'public')

function fileFor(webPath: string): string {
  return join(PUBLIC_DIR, webPath.replace(/^\//, ''))
}

const ALL_GAME_TYPES = Object.keys(GAME_TYPE_CONFIG) as GameType[]

describe('game landing OG art', () => {
  it('every entry points at a file that exists in public/', () => {
    const broken = Object.entries(GAME_LANDING_OG_BY_SLUG)
      .filter(([, webPath]) => !existsSync(fileFor(webPath)))
      .map(([slug, webPath]) => `${slug} -> ${webPath}`)
    expect(broken, 'OG entry points at a missing file — social cards 404').toEqual([])
  })

  it('the site-wide fallback image exists', () => {
    expect(existsSync(fileFor(OG_IMAGE.url)), OG_IMAGE.url).toBe(true)
  })

  it('every game type resolves to its own card, not the generic fallback', () => {
    const generic = ALL_GAME_TYPES.filter((gameType) => {
      const slug = GAME_TYPE_TO_SLUG[gameType]
      return gameLandingOgPath(slug) === OG_IMAGE.url
    })
    expect(
      generic,
      'game types whose landing slug has no OG entry — they share the generic site card. ' +
        'Add a GAMES entry in scripts/og/og-template.html, render it to public/og/<slug>.png, ' +
        'then register it in GAME_LANDING_OG_BY_SLUG.'
    ).toEqual([])
  })

  it('every daily challenge resolves to its own card', () => {
    const generic = DAILY_CHALLENGE_GAME_TYPES.filter(
      (gameType) => gameLandingOgPath(`daily-${DAILY_GAME_TYPE_TO_SLUG[gameType]}`) === OG_IMAGE.url
    )
    expect(generic, 'daily challenges with no OG entry — they share the generic site card').toEqual([])
  })

  it('has no entries for slugs that are neither a game landing nor a daily challenge', () => {
    const known = new Set<string>([
      ...Object.values(GAME_TYPE_TO_SLUG),
      ...DAILY_CHALLENGE_GAME_TYPES.map((gameType) => `daily-${DAILY_GAME_TYPE_TO_SLUG[gameType]}`),
      'daily-challenges', // the /daily-challenges hub page
    ])
    const orphans = Object.keys(GAME_LANDING_OG_BY_SLUG).filter((slug) => !known.has(slug))
    expect(orphans, 'OG entry for a slug nothing routes to — a retired game left it behind').toEqual([])
  })
})
