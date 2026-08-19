const APP='http://127.0.0.1:3000', REST='http://127.0.0.1:54321/rest/v1'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SRV='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const h=k=>({apikey:k,Authorization:`Bearer ${k}`})
const J={'Content-Type':'application/json'}
const post=async(u,b)=>{const r=await fetch(u,{method:'POST',headers:J,body:JSON.stringify(b)});let d=null;try{d=await r.json()}catch{};return{status:r.status,d}}
const get=async(u,k)=>{const r=await fetch(u,{headers:h(k)});let d=null;try{d=await r.json()}catch{};return{status:r.status,d}}
const log=[],fail=[]

const c=await post(`${APP}/api/games`,{title:'PT cw',game_type:'codewords',participant_mode:'joiners'})
const {gameCode:code,hostToken}=c.d; log.push(`created ${code}`)
const ps=[]
for(let i=0;i<4;i++){const p=await post(`${APP}/api/players`,{gameCode:code,playerName:`P${i+1}`});ps.push(p.d)}
log.push(`joined ${ps.length}`)

const assign=[['red','spymaster'],['red','operative'],['blue','spymaster'],['blue','operative']]
for(const [i,p] of ps.entries()){
  const [team,role]=assign[i]
  const r=await post(`${APP}/api/codewords/role`,{gameId:code,resumeToken:p.resumeToken,team,role})
  log.push(`role P${i+1} ${team}/${role} -> ${r.status}${r.status!==200?' '+JSON.stringify(r.d).slice(0,90):''}`)
  if(r.status!==200) fail.push(`role assign P${i+1} failed: ${JSON.stringify(r.d)}`)
}

const s=await post(`${APP}/api/games/${code}/start`,{hostToken})
log.push(`START -> ${s.status} ${s.status!==200?JSON.stringify(s.d):''}`)
if(s.status!==200) fail.push(`START FAILED: ${JSON.stringify(s.d)}`)
const g=await get(`${REST}/games?id=eq.${code}&select=status`,SRV)
log.push(`game.status=${g.d?.[0]?.status}`)
if(g.d?.[0]?.status==='waiting') fail.push('still waiting after start')

const b=await get(`${REST}/codewords_boards?game_id=eq.${code}&select=key`,SRV)
log.push(`board rows(service)=${b.d?.length}, key present=${!!b.d?.[0]?.key}`)
if(!b.d?.[0]?.key) fail.push('no board key generated')

// anon must not read the key; must still read the words
const leak=await get(`${REST}/codewords_boards?game_id=eq.${code}&select=key`,ANON)
log.push(`anon key -> ${leak.status}`)
if(leak.status===200) fail.push('LEAK: anon read codewords_boards.key')
const star=await get(`${REST}/codewords_boards?game_id=eq.${code}&select=*`,ANON)
log.push(`anon select=* -> ${star.status}`)
if(star.status===200) fail.push('LEAK: anon select=* returned 200')
const words=await get(`${REST}/codewords_boards?game_id=eq.${code}&select=game_id,words`,ANON)
log.push(`anon words -> ${words.status}`)
if(words.status!==200) fail.push(`BREAK: anon cannot read board words (${words.status})`)

// spymaster route must serve the key to the spymaster only
const sm=await post(`${APP}/api/codewords/board`,{gameId:code,gameCode:code,resumeToken:ps[0].resumeToken})
const op=await post(`${APP}/api/codewords/board`,{gameId:code,gameCode:code,resumeToken:ps[1].resumeToken})
// a real leak = at least one non-null entry in the key array
const hasKey=o=>Array.isArray(o?.board?.key)&&o.board.key.some(v=>v!==null)
log.push(`board(spymaster) -> ${sm.status} key=${hasKey(sm.d)}`)
log.push(`board(operative) -> ${op.status} key=${hasKey(op.d)}`)
if(sm.status===200&&!hasKey(sm.d)) fail.push('BREAK: spymaster did NOT receive the key')
if(op.status===200&&hasKey(op.d)) fail.push('LEAK: operative received the board key')
const anonB=await post(`${APP}/api/codewords/board`,{gameId:code,gameCode:code})
log.push(`board(no token) -> ${anonB.status} key=${hasKey(anonB.d)}`)
if(anonB.status===200&&hasKey(anonB.d)) fail.push('LEAK: unauthenticated caller received the board key')

console.log('===== CODEWORDS =====')
log.forEach(l=>console.log('  · '+l)); fail.forEach(f=>console.log('  ✗ '+f))
console.log(fail.length?`\nFAIL (${fail.length})`:'\nPASS')
