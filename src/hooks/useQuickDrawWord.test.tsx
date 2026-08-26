// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuickDrawWord } from '@/hooks/useQuickDrawWord'
import type { QuickDrawWordResult } from '@/lib/quick-draw-client'
import type { QuickDrawGuessSession } from '@/types'

const fetchQuickDrawWord = vi.fn<() => Promise<QuickDrawWordResult>>()
vi.mock('@/lib/quick-draw-client', async (orig) => ({
  ...(await orig<typeof import('@/lib/quick-draw-client')>()),
  fetchQuickDrawWord: () => fetchQuickDrawWord(),
}))

const CODE = 'ABCD'
const ME = 'p1'

const session = (over: Partial<QuickDrawGuessSession> = {}) =>
  ({
    id: 's1',
    game_id: CODE,
    phase: 'turn',
    status: 'active',
    turn_index: 0,
    drawer_player_id: ME,
    word_seq: 1,
    ...over,
  }) as unknown as QuickDrawGuessSession

afterEach(() => {
  fetchQuickDrawWord.mockReset()
})

describe('useQuickDrawWord', () => {
  it('gives the drawer their prompt', async () => {
    fetchQuickDrawWord.mockResolvedValue({ ok: true, word: 'giraffe' })
    const { result } = renderHook(() => useQuickDrawWord(CODE, session(), ME, { resumeToken: 'RT' }))
    await waitFor(() => expect(result.current).toBe('giraffe'))
  })

  it('never fetches for a guesser', async () => {
    fetchQuickDrawWord.mockResolvedValue({ ok: true, word: 'giraffe' })
    const { result } = renderHook(() =>
      useQuickDrawWord(CODE, session({ drawer_player_id: 'someone-else' }), ME, { resumeToken: 'RT' })
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchQuickDrawWord).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  // The route can only answer `{ word: null }` without a secret, so the request is pure
  // rate-limit burn — and the drawer must still get the word once the token lands.
  it('waits for a secret before asking, then asks', async () => {
    fetchQuickDrawWord.mockResolvedValue({ ok: true, word: 'giraffe' })
    const { result, rerender } = renderHook(
      ({ token }: { token: string | null }) => useQuickDrawWord(CODE, session(), ME, { resumeToken: token }),
      { initialProps: { token: null as string | null } }
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchQuickDrawWord).not.toHaveBeenCalled()

    rerender({ token: 'RT' })
    await waitFor(() => expect(result.current).toBe('giraffe'))
  })

  it('asks on a host token alone (host-as-player, resume token not loaded yet)', async () => {
    fetchQuickDrawWord.mockResolvedValue({ ok: true, word: 'giraffe' })
    const { result } = renderHook(() => useQuickDrawWord(CODE, session(), ME, { resumeToken: null, hostToken: 'HT' }))
    await waitFor(() => expect(result.current).toBe('giraffe'))
  })

  // A 429 from the shared bucket or a cold-start 500 must not cost the drawer the whole word:
  // the refetch key only moves when the word does, so without a retry nothing would ever ask again.
  it('retries a transient failure instead of stranding the drawer on the placeholder', async () => {
    fetchQuickDrawWord
      .mockResolvedValueOnce({ ok: false, retryable: true })
      .mockResolvedValueOnce({ ok: true, word: 'giraffe' })
    const { result } = renderHook(() => useQuickDrawWord(CODE, session(), ME, { resumeToken: 'RT' }))
    await waitFor(() => expect(result.current).toBe('giraffe'), { timeout: 3000 })
    expect(fetchQuickDrawWord).toHaveBeenCalledTimes(2)
  })

  it('stops on a settled 4xx rather than hammering the route', async () => {
    fetchQuickDrawWord.mockResolvedValue({ ok: false, retryable: false })
    const { result } = renderHook(() => useQuickDrawWord(CODE, session(), ME, { resumeToken: 'RT' }))
    await new Promise((r) => setTimeout(r, 100))
    expect(fetchQuickDrawWord).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()
  })

  // Guards the redaction itself: a word fetched for the previous word_seq must never render as the
  // new one.
  it('drops the previous word the moment word_seq ticks', async () => {
    fetchQuickDrawWord.mockResolvedValue({ ok: true, word: 'giraffe' })
    const { result, rerender } = renderHook(
      ({ seq }: { seq: number }) => useQuickDrawWord(CODE, session({ word_seq: seq }), ME, { resumeToken: 'RT' }),
      { initialProps: { seq: 1 } }
    )
    await waitFor(() => expect(result.current).toBe('giraffe'))

    let release: (v: QuickDrawWordResult) => void = () => {}
    fetchQuickDrawWord.mockReturnValue(new Promise<QuickDrawWordResult>((r) => (release = r)))
    rerender({ seq: 2 })
    expect(result.current).toBeNull()

    release({ ok: true, word: 'kettle' })
    await waitFor(() => expect(result.current).toBe('kettle'))
  })
})
