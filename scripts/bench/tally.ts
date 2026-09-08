/**
 * Byte tallies for the two channels Supabase bills as egress.
 *
 * Everything here counts BYTES ACTUALLY OBSERVED ON THE WIRE, never a modelled or assumed
 * size. `fetch` is wrapped so the response is handed straight back to the caller while a clone of
 * its body is weighed in the background (see `Tally.drain`); `WebSocket` is subclassed so every
 * inbound frame is weighed as it arrives. If a number in a bench report did not pass through one of these two functions, it is
 * an inference and must be labelled as one.
 */

export type RestCall = { url: string; endpoint: string; status: number; bytes: number; at: number }
export type RtFrame = { channel: string; table: string | null; event: string | null; bytes: number; at: number }

export type Tally = {
  rest: RestCall[]
  rtFrames: RtFrame[]
  rtTxBytes: number
  /**
   * Resolve once every fetch started through the wrapper has finished being weighed.
   *
   * The wrapper hands the caller its `Response` as soon as the headers land — measuring the
   * body inline would make every benchmarked hook wait for the download, which is not what
   * native `fetch` does and would distort the very timing these benches exist to measure. The
   * cost of that is that `rest` trails reality by one body read, so ANY read of `rest` that is
   * meant to be complete (a final tally, a count compared against a server-side counter) must
   * `await drain()` first.
   */
  drain: () => Promise<void>
  restore: () => void
}

/** `/rest/v1/anonymous_messages?select=…` -> `anonymous_messages`; `/api/bingo/sync` -> itself. */
export function endpointOf(url: string): string {
  try {
    const u = new URL(url, 'http://127.0.0.1')
    const rest = u.pathname.match(/\/rest\/v1\/([^/?]+)/)
    if (rest) return rest[1]
    return u.pathname
  } catch {
    return url
  }
}

/**
 * Wrap `globalThis.fetch` and `globalThis.WebSocket` and start counting.
 *
 * Both are restored by `restore()`. The wrappers are installed on the globals rather than
 * injected into the Supabase client because the app's client is a module singleton constructed
 * at import time — by the time a bench file can reach it, its `global.fetch` option is already
 * bound. Patching the global catches that client, `/api/*` route pokes, and anything else the
 * hook under test happens to call, which is exactly the coverage a cost measurement needs.
 */
/** Where a relative `/api/...` fetch is sent. NEVER default this to :3000 — see README. */
const APP_BASE = process.env.BENCH_APP_URL ?? 'http://127.0.0.1:3199'

export function startTally(): Tally {
  const realFetch = globalThis.fetch
  const RealWS = globalThis.WebSocket

  const rest: RestCall[] = []
  const rtFrames: RtFrame[] = []
  const state = { tx: 0 }

  /** One entry per in-flight fetch-to-body operation; see `drain()`. */
  const pending = new Set<Promise<void>>()

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    // Node's `fetch` REJECTS a relative URL — jsdom's document origin does not apply to it. The
    // app's own code fetches `/api/...` relative, so without this every such call throws before
    // it leaves the process, the hook's own `catch` swallows it, and the bench records ZERO
    // requests for a client that is in fact hammering the endpoint. That is a false saving, and
    // it is how this bench first "proved" the bingo baseline made no requests at all.
    const url = raw.startsWith('/') ? new URL(raw, APP_BASE).href : raw
    const target: RequestInfo | URL =
      raw.startsWith('/') && typeof input !== 'string' && !(input instanceof URL)
        ? new Request(url, input as Request)
        : url === raw
          ? (input as RequestInfo)
          : url

    // Registered SYNCHRONOUSLY, before the request is even issued, so that a `drain()` racing an
    // `unmount()` still waits for a fetch whose headers have not landed yet.
    let done!: () => void
    const tracked = new Promise<void>((resolve) => {
      done = resolve
    })
    pending.add(tracked)
    const finish = () => {
      pending.delete(tracked)
      done()
    }

    return (async () => {
      let res: Response
      try {
        res = await realFetch(target, init)
      } catch (err) {
        // A request that FAILED still left the client and still cost something. Recording it with
        // status 0 keeps a broken endpoint visible as traffic instead of erasing it from the count.
        rest.push({ url, endpoint: endpointOf(url), status: 0, bytes: 0, at: Date.now() })
        finish()
        throw err
      }
      const at = Date.now()
      const status = res.status
      // Weigh the body WITHOUT awaiting it: the caller gets its response exactly when native
      // `fetch` would hand one over. `clone()` is drained here, so the copy never leaks.
      void res
        .clone()
        .arrayBuffer()
        .then(
          (buf) => {
            rest.push({ url, endpoint: endpointOf(url), status, bytes: buf.byteLength, at })
          },
          () => {
            rest.push({ url, endpoint: endpointOf(url), status, bytes: 0, at })
          }
        )
        .finally(finish)
      return res
    })()
  }) as typeof fetch

  class CountingWebSocket extends RealWS {
    constructor(...args: ConstructorParameters<typeof WebSocket>) {
      super(...args)
      this.addEventListener('message', (ev: MessageEvent) => {
        const bytes =
          typeof ev.data === 'string' ? Buffer.byteLength(ev.data, 'utf8') : (ev.data as ArrayBuffer).byteLength
        let channel = '?'
        let table: string | null = null
        let event: string | null = null
        if (typeof ev.data === 'string') {
          try {
            const f = JSON.parse(ev.data) as [unknown, unknown, string, string, Record<string, unknown>]
            channel = f[2] ?? '?'
            event = f[3] ?? null
            const data = (f[4] as { data?: { table?: string; type?: string } } | undefined)?.data
            if (data?.table) table = data.table
            if (data?.type) event = `${event}:${data.type}`
          } catch {
            /* heartbeats and non-JSON frames still count toward bytes */
          }
        }
        rtFrames.push({ channel, table, event, bytes, at: Date.now() })
      })
    }
    send(data: Parameters<WebSocket['send']>[0]) {
      state.tx += typeof data === 'string' ? Buffer.byteLength(data, 'utf8') : (data as ArrayBuffer).byteLength
      return super.send(data)
    }
  }
  globalThis.WebSocket = CountingWebSocket as unknown as typeof WebSocket

  return {
    rest,
    rtFrames,
    get rtTxBytes() {
      return state.tx
    },
    async drain() {
      // A settling measurement can start another fetch (a hook reacting to the response), so
      // loop until the set is genuinely empty rather than awaiting one snapshot of it.
      while (pending.size > 0) {
        await Promise.all([...pending])
      }
    },
    restore() {
      globalThis.fetch = realFetch
      globalThis.WebSocket = RealWS
    },
  } as Tally
}

/** Requests + bytes grouped by endpoint, so a report can name WHICH table cost the money. */
export function summarize(calls: readonly RestCall[]) {
  const by = new Map<string, { requests: number; bytes: number }>()
  for (const c of calls) {
    const e = by.get(c.endpoint) ?? { requests: 0, bytes: 0 }
    e.requests += 1
    e.bytes += c.bytes
    by.set(c.endpoint, e)
  }
  return {
    requests: calls.length,
    bytes: calls.reduce((n, c) => n + c.bytes, 0),
    byEndpoint: Object.fromEntries([...by].sort((a, b) => b[1].bytes - a[1].bytes)),
  }
}
