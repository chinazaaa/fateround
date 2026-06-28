// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { PollHostView } from './PollHostView'

// Module-load smoke test: PollHostView (and its large transitive graph of game host
// sub-components) builds a Supabase client at import — this confirms it loads cleanly
// under the harness's dummy-Supabase env. A full render test would need fetch/supabase
// mocks; the move itself is verified by tsc + next build + behaviour-equivalence.
describe('PollHostView', () => {
  it('imports cleanly under the test harness', () => {
    expect(PollHostView).toBeTypeOf('function')
  })
})
