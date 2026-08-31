import {
  ANON,
  APP,
  REST,
  SRV,
  assertDenied,
  assertReadableRows,
  get,
  post,
} from './_shared.mjs'

/**
 * Play whot, uno and crazy_eights through the real action routes until the market runs dry.
 *
 * Every other harness in this directory stops at create → join → start and then asserts reads.
 * Nothing had ever taken a turn, which left the most dangerous consequence of the pile revoke
 * untested: `draw_pile`/`discard_pile` are revoked from anon and replaced by the generated
 * `draw_count`/`discard_count`, and `isDrawPileDepleted` used to read `session.draw_pile.length`.
 * A revoked pile arrives as `undefined`, `?? []` turns that into length 0, and the game then
 * believes the deck is exhausted — flipping a live table into its reshuffle and pass-turn paths
 * while dozens of cards are still sitting in the pile. The fix (prefer the counts, refuse to
 * answer when neither is readable) has unit tests; it has never had a game played over it.
 *
 * So this harness plays. Two runs per game:
 *
 *  · DRAIN — alternates play and draw so the discard keeps growing while the draw pile shrinks,
 *    then keeps going past the point where the draw pile empties. That is the only way to reach
 *    the reshuffle, and a draw-only strategy cannot: it never feeds the discard, so the pile the
 *    reshuffle refills FROM would be empty too and the deck would genuinely exhaust instead.
 *
 *  · FINISH — plays greedily until somebody empties their hand, proving a game can still end.
 *
 * Legal moves are found by ASKING the server (try each card, keep the one that returns 200)
 * rather than by reimplementing the rules here. A harness that duplicates the rules tests its own
 * copy of them, and drifts.
 */

/** How many turns each run may take before we call it stuck. Sized off UNO's 86-card draw pile. */
const DRAIN_TURN_CAP = 500
const FINISH_TURN_CAP = 300
/** Actions that must succeed AFTER the reshuffle to prove the game did not just stall there. */
const POST_RESHUFFLE_ACTIONS = 3
/**
 * How empty the draw pile must be, as a fraction of the deal, on the turn the reshuffle fires.
 *
 * Not zero, and not an absolute count. A single request can consume several cards at once — Whot's
 * "general market" deals one to every player, UNO's stacked Draw Two/Four hands over four or more —
 * so the pile can empty and be refilled between two of our reads and never be observed at 0. Runs
 * have been seen bottoming out at 0, 1 and 3 on the same deck.
 *
 * The reshuffle is the load-bearing proof that the pile ran out: nothing but a refill makes it
 * grow. This threshold only proves we got there by playing the deck down — that the pile was
 * nearly gone at the moment it was refilled, not topped up early from a half-full state.
 */
const DRAINED_FRACTION = 0.1

const GAMES = [
  {
    type: 'whot',
    api: 'whot',
    table: 'whot_sessions',
    // Whot alone tracks reshuffles in a column, so it gets a direct second witness.
    reshuffleColumn: 'reshuffle_count',
    resolvePhase: (phase) =>
      phase === 'choose_whot' ? { path: 'choose', body: { shape: 'circle' } } : null,
  },
  {
    type: 'uno',
    api: 'uno',
    table: 'uno_sessions',
    // Always call "UNO". The flag is only read when the play leaves the player on one card, so
    // it is a no-op otherwise — but without it every player who gets down to one card is caught
    // by the next move and penalised back up, and no game ever ends.
    playExtra: { callUno: true },
    resolvePhase: (phase) => {
      if (phase === 'choose_color') return { path: 'choose', body: { color: 'red' } }
      // Declining the challenge is the branch that keeps play moving; challenging forks into a
      // reveal path that is not what this harness is measuring.
      if (phase === 'challenge_window') return { path: 'challenge', body: { challenge: false } }
      return null
    },
  },
  {
    type: 'crazy_eights',
    api: 'crazy-eights',
    table: 'crazy_eights_sessions',
    resolvePhase: (phase) =>
      phase === 'choose_suit' ? { path: 'choose', body: { suit: 'hearts' } } : null,
  },
]

const jsonLen = (v) => (Array.isArray(v) ? v.length : null)

