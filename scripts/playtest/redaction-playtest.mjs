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

const GAMES = [
  { type: 'whot', players: 3, table: 'whot_sessions', secrets: ['draw_pile', 'discard_pile'], extra: {} },
  { type: 'uno', players: 3, table: 'uno_sessions', secrets: ['draw_pile', 'discard_pile'], extra: {} },
  {
    type: 'crazy_eights',
    players: 3,
    table: 'crazy_eights_sessions',
    secrets: ['draw_pile', 'discard_pile'],
    extra: {},
  },
  {
    type: 'codewords',
    players: 4,
    table: 'codewords_boards',
    secrets: ['key'],
    extra: { participant_mode: 'joiners' },
    pre: 'codewords',
  },
  {
    type: 'describe_it',
    players: 4,
    table: 'describe_it_sessions',
    secrets: ['current_word', 'used_words'],
    extra: { describe_it_num_teams: 2 },
  },
  {
    type: 'quick_draw',
    players: 4,
    table: 'quick_draw_guess_sessions',
    secrets: ['current_word', 'used_words'],
    extra: { quick_draw_variant: 'guess', quick_draw_num_teams: 2 },
  },
  { type: 'two_truths', players: 3, table: 'ttl_statements', secrets: ['lie_index'], extra: {}, pre: 'ttl' },
]

const post = async (u, b) => {
  const r = await fetch(u, { method: 'POST', headers: J, body: JSON.stringify(b) })
  let d = null
  try {
    d = await r.json()
  } catch {}
  return { status: r.status, d }
}

async function run(g) {
  const log = [],
    fail = []
  const c = await post(`${APP}/api/games`, { title: `PT ${g.type}`, game_type: g.type, ...g.extra })
  if (c.status !== 200 || !c.d?.gameCode) {
    fail.push(`create -> ${c.status} ${JSON.stringify(c.d)}`)
    return { g, log, fail }
  }
  const { gameCode: code, hostToken } = c.d
  log.push(`created ${code}`)

  const players = []
  for (let i = 0; i < g.players; i++) {
    const p = await post(`${APP}/api/players`, { gameCode: code, playerName: `P${i + 1}` })
    if (p.status !== 200) {
      fail.push(`join P${i + 1} -> ${p.status} ${JSON.stringify(p.d)}`)
    } else players.push(p.d)
  }
  log.push(`joined ${players.length}/${g.players}`)

  // per-game pre-start setup the real UI performs
  if (g.pre === 'ttl') {
    for (const [i, p] of players.entries()) {
      const r = await post(`${APP}/api/two-truths/statements`, {
        gameId: code,
        resumeToken: p.resumeToken,
        statementA: `A${i}`,
        statementB: `B${i}`,
        statementC: `C${i}`,
        lieIndex: 2,
      })
      if (r.status !== 200) fail.push(`ttl submit P${i + 1} -> ${r.status}`)
    }
    log.push('submitted 3 statement sets')
  }
  if (g.pre === 'codewords') {
    const assign = [
      ['red', 'spymaster'],
      ['red', 'operative'],
      ['blue', 'spymaster'],
      ['blue', 'operative'],
    ]
    for (const [i, p] of players.entries()) {
      const r = await post(`${APP}/api/codewords/role`, {
        gameId: code,
        resumeToken: p.resumeToken,
        team: assign[i][0],
        role: assign[i][1],
      })
      if (r.status !== 200) fail.push(`cw role P${i + 1} -> ${r.status}`)
    }
    log.push('assigned 2 spymasters + 2 operatives')
  }

  const s = await post(`${APP}/api/games/${code}/start`, { hostToken })
  log.push(`start -> ${s.status} ${s.status !== 200 ? JSON.stringify(s.d) : ''}`)
  if (s.status !== 200) fail.push(`START FAILED ${s.status}: ${JSON.stringify(s.d)}`)

  // did the game actually leave 'waiting'?
  const gres = await fetch(`${REST}/games?id=eq.${code}&select=status`, { headers: h(SRV) })
  const gr = await gres.json().catch(() => null)
  // Verify the QUERY worked before trusting its answer: a 401/500/empty result yields
  // `status === undefined`, which would silently skip the "still waiting" check below.
  if (!gres.ok) fail.push(`games status query failed (${gres.status}) — cannot verify the game started`)
  else if (!Array.isArray(gr) || gr.length === 0)
    fail.push(`games row ${code} not found — cannot verify the game started`)
  const status = gr?.[0]?.status
  log.push(`game.status=${status}`)
  if (status === 'waiting') fail.push(`game still 'waiting' after start (silent-failure signature)`)

  // secret row must exist and be populated (service role)
  const col = g.table === 'ttl_statements' ? 'game_id' : 'game_id'
  const sel = g.secrets.join(',')
  const sr = await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=${sel}`, { headers: h(SRV) }).then((r) =>
    r.json()
  )
  const rows = Array.isArray(sr) ? sr : []
  // Non-vacuity: a row whose secret columns are ALL null proves nothing about redaction — the
  // anon denials below would pass against empty state. Require the game to have generated
  // hidden state before asserting anyone is denied it.
  const populated = rows.some((r) => g.secrets.some((k) => r[k] !== null && r[k] !== undefined))
  log.push(`${g.table} rows(service)=${rows.length} populated=${populated}`)
  if (rows.length === 0) fail.push(`no ${g.table} row created`)
  else if (!populated)
    fail.push(`${g.table} row exists but every secret column is null — the anon assertions below would be vacuous`)

  // anon MUST be denied each secret column
  for (const secret of g.secrets) {
    const r = await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=${secret}`, { headers: h(ANON) })
    const body = await r.json().catch(() => null)
    // A LEAK is a successful read. But "not 2xx" is not the same as "denied": a 500, 404 or 429
    // would otherwise sail through as if the column were protected. Only the documented denial
    // statuses count as proof — locally PostgREST answers a column revoke with 401, hosted with
    // 403 (see README). Anything else is an inconclusive result and must fail loudly.
    if (r.ok) fail.push(`LEAK ${g.table}.${secret} anon read it (${r.status}) ${JSON.stringify(body).slice(0, 120)}`)
    else if (r.status !== 401 && r.status !== 403)
      fail.push(`INCONCLUSIVE ${g.table}.${secret} -> ${r.status} (expected 401/403 denial, not an error)`)
  }
  // anon MUST still read the table's non-secret columns (not broken)
  const okr = await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=game_id`, { headers: h(ANON) })
  if (okr.status !== 200) fail.push(`BREAK anon cannot read ${g.table}.game_id -> ${okr.status}`)
  // and select=* must fail closed, never silently succeed
  const star = await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=*`, { headers: h(ANON) })
  log.push(`anon select=* -> ${star.status} (expect 403)`)
  if (star.status === 200) fail.push(`LEAK anon select=* returned 200 on ${g.table}`)

  return { g, code, log, fail }
}

const results = []
for (const g of GAMES) results.push(await run(g))
console.log('\n================ PLAYTEST ================')
let bad = 0
for (const r of results) {
  const ok = r.fail.length === 0
  if (!ok) bad++
  console.log(`\n${ok ? 'PASS' : 'FAIL'}  ${r.g.type}${r.code ? ' (' + r.code + ')' : ''}`)
  r.log.forEach((l) => console.log('   · ' + l))
  r.fail.forEach((f) => console.log('   ✗ ' + f))
}
console.log(`\n${results.length - bad}/${results.length} games passed`)
process.exit(bad ? 1 : 0)
