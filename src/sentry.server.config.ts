/**
 * Sentry — Node.js server runtime. Imported from `register()` in src/instrumentation.ts,
 * which Next.js runs once at server startup before any request is handled.
 */
import * as Sentry from '@sentry/nextjs'
import { sentryEnabled, sharedSentryOptions } from '@/lib/sentry-shared'

if (sentryEnabled) {
  Sentry.init({
    ...sharedSentryOptions,
    // DO NOT REMOVE. @sentry/nextjs builds its tracing on OpenTelemetry and, left to
    // itself, installs its OWN TracerProvider and context manager globally. This app
    // already registers one via @vercel/otel (src/instrumentation.ts) that exports to
    // the OTLP backend, and whichever registers second loses — silently. Sentry is
    // configured for errors only (tracesSampleRate: 0), so it has no reason to own the
    // provider: this flag makes it keep its hands off, and the existing OTel export
    // keeps working untouched.
    skipOpenTelemetrySetup: true,
  })
}
