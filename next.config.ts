import type { NextConfig } from 'next'
import path from 'path'
import { fileURLToPath } from 'url'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: projectRoot,
  },
  // Safety net for OpenTelemetry in `output: 'standalone'`. The Node-only instrumentation split
  // (src/instrumentation.node.ts) is the primary fix that gets @vercel/otel traced in; these
  // globs guarantee the exporter and its OpenTelemetry SDK deps (which live under pnpm's .pnpm
  // store) can never be silently dropped from the runtime image. Harmless no-op once OTel is
  // removed. Keyed on all routes so the files land in standalone regardless of entry.
  outputFileTracingIncludes: {
    '/**/*': [
      './node_modules/.pnpm/**/node_modules/@vercel/otel/**/*',
      './node_modules/.pnpm/**/node_modules/@opentelemetry/**/*',
    ],
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
