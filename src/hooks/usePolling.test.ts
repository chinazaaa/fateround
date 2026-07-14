import { describe, it, expect } from 'vitest'
import { supabasePollOk } from './usePolling'

// Shaped like real Supabase results. Declared as consts because supabasePollOk takes
// `{ error: unknown }` — an inline literal carrying `data` trips excess-property checks.
const ok = { data: [{ id: 'p1' }], error: null }
const emptyRow = { data: null, error: null }
const emptyList = { data: [], error: null }
const denied = { data: null, error: { code: '42501', message: 'permission denied for table players' } }
const retriable = { data: null, error: { code: 'PGRST002', message: 'schema cache' } }
const failed = { data: null, error: { message: 'boom' } }

describe('supabasePollOk', () => {
  it('passes when every read succeeded', () => {
    expect(supabasePollOk(ok, ok)).toBe(true)
  })

  it('treats an empty read as success, not failure', () => {
    // .maybeSingle() / plain selects report "no rows" as data-null-or-empty with no
    // error — a genuinely empty game must still apply to state.
    expect(supabasePollOk(emptyRow, emptyList)).toBe(true)
  })

  it('fails on a permission error so callers never wipe good state to empty', () => {
    // 42501 = a column without a column-level GRANT (migration 0122). This is the case
    // that used to slip through as "ok" and blank the roster.
    expect(supabasePollOk(ok, denied)).toBe(false)
  })

  it('fails on a retriable error', () => {
    expect(supabasePollOk(retriable)).toBe(false)
  })

  it('fails when any one of several reads errored', () => {
    expect(supabasePollOk(ok, ok, failed, ok)).toBe(false)
  })
})
