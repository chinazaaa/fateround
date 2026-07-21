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
  // The Apple App Site Association file has no extension, so serve it explicitly
  // as JSON (Apple fetches it to verify Universal Links → the Fate Round app).
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ]
  },
}

export default nextConfig