/**
 * Read one session twice — once as service_role (the truth, piles included) and once as anon
 * (what a real client sees) — and assert the two agree.
 *
 * This is requirement 3 made concrete: `draw_count` is a stored generated column over
 * `draw_pile`, so anon's count and the service role's `jsonb_array_length(draw_pile)` must be
 * the same number on every single turn. If they ever diverge, `isDrawPileDepleted` is reasoning
 * about a pile that does not exist.
 *
 * Returns null (having recorded a failure) whenever either read is untrustworthy, so the caller
 * stops rather than continuing over `undefined` — the silent-skip that makes these harnesses lie.
 */
async function readSession(g, code, fail, stats, label) {
  const srv = await get(`${REST}/${g.table}?game_id=eq.${code}&select=*`, SRV)
  if (srv.status !== 200) {
    fail.push(`${g.type}: ${label} service-role session read -> ${srv.status}; state cannot be trusted`)
    return null
  }
  const row = Array.isArray(srv.d) ? srv.d[0] : null
  if (!row) {
    fail.push(`${g.type}: ${label} service-role session read returned no row`)
    return null
  }
  const drawLen = jsonLen(row.draw_pile)
  const discardLen = jsonLen(row.discard_pile)
  if (drawLen == null || discardLen == null) {
    fail.push(`${g.type}: ${label} piles are not arrays (draw=${typeof row.draw_pile}, discard=${typeof row.discard_pile})`)
    return null
  }
  if (!Array.isArray(row.turn_order) || row.turn_order.length === 0) {
    fail.push(`${g.type}: ${label} turn_order is empty — no turn could be taken`)
    return null
  }

  const anon = await get(
    `${REST}/${g.table}?game_id=eq.${code}&select=draw_count,discard_count,phase,current_turn_index`,
    ANON
  )
  // Requirement 5's positive half: the counts that replaced the piles must stay readable. A
  // non-200 here is exactly the regression that would send `draw_count` back to `undefined`.
  assertReadableRows(anon, `${g.type} ${g.table} draw_count/discard_count`, fail)
  const anonRow = Array.isArray(anon.d) ? anon.d[0] : null
  if (!anonRow || typeof anonRow.draw_count !== 'number' || typeof anonRow.discard_count !== 'number') {
    fail.push(`${g.type}: ${label} anon counts missing or non-numeric (${JSON.stringify(anonRow)?.slice(0, 90)})`)
    return null
  }

  if (anonRow.draw_count !== drawLen) {
    fail.push(
      `${g.type}: ${label} draw_count ${anonRow.draw_count} != jsonb_array_length(draw_pile) ${drawLen} — the count anon steers by is wrong`
    )
  }
  if (anonRow.discard_count !== discardLen) {
    fail.push(
      `${g.type}: ${label} discard_count ${anonRow.discard_count} != jsonb_array_length(discard_pile) ${discardLen}`
    )
  }
  // The depletion rule the product runs on, evaluated over what anon can actually see. Cards
  // remain, so nothing may report depleted — this is the #838-shaped bug, restated as gameplay.
  if (anonRow.draw_count === 0 && anonRow.discard_count === 0 && drawLen + discardLen > 0) {
    fail.push(`${g.type}: ${label} counts read as DEPLETED while ${drawLen + discardLen} cards remain`)
  }
  stats.countChecks += 1

  return { row, drawLen, discardLen, phase: row.phase }
}

/** POST an action and flag any 5xx immediately — a crashed route must never read as "illegal move". */
async function action(g, path, body, fail, label) {
  const res = await post(`${APP}/api/${g.api}/${path}`, body)
  if (res.status >= 500) {
    fail.push(`${g.type}: ${label} /${path} -> ${res.status} ${JSON.stringify(res.d)?.slice(0, 140)}`)
  }
  return res
}

/**
 * Take one turn for whoever is on the clock.
 *
 * `prefer` is 'play' or 'draw'. Preferring play still falls back to a draw when no card is legal,
 * which is what a real player does; preferring draw never plays, which is how the pile is drained
 * without emptying anybody's hand.
 */
