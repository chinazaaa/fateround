import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: Troll Run runs the SHARED engine on both platforms, not two copies of it.
 *
 * Troll Run was the last of the 49 game types with no mobile player view, and the reason was the
 * engine: ~7,000 lines of physics, traps and level generation written against a 2D canvas. The way
 * it shipped was to move the platform-neutral half into `packages/shared` behind two adapters —
 * a render target and an audio sink — leaving only the canvas renderer and the WebAudio synth on
 * the web side.
 *
 * That is the property worth protecting. The levels are rebuilt on each client from
 * `session.level_order` rather than sent over the wire, and the server scores against the sequence
 * it drew; if web and mobile ever ran different level geometry or different physics constants, a
 * mixed race would score runners against levels they never saw. A second copy of any of this is
 * the failure mode, so these tests assert there is exactly one.
 */

const root = process.cwd()
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8')

/** Strips comments so a path named in prose does not read as an import. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const SHARED_ENGINE = 'packages/shared/src/troll-run-engine'

describe('the Troll Run engine lives in packages/shared', () => {
  it('keeps the simulation free of DOM, canvas and Web Audio', () => {
    for (const file of ['engine.ts', 'physics.ts', 'triggers.ts', 'particles.ts', 'tweens.ts', 'input.ts']) {
      const code = codeOf(read(SHARED_ENGINE, file))
      expect(code, `${file} must not reference a canvas context`).not.toMatch(/CanvasRenderingContext2D/)
      expect(code, `${file} must not construct an AudioContext`).not.toMatch(/new AudioContext|webkitAudioContext/)
      expect(code, `${file} must not reach for the DOM`).not.toMatch(/\bdocument\.\w/)
    }
  })

  it('reaches a screen through injected adapters', () => {
    const engine = codeOf(read(SHARED_ENGINE, 'engine.ts'))
    expect(engine).toMatch(/setRenderTarget\(target: TrollRunRenderTarget \| null\)/)
    expect(engine).toMatch(/setAudioSink\(sink: TrollRunAudioSink \| null\)/)
    // Every audio call must be optional-chained: mobile supplies a partial sink (or none at all).
    const audioCalls = [...engine.matchAll(/this\.audio\.\w+/g)].map((match) => match[0])
    expect(audioCalls.length, 'expected the engine to still make sounds').toBeGreaterThan(3)
    for (const call of audioCalls) {
      expect(engine).toMatch(new RegExp(`${call.replace('.', '\\.')}\\?\\.\\(`))
    }
  })

  it('is the only copy — web re-exports it rather than keeping its own', () => {
    const webIndex = codeOf(read('src/lib/troll-run-engine/index.ts'))
    expect(webIndex).toMatch(/export \* from '\.\.\/\.\.\/\.\.\/packages\/shared\/src\/troll-run-engine'/)

    // The web folder may hold only the browser half plus the entry points.
    const webOnly = ['index.ts', 'levels.ts', 'renderer.ts', 'audio.ts', 'web-engine.ts']
    for (const file of ['physics.ts', 'triggers.ts', 'tweens.ts', 'particles.ts', 'engine.ts', 'types.ts']) {
      expect(webOnly, `src/lib/troll-run-engine/${file} would be a second copy`).not.toContain(file)
      expect(() => read('src/lib/troll-run-engine', file)).toThrow()
    }
  })

  it('shares the stage palettes, so a mixed race looks like one race', () => {
    const palette = read(SHARED_ENGINE, 'palette.ts')
    for (const name of ['dark', 'retro', 'neon']) {
      expect(palette).toMatch(new RegExp(`\\b${name}: \\{`))
    }
    expect(codeOf(read('src/lib/troll-run-engine/renderer.ts'))).toMatch(
      /from '.*shared\/src\/troll-run-engine\/palette'/
    )
  })
})

describe('the mobile app can actually open a Troll Run room', () => {
  const router = codeOf(read('apps/mobile/components/games/GameRouter.tsx'))

  it('registers a player view', () => {
    expect(router).toMatch(/troll_run: lazyView\(\(\) => import\('@\/components\/games\/TrollRunPlayerView'\)/)
    // Registering the view is not enough — the batch has to reach MOBILE_SUPPORTED_GAMES, which is
    // what puts the game in the create picker and stops the app falling back to the web view.
    expect(router).toMatch(/\.\.\.BATCH_13_VIEWS,/)
    expect(router).toMatch(/\.\.\.BATCH_13_GAMES,/)
  })

  it('draws the stage without a canvas', () => {
    const stage = codeOf(read('apps/mobile/components/games/troll-run/TrollRunStage.tsx'))
    expect(stage).toMatch(/from '@fateround\/shared\/troll-run-engine'/)
    expect(stage).toMatch(/setRenderTarget\(/)
    expect(stage, 'the mobile stage must not import a web-only engine path').not.toMatch(/troll-run-engine\/renderer/)
  })

  it('rebuilds the round from the order the server drew', () => {
    // Not the world's default order: a round is a fresh shuffle plus generated levels, and scoring
    // looks a runner up with `level_order.indexOf(levelId)`.
    const view = codeOf(read('apps/mobile/components/games/TrollRunPlayerView.tsx'))
    expect(view).toMatch(/resolveTrollRunLevels\(levelOrderKey \? levelOrderKey\.split\('\|'\) : null, currentWorld\)/)
  })

  it('leaves progress server-authoritative', () => {
    const view = codeOf(read('apps/mobile/components/games/TrollRunPlayerView.tsx'))
    for (const post of ['postTrollRunDeath', 'postTrollRunClear', 'postTrollRunRoundFinish']) {
      expect(view, `${post} must be wired to the stage`).toContain(post)
    }
    // The round-finish claim carries no result — the server checks its own progress row and reads
    // the time off the shared round clock. Sending one would be a client-authored score.
    const api = codeOf(read('apps/mobile/lib/game-api.ts'))
    const finish = /export function postTrollRunRoundFinish\([\s\S]*?\n}/.exec(api)?.[0] ?? ''
    expect(finish).not.toMatch(/deaths|timeMs|levelsCleared|score/)
  })

  it('gives the host the one control no deadline can supply', () => {
    // Every other phase change is earned by the clock and any client may nudge it, but leaving the
    // between-rounds scoreboard needs `forceNextRound`, which the server accepts only from the
    // host. Without this button a mobile-hosted race stalls on the round results.
    const view = codeOf(read('apps/mobile/components/games/TrollRunPlayerView.tsx'))
    expect(view).toContain('postTrollRunNextRound')
    expect(view).toMatch(/useHostView\(\)/)

    const api = codeOf(read('apps/mobile/lib/game-api.ts'))
    const nextRound = /export function postTrollRunNextRound\([\s\S]*?\n}/.exec(api)?.[0] ?? ''
    expect(nextRound).toMatch(/hostToken/)
    expect(nextRound).toMatch(/forceNextRound: true/)

    // ...and the tokenless nudge must never carry it, or any client could skip a round.
    const sync = /export function postTrollRunSync\([\s\S]*?\n}/.exec(api)?.[0] ?? ''
    expect(sync).not.toMatch(/forceNextRound|hostToken/)
  })
})
