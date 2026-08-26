// OpenTelemetry bootstrap. Next.js calls register() once at server startup.
//
// This is intentionally a NO-OP unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so local dev and
// any not-yet-provisioned deploy don't spin up the SDK or spam exporter connection errors.
// Turn it on per-environment by setting the OTLP env vars at runtime (SSM → container):
//
//   OTEL_EXPORTER_OTLP_ENDPOINT   e.g. https://otlp-gateway-<region>.grafana.net/otlp
//                                 (or http://localhost:4318 to route via an on-box collector)
//   OTEL_EXPORTER_OTLP_HEADERS    e.g. Authorization=Basic <base64(instanceID:token)>  (Grafana Cloud)
//   OTEL_SERVICE_NAME             defaults to "fateround" below
//   OTEL_RESOURCE_ATTRIBUTES      e.g. deployment.environment=prod,service.version=<commit>
//   OTEL_TRACES_SAMPLER / _ARG    e.g. parentbased_traceidratio / 0.2  (head sampling)
//
// @vercel/otel auto-instruments Next.js server spans + outgoing fetch, so Supabase REST,
// LiveKit token issuance, Klipy, and Anthropic calls are captured with no per-call code.
// Env-driven config (endpoint/headers/sampler/resource) is read by the SDK, so switching the
// export target (Grafana Cloud direct ⇄ on-box collector) is a deploy-config change, not code.
export async function register() {
  // Only the Node.js server runtime runs background work; skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Server-side game ticker — advances timed games (rounds/turns) even when every
  // participant's tab is backgrounded, so a 10s round can't sit for minutes waiting on
  // a foregrounded browser to poke it. See src/lib/game-tick.ts. Runs regardless of OTel.
  const { startGameTicker } = await import('@/lib/game-tick')
  startGameTicker()

  // Scheduled-tournament reminders (T-15 / T-0 push). Same in-process pattern as
  // the game ticker — this deploy is a long-running `node server.js`, so it can
  // schedule its own background work and needs no external cron service.
  //
  // Imports the TICKER module, not the dispatch one: this hook is also compiled
  // for the edge runtime, and the dispatch side pulls in web-push → node `https`,
  // which edge can't resolve. The ticker just POSTs to /api/tournaments/reminders.
  const { startTournamentReminderTicker } = await import('@/lib/tournament-reminder-ticker')
  startTournamentReminderTicker()

  // ── IDLE REAPER DISABLED — DO NOT RE-ADD WITHOUT READING THIS ────────────────
  // Importing '@/lib/idle-reaper' from here took production down on 2026-08-24
  // (shipped in #1059). This hook runs during Next's server bootstrap, and that
  // module pulls in the whole finish graph — admin-end-game -> game-finish ->
  // room-points / tournament-* / trophies-* -> coins. Bundled, that graph is
  // circular, and webpack resolves the cycle into a temporal-dead-zone access:
  //
  //   ReferenceError: An error occurred while loading instrumentation hook:
  //     Cannot access 'g' before initialization
  //   Failed to prepare server
  //
  // The server never finishes starting, so EVERY request 500s — a total outage,
  // not a degraded feature. The two tickers above are safe because their module
  // graphs don't reach the finish machinery.
  //
  // Note the cycle is NOT unique to this hook: a production build of main also
  // fails to collect page data with the same ReferenceError, on a different
  // route each run. So re-enabling the reaper needs the cycle broken and proven
  // (build + boot), not just a lazy import here. Tracked as follow-up.
  // ─────────────────────────────────────────────────────────────────────────────

  // Not configured for this environment → do nothing.
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return

  const { registerOTel } = await import('@vercel/otel')
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'fateround',
  })
}
