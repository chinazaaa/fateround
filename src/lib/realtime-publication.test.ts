// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// A Supabase Realtime channel is all-or-nothing: one `postgres_changes` binding on a table that is
// not in the `supabase_realtime` publication makes the server reject the WHOLE channel, so every
// other table on it stops delivering too (players then only hear about a game starting from a slow
// polling fallback). This reads the migrations and the client subscriptions and fails when a table
// the client subscribes to is never added to the publication.

const ROOT = process.cwd()
const MIGRATIONS = join(ROOT, 'supabase/migrations')

// Tables that are deliberately NOT published (server-only / hidden state). Their views subscribe to
// them anyway and rely on polling; fixing that is a separate change.
// `mahjong_player_state` (hidden hands, dropped by 20260803180100) is subscribed to by the mobile
// Mahjong view, which therefore also loses its whole sync channel and relies on polling.
const INTENTIONALLY_UNPUBLISHED = new Set([
  'mafia_chat_messages',
  'mafia_player_states',
  'mafia_sessions',
  'mahjong_player_state',
])

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

function tableName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)[0]!
    .replace(/^public\./i, '')
    .replace(/"/g, '')
}

/** Text between an already-opened `loop` (starting at `from`) and its balancing `end loop`. */
function loopBody(sql: string, from: number): string {
  const token = /\bend\s+loop\b|\bloop\b/gi
  token.lastIndex = from
  let depth = 1
  for (let m = token.exec(sql); m; m = token.exec(sql)) {
    depth += /^end/i.test(m[0]) ? -1 : 1
    if (depth === 0) return sql.slice(from, m.index)
  }
  throw new Error('publication loop has no balancing `end loop`')
}

type PublicationEvent = { at: number; op: 'add' | 'drop'; tables: string[] }

/** Every literal `ALTER PUBLICATION ... ADD|DROP TABLE` and every `FOREACH ... LOOP` that adds/drops, in file order. */
function publicationEvents(sql: string): PublicationEvent[] {
  const events: PublicationEvent[] = []
  const literal = /alter\s+publication\s+supabase_realtime\s+(add|drop)\s+table\s+(?:only\s+)?([^;]+?)\s*;/gi
  for (const m of sql.matchAll(literal)) {
    events.push({ at: m.index!, op: m[1]!.toLowerCase() as 'add' | 'drop', tables: m[2]!.split(',').map(tableName) })
  }
  // A DO block that loops over a table list and runs the ALTER with `format(..., tbl)` cannot be read
  // statement by statement. Read the array literal of THAT loop, and only if its own body (up to
  // `end loop`) runs the ALTER, so an unrelated loop's array is never mistaken for a publication list.
  // The loop may iterate an inline `array[...]` or a variable declared as `name text[] := array[...]`
  // earlier in the same block (20260803180100 drops hidden-state tables that way). Its body can hold
  // nested loops, so read it up to the `end loop` that balances the opening `loop`.
  const loop = /foreach\s+\w+\s+in\s+array\s+(array\[[^\]]+\]|\w+)\s+loop\b/gi
  for (const m of sql.matchAll(loop)) {
    const body = loopBody(sql, m.index! + m[0].length)
    const alter = /alter\s+publication\s+supabase_realtime\s+(add|drop)\s+table/i.exec(body)
    if (!alter) continue
    let list = m[1]!
    if (!/^array\[/i.test(list)) {
      const decl = new RegExp(`\\b${list}\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]+)\\]`, 'i').exec(sql)
      if (!decl) throw new Error(`publication loop over '${list}' has no array declaration to read`)
      list = decl[1]!
    }
    const tables = [...list.matchAll(/'(\w+)'/g)].map((n) => n[1]!)
    events.push({ at: m.index!, op: alter[1]!.toLowerCase() as 'add' | 'drop', tables })
  }
  return events.sort((a, b) => a.at - b.at)
}

/** Tables left in the publication after replaying every migration's ADD/DROP TABLE in order. */
function publishedTables(): { published: Set<string>; created: Set<string> } {
  const published = new Set<string>()
  const created = new Set<string>()
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const f of files) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, f), 'utf8'))
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?(\w+)"?/gi))
      created.add(m[1]!)
    for (const ev of publicationEvents(sql)) {
      for (const t of ev.tables) {
        if (ev.op === 'add') published.add(t)
        else published.delete(t)
      }
    }
  }
  return { published, created }
}

/** Recursively collects non-test .ts/.tsx files, skipping dependency and build directories. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

/** Tables named in `postgres_changes` bindings and `useGameTableSync` table lists (web and mobile). */
function subscribedTables(): Map<string, string> {
  const tables = new Map<string, string>()
  for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'apps/mobile'))]) {
    const src = readFileSync(file, 'utf8')
    const rel = file.slice(ROOT.length + 1)
    if (src.includes('postgres_changes')) {
      for (const m of src.matchAll(/table:\s*'(\w+)'/g)) tables.set(m[1]!, rel)
    }
    for (const m of src.matchAll(/useGameTableSync\(/g)) {
      // Scan the WHOLE table array: find its matching `]` from the first `[` after the call, however
      // long the list is, and fail loudly if there is none (a silent truncation would let a table
      // appended to a long list go unchecked).
      const from = m.index! + m[0].length
      const start = src.indexOf('[', from)
      if (start < 0) continue
      let depth = 0
      let end = -1
      for (let i = start; i < src.length; i++) {
        if (src[i] === '[') depth++
        else if (src[i] === ']' && --depth === 0) {
          end = i
          break
        }
      }
      if (end < 0) throw new Error(`useGameTableSync table list in ${rel} has no closing bracket`)
      const arr = src.slice(start, end + 1)
      for (const s of arr.matchAll(/'([a-z][a-z0-9_]+)'/g)) tables.set(s[1]!, rel)
      for (const s of arr.matchAll(/table:\s*'(\w+)'/g)) tables.set(s[1]!, rel)
    }
  }
  return tables
}

describe('realtime publication', () => {
  it('contains every table the client subscribes to', () => {
    const { published, created } = publishedTables()
    const missing: string[] = []
    for (const [table, file] of subscribedTables()) {
      // Only real tables: ignore identifiers that merely sit inside the same array literal.
      if (!created.has(table)) continue
      if (INTENTIONALLY_UNPUBLISHED.has(table)) continue
      if (!published.has(table)) missing.push(`${table} (subscribed in ${file})`)
    }
    expect(
      missing,
      'These tables are subscribed to but never added to the supabase_realtime publication. ' +
        'One unpublished binding kills the whole Realtime channel. Add them in a migration:\n' +
        missing.join('\n')
    ).toEqual([])
  })

  it('actually finds subscriptions and published tables (the scan itself is not broken)', () => {
    const { published } = publishedTables()
    const subs = subscribedTables()
    expect(published.has('games')).toBe(true)
    expect(published.has('participants')).toBe(true)
    expect(subs.has('games')).toBe(true)
    // The four tables this test was written for: the scan must see their useGameChannel bindings.
    for (const t of ['participants', 'confessions', 'hot_seat_submissions', 'anonymous_room_bans']) {
      expect(subs.has(t), `scan did not find a subscription to ${t}`).toBe(true)
    }
    expect(subs.size).toBeGreaterThan(20)
  })
})