async function takeTurn(g, code, seats, session, prefer, fail, stats) {
  const current = session.row.turn_order[session.row.current_turn_index]
  const seat = seats.find((s) => s.playerId === current)
  if (!seat) {
    fail.push(`${g.type}: turn belongs to ${current}, who is not one of the joined players`)
    return 'stop'
  }
  const auth = { gameId: code, resumeToken: seat.resumeToken }

  // A non-playing phase (pick a shape/suit/colour, answer a challenge) blocks every other action,
  // so it has to be resolved before a play or draw can even be attempted.
  const pending = g.resolvePhase(session.phase)
  if (pending) {
    const res = await action(g, pending.path, { ...auth, ...pending.body }, fail, `phase ${session.phase}`)
    if (res.status !== 200) {
      fail.push(`${g.type}: ${session.phase} could not be resolved via /${pending.path} -> ${res.status} ${JSON.stringify(res.d)?.slice(0, 120)}`)
      return 'stop'
    }
    stats.resolves += 1
    return 'ok'
  }
  if (session.phase !== 'playing') {
    fail.push(`${g.type}: unhandled phase '${session.phase}' — the harness cannot take a turn`)
    return 'stop'
  }

  if (prefer === 'play') {
    const hands = await post(`${APP}/api/${g.api}/hands`, { gameCode: code, resumeToken: seat.resumeToken })
    // A 429 or a 500 here would leave `mine` empty and silently demote every play turn into a
    // draw — the run would still go green while proving nothing about playing cards.
    if (hands.status !== 200) {
      fail.push(`${g.type}: hands fetch -> ${hands.status} ${JSON.stringify(hands.d)?.slice(0, 120)}`)
      return 'stop'
    }
    const mine = hands.d?.hands?.find((h) => h.player_id === current)?.cards
    if (!Array.isArray(mine)) {
      fail.push(`${g.type}: own hand came back as ${JSON.stringify(mine)?.slice(0, 60)} instead of an array`)
      return 'stop'
    }
    stats.handFetches += 1
    for (const card of mine) {
      const res = await action(g, 'play', { ...auth, ...(g.playExtra ?? {}), cardId: card.id }, fail, 'play')
      if (res.status === 200) {
        stats.plays += 1
        return 'ok'
      }
      // 400 = "not a legal move", the expected answer while we hunt for a playable card.
      if (res.status !== 400) {
        fail.push(`${g.type}: play answered ${res.status}; expected 200 or a 400 illegal-move`)
        return 'stop'
      }
    }
  }

  const drew = await action(g, 'draw', auth, fail, 'draw')
  if (drew.status === 200) {
    stats.draws += 1
    return 'ok'
  }
  // UNO lets a player pass after drawing; without this the run deadlocks on that state rather
  // than reaching the pile-empty case we are here to test.
  if (g.api === 'uno') {
    const passed = await action(g, 'pass', auth, fail, 'pass')
    if (passed.status === 200) {
      stats.passes += 1
      return 'ok'
    }
  }
  fail.push(`${g.type}: neither play nor draw was accepted for the player on turn (draw -> ${drew.status} ${JSON.stringify(drew.d)?.slice(0, 120)})`)
  return 'stop'
}

/** Create a game, seat three players and start it. Nothing downstream runs unless all of it worked. */
async function openTable(g, label, fail) {
  const created = await post(`${APP}/api/games`, { title: `GP ${g.type} ${label}`, game_type: g.type })
  if (created.status !== 200 || !created.d?.gameCode || !created.d?.hostToken) {
    fail.push(`${g.type}: ${label} create -> ${created.status} ${JSON.stringify(created.d)?.slice(0, 140)}`)
    return null
  }
  const code = created.d.gameCode
  const seats = []
  for (let i = 0; i < 3; i += 1) {
    const p = await post(`${APP}/api/players`, { gameCode: code, playerName: `P${i + 1}` })
    if (p.status !== 200 || !p.d?.playerId || !p.d?.resumeToken) {
      fail.push(`${g.type}: ${label} join P${i + 1} -> ${p.status} ${JSON.stringify(p.d)?.slice(0, 120)}`)
      return null
    }
    seats.push(p.d)
  }
  const started = await post(`${APP}/api/games/${code}/start`, { hostToken: created.d.hostToken })
  if (started.status !== 200) {
    fail.push(`${g.type}: ${label} start -> ${started.status} ${JSON.stringify(started.d)?.slice(0, 140)}`)
    return null
  }
  return { code, seats }
}

