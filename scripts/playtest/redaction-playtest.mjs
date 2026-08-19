const APP='http://127.0.0.1:3000', REST='http://127.0.0.1:54321/rest/v1'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SRV='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const h=k=>({apikey:k,Authorization:`Bearer ${k}`})
const J={'Content-Type':'application/json'}

const GAMES=[
 {type:'whot',        players:3, table:'whot_sessions',            secrets:['draw_pile','discard_pile'], extra:{}},
 {type:'uno',         players:3, table:'uno_sessions',             secrets:['draw_pile','discard_pile'], extra:{}},
 {type:'crazy_eights',players:3, table:'crazy_eights_sessions',    secrets:['draw_pile','discard_pile'], extra:{}},
 {type:'codewords',   players:4, table:'codewords_boards',         secrets:['key'],                      extra:{participant_mode:'joiners'}, pre:'codewords'},
 {type:'describe_it', players:4, table:'describe_it_sessions',     secrets:['current_word','used_words'],extra:{describe_it_num_teams:2}},
 {type:'quick_draw',  players:4, table:'quick_draw_guess_sessions',secrets:['current_word','used_words'],extra:{quick_draw_variant:'guess',quick_draw_num_teams:2}},
 {type:'two_truths',  players:3, table:'ttl_statements',           secrets:['lie_index'],                extra:{}, pre:'ttl'},
]

const post=async(u,b)=>{const r=await fetch(u,{method:'POST',headers:J,body:JSON.stringify(b)});let d=null;try{d=await r.json()}catch{}; return {status:r.status,d}}

async function run(g){
  const log=[], fail=[]
  const c=await post(`${APP}/api/games`,{title:`PT ${g.type}`,game_type:g.type,...g.extra})
  if(c.status!==200||!c.d?.gameCode){fail.push(`create -> ${c.status} ${JSON.stringify(c.d)}`);return{g,log,fail}}
  const {gameCode:code,hostToken}=c.d
  log.push(`created ${code}`)

  const players=[]
  for(let i=0;i<g.players;i++){
    const p=await post(`${APP}/api/players`,{gameCode:code,playerName:`P${i+1}`})
    if(p.status!==200){fail.push(`join P${i+1} -> ${p.status} ${JSON.stringify(p.d)}`)}
    else players.push(p.d)
  }
  log.push(`joined ${players.length}/${g.players}`)

  // per-game pre-start setup the real UI performs
  if(g.pre==='ttl'){
    for(const [i,p] of players.entries()){
      const r=await post(`${APP}/api/two-truths/statements`,{gameId:code,resumeToken:p.resumeToken,
        statementA:`A${i}`,statementB:`B${i}`,statementC:`C${i}`,lieIndex:2})
      if(r.status!==200) fail.push(`ttl submit P${i+1} -> ${r.status}`)
    }
    log.push('submitted 3 statement sets')
  }
  if(g.pre==='codewords'){
    const assign=[['red','spymaster'],['red','operative'],['blue','spymaster'],['blue','operative']]
    for(const [i,p] of players.entries()){
      const r=await post(`${APP}/api/codewords/role`,{gameId:code,resumeToken:p.resumeToken,team:assign[i][0],role:assign[i][1]})
      if(r.status!==200) fail.push(`cw role P${i+1} -> ${r.status}`)
    }
    log.push('assigned 2 spymasters + 2 operatives')
  }

  const s=await post(`${APP}/api/games/${code}/start`,{hostToken})
  log.push(`start -> ${s.status} ${s.status!==200?JSON.stringify(s.d):''}`)
  if(s.status!==200) fail.push(`START FAILED ${s.status}: ${JSON.stringify(s.d)}`)

  // did the game actually leave 'waiting'?
  const gr=await fetch(`${REST}/games?id=eq.${code}&select=status`,{headers:h(SRV)}).then(r=>r.json())
  const status=gr?.[0]?.status
  log.push(`game.status=${status}`)
  if(status==='waiting') fail.push(`game still 'waiting' after start (silent-failure signature)`)

  // secret row must exist and be populated (service role)
  const col=g.table==='ttl_statements'?'game_id':'game_id'
  const sel=g.secrets.join(',')
  const sr=await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=${sel}`,{headers:h(SRV)}).then(r=>r.json())
  const rows=Array.isArray(sr)?sr:[]
  log.push(`${g.table} rows(service)=${rows.length}`)
  if(rows.length===0) fail.push(`no ${g.table} row created`)

  // anon MUST be denied each secret column
  for(const secret of g.secrets){
    const r=await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=${secret}`,{headers:h(ANON)})
    const body=await r.json().catch(()=>null)
    if(r.status!==403&&body?.code!=='42501'){fail.push(`LEAK ${g.table}.${secret} anon got ${r.status} ${JSON.stringify(body).slice(0,120)}`)}
  }
  // anon MUST still read the table's non-secret columns (not broken)
  const okr=await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=game_id`,{headers:h(ANON)})
  if(okr.status!==200) fail.push(`BREAK anon cannot read ${g.table}.game_id -> ${okr.status}`)
  // and select=* must fail closed, never silently succeed
  const star=await fetch(`${REST}/${g.table}?${col}=eq.${code}&select=*`,{headers:h(ANON)})
  log.push(`anon select=* -> ${star.status} (expect 403)`)
  if(star.status===200) fail.push(`LEAK anon select=* returned 200 on ${g.table}`)

  return {g,code,log,fail}
}

const results=[]
for(const g of GAMES) results.push(await run(g))
console.log('\n================ PLAYTEST ================')
let bad=0
for(const r of results){
  const ok=r.fail.length===0
  if(!ok) bad++
  console.log(`\n${ok?'PASS':'FAIL'}  ${r.g.type}${r.code?' ('+r.code+')':''}`)
  r.log.forEach(l=>console.log('   · '+l))
  r.fail.forEach(f=>console.log('   ✗ '+f))
}
console.log(`\n${results.length-bad}/${results.length} games passed`)
process.exit(bad?1:0)
