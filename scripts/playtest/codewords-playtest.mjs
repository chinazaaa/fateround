import { ANON, APP, REST, SRV, assertDenied, assertQueryUsable, assertReadableRows, get, post } from './_shared.mjs'
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
const gRow = Array.isArray(g.d) ? g.d[0] : null
log.push(`game.status=${gRow?.status} (query g.status)`)
// Verify the QUERY before trusting its answer. A 401/500/malformed body/empty result leaves the
// status undefined, which would silently skip the still-waiting check below and could hide a
// revoked `games` privilege while every other assertion still passed.
if (g.status !== 200) fail.push(`games status query failed (${g.status}) — cannot verify the game started`)
else if (!gRow) fail.push(`games row ${code} not found — cannot verify the game started`)
else if (gRow.status == null) fail.push(`games row ${code} has a null status — cannot verify the game started`)
else if (gRow.status === 'waiting') fail.push('still waiting after start')

const b = await get(`${REST}/codewords_boards?game_id=eq.${code}&select=key`, SRV)
log.push(`board rows(service)=${b.d?.length}, key present=${!!b.d?.[0]?.key}`)
if (!b.d?.[0]?.key) fail.push('no board key generated')

// anon must not read the key; must still read the words
const leak = await get(`${REST}/codewords_boards?game_id=eq.${code}&select=key`, ANON)
log.push(`anon key -> ${leak.status}`)
assertDenied(leak, 'codewords_boards.key', fail)
const star = await get(`${REST}/codewords_boards?game_id=eq.${code}&select=*`, ANON)
log.push(`anon select=* -> ${star.status}`)
assertDenied(star, 'codewords_boards select=*', fail)
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
