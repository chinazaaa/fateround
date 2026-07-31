import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

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
  async headers() {
    // Pragmatic CSP: Next injects inline scripts/styles (hydration, GA), so we
    // allow 'unsafe-inline' for script/style rather than break the app. Network
    // sinks stay permissive (https:/wss:) so Supabase, LiveKit (wss +
    // NEXT_PUBLIC_LIVEKIT_URL), Spotify, Klipy, Google Analytics and Supabase
    // Storage/avatars all keep working. frame-ancestors 'none' blocks framing —
    // the app has no legit embedding and host actions are one-click token-authed
    // (clickjacking risk). img-src allows https: for remote avatars/GIFs.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss:",
      "media-src 'self' blob: https:",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')

    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
    ]

    return [
      // Security headers on every route.
      { source: '/:path*', headers: securityHeaders },
      // The Apple App Site Association file has no extension, so serve it explicitly
      // as JSON (Apple fetches it to verify Universal Links → the FateRound app).
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ]
  },
}

export default nextConfig