const fail = []

for (const g of GAMES) {
  const before = fail.length
  const log = []
  const stats = { plays: 0, draws: 0, passes: 0, resolves: 0, handFetches: 0, countChecks: 0, turns: 0 }

  try {
    // ── Requirement 5: the revoke itself, checked on a live table rather than a fresh row.
    const table = await openTable(g, 'drain', fail)
    if (!table) throw new Error('table could not be opened')
    const { code, seats } = table
    log.push(`drain table ${code}, 3 players, started`)

    assertDenied(await get(`${REST}/${g.table}?game_id=eq.${code}&select=draw_pile`, ANON), `${g.type} draw_pile`, fail)
    assertDenied(await get(`${REST}/${g.table}?game_id=eq.${code}&select=discard_pile`, ANON), `${g.type} discard_pile`, fail)

    const opening = await readSession(g, code, fail, stats, 'opening')
    if (!opening) throw new Error('opening session unreadable')
    log.push(`opening draw_count=${opening.drawLen}, discard_count=${opening.discardLen}`)
    if (opening.drawLen === 0) {
      fail.push(`${g.type}: draw pile was already empty at deal — the drain run would be vacuous`)
      throw new Error('empty deal')
    }

    // ── Requirements 1 and 2: play the game, and keep going past an empty draw pile.
    let reshuffled = false
    let actionsAfterReshuffle = 0
    let prevDrawLen = opening.drawLen
    let lowWater = opening.drawLen
    // What the pile was down to on the turn the reshuffle fired — the number that says whether we
    // truly played the deck out or merely watched an early top-up.
    let drainedAt = null
    let session = opening

    for (let turn = 0; turn < DRAIN_TURN_CAP; turn += 1) {
      if (session.phase === 'finished') {
        // Alternating draws should keep every hand alive, so this is unexpected. It is not
        // silently tolerated: the reshuffle assertions below will fail, and this line says why.
        log.push(`drain game ended at turn ${turn} before the pile ran out`)
        break
      }
      // Alternating keeps the discard growing while the draw pile shrinks. A draw-only run would
      // exhaust the deck outright and never reach a reshuffle at all.
      const outcome = await takeTurn(g, code, seats, session, turn % 2 === 0 ? 'play' : 'draw', fail, stats)
      if (outcome === 'stop') break
      stats.turns += 1

      const next = await readSession(g, code, fail, stats, `turn ${turn}`)
      if (!next) break

      lowWater = Math.min(lowWater, next.drawLen)
      // The pile can only GROW by being refilled from the discard. An increase is therefore a
      // reshuffle, observed rather than inferred from a status message.
      if (next.drawLen > prevDrawLen) {
        if (!reshuffled) {
          drainedAt = prevDrawLen
          log.push(`RESHUFFLE at turn ${turn}: draw_count ${prevDrawLen} -> ${next.drawLen}`)
        }
        reshuffled = true
      } else if (reshuffled) {
        actionsAfterReshuffle += 1
      }
      prevDrawLen = next.drawLen
      session = next

      if (reshuffled && actionsAfterReshuffle >= POST_RESHUFFLE_ACTIONS) break
    }

    log.push(
      `drain: ${stats.turns} turns, ${stats.plays} plays, ${stats.draws} draws, ` +
        `${stats.passes} passes, ${stats.resolves} phase resolutions, low-water draw_count=${lowWater}`
    )

    // Requirement 1 — the run has to have actually done both things. Without these floors an
    // early break would leave every check below trivially satisfied.
    if (stats.plays < 5) fail.push(`${g.type}: only ${stats.plays} legal plays succeeded (need >= 5) — nothing was really played`)
    if (stats.draws < 5) fail.push(`${g.type}: only ${stats.draws} draws succeeded (need >= 5)`)
    if (stats.countChecks < 10) fail.push(`${g.type}: only ${stats.countChecks} count comparisons ran (need >= 10)`)

    // Requirement 2 — driven dry, and survived it.
    const drainedFloor = Math.max(2, Math.ceil(opening.drawLen * DRAINED_FRACTION))
    if (!reshuffled) {
      fail.push(`${g.type}: draw_count never recovered (low-water ${lowWater} of ${opening.drawLen}) — no reshuffle happened`)
    } else if (drainedAt > drainedFloor) {
      fail.push(`${g.type}: the pile was refilled while ${drainedAt} cards were still in it (floor ${drainedFloor} of a ${opening.drawLen}-card deal) — it was never played down`)
    }
    if (reshuffled && actionsAfterReshuffle < POST_RESHUFFLE_ACTIONS) {
      fail.push(`${g.type}: only ${actionsAfterReshuffle} action(s) completed after the reshuffle (need ${POST_RESHUFFLE_ACTIONS}) — the game did not continue`)
    }

    // Whot records reshuffles in a column, so its recovery gets a second, independent witness.
    if (g.reshuffleColumn && reshuffled) {
      const after = await get(`${REST}/${g.table}?game_id=eq.${code}&select=${g.reshuffleColumn}`, SRV)
      const n = Array.isArray(after.d) ? after.d[0]?.[g.reshuffleColumn] : null
      if (after.status !== 200 || typeof n !== 'number') {
        fail.push(`${g.type}: ${g.reshuffleColumn} unreadable (${after.status}) — cannot corroborate the reshuffle`)
      } else if (n < 1) {
        fail.push(`${g.type}: draw_count recovered but ${g.reshuffleColumn} is ${n} — the pile grew without a recorded reshuffle`)
      } else {
        log.push(`${g.reshuffleColumn}=${n}`)
      }
    }

    // The revoke must still hold after all that state churn, and the counts must still be public.
    assertDenied(await get(`${REST}/${g.table}?game_id=eq.${code}&select=draw_pile`, ANON), `${g.type} draw_pile (post-reshuffle)`, fail)
    assertReadableRows(await get(`${REST}/${g.table}?game_id=eq.${code}&select=draw_count`, ANON), `${g.type} draw_count (post-reshuffle)`, fail)

    // ── Requirement 4: a separate table, played greedily, so somebody actually goes out.
    const finishTable = await openTable(g, 'finish', fail)
    if (!finishTable) throw new Error('finish table could not be opened')
    let finishSession = await readSession(g, finishTable.code, fail, stats, 'finish opening')
    if (!finishSession) throw new Error('finish session unreadable')

    let finished = false
    let finishTurns = 0
    for (let turn = 0; turn < FINISH_TURN_CAP; turn += 1) {
      if (finishSession.phase === 'finished') { finished = true; break }
      const outcome = await takeTurn(g, finishTable.code, finishTable.seats, finishSession, 'play', fail, stats)
      if (outcome === 'stop') break
      finishTurns += 1
      finishSession = await readSession(g, finishTable.code, fail, stats, `finish turn ${turn}`)
      if (!finishSession) break
    }

    if (!finished) {
      fail.push(`${g.type}: greedy play did not finish a game in ${finishTurns} turns — nobody went out`)
    } else {
      const done = await get(`${REST}/${g.table}?game_id=eq.${finishTable.code}&select=winner_player_id,finish_order`, SRV)
      const row = Array.isArray(done.d) ? done.d[0] : null
      if (done.status !== 200 || !row) {
        fail.push(`${g.type}: finished game's result row unreadable (${done.status})`)
      } else if (!row.winner_player_id) {
        // phase='finished' with no winner recorded is the shape a spurious "deck exhausted"
        // bail-out leaves behind, so it must not pass as a normal finish.
        fail.push(`${g.type}: game reached phase 'finished' with no winner_player_id — it ended without anyone going out`)
      } else {
        log.push(`finish table ${finishTable.code}: winner after ${finishTurns} turns`)
      }
    }
  } catch (e) {
    // openTable/readSession already recorded the specific failure; this only stops the run.
    if (fail.length === before) fail.push(`${g.type}: threw ${e.message}`)
  }

  console.log(`\n${fail.length > before ? 'FAIL' : 'PASS'}  ${g.type}`)
  for (const l of log) console.log(`   · ${l}`)
  for (const f of fail.slice(before)) console.log(`   ✗ ${f}`)
}

console.log('')
if (fail.length) {
  console.log(`FAIL (${fail.length})`)
  for (const f of fail) console.log(`  ✗ ${f}`)
  process.exit(1)
}
console.log('PASS — all three card games played past an empty draw pile, reshuffled, and finished')
