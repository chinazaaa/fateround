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

  // Idle-active-game reaper — auto-ends games left running with no human activity.
  //
  // This import took production down on 2026-08-24 (#1059): it reached the finish graph, which
  // was circular, and webpack turned the cycle into a temporal-dead-zone access while the hook
  // loaded. It is safe again because `src/lib/game-finish.ts` is now a LEAF at import time — all
  // four of its post-finish side effects are imported at their call sites — so this module no
  // longer pulls a cycle in. See the warning at the top of game-finish.ts before adding imports
  // there. Verified by building and BOOTING the standalone server with this line present.
  const { startIdleReaper } = await import('@/lib/idle-reaper')
  startIdleReaper()

  // Not configured for this environment → do nothing.
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return

  const { registerOTel } = await import('@vercel/otel')
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'fateround',
  })
}
