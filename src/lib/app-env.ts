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

export function resolveAppEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const explicit = env.APP_ENV?.trim().toLowerCase()
  if (explicit === 'prod' || explicit === 'production') return 'prod'
  if (explicit === 'dev' || explicit === 'development' || explicit === 'preview') return 'dev'

  const host = hostOf(env.NEXT_PUBLIC_APP_URL)
  if (host && PRODUCTION_HOSTS.has(host)) return 'prod'
  return 'dev'
}

/** True only on the real production deployment. Use this to gate background work. */
export function isProdDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveAppEnv(env) === 'prod'
}
