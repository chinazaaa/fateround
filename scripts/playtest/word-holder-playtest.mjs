import { APP, REST, SRV, post } from './_shared.mjs'

// This script's `get` intentionally differs from the shared one: it returns the PARSED BODY
// rather than {status, d}, because every call here is a service-role read used only to learn
// the expected word/holder. It asserts nothing, so it needs no status handling.
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
  // Check BOTH shapes. The holder path reads `word ?? currentWord`; checking only `word` here
  // would let a 4xx response that carries `currentWord` report success while leaking the secret.
  const nt = JSON.stringify(noTok.d?.word ?? noTok.d?.currentWord ?? null)
  console.log(`  · no-token -> ${noTok.status} word=${nt.slice(0, 40)}`)
  if (nt && nt !== 'null') fail.push(`${type}: unauthenticated caller got a word ${nt} (LEAK)`)
  // The unauthenticated response must be INDISTINGUISHABLE from a legitimate non-holder's, which
  // means 200 + null — not a 4xx.
  //
  // This assertion used to demand a 4xx, on the reasoning that "a 200 with no word is not proof of
  // rejection". That is true of this line in isolation but wrong for the system: docs/
  // rls-hardening.md § Phase 8 makes the sameness deliberate — "asking is normal traffic, so the
  // status code must not become an oracle". A 4xx here would tell any caller whether the token
  // they hold is the describer's, which is the very thing being hidden.
  //
  // Refusal is proven above instead, by contrast rather than by status: the HOLDER must receive
  // the word (line ~44), and every non-holder must not. Those two together cannot both pass unless
  // the route is genuinely resolving the caller.
  if (noTok.status !== 200)
    fail.push(`${type}: unauthenticated /my-word returned ${noTok.status}; expected 200 with a null word, so the status cannot be used as an oracle`)
}
console.log(fail.length ? `\nFAIL:\n  ✗ ` + fail.join('\n  ✗ ') : '\nPASS — word served only to its holder')
process.exit(fail.length ? 1 : 0)
