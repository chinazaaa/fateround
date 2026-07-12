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
  // Only the Node.js server runtime exports OTLP; skip the edge runtime.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  // Not configured for this environment → do nothing.
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return

  // Import a Node-only submodule (relative path — the standalone tracer DOES follow this) that
  // statically imports @vercel/otel, so the exporter + its OpenTelemetry deps get bundled into
  // `.next/standalone`. A bare `import('@vercel/otel')` here is not traced and ships nothing.
  //
  // Fail-safe: telemetry must NEVER take down the app. If the exporter fails to load (e.g. missing
  // from the standalone bundle) or initialize, log and continue serving without tracing rather
  // than letting register() reject at startup.
  try {
    await import('./instrumentation.node')
  } catch (err) {
    console.error('[instrumentation] OpenTelemetry setup failed; continuing without tracing.', err)
  }
}
