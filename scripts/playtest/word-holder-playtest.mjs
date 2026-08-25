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
const SRV = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const J = { 'Content-Type': 'application/json' }
const post = async (u, b) => {
  const r = await fetch(u, { method: 'POST', headers: J, body: JSON.stringify(b) })
  let d = null
  try {
    d = await r.json()
  } catch {}
  return { status: r.status, d }
}
const get = async (u) => fetch(u, { headers: { apikey: SRV, Authorization: `Bearer ${SRV}` } }).then((r) => r.json())
const fail = []

for (const [type, api, table, holderCol, extra] of [
  ['describe_it', 'describe-it', 'describe_it_sessions', 'describer_player_id', { describe_it_num_teams: 2 }],
  [
    'quick_draw',
    'quick-draw',
    'quick_draw_guess_sessions',
    'drawer_player_id',
    { quick_draw_variant: 'guess', quick_draw_num_teams: 2 },
  ],
]) {
  console.log(`\n===== ${type} =====`)
  const c = await post(`${APP}/api/games`, { title: `PT ${type}`, game_type: type, ...extra })
  const { gameCode: code, hostToken } = c.d
  const ps = []
  for (let i = 0; i < 4; i++) {
    const p = await post(`${APP}/api/players`, { gameCode: code, playerName: `P${i + 1}` })
    ps.push(p.d)
  }
  const s = await post(`${APP}/api/games/${code}/start`, { hostToken })
  console.log(`  · start -> ${s.status}`)
  const sess = (await get(`${REST}/${table}?game_id=eq.${code}&select=${holderCol},current_word`))?.[0]
  const holder = sess?.[holderCol],
    word = sess?.current_word
  console.log(`  · secret word (service) = ${JSON.stringify(word)}`)
  console.log(`  · holder ${holderCol} = ${holder}`)
  if (!word) fail.push(`${type}: no current_word generated`)

  for (const [i, p] of ps.entries()) {
    const isHolder = p.playerId === holder
    const r = await post(`${APP}/api/${api}/my-word`, { gameCode: code, resumeToken: p.resumeToken })
    const got = JSON.stringify(r.d?.word ?? r.d?.currentWord ?? null)
    const revealed = got && got !== 'null' && got.replace(/"/g, '') === word
    console.log(`  · P${i + 1}${isHolder ? ' (HOLDER)' : '         '} -> ${r.status} word=${got.slice(0, 40)}`)
    if (isHolder && !revealed) fail.push(`${type}: holder did NOT get the word (BREAK)`)
    // ANY non-null word to a non-holder is a leak, not just the current one — returning a
    // different real word would otherwise slip through.
    if (!isHolder && got && got !== 'null') fail.push(`${type}: NON-holder P${i + 1} received a word ${got} (LEAK)`)
  }
  const noTok = await post(`${APP}/api/${api}/my-word`, { gameCode: code })
  const nt = JSON.stringify(noTok.d?.word ?? null)
  console.log(`  · no-token -> ${noTok.status} word=${nt.slice(0, 40)}`)
  if (nt && nt !== 'null') fail.push(`${type}: unauthenticated caller got a word ${nt} (LEAK)`)
  // A 200 with no word is not proof of rejection — it is indistinguishable from "no word yet".
  // The route must actually refuse a caller it cannot resolve.
  if (noTok.status < 400)
    fail.push(`${type}: unauthenticated /my-word returned ${noTok.status}, expected a 4xx refusal`)
}
console.log(fail.length ? `\nFAIL:\n  ✗ ` + fail.join('\n  ✗ ') : '\nPASS — word served only to its holder')
process.exit(fail.length ? 1 : 0)
