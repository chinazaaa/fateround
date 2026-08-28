/**
 * Sentry — browser runtime. Next.js loads this file once, before any app code runs.
 *
 * No-op unless NEXT_PUBLIC_SENTRY_DSN is set for the build, so local dev and any
 * environment that hasn't been pointed at a Sentry project ship an inert SDK.
 */
import * as Sentry from '@sentry/nextjs'
import { sentryEnabled, sharedSentryOptions } from '@/lib/sentry-shared'

if (sentryEnabled) {
  Sentry.init({
    ...sharedSentryOptions,
    // Session Replay is deliberately NOT enabled: it costs ~50KB of JS on every page
    // and burns the event quota fast. Errors only.
    integrations: [],
  })
}

/**
 * Required by @sentry/nextjs so client-side navigations are stitched onto the right
 * error scope. Cheap and a no-op while the SDK is uninitialised.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
