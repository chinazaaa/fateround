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

export default nextConfig
