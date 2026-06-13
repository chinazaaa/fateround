'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, getInitial } from '@/lib/utils'
import type { Game, Participant, Player, Round, Vote, VoteAssignment, Confession } from '@/types'

type View = 'loading' | 'not_found' | 'join' | 'waiting' | 'round' | 'round_results' | 'results'

export default function GamePage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()

  const [view, setView] = useState<View>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [players, setPlayers] = useState<Player[]>([])

  // Active round state
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [assignment, setAssignment] = useState<VoteAssignment>({ kiss: null, marry: null, kill: null })
  const [submitted, setSubmitted] = useState(false)
  const [confessionText, setConfessionText] = useState('')
  const [confessionSent, setConfessionSent] = useState(false)

  // Between-rounds results
  const [lastFinishedRound, setLastFinishedRound] = useState<Round | null>(null)
  const [lastRoundVotes, setLastRoundVotes] = useState<Vote[]>([])

  // All-game accumulation (for final results)
  const [allVotes, setAllVotes] = useState<Vote[]>([])
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [allConfessions, setAllConfessions] = useState<Confession[]>([])

  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState<string | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [joining, setJoining] = useState(false)

  // ── Refs that are always up-to-date (avoid stale closures in timer/auto-submit) ──
  const submittedRef = useRef(false)
  const assignmentRef = useRef(assignment)
  assignmentRef.current = assignment
  const currentRoundRef = useRef(currentRound)
  currentRoundRef.current = currentRound
  const gameRef = useRef(game)
  gameRef.current = game
  const participantsRef = useRef(participants)
  participantsRef.current = participants
  const myPlayerIdRef = useRef(myPlayerId)
  myPlayerIdRef.current = myPlayerId
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: gameData } = await supabase
        .from('games').select('*').eq('id', gameCode).maybeSingle()
      if (!gameData) { setView('not_found'); return }
      setGame(gameData)

      const [{ data: parts }, { data: plrs }] = await Promise.all([
        supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
      ])
      setParticipants(parts || [])
      setPlayers(plrs || [])

      const session = getPlayerSession(gameCode)
      if (session) {
        setMyPlayerId(session.playerId)
        setMyPlayerName(session.playerName)
      }

      if (gameData.status === 'active') {
        const { data: activeRound } = await supabase
          .from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle()

        if (activeRound) {
          setCurrentRound(activeRound)
          if (session) {
            const { data: existingVote } = await supabase
              .from('votes').select('*')
              .eq('player_id', session.playerId).eq('round_id', activeRound.id).maybeSingle()
            if (existingVote) {
              setAssignment({
                kiss: existingVote.kiss_participant_id,
                marry: existingVote.marry_participant_id,
                kill: existingVote.kill_participant_id,
              })
              submittedRef.current = true
              setSubmitted(true)
            }
          }
          setView(session ? 'round' : 'join')
        } else {
          const { data: finishedRound } = await supabase
            .from('rounds').select('*').eq('game_id', gameCode).eq('status', 'finished')
            .order('round_number', { ascending: false }).limit(1).maybeSingle()

          if (finishedRound && session) {
            const [{ data: rv }, { data: rc }] = await Promise.all([
              supabase.from('votes').select('*').eq('round_id', finishedRound.id),
              supabase.from('confessions').select('*').eq('round_id', finishedRound.id).order('created_at'),
            ])
            setLastFinishedRound(finishedRound)
            setLastRoundVotes(rv || [])
            if (rc?.length) {
              setAllConfessions((prev) => {
                const ids = new Set(prev.map((c) => c.id))
                return [...prev, ...rc.filter((c) => !ids.has(c.id))]
              })
            }
            setView('round_results')
          } else {
            setView(session ? 'waiting' : 'join')
          }
        }
        return
      }

      if (gameData.status === 'finished') {
        await loadAllResults()
        setView('results')
        return
      }

      setView(session ? 'waiting' : 'join')
    }
    load()
  }, [gameCode])

  async function loadAllResults() {
    const [{ data: rounds }, { data: votes }, { data: confs }] = await Promise.all([
      supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
      supabase.from('votes').select('*').eq('game_id', gameCode),
      supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
    ])
    setAllRounds(rounds || [])
    setAllVotes(votes || [])
    setAllConfessions(confs || [])
  }

  // ── Real-time subscriptions ───────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`game-player-${gameCode}`)

      // Game status changes
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        async (payload) => {
          const newGame = payload.new as Game
          setGame(newGame)

          if (newGame.status === 'active' && myPlayerIdRef.current) {
            const { data: activeRound } = await supabase
              .from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle()
            if (activeRound) {
              setCurrentRound(activeRound)
              submittedRef.current = false
              setSubmitted(false)
              setAssignment({ kiss: null, marry: null, kill: null })
              setConfessionText('')
              setConfessionSent(false)
              setView('round')
            }
          }

          if (newGame.status === 'finished') {
            await loadAllResults()
            setView('results')
          }
        }
      )

      // First round is inserted (not updated) when the host starts the game
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const round = payload.new as Round
          if (round.status === 'active' && myPlayerIdRef.current) {
            setCurrentRound(round)
            submittedRef.current = false
            setSubmitted(false)
            setAssignment({ kiss: null, marry: null, kill: null })
            setConfessionText('')
            setConfessionSent(false)
            setView('round')
          }
        }
      )

      // Round status changes — this drives the whole flow
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        async (payload) => {
          const round = payload.new as Round

          if (round.status === 'active') {
            // New round starting — only leave results once the host starts the next round
            setCurrentRound(round)
            submittedRef.current = false
            setSubmitted(false)
            setAssignment({ kiss: null, marry: null, kill: null })
            setConfessionText('')
            setConfessionSent(false)
            setView('round')
          }

          if (round.status === 'finished') {
            // Round ended — show results before next round
            const [{ data: rv }, { data: rc }] = await Promise.all([
              supabase.from('votes').select('*').eq('round_id', round.id),
              supabase.from('confessions').select('*').eq('round_id', round.id).order('created_at'),
            ])
            setLastFinishedRound(round)
            setLastRoundVotes(rv || [])
            // Merge into allConfessions (dedup)
            setAllConfessions((prev) => {
              const ids = new Set(prev.map((c) => c.id))
              return [...prev, ...(rc || []).filter((c) => !ids.has(c.id))]
            })
            // Merge into allVotes
            setAllVotes((prev) => {
              const ids = new Set(prev.map((v) => v.id))
              return [...prev, ...(rv || []).filter((v) => !ids.has(v.id))]
            })
            setAllRounds((prev) => {
              const ids = new Set(prev.map((r) => r.id))
              return ids.has(round.id)
                ? prev.map((r) => r.id === round.id ? round : r)
                : [...prev, round]
            })
            setView('round_results')
          }
        }
      )

      // New player joined
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          setPlayers((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, p])
        }
      )

      // New confession (live hot takes)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const c = payload.new as Confession
          setAllConfessions((prev) => prev.some((x) => x.id === c.id) ? prev : [...prev, c])
          // If it belongs to the currently-displayed finished round, add it live
          setLastRoundVotes((prev) => prev) // trigger no-op to let view re-render
        }
      )

      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [gameCode])

  // Poll lobby while waiting — fallback if realtime is slow or unavailable
  useEffect(() => {
    if (view !== 'waiting') return

    async function refreshLobby() {
      const [{ data: plrs }, { data: gameData }] = await Promise.all([
        supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
        supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
      ])
      if (plrs) setPlayers(plrs)
      if (gameData) setGame(gameData)

      if (gameData?.status === 'active' && myPlayerIdRef.current) {
        const { data: activeRound } = await supabase
          .from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle()
        if (activeRound) {
          setCurrentRound(activeRound)
          submittedRef.current = false
          setSubmitted(false)
          setAssignment({ kiss: null, marry: null, kill: null })
          setView('round')
        }
      }
    }

    refreshLobby()
    const id = setInterval(refreshLobby, 3000)
    return () => clearInterval(id)
  }, [view, gameCode])

  // Poll during round / results — fallback when realtime misses round transitions
  useEffect(() => {
    if (view !== 'round' && view !== 'round_results') return

    async function refreshRoundState() {
      const [{ data: gameData }, { data: activeRound }, { data: finishedRound }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
        supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
        supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'finished').order('round_number', { ascending: false }).limit(1).maybeSingle(),
      ])

      if (gameData) setGame(gameData)

      if (gameData?.status === 'finished') {
        await loadAllResults()
        setView('results')
        return
      }

      if (activeRound && myPlayerIdRef.current) {
        setCurrentRound(activeRound)
        if (view === 'round_results' || activeRound.id !== currentRoundRef.current?.id) {
          submittedRef.current = false
          setSubmitted(false)
          setAssignment({ kiss: null, marry: null, kill: null })
          setConfessionText('')
          setConfessionSent(false)
          setView('round')
        }
        return
      }

      if (finishedRound && myPlayerIdRef.current) {
        const [{ data: rv }, { data: rc }] = await Promise.all([
          supabase.from('votes').select('*').eq('round_id', finishedRound.id),
          supabase.from('confessions').select('*').eq('round_id', finishedRound.id).order('created_at'),
        ])
        setLastFinishedRound(finishedRound)
        setLastRoundVotes(rv || [])
        if (rc?.length) {
          setAllConfessions((prev) => {
            const ids = new Set(prev.map((c) => c.id))
            return [...prev, ...rc.filter((c) => !ids.has(c.id))]
          })
        }
        setView('round_results')
      }
    }

    refreshRoundState()
    const id = setInterval(refreshRoundState, 2000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, gameCode, currentRound?.id])

  // ── Timer — NO `submitted` in deps so it keeps running after submit ───────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (view !== 'round' || !currentRound?.started_at || !game) return

    const endMs = new Date(currentRound.started_at).getTime() + game.timer_seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
      setTimeLeft(remaining)

      if (remaining === 0 && !submittedRef.current) {
        submittedRef.current = true
        setSubmitted(true)
        autoSubmitFromRefs()
      }
    }

    tick()
    timerRef.current = setInterval(tick, 500)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentRound?.id, currentRound?.started_at, game?.timer_seconds])
  // Note: `submitted` intentionally excluded — the timer always counts to zero

  // Uses only refs so it never causes stale closure issues
  function autoSubmitFromRefs() {
    const a = { ...assignmentRef.current }
    const r = currentRoundRef.current
    const g = gameRef.current
    const parts = participantsRef.current
    const pid = myPlayerIdRef.current

    if (!r || !pid) return

    if (g?.auto_submit_behavior === 'random') {
      const roundParts = parts.filter((p) => r.participant_ids.includes(p.id))
      const actions: (keyof VoteAssignment)[] = ['kiss', 'marry', 'kill']
      const unassigned = actions.filter((k) => !a[k])
      const available = roundParts.filter((p) => !Object.values(a).includes(p.id))
      unassigned.forEach((act, i) => { if (available[i]) a[act] = available[i].id })
    }

    fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: pid,
        roundId: r.id,
        gameId: gameCode,
        kiss: a.kiss,
        marry: a.marry,
        kill: a.kill,
      }),
    })
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const assign = (action: keyof VoteAssignment, participantId: string) => {
    setAssignment((prev) => {
      const next = { ...prev }
      // Clear this participant from any existing slot
      ;(Object.keys(next) as (keyof VoteAssignment)[]).forEach((k) => {
        if (next[k] === participantId) next[k] = null
      })
      next[action] = participantId
      return next
    })
  }

  const handleSubmit = async () => {
    if (submittedRef.current || !currentRound || !myPlayerId) return
    submittedRef.current = true
    setSubmitted(true)
    await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: myPlayerId,
        roundId: currentRound.id,
        gameId: gameCode,
        kiss: assignment.kiss,
        marry: assignment.marry,
        kill: assignment.kill,
      }),
    })
  }

  const joinGame = async () => {
    if (joining || !nameInput.trim()) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: nameInput.trim() }),
      })
      const data = await res.json()
      if (data.playerId) {
        setPlayerSession(gameCode, data.playerId, data.playerName)
        setMyPlayerId(data.playerId)
        setMyPlayerName(data.playerName)
        const { data: plrs } = await supabase
          .from('players').select('*').eq('game_id', gameCode).order('joined_at')
        setPlayers(plrs || [])
        setView('waiting')
      } else {
        alert(data.error || 'Failed to join')
      }
    } finally {
      setJoining(false)
    }
  }

  const sendConfession = async () => {
    if (!confessionText.trim() || confessionSent) return
    setConfessionSent(true)
    await fetch('/api/confessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, roundId: currentRound?.id, text: confessionText }),
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (view === 'loading') return <FullLoader />
  if (view === 'not_found') return <NotFound onHome={() => router.push('/')} />

  // JOIN
  if (view === 'join') {
    return (
      <CenteredCard>
        <div className="text-center space-y-1">
          <div className="text-4xl">❤️💍💀</div>
          <h1 className="text-2xl font-black text-white">{game?.title}</h1>
          <p className="text-zinc-500 text-sm">{game?.rounds_count} rounds · {game?.timer_seconds}s each</p>
        </div>
        <div className="space-y-3">
          <p className="text-zinc-400 font-medium text-center">Enter your name to join</p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            placeholder="Your name"
            autoFocus
            className={inputCls}
          />
          <button onClick={joinGame} disabled={!nameInput.trim() || joining} className={primaryBtnCls}>
            {joining ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </CenteredCard>
    )
  }

  // WAITING
  if (view === 'waiting') {
    return (
      <CenteredCard>
        <div className="text-center space-y-1">
          <div className="text-4xl">⏳</div>
          <h1 className="text-2xl font-black text-white">{game?.title}</h1>
          <p className="text-zinc-500">Waiting for the host to start...</p>
        </div>
        <div className="bg-[#0d0d0d] border border-[#262626] rounded-2xl p-4 space-y-2">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">Players Joined ({players.length})</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${p.name === myPlayerName ? 'bg-purple-400' : 'bg-zinc-600'}`} />
                <span className={`text-sm ${p.name === myPlayerName ? 'text-purple-300 font-semibold' : 'text-zinc-300'}`}>
                  {p.name}{p.name === myPlayerName ? ' (you)' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-zinc-600 text-xs text-center">Keep this tab open</p>
      </CenteredCard>
    )
  }

  // ROUND — voting
  if (view === 'round' && currentRound) {
    const roundParts = participants.filter((p) => currentRound.participant_ids.includes(p.id))
    const roundVoteCount = lastRoundVotes.length // approximate; not perfect but fine
    const allAssigned = !!(assignment.kiss && assignment.marry && assignment.kill)

    return (
      <div className="min-h-screen flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider">{game?.title}</p>
            <p className="text-white font-black text-2xl">
              Round {currentRound.round_number}
              <span className="text-zinc-600 font-normal text-base"> / {game?.rounds_count}</span>
            </p>
          </div>
          <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} />
        </div>

        {/* Participant cards */}
        <div className="flex-1 flex flex-col gap-4 mb-6">
          {roundParts.map((p) => {
            const action =
              assignment.kiss === p.id ? 'kiss' :
              assignment.marry === p.id ? 'marry' :
              assignment.kill === p.id ? 'kill' : null
            return (
              <ParticipantCard
                key={p.id}
                participant={p}
                action={action}
                onAssign={(a) => !submitted && assign(a, p.id)}
                disabled={submitted}
              />
            )
          })}
        </div>

        {/* Submit / submitted */}
        {!submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!allAssigned}
            className={`w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-95 ${
              allAssigned
                ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-rose-500 text-white shadow-lg shadow-purple-500/20 hover:opacity-90'
                : 'bg-[#161616] text-zinc-600 border border-[#262626] cursor-not-allowed'
            }`}
          >
            {allAssigned
              ? 'Submit Vote ✓'
              : `Assign all 3 (${[assignment.kiss, assignment.marry, assignment.kill].filter(Boolean).length}/3)`}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="w-full py-4 rounded-2xl bg-[#161616] border border-green-800/50 text-center">
              <p className="text-green-400 font-semibold">✓ Vote submitted!</p>
              <p className="text-zinc-500 text-sm mt-0.5">Results will show when the round ends</p>
            </div>
            {!confessionSent ? (
              <div className="space-y-2">
                <p className="text-zinc-600 text-xs text-center">Leave an anonymous hot take (optional)</p>
                <div className="flex gap-2">
                  <input
                    value={confessionText}
                    onChange={(e) => setConfessionText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendConfession()}
                    placeholder="Why did you make those choices?"
                    className="flex-1 bg-[#161616] text-white border border-[#262626] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 placeholder:text-zinc-700"
                  />
                  <button
                    onClick={sendConfession}
                    disabled={!confessionText.trim()}
                    className="px-4 py-2.5 bg-[#262626] text-zinc-300 rounded-xl text-sm hover:bg-[#2a2a2a] disabled:opacity-40 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-zinc-600 text-xs text-center">Hot take sent 👀</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ROUND RESULTS — shown after round ends, before next round starts
  if (view === 'round_results' && lastFinishedRound) {
    const roundParts = participants.filter((p) => lastFinishedRound.participant_ids.includes(p.id))
    const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
    const roundConfessions = allConfessions.filter((c) => c.round_id === lastFinishedRound.id)
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

    return (
      <div className="min-h-screen flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-zinc-500 text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
          </p>
          <h2 className="text-2xl font-black text-white mt-1">Results are in! 🗳️</h2>
        </div>

        {/* My vote recap */}
        {myVote && (
          <div className="bg-[#161616] border border-purple-800/40 rounded-2xl p-4">
            <p className="text-purple-400 text-xs uppercase tracking-wider mb-2">Your vote</p>
            <div className="flex gap-4 flex-wrap">
              {myVote.kiss_participant_id && (
                <span className="text-pink-300 text-sm font-medium">
                  ❤️ {participants.find((p) => p.id === myVote.kiss_participant_id)?.name}
                </span>
              )}
              {myVote.marry_participant_id && (
                <span className="text-amber-300 text-sm font-medium">
                  💍 {participants.find((p) => p.id === myVote.marry_participant_id)?.name}
                </span>
              )}
              {myVote.kill_participant_id && (
                <span className="text-red-300 text-sm font-medium">
                  💀 {participants.find((p) => p.id === myVote.kill_participant_id)?.name}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Per-person vote counts */}
        <div className="space-y-3">
          {roundParts.map((p) => {
            const k = lastRoundVotes.filter((v) => v.kiss_participant_id  === p.id).length
            const m = lastRoundVotes.filter((v) => v.marry_participant_id === p.id).length
            const d = lastRoundVotes.filter((v) => v.kill_participant_id  === p.id).length
            const total = lastRoundVotes.length || 1

            const myAction =
              myVote?.kiss_participant_id  === p.id ? 'kiss'  :
              myVote?.marry_participant_id === p.id ? 'marry' :
              myVote?.kill_participant_id  === p.id ? 'kill'  : null

            const borderCls =
              myAction === 'kiss'  ? 'border-pink-500/40'  :
              myAction === 'marry' ? 'border-amber-500/40' :
              myAction === 'kill'  ? 'border-red-500/40'   : 'border-[#262626]'

            return (
              <div key={p.id} className={`bg-[#161616] border-2 ${borderCls} rounded-2xl p-4`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-lg shrink-0">
                    {getInitial(p.name)}
                  </div>
                  <p className="text-white font-bold text-lg">{p.name}</p>
                  {myAction && (
                    <span className="ml-auto text-xs text-zinc-500 italic">
                      you: {myAction === 'kiss' ? '❤️' : myAction === 'marry' ? '💍' : '💀'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <VoteStat emoji="❤️" label="Kiss"  count={k} total={total} color="#f472b6" />
                  <VoteStat emoji="💍" label="Marry" count={m} total={total} color="#fbbf24" />
                  <VoteStat emoji="💀" label="Kill"  count={d} total={total} color="#f87171" />
                </div>
              </div>
            )
          })}
        </div>

        {/* Hot takes for this round */}
        {roundConfessions.length > 0 && (
          <div>
            <p className="text-zinc-500 text-xs uppercase tracking-wider mb-2">🔥 Hot Takes</p>
            <div className="space-y-2">
              {roundConfessions.map((c) => (
                <div key={c.id} className="bg-[#161616] border border-[#262626] rounded-xl px-4 py-3">
                  <p className="text-zinc-300 text-sm italic">&ldquo;{c.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className={`text-sm text-center animate-pulse ${isLastRound ? 'text-purple-400' : 'text-zinc-600'}`}>
          {isLastRound ? '⏳ Loading final results...' : '⏳ Waiting for next round...'}
        </p>
      </div>
    )
  }

  // FINAL RESULTS
  if (view === 'results') {
    return (
      <FinalResultsView
        game={game!}
        participants={participants}
        rounds={allRounds}
        votes={allVotes}
        confessions={allConfessions}
        players={players}
        myPlayerId={myPlayerId}
      />
    )
  }

  return <FullLoader />
}

// ── Sub-components ────────────────────────────────────────────────────────

const ACTION_CONFIG = {
  kiss:  { emoji: '❤️', label: 'Kiss',  border: 'border-pink-500 bg-pink-500/10',  active: 'bg-pink-500/25 text-pink-200 border-pink-400'  },
  marry: { emoji: '💍', label: 'Marry', border: 'border-amber-500 bg-amber-500/10', active: 'bg-amber-500/25 text-amber-200 border-amber-400' },
  kill:  { emoji: '💀', label: 'Kill',  border: 'border-red-500 bg-red-500/10',    active: 'bg-red-500/25 text-red-200 border-red-400'   },
}

function ParticipantCard({ participant, action, onAssign, disabled }: {
  participant: Participant
  action: 'kiss' | 'marry' | 'kill' | null
  onAssign: (a: 'kiss' | 'marry' | 'kill') => void
  disabled: boolean
}) {
  const cfg = action ? ACTION_CONFIG[action] : null
  return (
    <div className={`rounded-2xl border-2 p-4 transition-all ${cfg ? cfg.border : 'border-[#262626] bg-[#161616]'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-lg shrink-0">
          {getInitial(participant.name)}
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-tight">{participant.name}</p>
          {action && (
            <p className="text-sm font-medium" style={{ color: action === 'kiss' ? '#f9a8d4' : action === 'marry' ? '#fcd34d' : '#fca5a5' }}>
              {ACTION_CONFIG[action].emoji} {ACTION_CONFIG[action].label}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {(['kiss', 'marry', 'kill'] as const).map((a) => (
          <button
            key={a}
            onClick={() => onAssign(a)}
            disabled={disabled}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
              action === a
                ? ACTION_CONFIG[a].active
                : `bg-[#0d0d0d] border-[#2a2a2a] text-zinc-500 ${!disabled ? 'hover:border-zinc-500 hover:text-zinc-300' : ''}`
            } disabled:cursor-not-allowed`}
          >
            {ACTION_CONFIG[a].emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

function TimerDisplay({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? (seconds / total) * 100 : 0
  const color = seconds <= 5 ? 'text-red-400' : seconds <= 10 ? 'text-amber-400' : 'text-green-400'
  const barColor = seconds <= 5 ? 'bg-red-500' : seconds <= 10 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="text-right">
      <p className={`text-4xl font-black tabular-nums ${color} ${seconds <= 5 ? 'animate-pulse' : ''}`}>
        {seconds}
      </p>
      <div className="w-20 h-1.5 bg-[#262626] rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function VoteStat({ emoji, label, count, total, color }: {
  emoji: string; label: string; count: number; total: number; color: string
}) {
  const pct = total > 0 ? Math.min((count / total) * 100, 100) : 0
  return (
    <div className="text-center">
      <p className="text-base">{emoji} <span className="text-white font-bold">{count}</span></p>
      <p className="text-zinc-600 text-xs">{label}</p>
      <div className="h-1.5 bg-[#2a2a2a] rounded-full mt-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function FinalResultsView({ game, participants, rounds, votes, confessions, players, myPlayerId }: {
  game: Game
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
  confessions: Confession[]
  players: Player[]
  myPlayerId: string | null
}) {
  const tally = participants.map((p) => ({
    ...p,
    kissCount:  votes.filter((v) => v.kiss_participant_id  === p.id).length,
    marryCount: votes.filter((v) => v.marry_participant_id === p.id).length,
    killCount:  votes.filter((v) => v.kill_participant_id  === p.id).length,
  }))

  const mostMarried = [...tally].sort((a, b) => b.marryCount - a.marryCount)[0]
  const mostKissed  = [...tally].sort((a, b) => b.kissCount  - a.kissCount)[0]
  const mostKilled  = [...tally].sort((a, b) => b.killCount  - a.killCount)[0]

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto w-full space-y-8">
      <div className="text-center">
        <div className="text-4xl mb-2">🎊</div>
        <h1 className="text-3xl font-black text-white">{game.title}</h1>
        <p className="text-zinc-500">{players.length} players · {rounds.length} rounds</p>
      </div>

      {/* Leaderboard */}
      <div>
        <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Leaderboard</h2>
        <div className="grid grid-cols-3 gap-3">
          <LeaderCard emoji="💍" label="Most Married" name={mostMarried?.name} count={mostMarried?.marryCount} color="amber" />
          <LeaderCard emoji="❤️" label="Most Kissed"  name={mostKissed?.name}  count={mostKissed?.kissCount}  color="pink"  />
          <LeaderCard emoji="💀" label="Most Killed"  name={mostKilled?.name}  count={mostKilled?.killCount}  color="red"   />
        </div>
      </div>

      {/* Round-by-round breakdown */}
      {rounds.map((round) => {
        const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))
        const roundVotes = votes.filter((v) => v.round_id === round.id)
        const myVote = roundVotes.find((v) => v.player_id === myPlayerId)

        return (
          <div key={round.id}>
            <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-3">Round {round.round_number}</h2>
            {myVote && (
              <div className="bg-[#161616] border border-purple-800/30 rounded-xl px-4 py-2.5 mb-3 flex gap-4 flex-wrap">
                <span className="text-zinc-500 text-xs uppercase tracking-wider self-center">Your vote:</span>
                {myVote.kiss_participant_id  && <span className="text-pink-300 text-sm">❤️ {participants.find((p) => p.id === myVote.kiss_participant_id)?.name}</span>}
                {myVote.marry_participant_id && <span className="text-amber-300 text-sm">💍 {participants.find((p) => p.id === myVote.marry_participant_id)?.name}</span>}
                {myVote.kill_participant_id  && <span className="text-red-300 text-sm">💀 {participants.find((p) => p.id === myVote.kill_participant_id)?.name}</span>}
              </div>
            )}
            <div className="space-y-2">
              {roundParts.map((p) => {
                const k = roundVotes.filter((v) => v.kiss_participant_id  === p.id).length
                const m = roundVotes.filter((v) => v.marry_participant_id === p.id).length
                const d = roundVotes.filter((v) => v.kill_participant_id  === p.id).length
                return (
                  <div key={p.id} className="bg-[#161616] border border-[#262626] rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-black shrink-0">
                        {getInitial(p.name)}
                      </div>
                      <p className="text-white font-bold">{p.name}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <VoteStat emoji="❤️" label="Kiss"  count={k} total={roundVotes.length || 1} color="#f472b6" />
                      <VoteStat emoji="💍" label="Marry" count={m} total={roundVotes.length || 1} color="#fbbf24" />
                      <VoteStat emoji="💀" label="Kill"  count={d} total={roundVotes.length || 1} color="#f87171" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* All hot takes */}
      {confessions.length > 0 && (
        <div>
          <h2 className="text-zinc-400 text-xs uppercase tracking-wider mb-3">🔥 All Hot Takes</h2>
          <div className="space-y-2">
            {confessions.map((c) => (
              <div key={c.id} className="bg-[#161616] border border-[#262626] rounded-xl px-4 py-3">
                <p className="text-zinc-300 text-sm italic">&ldquo;{c.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LeaderCard({ emoji, label, name, count, color }: {
  emoji: string; label: string; name?: string; count?: number; color: string
}) {
  const cls: Record<string, string> = {
    amber: 'border-amber-500/30 bg-amber-500/5',
    pink:  'border-pink-500/30 bg-pink-500/5',
    red:   'border-red-500/30 bg-red-500/5',
  }
  return (
    <div className={`border rounded-2xl p-3 text-center ${cls[color]}`}>
      <p className="text-2xl">{emoji}</p>
      <p className="text-zinc-400 text-xs mt-1 leading-tight">{label}</p>
      <p className="text-white font-bold text-sm mt-1 truncate">{name ?? '—'}</p>
      {count !== undefined && <p className="text-zinc-500 text-xs">{count} votes</p>}
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">{children}</div>
    </div>
  )
}

function FullLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-6xl">🤷</p>
        <h1 className="text-2xl font-black text-white">Game not found</h1>
        <p className="text-zinc-500">Check the code and try again</p>
        <button onClick={onHome} className={primaryBtnCls + ' max-w-xs mx-auto'}>Back Home</button>
      </div>
    </div>
  )
}

const inputCls = 'w-full bg-[#161616] text-white border border-[#262626] rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 transition-colors placeholder:text-zinc-700'
const primaryBtnCls = 'w-full py-4 bg-gradient-to-r from-pink-500 via-purple-500 to-rose-500 text-white font-bold text-lg rounded-2xl hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20'
