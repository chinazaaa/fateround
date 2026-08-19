const APP='http://127.0.0.1:3000', REST='http://127.0.0.1:54321/rest/v1'
const SRV='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const J={'Content-Type':'application/json'}
const post=async(u,b)=>{const r=await fetch(u,{method:'POST',headers:J,body:JSON.stringify(b)});let d=null;try{d=await r.json()}catch{};return{status:r.status,d}}
const get=async u=>fetch(u,{headers:{apikey:SRV,Authorization:`Bearer ${SRV}`}}).then(r=>r.json())
const fail=[]

for(const [type,api,table,holderCol,extra] of [
  ['describe_it','describe-it','describe_it_sessions','describer_player_id',{describe_it_num_teams:2}],
  ['quick_draw','quick-draw','quick_draw_guess_sessions','drawer_player_id',{quick_draw_variant:'guess',quick_draw_num_teams:2}],
]){
  console.log(`\n===== ${type} =====`)
  const c=await post(`${APP}/api/games`,{title:`PT ${type}`,game_type:type,...extra})
  const {gameCode:code,hostToken}=c.d
  const ps=[];for(let i=0;i<4;i++){const p=await post(`${APP}/api/players`,{gameCode:code,playerName:`P${i+1}`});ps.push(p.d)}
  const s=await post(`${APP}/api/games/${code}/start`,{hostToken})
  console.log(`  · start -> ${s.status}`)
  const sess=(await get(`${REST}/${table}?game_id=eq.${code}&select=${holderCol},current_word`))?.[0]
  const holder=sess?.[holderCol], word=sess?.current_word
  console.log(`  · secret word (service) = ${JSON.stringify(word)}`)
  console.log(`  · holder ${holderCol} = ${holder}`)
  if(!word) fail.push(`${type}: no current_word generated`)

  for(const [i,p] of ps.entries()){
    const isHolder=p.playerId===holder
    const r=await post(`${APP}/api/${api}/my-word`,{gameCode:code,resumeToken:p.resumeToken})
    const got=JSON.stringify(r.d?.word ?? r.d?.currentWord ?? null)
    const revealed=got&&got!=='null'&&got.replace(/"/g,'')===word
    console.log(`  · P${i+1}${isHolder?' (HOLDER)':'         '} -> ${r.status} word=${got.slice(0,40)}`)
    if(isHolder&&!revealed) fail.push(`${type}: holder did NOT get the word (BREAK)`)
    if(!isHolder&&revealed) fail.push(`${type}: NON-holder P${i+1} received the word (LEAK)`)
  }
  const noTok=await post(`${APP}/api/${api}/my-word`,{gameCode:code})
  const nt=JSON.stringify(noTok.d?.word??null)
  console.log(`  · no-token -> ${noTok.status} word=${nt.slice(0,40)}`)
  if(nt.replace(/"/g,'')===word) fail.push(`${type}: unauthenticated caller got the word (LEAK)`)
}
console.log(fail.length?`\nFAIL:\n  ✗ `+fail.join('\n  ✗ '):'\nPASS — word served only to its holder')
