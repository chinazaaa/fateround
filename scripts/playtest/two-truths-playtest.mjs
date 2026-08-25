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
const fail = [],
  log = []
// A DISTINCT lie index per player. With everyone on the same value, /my-statement returning
// somebody else's statement would still look correct — the assertion would pass for the wrong
// reason. Distinct values make a cross-player leak impossible to mistake for success.
const LIE_OF = [0, 1, 2]

const c = await post(`${APP}/api/games`, { title: 'PT ttl', game_type: 'two_truths' })
const { gameCode: code, hostToken } = c.d
log.push(`created ${code}`)

const ps = []
for (let i = 0; i < 3; i++) {
  const p = await post(`${APP}/api/players`, { gameCode: code, playerName: `P${i + 1}` })
  ps.push(p.d)
}
log.push(`joined ${ps.length}`)

// each player submits 3 statements with a designated lie
for (const [i, p] of ps.entries()) {
  const r = await post(`${APP}/api/two-truths/statements`, {
    gameId: code,
    resumeToken: p.resumeToken,
    statementA: `A${i}-true`,
    statementB: `B${i}-true`,
    statementC: `C${i}-true`,
    lieIndex: LIE_OF[i],
  })
  log.push(`submit P${i + 1} -> ${r.status}${r.status !== 200 ? ' ' + JSON.stringify(r.d) : ''}`)
  if (r.status !== 200) fail.push(`submit P${i + 1} failed ${r.status} ${JSON.stringify(r.d)}`)
}

const srows = await get(`${REST}/ttl_statements?game_id=eq.${code}&select=player_id,lie_index`, SRV)
log.push(`ttl_statements rows(service)=${srows.d?.length}`)

// THE #838 CHECK: start must succeed now that statements exist
const s = await post(`${APP}/api/games/${code}/start`, { hostToken })
log.push(`START -> ${s.status} ${s.status !== 200 ? JSON.stringify(s.d) : ''}`)
if (s.status !== 200) fail.push(`START FAILED: ${JSON.stringify(s.d)} <-- #838 regression signature`)
const g1 = await get(`${REST}/games?id=eq.${code}&select=status`, SRV)
log.push(`game.status=${g1.d?.[0]?.status}`)
if (g1.d?.[0]?.status === 'waiting') fail.push(`game still waiting after start`)

// redaction: anon must not read lie_index, must still read the rest
const leak = await get(`${REST}/ttl_statements?game_id=eq.${code}&select=lie_index`, ANON)
log.push(`anon lie_index -> ${leak.status}`)
if (leak.status === 200) fail.push(`LEAK: anon read lie_index`)
const okc = await get(`${REST}/ttl_statements?game_id=eq.${code}&select=id,player_id,statement_a`, ANON)
log.push(`anon non-secret cols -> ${okc.status} (${okc.d?.length ?? 0} rows)`)
if (okc.status !== 200) fail.push(`BREAK: anon cannot read non-secret ttl_statements cols (${okc.status})`)
// A 200 with [] proves nothing and would hide an RLS regression that makes every row invisible.
else if (!Array.isArray(okc.d) || okc.d.length === 0)
  fail.push('BREAK: anon read ttl_statements but got 0 rows — the check is vacuous')

// own-lie path: /my-statement must return the caller's own lieIndex
const mine = await post(`${APP}/api/two-truths/my-statement`, { gameCode: code, resumeToken: ps[0].resumeToken })
log.push(
  `my-statement P1 -> ${mine.status} lieIndex=${JSON.stringify(mine.d?.lieIndex ?? mine.d?.statement?.lie_index ?? mine.d)}`.slice(
    0,
    160
  )
)
if (mine.status !== 200) fail.push(`my-statement failed ${mine.status}`)
// A 200 alone is not enough: an empty or redacted payload would pass while the owner cannot
// actually retrieve their own lie. Assert the value we submitted comes back.
const lieOf = (r) => r?.d?.lieIndex ?? r?.d?.statement?.lie_index ?? null
const mineLieIndex = lieOf(mine)
if (mine.status === 200 && mineLieIndex !== LIE_OF[0])
  fail.push(`my-statement gave P1 lieIndex=${JSON.stringify(mineLieIndex)}, expected ${LIE_OF[0]} (their own)`)

// IDOR: P2's token must not yield P1's lie
const other = await post(`${APP}/api/two-truths/my-statement`, { gameCode: code, resumeToken: ps[1].resumeToken })
const otherLieIndex = lieOf(other)
log.push(`my-statement P2 -> ${other.status} lieIndex=${JSON.stringify(otherLieIndex)} (expect ${LIE_OF[1]})`)
if (other.status !== 200) fail.push(`my-statement P2 failed ${other.status}`)
// Each token must return ITS OWN statement. Comparing the two payloads for inequality was too
// weak: two different WRONG statements would also differ and pass.
else if (otherLieIndex !== LIE_OF[1])
  fail.push(`my-statement gave P2 lieIndex=${JSON.stringify(otherLieIndex)}, expected ${LIE_OF[1]} (their own)`)

