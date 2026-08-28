import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'
import { withSentryConfig } from '@sentry/nextjs'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: 'standalone',
  // NOTE: `next dev` uses Turbopack, but the PRODUCTION build runs webpack — the
  // `build` script in package.json passes `--webpack` deliberately. Turbopack's
  // `output: 'standalone'` tracer (Next 16.2.9) does NOT copy the instrumentation
  // hook's node_modules (so @vercel/otel never ships → no OTel export), and forcing
  // it via `outputFileTracingIncludes` dropped a shared server chunk and broke
  // /api/audio-presence (LiveKit). Webpack's standalone output handles both correctly.
  // Do not drop `--webpack` from the build script without re-verifying OTel + LiveKit.
  turbopack: {
    root: projectRoot,
  },
  // Don't advertise the framework (audit finding H4).
  poweredByHeader: false,
  async redirects() {
    return [
      // Blog post slug rename.
      {
        source: '/blog/how-to-play-whot-card-game-rules',
        destination: '/blog/whot-rules-explained',
        permanent: true,
      },
      {
        source: '/blog/free-online-party-games-with-friends',
        destination: '/free-online-party-games',
        permanent: true,
      },
      {
        source: '/blog/best-games-to-play-over-video-call',
        destination: '/blog/games-to-play-video-call-discord',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      // The Apple App Site Association file has no extension, so serve it explicitly
      // as JSON (Apple fetches it to verify Universal Links → the FateRound app).
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
      // Baseline security headers (audit finding H4 — production was sending none of these,
      // and Cloudflare wasn't adding them either).
      //
      // NOT included yet: a `script-src` Content-Security-Policy. The app inlines
      // ThemeInitScript and several JSON-LD blocks, so a strict script policy needs nonces
      // threaded through those first; shipping it half-configured would either break the
      // theme flash-guard or be trivially bypassable. `frame-ancestors` is the part of CSP
      // that needs no nonces, so it ships here alongside X-Frame-Options.
      {
        source: '/:path*',
        headers: [
          // Two years + preload, per hstspreload.org's requirements.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Voice chat needs the microphone, so it stays `self`. Everything else is off:
          // the app has no camera, geolocation or payment surface.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), payment=(), usb=(), interest-cohort=(), microphone=(self)',
          },
        ],
      },
    ]
  },
}

/**
 * Sentry's build step. It injects the SDK into the server/edge bundles and — only when a
 * SENTRY_AUTH_TOKEN is present — uploads source maps so production stack traces name real
 * files and lines instead of `main-4f2a.js:1:28174`.
 *
 * Upload is OFF by default and stays off for anyone building without the token (local
 * builds, forks, a `docker build` on a laptop): missing credentials must not fail a build.
 * To turn it on, set SENTRY_ORG/SENTRY_PROJECT and add SENTRY_AUTH_TOKEN as a repository
 * secret wired into the build workflow — and flip `@sentry/cli` to `true` in
 * pnpm-workspace.yaml, since the uploader needs its postinstall binary.
 */
const sentryUploadEnabled = Boolean(process.env.SENTRY_AUTH_TOKEN)

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Don't narrate the upload (or its absence) on every build.
  silent: true,
  sourcemaps: { disable: !sentryUploadEnabled },
  webpack: {
    // Strip Sentry's own debug logging from the bundles.
    treeshake: { removeDebugLogging: true },
    // This app is not on Vercel — don't try to wire up Vercel Cron monitors.
    automaticVercelMonitors: false,
  },
  // No build-time telemetry to Sentry.
  telemetry: false,
})
