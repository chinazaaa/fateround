import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from './supabase'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Capture the init the wrapper passes through, so the test can inspect its signal. */
function stubFetch(impl: (init: RequestInit | undefined) => Promise<Response>) {
  const seen: { init?: RequestInit } = {}
  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      seen.init = init
      return impl(init)
    })
  )
  return seen
}

describe('fetchWithTimeout', () => {
  it('aborts a request that never settles', async () => {
    vi.useFakeTimers()
    const seen = stubFetch(() => new Promise<Response>(() => {}))
    void fetchWithTimeout('https://example.test/rest/v1/games')
    expect(seen.init?.signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1_000)
    expect(seen.init?.signal?.aborted).toBe(true)
  })

  it('keeps the deadline armed after fetch resolves, so a stalled body still aborts', async () => {
    // postgrest-js gets only the headers from fetch() and then calls res.text() to read the
    // body. A response that delivers headers and then stalls mid-body would hang forever if
    // the deadline were cleared when fetch() settled.
    vi.useFakeTimers()
    const seen = stubFetch(async () => new Response('{}'))
    await fetchWithTimeout('https://example.test/rest/v1/games')
    expect(seen.init?.signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1_000)
    expect(seen.init?.signal?.aborted).toBe(true)
  })

  it("aborts immediately when the caller's own signal is already aborted", async () => {
    const seen = stubFetch(async () => new Response('{}'))
    await fetchWithTimeout('https://example.test/rest/v1/games', { signal: AbortSignal.abort() })
    expect(seen.init?.signal?.aborted).toBe(true)
  })

  it("aborts when the caller's signal fires later", async () => {
    const caller = new AbortController()
    const seen = stubFetch(async () => new Response('{}'))
    await fetchWithTimeout('https://example.test/rest/v1/games', { signal: caller.signal })
    expect(seen.init?.signal?.aborted).toBe(false)

    caller.abort()
    expect(seen.init?.signal?.aborted).toBe(true)
  })
})
