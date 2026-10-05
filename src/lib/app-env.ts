/**
 * Which DEPLOYMENT this process is — as opposed to which build mode it is.
 *
 * `NODE_ENV` answers "was this built for production?", and a deployed dev build answers yes. It
 * is the right gate for things that follow the build (secure cookies, minification) and the
 * WRONG gate for things that should differ per environment. Using it for the latter is how dev
 * ended up running production-grade background work — the 2.5s game ticker, the tournament
 * reminder ticker and the idle reaper — against a FREE Supabase project, until that project hit
 * `402 exceed_egress_quota` on 2026-08-24 and was suspended, taking the RLS Boundaries check and
 * the dev -> main promotion down with it.
 *
 * Resolution order, deliberately self-correcting so a new stack cannot inherit prod behaviour by
 * forgetting a variable:
 *
 *   1. `APP_ENV` when set — an explicit override always wins.
 *   2. Otherwise the host in `NEXT_PUBLIC_APP_URL`, which every stack already sets to its own
 *      URL. Only the real production hosts resolve to 'prod'.
 *   3. Otherwise 'dev' — because the safe default for an unidentified environment is the one
 *      that does LESS. A misconfigured prod loses background work and is noticed; a
 *      misconfigured dev quietly bills someone.
 *
 * Adding a new background worker? Gate it on `isProdDeployment()`, never on NODE_ENV.
 */

/** Hosts that are the real site. Mirrors PRODUCTION_HOSTS in src/middleware.ts. */
const PRODUCTION_HOSTS = new Set(['fateround.com', 'www.fateround.com'])

export type AppEnv = 'prod' | 'dev'

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * The ambient environment, built so the CLIENT bundle can actually see the app URL.
 *
 * Next.js replaces `NEXT_PUBLIC_*` in browser code at BUILD time, and only where the source
 * reads the literal member expression `process.env.NEXT_PUBLIC_APP_URL`. Reading it off a
 * variable — which is what the `env` parameter below is — is invisible to that substitution,
 * so in the browser it was `undefined` and every client call fell through to 'dev'. Production
 * browser errors were therefore tagged `environment: dev` in Sentry, making prod and dev
 * indistinguishable there (observed on fateround.com events, Sentry issues JAVASCRIPT-NEXTJS-F
 * and -K).
 *
 * `process.env.NEXT_PUBLIC_APP_URL` below must stay spelled out EXACTLY like that — destructure
 * it, alias it, or index it dynamically and the browser silently regresses to 'dev'. There is a
 * test asserting the literal is still present, because nothing else would catch it.
 *
 * On the server this is a no-op: `process.env` already holds the value at runtime. `APP_ENV` is
 * deliberately NOT given the same treatment — it is not a `NEXT_PUBLIC_` var, so it is a
 * server-only override by design and is correctly absent in the browser.
 */
function ambientEnv(): NodeJS.ProcessEnv {
  return { ...process.env, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL }
}

export function resolveAppEnv(env: NodeJS.ProcessEnv = ambientEnv()): AppEnv {
  const explicit = env.APP_ENV?.trim().toLowerCase()
  if (explicit === 'prod' || explicit === 'production') return 'prod'
  if (explicit === 'dev' || explicit === 'development' || explicit === 'preview') return 'dev'

  const host = hostOf(env.NEXT_PUBLIC_APP_URL)
  if (host && PRODUCTION_HOSTS.has(host)) return 'prod'
  return 'dev'
}

/** True only on the real production deployment. Use this to gate background work. */
export function isProdDeployment(env: NodeJS.ProcessEnv = ambientEnv()): boolean {
  return resolveAppEnv(env) === 'prod'
}
