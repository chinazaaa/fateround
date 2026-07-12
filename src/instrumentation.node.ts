// Node-only OpenTelemetry setup, deliberately split out of instrumentation.ts.
//
// Why a separate file: Next's `output: 'standalone'` tracer follows STATIC imports when
// deciding which node_modules to copy into `.next/standalone`, but it does NOT follow a bare
// *dynamic* `import('@vercel/otel')`. With the dynamic form the image shipped without
// @vercel/otel (or its OpenTelemetry SDK deps) at all, so register() failed to load an
// exporter and traces silently never left the box. Importing @vercel/otel statically here —
// and dynamically importing THIS module (a relative path the tracer does follow) only on the
// nodejs runtime from instrumentation.ts — gets the whole exporter closure traced in.
import { registerOTel } from '@vercel/otel'

// Endpoint/headers/sampler/resource are all read from OTEL_* env by the SDK (SSM → container).
registerOTel({
  serviceName: process.env.OTEL_SERVICE_NAME || 'fateround',
})
