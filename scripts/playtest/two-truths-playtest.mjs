const APP='http://127.0.0.1:3000', REST='http://127.0.0.1:54321/rest/v1'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SRV='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const h=k=>({apikey:k,Authorization:`Bearer ${k}`})
const J={'Content-Type':'application/json'}
const post=async(u,b)=>{const r=await fetch(u,{method:'POST',headers:J,body:JSON.stringify(b)});let d=null;try{d=await r.json()}catch{};return{status:r.status,d}}
const get=async(u,k)=>{const r=await fetch(u,{headers:h(k)});let d=null;try{d=await r.json()}catch{};return{status:r.status,d}}
const fail=[],log=[]

const c=await post(`${APP}/api/games`,{title:'PT ttl',game_type:'two_truths'})
const {gameCode:code,hostToken}=c.d; log.push(`created ${code}`)

const ps=[]
for(let i=0;i<3;i++){const p=await post(`${APP}/api/players`,{gameCode:code,playerName:`P${i+1}`});ps.push(p.d)}
log.push(`joined ${ps.length}`)

// each player submits 3 statements with a designated lie
for(const [i,p] of ps.entries()){
  const r=await post(`${APP}/api/two-truths/statements`,{gameId:code,resumeToken:p.resumeToken,
    statementA:`A${i}-true`,statementB:`B${i}-true`,statementC:`C${i}-LIE`,lieIndex:2})
  log.push(`submit P${i+1} -> ${r.status}${r.status!==200?' '+JSON.stringify(r.d):''}`)
  if(r.status!==200) fail.push(`submit P${i+1} failed ${r.status} ${JSON.stringify(r.d)}`)
}

const srows=await get(`${REST}/ttl_statements?game_id=eq.${code}&select=player_id,lie_index`,SRV)
log.push(`ttl_statements rows(service)=${srows.d?.length}`)

// THE #838 CHECK: start must succeed now that statements exist
const s=await post(`${APP}/api/games/${code}/start`,{hostToken})
log.push(`START -> ${s.status} ${s.status!==200?JSON.stringify(s.d):''}`)
if(s.status!==200) fail.push(`START FAILED: ${JSON.stringify(s.d)} <-- #838 regression signature`)
const g1=await get(`${REST}/games?id=eq.${code}&select=status`,SRV)
log.push(`game.status=${g1.d?.[0]?.status}`)
if(g1.d?.[0]?.status==='waiting') fail.push(`game still waiting after start`)

// redaction: anon must not read lie_index, must still read the rest
const leak=await get(`${REST}/ttl_statements?game_id=eq.${code}&select=lie_index`,ANON)
log.push(`anon lie_index -> ${leak.status}`)
if(leak.status===200) fail.push(`LEAK: anon read lie_index`)
const okc=await get(`${REST}/ttl_statements?game_id=eq.${code}&select=id,player_id,statement_a`,ANON)
log.push(`anon non-secret cols -> ${okc.status} (${okc.d?.length} rows)`)
if(okc.status!==200) fail.push(`BREAK: anon cannot read non-secret ttl_statements cols (${okc.status})`)

// own-lie path: /my-statement must return the caller's own lieIndex
const mine=await post(`${APP}/api/two-truths/my-statement`,{gameCode:code,resumeToken:ps[0].resumeToken})
log.push(`my-statement P1 -> ${mine.status} lieIndex=${JSON.stringify(mine.d?.lieIndex ?? mine.d?.statement?.lie_index ?? mine.d)}`.slice(0,160))
if(mine.status!==200) fail.push(`my-statement failed ${mine.status}`)

// IDOR: P2's token must not yield P1's lie
const other=await post(`${APP}/api/two-truths/my-statement`,{gameCode:code,resumeToken:ps[1].resumeToken})
const mineLie=JSON.stringify(mine.d), otherLie=JSON.stringify(other.d)
log.push(`my-statement P2 -> ${other.status}`)
if(mineLie===otherLie && mine.status===200) fail.push(`my-statement returns identical payload for two players (not scoped)`)

