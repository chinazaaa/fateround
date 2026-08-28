/**
 * Sentry — edge runtime (middleware and any edge route). Imported from `register()` in
 * src/instrumentation.ts, which runs for the edge runtime too.
 *
 * Kept separate from the server config because the edge runtime has no Node built-ins;
 * the SDK ships a different set of integrations there.
 */
import * as Sentry from '@sentry/nextjs'
import { sentryEnabled, sharedSentryOptions } from '@/lib/sentry-shared'

if (sentryEnabled) {
  Sentry.init({
    ...sharedSentryOptions,
    // Same reasoning as the server config — Sentry must not take over the OTel globals.
    skipOpenTelemetrySetup: true,
  })
}
