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
  // The conservative data-collection profile. Precisely (verified against
  // @sentry/core 10.71's `defaultPiiToCollectionOptions`, not assumed):
  //
  //   NOT sent — request/response bodies (`httpBodies: []`), cookies, `user.ip_address`,
  //     database query values, and any header or query param whose NAME contains a
  //     credential-ish snippet (auth, token, secret, session, key, jwt, bearer, cookie, …)
  //     or an IP-ish one (forwarded, -ip, remote-, via, -user). Every sensitive header this
  //     app actually sends is covered by that: `authorization` (the Supabase JWT and the
  //     cron secret), `x-host-token`, `x-forwarded-for` and `x-real-ip` all arrive as
  //     "[Filtered]".
  //   STILL sent — the remaining request headers and URL query params, e.g. `user-agent`,
  //     `host`, `referer`, `cf-ipcountry`, and a room code in a query string. That is
  //     deliberate: `user-agent` is how a Safari-only bug gets identified at all.
  //
  // The only user context attached is the Supabase user id (an opaque uuid) — see
  // src/components/SentryUserContext.tsx.
  //
  // DO NOT "tighten" this by adding a partial `dataCollection` block. Setting that option
  // AT ALL switches the resolver's base from this conservative profile to the permissive
  // `DEFAULTS`, and every key left unspecified then flips ON — cookies, request bodies,
  // user info, database query values. A `dataCollection` block here has to be complete or
  // it is strictly worse than none.
  sendDefaultPii: false,
  // Sentry's own console noise, off in production builds.
  debug: false,
}
