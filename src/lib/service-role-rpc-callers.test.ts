// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * These database functions are granted to service_role ONLY (their migrations revoke them from public, anon and
 * authenticated): a call through the anon client fails at runtime, and does so only on the rarely-taken path that
 * reaches it (an expired room, a lost finish race). So every call site is pinned here: a new one must be added to
 * the list, which is the moment to check it runs on a service-role client.
 */
const ALLOWED: Record<string, string[]> = {
  settle_host_leave: ['src/app/api/players/route.ts'],
  end_game_if_host_alone: ['src/app/api/players/route.ts'],
  wipe_finished_session_rows: ['src/lib/session-clear.ts'],
  insert_anonymous_message_if_active: ['src/app/api/anonymous-messages/route.ts'],
  insert_codewords_message_if_active: ['src/app/api/codewords/chat/route.ts'],
  begin_play_again_reset: ['src/app/api/games/[code]/play-again/route.ts'],
  abort_play_again_reset: ['src/app/api/games/[code]/play-again/route.ts'],
  remove_player_if_game_open: ['src/lib/codewords.ts'],
  start_two_truths_game: ['src/app/api/games/[code]/start/route.ts'],
  word_rush_restore_roster_member: ['src/lib/word-rush-server.ts'],
  finish_rounds_of_finished_session: ['src/lib/admin-end-game.ts'],
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) sourceFiles(full, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

describe('service-role-only database functions', () => {
  const files = sourceFiles(join(process.cwd(), 'src'))

  it.each(Object.entries(ALLOWED))('%s is called only from the audited files', (fn, allowed) => {
    const callers = files
      .filter((f) => new RegExp(`\\.rpc\\(\\s*['"]${fn}['"]`).test(readFileSync(f, 'utf8')))
      .map((f) => relative(process.cwd(), f))
      .sort()
    expect(callers).toEqual([...allowed].sort())
  })

  it('the anonymous-messages route never hands its anon client to a finisher that wipes', () => {
    const route = readFileSync(join(process.cwd(), 'src/app/api/anonymous-messages/route.ts'), 'utf8')
    expect(route).not.toMatch(/finishExpiredAnonymousSession\(\s*supabase\b/)
  })
})