// Play a round. ORDER MATTERS: the first advance ACTIVATES a round; guesses before that are
// rejected with "Round is not active". Getting this wrong makes the redaction assertions below
// vacuous — they would run against an empty ttl_guesses and pass no matter what the grants say.
const adv1 = await post(`${APP}/api/two-truths/advance`, { gameId: code, hostToken })
log.push(`advance(activate) -> ${adv1.status} ${adv1.status !== 200 ? JSON.stringify(adv1.d).slice(0, 160) : ''}`)
if (adv1.status !== 200) fail.push(`advance(activate) failed ${adv1.status}: ${JSON.stringify(adv1.d)}`)

const rr = await get(
  `${REST}/rounds?game_id=eq.${code}&select=id,submitter_player_id,status&status=eq.active&limit=1`,
  SRV
)
const round = rr.d?.[0],
  roundId = round?.id,
  subject = round?.submitter_player_id
log.push(`active round=${roundId} subject=${subject}`)
if (!roundId) fail.push('no active round after advance — the guess and reveal below cannot run')

// everyone except the round's subject guesses; each must be accepted
let accepted = 0
for (const [i, p] of ps.entries()) {
  if (p.playerId === subject) continue
  const subjectIdx = ps.findIndex((x) => x.playerId === subject)
  const guessedIndex = subjectIdx >= 0 ? LIE_OF[subjectIdx] : 0
  const gsr = await post(`${APP}/api/two-truths/guess`, {
    gameId: code,
    resumeToken: p.resumeToken,
    roundId,
    guessedIndex,
  })
  log.push(`guess P${i + 1} -> ${gsr.status}${gsr.status !== 200 ? ' ' + JSON.stringify(gsr.d).slice(0, 120) : ''}`)
  if (gsr.status !== 200) fail.push(`guess P${i + 1} REJECTED ${gsr.status}: ${JSON.stringify(gsr.d)}`)
  else accepted++
}
if (accepted === 0) fail.push('no guess was accepted — redaction checks below would be vacuous')

const adv = await post(`${APP}/api/two-truths/advance`, { gameId: code, hostToken })
log.push(`advance(reveal) -> ${adv.status} ${adv.status !== 200 ? JSON.stringify(adv.d).slice(0, 160) : ''}`)
if (adv.status !== 200) fail.push(`advance(reveal) failed ${adv.status}: ${JSON.stringify(adv.d)}`)

// NON-VACUITY GUARD: there must be real rows before asserting anon cannot read them.
const rows = await get(`${REST}/ttl_guesses?game_id=eq.${code}&select=id,guessed_index,is_correct,points`, SRV)
log.push(`ttl_guesses rows(service)=${rows.d?.length}`)
if (!rows.d?.length) fail.push('ttl_guesses is EMPTY — the anon assertions below prove nothing')

// guesses redaction
for (const col of ['guessed_index', 'is_correct', 'points']) {
  const gl = await get(`${REST}/ttl_guesses?game_id=eq.${code}&select=${col}`, ANON)
  log.push(`anon ttl_guesses.${col} -> ${gl.status}`)
  if (gl.status === 200) fail.push(`LEAK: anon read ttl_guesses.${col}`)
}
// the other half: anon must still read the non-secret columns, and actually get the rows back
const gok = await get(`${REST}/ttl_guesses?game_id=eq.${code}&select=id,player_id`, ANON)
log.push(`anon ttl_guesses non-secret -> ${gok.status} (${gok.d?.length ?? 0} rows)`)
if (gok.status !== 200) fail.push(`BREAK: anon cannot read non-secret ttl_guesses cols (${gok.status})`)
else if (!gok.d?.length) fail.push('anon read ttl_guesses but got 0 rows — assertions are vacuous')
const rl = await get(`${REST}/ttl_round_lies?select=*&limit=1`, ANON)
log.push(`anon ttl_round_lies -> ${rl.status}`)
if (rl.status === 200) fail.push(`LEAK: anon read ttl_round_lies`)

console.log('===== TWO TRUTHS =====')
log.forEach((l) => console.log('  · ' + l))
fail.forEach((f) => console.log('  ✗ ' + f))
console.log(fail.length ? `\nFAIL (${fail.length})` : '\nPASS')
process.exit(fail.length ? 1 : 0)
