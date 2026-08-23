import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard: a finished game's roster is immutable.
 *
 * Leaving a game hard-DELETEs the `players` row, and every per-game score table cascades off
 * it — `trivia_answers.player_id references players(id) on delete cascade`, and the same shape
 * everywhere else. Finished screens rank the rows still present and highlight the top one, so
 * when the players above you closed the results screen their scores were ERASED and you were
 * promoted into first. Reported as "I was 5th, the top four left, and it made me the winner".
 *
 * Not cosmetic: `GameFinishPanel` derives `winnerPlayerId` the same way and `PostWinToCommunity`
 * fires on it, so a phantom win reached the community leaderboard.
 *
 * The fix is a no-op removal once `status === 'finished'`. What this test really protects is its
 * POSITION: each game type runs its own removal helper and returns early, so a guard placed
 * after those branches would only cover the handful that fall through to the generic delete.
 */

const ROUTE = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'players', 'route.ts'), 'utf8')

/** The DELETE handler only — the file also serves POST/PATCH. */
const deleteHandler = (() => {
  const start = ROUTE.indexOf('export async function DELETE(')
  expect(start, 'DELETE handler not found').toBeGreaterThan(-1)
  return ROUTE.slice(start)
})()

describe('removal from a finished game', () => {
  it('is a no-op rather than a delete', () => {
    // The guard, and the fact it returns the retained shape — not that they are adjacent.
    // There is an unsubscribe step between them (see below).
    expect(deleteHandler).toMatch(/if \(\(game as \{ status\?: string \}\)\.status === 'finished'\) \{/)
    expect(deleteHandler).toMatch(/return NextResponse\.json\(\{ success: true, retained: true \}\)/)
  })

  it('answers 200, because the client navigates away either way', () => {
    // An error here would surface a failure toast on a perfectly ordinary "back to home".
    const guard = /status === 'finished'\)[\s\S]{0,200}?NextResponse\.json\(([\s\S]{0,80}?)\)/.exec(deleteHandler)
    expect(guard?.[1] ?? '', 'must not return an error status').not.toMatch(/status:\s*4\d\d|error:/)
  })

  it('runs BEFORE the per-game removal branches', () => {
    // The load-bearing property. Every `isXGame(gameType)` branch calls its own removal helper
    // and returns, so a guard below even one of them silently misses that game.
    const guardAt = deleteHandler.search(/status === 'finished'\) \{/)
    expect(guardAt).toBeGreaterThan(-1)

    const branches = [...deleteHandler.matchAll(/\bif \(is[A-Z]\w*Game\(gameType\)\)/g)]
    expect(branches.length, 'expected the per-game removal branches').toBeGreaterThanOrEqual(10)
    for (const branch of branches) {
      expect(branch.index!, `guard must precede ${branch[0]}`).toBeGreaterThan(guardAt)
    }
  })

  it('runs before the generic delete too', () => {
    const guardAt = deleteHandler.search(/status === 'finished'/)
    const genericDelete = deleteHandler.search(/from\('players'\)\s*\.delete\(\)/)
    expect(genericDelete).toBeGreaterThan(guardAt)
  })

  it("unsubscribes the leaver from this game's pushes", () => {
    // Both push tables key on `players(id) ON DELETE CASCADE`, so before the guard existed a
    // leave unsubscribed the device as a side effect of the delete. Retaining the row retains
    // those too — which would leave someone who deliberately left a finished game still
    // getting "Play again? 🔁" when the host reopened the lobby. The score tables hang off the
    // player row, not these, so dropping them costs the standings nothing.
    expect(deleteHandler).toMatch(/from\('push_subscriptions'\)\.delete\(\)/)
    expect(deleteHandler).toMatch(/from\('mobile_push_tokens'\)\.delete\(\)/)
    const unsub = deleteHandler.search(/push_subscriptions'\)\.delete/)
    const retained = deleteHandler.search(/retained: true/)
    expect(unsub, 'must run before the early return').toBeLessThan(retained)
  })

  it('still deletes mid-game — a player who walks out forfeits rather than places', () => {
    // The guard must key on 'finished' alone. Widening it to 'active' would leave abandoned
    // seats blocking turn order for the rest of the game.
    expect(deleteHandler).not.toMatch(/status === 'active'[\s\S]{0,120}?retained: true/)
  })
})
