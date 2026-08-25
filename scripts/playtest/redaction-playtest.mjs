import { ANON, APP, REST, SRV, assertDenied, assertQueryUsable, assertReadableRows, h, post } from './_shared.mjs'

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
  // assertQueryUsable fails loudly on a 401/500/empty result rather than leaving `status`
  // undefined, which would silently skip the "still waiting" check below.
  const gres = await get(`${REST}/games?id=eq.${code}&select=status`, SRV)
  const status = assertQueryUsable(gres, `games ${code}`, fail)?.status
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
    const r = await get(`${REST}/${g.table}?${col}=eq.${code}&select=${secret}`, ANON)
    assertDenied(r, `${g.table}.${secret}`, fail)
  }
  // anon MUST still read the table's non-secret columns, AND get rows back: a 200 with [] is what
  // an RLS regression looks like, and it would make every denial above vacuous.
  const okr = await get(`${REST}/${g.table}?${col}=eq.${code}&select=game_id`, ANON)
  log.push(`anon non-secret -> ${okr.status} (${Array.isArray(okr.d) ? okr.d.length : 0} rows)`)
  assertReadableRows(okr, `${g.table}.game_id`, fail)
  // and select=* must fail CLOSED — with a denial, not merely a non-200
  const star = await get(`${REST}/${g.table}?${col}=eq.${code}&select=*`, ANON)
  log.push(`anon select=* -> ${star.status}`)
  assertDenied(star, `${g.table} select=*`, fail)

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
