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

/**
 * `removePlayer` only (the DELETE wrapper before it, `settleHostLeave` and `endGameIfHostAlone` also speak of a
 * 'finished' game, but they are not the removal guard this file protects; the file also serves POST/PATCH).
 */
const deleteHandler = (() => {
  const start = ROUTE.indexOf('async function removePlayer(')
  expect(start, 'removePlayer not found').toBeGreaterThan(-1)
  return ROUTE.slice(start)
})()

/** The guard itself: the removal's own comparison of the game's status, not any other mention of 'finished'. */
const GUARD = /\(game as \{ status\?: string \}\)\.status === 'finished'\) \{/

describe('removal from a finished game', () => {
  it('is a no-op rather than a delete', () => {
    // The guard, and the fact it answers through the retained shape (the shared helper) rather than deleting.
    expect(deleteHandler).toMatch(GUARD)
    const guardBlock = deleteHandler.slice(
      deleteHandler.search(GUARD),
      deleteHandler.indexOf('const gameType = parseGameType(')
    )
    expect(guardBlock).toMatch(/return retainedLeaveResponse\(ctx, id, playerId\)/)
    expect(guardBlock).not.toMatch(/\.delete\(\)|removePlayerIfGameOpen\(/)
    expect(ROUTE).toMatch(/ctx\.seatRetained = true\s+return NextResponse\.json\(\{ success: true, retained: true \}\)/)
  })

  it('answers 200, because the client navigates away either way', () => {
    // An error here would surface a failure toast on a perfectly ordinary "back to home".
    const helper = /async function retainedLeaveResponse[\s\S]*?\n}\n/.exec(ROUTE)
    expect(helper, 'retainedLeaveResponse not found').not.toBeNull()
    // The response is exactly `NextResponse.json({ success: true, retained: true })`: no init argument at all, so the status
    // is the default 200 (a regex over 4xx/5xx would still accept a 302). The behavioural check (real HTTP 200 and
    // `retained: true`) is in route.host-leave-handoff.test.ts.
    expect(helper![0]).toMatch(/return NextResponse\.json\(\{ success: true, retained: true \}\)\s*\n}/)
    expect(helper![0]).not.toMatch(/status:|error:/)
  })

  it('runs BEFORE the per-game removal branches', () => {
    // The load-bearing property. Every `isXGame(gameType)` branch calls its own removal helper
    // and returns, so a guard below even one of them silently misses that game.
    const guardAt = deleteHandler.search(GUARD)
    expect(guardAt).toBeGreaterThan(-1)

    const branches = [...deleteHandler.matchAll(/\bif \(is[A-Z]\w*Game\(gameType\)\)/g)]
    expect(branches.length, 'expected the per-game removal branches').toBeGreaterThanOrEqual(10)
    for (const branch of branches) {
      expect(branch.index!, `guard must precede ${branch[0]}`).toBeGreaterThan(guardAt)
    }
  })

  it('runs before the generic delete too', () => {
    const guardAt = deleteHandler.search(GUARD)
    expect(guardAt).toBeGreaterThan(-1)
    // The generic removal is the conditional `remove_player_if_game_open` (it re-checks the status under a lock).
    const genericDelete = deleteHandler.search(/removePlayerIfGameOpen\(/)
    expect(genericDelete).toBeGreaterThan(guardAt)
    expect(deleteHandler).not.toMatch(/from\('players'\)\s*\.delete\(\)/)
  })

  it("unsubscribes the leaver from this game's pushes", () => {
    // Both push tables key on `players(id) ON DELETE CASCADE`, so before the guard existed a
    // leave unsubscribed the device as a side effect of the delete. Retaining the row retains
    // those too — which would leave someone who deliberately left a finished game still
    // getting "Play again? 🔁" when the host reopened the lobby. The score tables hang off the
    // player row, not these, so dropping them costs the standings nothing.
    // The retained shape is produced by one helper (the guard returns it), so the unsubscribe lives there.
    const helper = /async function retainedLeaveResponse[\s\S]*?\n}\n/.exec(ROUTE)?.[0] ?? ''
    expect(helper).toMatch(/from\('push_subscriptions'\)\.delete\(\)/)
    expect(helper).toMatch(/from\('mobile_push_tokens'\)\.delete\(\)/)
    expect(helper.search(/push_subscriptions'\)\.delete/), 'must run before the early return').toBeLessThan(
      helper.search(/retained: true/)
    )
  })

  it('still deletes mid-game — a player who walks out forfeits rather than places', () => {
    // The guard must key on 'finished' alone. Widening it to 'active' would leave abandoned
    // seats blocking turn order for the rest of the game.
    expect(deleteHandler).not.toMatch(/status === 'active'[\s\S]{0,120}?retained: true/)
  })
})
