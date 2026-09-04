/**
 * Fixture seeding for the egress bench, over the service_role REST endpoint.
 *
 * Seeding goes through PostgREST rather than psql so the bench has no dependency on a local
 * `psql` binary or on the container name — it needs the same two URLs the app itself needs.
 * Every helper throws on a non-2xx: a bench that silently seeds nothing would then measure an
 * empty room and report the flat line as a saving.
 */
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY

export function requireServiceKey(): string {
  if (!SRV) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is required to seed bench fixtures. See scripts/bench/README.md.'
    )
  }
  return SRV
}

const srvHeaders = () => ({
  apikey: requireServiceKey(),
  Authorization: `Bearer ${requireServiceKey()}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
})

async function srv(path: string, init: RequestInit) {
  // The UNWRAPPED fetch on purpose: seeding traffic is the bench's own setup cost, not the
  // client behaviour under test, and counting it would inflate every baseline.
  const res = await fetch(`${URL_BASE}/rest/v1${path}`, { ...init, headers: srvHeaders() })
  if (!res.ok) throw new Error(`fixture ${init.method} ${path} -> ${res.status} ${await res.text()}`)
  return res.json().catch(() => null)
}

export const BENCH_PREFIX = 'BNCH'

/** A game row. `host_token` is NOT NULL, so it must be supplied even though nothing reads it. */
export async function seedGame(id: string, fields: Record<string, unknown> = {}) {
  await srv(`/games?id=eq.${id}`, { method: 'DELETE' })
  return srv('/games', {
    method: 'POST',
    body: JSON.stringify({
      id,
      title: `bench ${id}`,
      game_type: 'trivia',
      status: 'active',
      host_token: `bench-${id}`,
      ...fields,
    }),
  })
}

export async function seedPlayers(gameId: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    game_id: gameId,
    name: `P${i + 1}`,
    resume_token: `bench-${gameId}-${i}`,
  }))
  return srv('/players', { method: 'POST', body: JSON.stringify(rows) })
}

/**
 * Put EXACTLY `n` anonymous messages in the room.
 *
 * Deletes first. Topping up an existing room would make the 10/50/200 steps cumulative across
 * reruns, and the "bytes grow linearly" curve this measures would then be an artefact of rerun
 * count rather than of the query shape.
 */
export async function seedAnonymousMessages(gameId: string, playerId: string, n: number) {
  await srv(`/anonymous_messages?game_id=eq.${gameId}`, { method: 'DELETE' })
  if (n === 0) return []
  const rows = Array.from({ length: n }, (_, i) => ({
    game_id: gameId,
    player_id: playerId,
    text: `bench message ${String(i).padStart(4, '0')} ${'x'.repeat(40)}`,
    message_type: 'text',
  }))
  return srv('/anonymous_messages', { method: 'POST', body: JSON.stringify(rows) })
}

export async function cleanupGame(id: string) {
  await srv(`/anonymous_messages?game_id=eq.${id}`, { method: 'DELETE' }).catch(() => null)
  await srv(`/players?game_id=eq.${id}`, { method: 'DELETE' }).catch(() => null)
  await srv(`/games?id=eq.${id}`, { method: 'DELETE' }).catch(() => null)
}
