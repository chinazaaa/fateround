/**
 * Make Node's WebSocket usable inside the jsdom environment.
 *
 * The bench needs both at once: jsdom, because it renders the real React hooks, and a working
 * WebSocket, because a realtime channel that never opens would make PR #1134's gate look like
 * it does nothing — a FALSE REFUTATION, the worst possible bench failure.
 *
 * The clash: jsdom installs its own `Event` on `globalThis`, but Node's `WebSocket` (undici)
 * builds its `open`/`message`/`close` events with whatever `globalThis.Event` is and dispatches
 * them through Node's `EventTarget`, which rejects any Event that isn't Node's own. The socket
 * connects at the TCP level and then dies on the first dispatch with
 * `ERR_INVALID_ARG_TYPE: The "event" argument must be an instance of Event`.
 *
 * Node's native `Event` class is not importable, so it is recovered from the only place that
 * hands one out: an `AbortSignal`'s own `abort` event.
 */
const controller = new AbortController()
let NativeEvent: typeof Event | undefined
controller.signal.addEventListener('abort', (event) => {
  NativeEvent = event.constructor as typeof Event
})
controller.abort()

if (NativeEvent && globalThis.Event !== NativeEvent) {
  const JsdomEvent = globalThis.Event
  globalThis.Event = NativeEvent
  // jsdom's own Event is kept reachable for anything that genuinely needs the DOM flavour.
  ;(globalThis as unknown as { JsdomEvent: typeof Event }).JsdomEvent = JsdomEvent
}

export {}
