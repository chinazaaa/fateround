import { describe, it, expect, vi, afterEach } from 'vitest'
import { postRaceReportRequest } from './troll-run-report'
import { createSerialQueue } from './serial-queue'

afterEach(() => vi.unstubAllGlobals())

/** A fetch that never answers on its own but rejects when its signal aborts, like the real one. */
function hangingFetch() {
  return vi.fn((_url: string, init: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('aborted')))
    })
  })
}

describe('postRaceReportRequest', () => {
  it('returns the parsed body on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, deaths: 3 }), { status: 200 }))
    )
    expect(await postRaceReportRequest('/x', { a: 1 })).toEqual({ ok: true, body: { ok: true, deaths: 3 } })
  })

  it('hands a 4xx refusal back without retrying', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ currentLevelIndex: 2 }), { status: 409 }))
    vi.stubGlobal('fetch', f)
    expect(await postRaceReportRequest('/x', {})).toEqual({ ok: false, body: { currentLevelIndex: 2 } })
    expect(f).toHaveBeenCalledTimes(1)
  })

  /** Headers arrive at once but the body stream never finishes, and errors when the signal aborts. */
  function stalledBody(status: number, init: RequestInit) {
    const stream = new ReadableStream({
      start(controller) {
        init.signal?.addEventListener('abort', () => controller.error(new Error('body timeout')))
      },
    })
    return new Response(stream, { status })
  }

  it('keeps a 2xx whose body stalls as accepted, without retrying', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => stalledBody(200, init))
    vi.stubGlobal('fetch', f)
    expect(await postRaceReportRequest('/x', {}, 20)).toEqual({ ok: true, body: null })
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('retries a refusal whose body stalls instead of returning it with the progress lost', async () => {
    let n = 0
    const f = vi.fn(async (_u: string, init: RequestInit) =>
      ++n === 1 ? stalledBody(409, init) : new Response(JSON.stringify({ currentLevelIndex: 3 }), { status: 409 })
    )
    vi.stubGlobal('fetch', f)
    expect(await postRaceReportRequest('/x', {}, 20)).toEqual({ ok: false, body: { currentLevelIndex: 3 } })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('tolerates a malformed JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 200 }))
    )
    expect(await postRaceReportRequest('/x', {})).toEqual({ ok: true, body: null })
  })

  it('gives up on a request that never settles instead of blocking forever', async () => {
    const f = hangingFetch()
    vi.stubGlobal('fetch', f)
    expect(await postRaceReportRequest('/x', {}, 20)).toEqual({ ok: false, body: null })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a stalled death no longer holds back the clear queued behind it', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init: RequestInit) => {
        calls.push(url)
        if (url === '/death') {
          return new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('t'))))
        }
        return Promise.resolve(new Response('{}', { status: 200 }))
      })
    )
    const queue = createSerialQueue()
    void queue(() => postRaceReportRequest('/death', {}, 20))
    const clear = await queue(() => postRaceReportRequest('/clear', {}, 20))
    expect(clear.ok).toBe(true)
    expect(calls).toEqual(['/death', '/death', '/clear'])
  })
})
