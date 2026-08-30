import { ANON, APP, REST, SRV, assertDenied, get, post } from './_shared.mjs'

// The #763 class, which no other harness covers: a player who joins by the SHARED LINK rather
// than through the host flow. Their resume token is written asynchronously, so the first hand
// fetch can fire before it lands. The bug that keeps recurring is a fetch WITHOUT the token being
// answered as "you have no cards" instead of "I don't know who you are" — and an empty hand is
// meaningful state in these games (`isOut` derives from it), so it renders as "you are out"
// mid-game rather than as an error.
//
// A single host on one machine cannot reproduce this, which is why it has only ever been reasoned
// about. Here each player is a separate client with its own token, and the late joiner's first
// fetch is deliberately made tokenless.

const GAMES = [
  { type: 'whot', route: '/api/whot/hands', key: 'hands', players: 3 },
  { type: 'uno', route: '/api/uno/hands', key: 'hands', players: 3 },
  { type: 'crazy_eights', route: '/api/crazy-eights/hands', key: 'hands', players: 3 },
  // Bingo needs participants at creation ("At least 3 participants required") — a game rule,
  // not a redaction concern.
  { type: 'bingo', route: '/api/bingo/card', key: 'card', players: 3,
    extra: { participants: ['Ada', 'Bella', 'Ciara'] } },
]

const fail = []
for (const g of GAMES) {
  const log = []
  try {
    const c = await post(`${APP}/api/games`, { title: `LJ ${g.type}`, game_type: g.type, ...(g.extra ?? {}) })
    const { gameCode: code, hostToken } = c.d
    log.push(`created ${code}`)

    const ps = []
    for (let i = 0; i < g.players; i++) {
      const p = await post(`${APP}/api/players`, { gameCode: code, playerName: `P${i + 1}` })
      ps.push(p.d)
    }
    const s = await post(`${APP}/api/games/${code}/start`, { hostToken })
    log.push(`start -> ${s.status}`)
    if (s.status !== 200) { fail.push(`${g.type}: start failed ${s.status} ${JSON.stringify(s.d)}`); continue }

    const me = ps[ps.length - 1] // the late joiner

    // 1. TOKENLESS fetch — what a share-link joiner does before their session resolves.
    //    It must NOT come back as an empty hand; that is the regression.
    const anon = await post(`${APP}${g.route}`, { gameCode: code })
    log.push(`tokenless -> ${anon.status}`)
    if (g.key === 'card') {
      // Bingo has no counts to fall back on, so a tokenless caller must be DENIED rather than
      // handed `card: null`, which the UI cannot tell from "not dealt yet". assertDenied, not a
      // hand-rolled check: it also rejects 500/429, which would otherwise pass as "not 200".
      assertDenied(anon, `${g.type} tokenless card`, fail)
    } else {
      // MANDATORY, not filters over a possibly-empty array. A failed request or a 200 with no
      // rows would make `rows` `[]`, and every .filter() over [] is empty — so the whole block
      // would pass while asserting nothing. That is the vacuity this harness exists to avoid.
      if (anon.status !== 200) {
        fail.push(`${g.type}: tokenless fetch -> ${anon.status}; expected 200 with redacted rows`)
      } else {
        const rows = anon.d?.[g.key]
        if (!Array.isArray(rows) || rows.length === 0) {
          fail.push(`${g.type}: tokenless fetch returned no rows — the redaction assertions below would be vacuous`)
        } else {
          // The contract: `cards` NULL (redacted, not empty) and `card_count` a NUMBER on EVERY row.
          const leaked = rows.filter((h) => Array.isArray(h.cards) && h.cards.length > 0)
          const emptied = rows.filter((h) => Array.isArray(h.cards) && h.cards.length === 0)
          const noCount = rows.filter((h) => typeof h.card_count !== 'number')
          const zeroed = rows.filter((h) => h.card_count === 0)
          if (leaked.length) fail.push(`${g.type}: LEAK — tokenless fetch returned real cards for ${leaked.length} row(s)`)
          if (emptied.length) fail.push(`${g.type}: tokenless fetch returned cards:[] — reads as "you are out"`)
          if (noCount.length) fail.push(`${g.type}: ${noCount.length} row(s) lost card_count — the count must survive redaction`)
          if (zeroed.length) fail.push(`${g.type}: tokenless fetch zeroed card_count — reads as "you are out"`)
          log.push(`tokenless rows=${rows.length}, cards=null, card_count numeric on all rows`)
        }
      }
    }

    // 2. WITH the token — the same call once the session lands. Must be populated.
    const mine = await post(`${APP}${g.route}`, { gameCode: code, resumeToken: me.resumeToken })
    log.push(`with token -> ${mine.status}`)
    if (mine.status !== 200) { fail.push(`${g.type}: own fetch failed ${mine.status}`); continue }

    if (g.key === 'card') {
      if (!mine.d.card || !Array.isArray(mine.d.card.cells)) fail.push(`${g.type}: own card missing after token resolved`)
      else log.push(`own card cells=${mine.d.card.cells.length}`)
    } else {
      const rows = mine.d.hands ?? []
      const own = rows.find((h) => h.player_id === me.playerId)
      if (!own) { fail.push(`${g.type}: own row absent from hands`); continue }
      const n = Array.isArray(own.cards) ? own.cards.length : -1
      log.push(`own cards=${n}, opponents=${rows.length - 1}`)
      if (n <= 0) fail.push(`${g.type}: own hand EMPTY after the token resolved (${n}) — the #763 regression`)
      // opponents must be counts only
      const leaked = rows.filter((h) => h.player_id !== me.playerId && Array.isArray(h.cards) && h.cards.length > 0)
      if (leaked.length) fail.push(`${g.type}: LEAK — ${leaked.length} opponent hand(s) came back with real cards`)
    }
  } catch (e) {
    fail.push(`${g.type}: threw ${e.message}`)
  }
  console.log(`\n${fail.some((f) => f.startsWith(g.type)) ? 'FAIL' : 'PASS'}  ${g.type}`)
  for (const l of log) console.log(`   · ${l}`)
}

console.log('')
if (fail.length) { console.log(`FAIL (${fail.length})`); for (const f of fail) console.log(`  ✗ ${f}`); process.exit(1) }
console.log('PASS — late join returns the joiner their own hand, and only counts for everyone else')
