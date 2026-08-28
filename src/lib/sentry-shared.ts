/**
 * Settings shared by all three Sentry runtimes (client, server, edge).
 *
 * FateRound runs Sentry for ERRORS ONLY. Tracing stays with the existing
 * OpenTelemetry export (see src/instrumentation.ts) — `tracesSampleRate: 0` here
 * and `skipOpenTelemetrySetup: true` in the server/edge configs keep the two from
 * fighting over the global OTel provider.
 */
import { resolveAppEnv } from '@/lib/app-env'

/**
 * The DSN is PUBLIC by design (it only authorises writing events, and it ships inside
 * the browser bundle either way), so it is set as a build arg in the deploy workflow
 * alongside the other NEXT_PUBLIC_* values rather than living in SSM.
 *
 * Empty in local dev and in any environment that hasn't set it → `Sentry.init` is
 * skipped entirely and the SDK stays inert.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || ''

export const sentryEnabled = Boolean(SENTRY_DSN)

/**
 * 'prod' vs 'dev', resolved from APP_ENV/NEXT_PUBLIC_APP_URL by the same helper the
 * background workers gate on — so a new stack can't inherit the wrong label by
 * forgetting a variable. Both environments report into the same Sentry project and
 * are told apart by this tag.
 */
export const sentryEnvironment = resolveAppEnv()

/**
 * The commit the image was built from, so a stack trace can be pinned to a revision.
 * Set from the GIT_SHA build arg in the Dockerfile; empty for local builds.
 */
export const sentryRelease = process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined

/** Options every runtime passes to `Sentry.init`. */
export const sharedSentryOptions = {
  dsn: SENTRY_DSN,
  environment: sentryEnvironment,
  release: sentryRelease,
  // Errors only — tracing belongs to OpenTelemetry.
  tracesSampleRate: 0,
  // Never send emails, IPs, headers or request bodies. The only user context attached
  // is the Supabase user id (see src/components/SentryUserContext.tsx), which is an
  // opaque uuid.
  sendDefaultPii: false,
  // Sentry's own console noise, off in production builds.
  debug: false,
}
