const APP = 'http://127.0.0.1:3000',
  REST = 'http://127.0.0.1:54321/rest/v1'

/**
 * Read a required key from the environment.
 *
 * These were previously hard-coded. They were Supabase's public local demo keys (`iss:
 * supabase-demo`, identical on every machine), so nothing secret was committed — but a
 * `service_role` string in the repo is a bad pattern regardless, and hard-coding pinned these
 * scripts to a local stack. Failing loudly beats defaulting: a silently-wrong key would make
 * every redaction assertion below pass for the wrong reason.
 */
function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`Missing ${name}. Export it before running (see scripts/playtest/README.md):`)
    console.error(`  export ${name}="$(supabase status -o env | grep ${name} | cut -d= -f2-)"`)
    process.exit(2)
  }
  return v
}
const ANON = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SRV = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const h = (k) => ({ apikey: k, Authorization: `Bearer ${k}` })
const J = { 'Content-Type': 'application/json' }
const post = async (u, b) => {
  const r = await fetch(u, { method: 'POST', headers: J, body: JSON.stringify(b) })
  let d = null
  try {
    d = await r.json()
  } catch {}
  return { status: r.status, d }
}
const get = async (u, k) => {
  const r = await fetch(u, { headers: h(k) })
  let d = null
  try {
    d = await r.json()
  } catch {}
  return { status: r.status, d }
}
const log = [],
  fail = []

const c = await post(`${APP}/api/games`, { title: 'PT cw', game_type: 'codewords', participant_mode: 'joiners' })
const { gameCode: code, hostToken } = c.d
log.push(`created ${code}`)
const ps = []
for (let i = 0; i < 4; i++) {
  const p = await post(`${APP}/api/players`, { gameCode: code, playerName: `P${i + 1}` })
  ps.push(p.d)
}
log.push(`joined ${ps.length}`)

const assign = [
  ['red', 'spymaster'],
  ['red', 'operative'],
  ['blue', 'spymaster'],
  ['blue', 'operative'],
]
for (const [i, p] of ps.entries()) {
  const [team, role] = assign[i]
  const r = await post(`${APP}/api/codewords/role`, { gameId: code, resumeToken: p.resumeToken, team, role })
  log.push(
    `role P${i + 1} ${team}/${role} -> ${r.status}${r.status !== 200 ? ' ' + JSON.stringify(r.d).slice(0, 90) : ''}`
  )
  if (r.status !== 200) fail.push(`role assign P${i + 1} failed: ${JSON.stringify(r.d)}`)
}

const s = await post(`${APP}/api/games/${code}/start`, { hostToken })
log.push(`START -> ${s.status} ${s.status !== 200 ? JSON.stringify(s.d) : ''}`)
if (s.status !== 200) fail.push(`START FAILED: ${JSON.stringify(s.d)}`)
const g = await get(`${REST}/games?id=eq.${code}&select=status`, SRV)
log.push(`game.status=${g.d?.[0]?.status}`)
if (g.d?.[0]?.status === 'waiting') fail.push('still waiting after start')

const b = await get(`${REST}/codewords_boards?game_id=eq.${code}&select=key`, SRV)
log.push(`board rows(service)=${b.d?.length}, key present=${!!b.d?.[0]?.key}`)
if (!b.d?.[0]?.key) fail.push('no board key generated')

// anon must not read the key; must still read the words
const leak = await get(`${REST}/codewords_boards?game_id=eq.${code}&select=key`, ANON)
log.push(`anon key -> ${leak.status}`)
if (leak.status === 200) fail.push('LEAK: anon read codewords_boards.key')
const star = await get(`${REST}/codewords_boards?game_id=eq.${code}&select=*`, ANON)
log.push(`anon select=* -> ${star.status}`)
if (star.status === 200) fail.push('LEAK: anon select=* returned 200')
const words = await get(`${REST}/codewords_boards?game_id=eq.${code}&select=game_id,words`, ANON)
const wordRow = Array.isArray(words.d) ? words.d[0] : null
log.push(
  `anon words -> ${words.status} rows=${Array.isArray(words.d) ? words.d.length : 0} populated=${Array.isArray(wordRow?.words) && wordRow.words.length > 0}`
)
if (words.status !== 200) fail.push(`BREAK: anon cannot read board words (${words.status})`)
// A 200 with [] or a null `words` would pass a status-only check while proving nothing about
// what anon can actually read.
else if (!wordRow) fail.push('BREAK: anon read returned no codewords_boards row for this game')
else if (!Array.isArray(wordRow.words) || wordRow.words.length === 0)
  fail.push('BREAK: board row has no words — the non-secret read proves nothing')

// spymaster route must serve the key to the spymaster only
const sm = await post(`${APP}/api/codewords/board`, { gameId: code, gameCode: code, resumeToken: ps[0].resumeToken })
const op = await post(`${APP}/api/codewords/board`, { gameId: code, gameCode: code, resumeToken: ps[1].resumeToken })
// a real leak = at least one non-null entry in the key array
const hasKey = (o) => Array.isArray(o?.board?.key) && o.board.key.some((v) => v !== null)
log.push(`board(spymaster) -> ${sm.status} key=${hasKey(sm.d)}`)
log.push(`board(operative) -> ${op.status} key=${hasKey(op.d)}`)
// Authorized roles must be SERVED, not merely not-leaked: a route that denies both would
// otherwise report PASS.
if (sm.status !== 200) fail.push(`BREAK: spymaster board request failed (${sm.status})`)
if (op.status !== 200) fail.push(`BREAK: operative board request failed (${op.status})`)
if (sm.status === 200 && !hasKey(sm.d)) fail.push('BREAK: spymaster did NOT receive the key')
if (op.status === 200 && hasKey(op.d)) fail.push('LEAK: operative received the board key')
const anonB = await post(`${APP}/api/codewords/board`, { gameId: code, gameCode: code })
log.push(`board(no token) -> ${anonB.status} key=${hasKey(anonB.d)}`)
if (anonB.status === 200 && hasKey(anonB.d)) fail.push('LEAK: unauthenticated caller received the board key')

console.log('===== CODEWORDS =====')
log.forEach((l) => console.log('  · ' + l))
fail.forEach((f) => console.log('  ✗ ' + f))
console.log(fail.length ? `\nFAIL (${fail.length})` : '\nPASS')
process.exit(fail.length ? 1 : 0)