// Play a round. ORDER MATTERS: the first advance ACTIVATES a round; guesses before that are
// rejected with "Round is not active". Getting this wrong makes the redaction assertions below
// vacuous — they would run against an empty ttl_guesses and pass no matter what the grants say.
const adv1=await post(`${APP}/api/two-truths/advance`,{gameId:code,hostToken})
log.push(`advance(activate) -> ${adv1.status} ${adv1.status!==200?JSON.stringify(adv1.d).slice(0,160):''}`)
if(adv1.status!==200) fail.push(`advance(activate) failed ${adv1.status}: ${JSON.stringify(adv1.d)}`)

const rr=await get(`${REST}/rounds?game_id=eq.${code}&select=id,submitter_player_id,status&status=eq.active&limit=1`,SRV)
const round=rr.d?.[0], roundId=round?.id, subject=round?.submitter_player_id
log.push(`active round=${roundId} subject=${subject}`)
if(!roundId) fail.push('no active round after advance')

// everyone except the round's subject guesses; each must be accepted
let accepted=0
for(const [i,p] of ps.entries()){
  if(p.playerId===subject) continue
  const gsr=await post(`${APP}/api/two-truths/guess`,{gameId:code,resumeToken:p.resumeToken,roundId,guessedIndex:2})
  log.push(`guess P${i+1} -> ${gsr.status}${gsr.status!==200?' '+JSON.stringify(gsr.d).slice(0,120):''}`)
  if(gsr.status!==200) fail.push(`guess P${i+1} REJECTED ${gsr.status}: ${JSON.stringify(gsr.d)}`)
  else accepted++
}
if(accepted===0) fail.push('no guess was accepted — redaction checks below would be vacuous')

const adv=await post(`${APP}/api/two-truths/advance`,{gameId:code,hostToken})
log.push(`advance(reveal) -> ${adv.status} ${adv.status!==200?JSON.stringify(adv.d).slice(0,160):''}`)
if(adv.status!==200) fail.push(`advance(reveal) failed ${adv.status}: ${JSON.stringify(adv.d)}`)

// NON-VACUITY GUARD: there must be real rows before asserting anon cannot read them.
const rows=await get(`${REST}/ttl_guesses?game_id=eq.${code}&select=id,guessed_index,is_correct,points`,SRV)
log.push(`ttl_guesses rows(service)=${rows.d?.length}`)
if(!rows.d?.length) fail.push('ttl_guesses is EMPTY — the anon assertions below prove nothing')

// guesses redaction
for(const col of ['guessed_index','is_correct','points']){
  const gl=await get(`${REST}/ttl_guesses?game_id=eq.${code}&select=${col}`,ANON)
  log.push(`anon ttl_guesses.${col} -> ${gl.status}`)
  if(gl.status===200) fail.push(`LEAK: anon read ttl_guesses.${col}`)
}
// the other half: anon must still read the non-secret columns, and actually get the rows back
const gok=await get(`${REST}/ttl_guesses?game_id=eq.${code}&select=id,player_id`,ANON)
log.push(`anon ttl_guesses non-secret -> ${gok.status} (${gok.d?.length ?? 0} rows)`)
if(gok.status!==200) fail.push(`BREAK: anon cannot read non-secret ttl_guesses cols (${gok.status})`)
else if(!gok.d?.length) fail.push('anon read ttl_guesses but got 0 rows — assertions are vacuous')
const rl=await get(`${REST}/ttl_round_lies?select=*&limit=1`,ANON)
log.push(`anon ttl_round_lies -> ${rl.status}`)
if(rl.status===200) fail.push(`LEAK: anon read ttl_round_lies`)

console.log('===== TWO TRUTHS =====')
log.forEach(l=>console.log('  · '+l))
fail.forEach(f=>console.log('  ✗ '+f))
console.log(fail.length?`\nFAIL (${fail.length})`:'\nPASS')
