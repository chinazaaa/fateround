'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, getInitial, filterParticipantsInRounds } from '@/lib/utils'
import { roundGenderLabel, genderLabel, getRoundParticipantGender, canPlayerVoteInRound, eligibleVotersForRound, roundVoterLabel, spectatorMessage } from '@/lib/participants'
import type { ParticipantGender } from '@/types'
import { tallyRoundVotes, VOTE_CATEGORY_META, ASSIGNMENT_ACTION_META, assignmentEmoji } from '@/lib/vote-stats'
import { ParticipantRoundResults, VoteCountStat } from '@/components/VoteResults'
import { FinalGenderLeaderboards, FinalGenderBreakdown } from '@/components/FinalLeaderboard'
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
  const [myPlayerGender, setMyPlayerGender] = useState<ParticipantGender | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [joinGender, setJoinGender] = useState<ParticipantGender>('female')
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
  const myPlayerGenderRef = useRef(myPlayerGender)
  myPlayerGenderRef.current = myPlayerGender
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
        setMyPlayerGender(session.playerGender)
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

  useEffect(() => {
    if (!myPlayerId) return
    const me = players.find((p) => p.id === myPlayerId)
    if (me?.gender) setMyPlayerGender(me.gender)
  }, [myPlayerId, players])

  // ── Timer — NO `submitted` in deps so it keeps running after submit ───────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (view !== 'round' || !currentRound?.started_at || !game) return

    const endMs = new Date(currentRound.started_at).getTime() + game.timer_seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
      setTimeLeft(remaining)

      const roundGender = getRoundParticipantGender(
        currentRound.participant_ids,
        participantsRef.current
      )
      const playerGender = myPlayerGenderRef.current
      const canVote =
        !!roundGender &&
        !!playerGender &&
        canPlayerVoteInRound(playerGender, roundGender)

      if (remaining === 0 && !submittedRef.current && canVote) {
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
        body: JSON.stringify({ gameCode, playerName: nameInput.trim(), gender: joinGender }),
      })
      const data = await res.json()
      if (data.playerId) {
        setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender)
        setMyPlayerId(data.playerId)
        setMyPlayerName(data.playerName)
        setMyPlayerGender(data.playerGender)
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
          <div className="text-4xl">🔥💍💀</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
          <p className="text-muted text-sm">{game?.rounds_count} rounds · {game?.timer_seconds}s each</p>
        </div>
        <div className="space-y-4">
          <p className="text-muted font-medium text-center">Enter your name and gender to join</p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            placeholder="Your name"
            autoFocus
            className={inputCls}
          />
          <div>
            <p className="text-faint text-xs mb-2 text-center">I am</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setJoinGender('female')}
                className={`flex-1 chip ${joinGender === 'female' ? 'chip-active' : ''}`}
              >
                Female
              </button>
              <button
                type="button"
                onClick={() => setJoinGender('male')}
                className={`flex-1 chip ${joinGender === 'male' ? 'chip-active' : ''}`}
              >
                Male
              </button>
            </div>
          </div>
          <p className="text-faint text-xs text-center">
            You&apos;ll vote on the {joinGender === 'male' ? "women's" : "men's"} polls only
          </p>
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
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
          <p className="text-muted">Waiting for the host to start...</p>
        </div>
        <div className="surface-inset border border-white/10 rounded-2xl p-4 space-y-2">
          <p className="text-muted text-xs uppercase tracking-wider">Players Joined ({players.length})</p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full shrink-0 ${p.name === myPlayerName ? 'bg-[var(--primary)]' : 'bg-white/20'}`} />
                <span className={`text-sm flex-1 min-w-0 truncate ${p.name === myPlayerName ? 'text-[var(--primary)] font-semibold' : 'text-white/80'}`}>
                  {p.name}{p.name === myPlayerName ? ' (you)' : ''}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-faint shrink-0">
                  {genderLabel(p.gender)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-faint text-xs text-center">Keep this tab open</p>
      </CenteredCard>
    )
  }

  // ROUND — voting
  if (view === 'round' && currentRound) {
    const roundParts = participants.filter((p) => currentRound.participant_ids.includes(p.id))
    const roundParticipantGender = getRoundParticipantGender(currentRound.participant_ids, participants)
    const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))
    const voterHint = roundVoterLabel(roundParticipantGender)
    const canVote = !!(
      myPlayerGender &&
      roundParticipantGender &&
      canPlayerVoteInRound(myPlayerGender, roundParticipantGender)
    )
    const allAssigned = !!(assignment.kiss && assignment.marry && assignment.kill)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <p className="text-white font-black text-2xl">
              Round {currentRound.round_number}
              <span className="text-faint font-normal text-base"> / {game?.rounds_count}</span>
            </p>
            {roundGender && (
              <p className="text-[var(--primary)] text-sm font-medium mt-0.5">{roundGender}</p>
            )}
            {voterHint && (
              <p className="text-muted text-xs mt-0.5">{voterHint}</p>
            )}
          </div>
          {canVote ? (
            <TimerDisplay seconds={timeLeft} total={game?.timer_seconds ?? 30} />
          ) : (
            <div className="glass-card px-3 py-2 text-center">
              <p className="text-faint text-[10px] uppercase tracking-wider">Spectating</p>
            </div>
          )}
        </div>

        {!canVote && (
          <div className="glass-card border border-white/12 px-4 py-3 mb-4 text-center">
            <p className="text-white/90 text-sm">{spectatorMessage(roundParticipantGender)}</p>
          </div>
        )}

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
                onAssign={(a) => canVote && !submitted && assign(a, p.id)}
                disabled={submitted || !canVote}
              />
            )
          })}
        </div>

        {/* Submit / submitted / spectating */}
        {!canVote ? (
          <p className="text-faint text-sm text-center">Results will appear when voting ends</p>
        ) : !submitted ? (
          <button
            onClick={handleSubmit}
            disabled={!allAssigned}
            className={allAssigned ? 'btn-primary' : 'btn-secondary opacity-60 cursor-not-allowed'}
          >
            {allAssigned
              ? 'Submit Vote ✓'
              : `Assign all 3 (${[assignment.kiss, assignment.marry, assignment.kill].filter(Boolean).length}/3)`}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="w-full py-4 rounded-2xl glass-card border border-emerald-500/30 text-center">
              <p className="text-green-400 font-semibold">✓ Vote submitted!</p>
              <p className="text-muted text-sm mt-0.5">Results will show when the round ends</p>
            </div>
            {!confessionSent ? (
              <div className="space-y-2">
                <p className="text-faint text-xs text-center">Leave an anonymous hot take (optional)</p>
                <div className="flex gap-2">
                  <input
                    value={confessionText}
                    onChange={(e) => setConfessionText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendConfession()}
                    placeholder="Why did you make those choices?"
                    className="flex-1 input-field py-2.5 text-sm"
                  />
                  <button
                    onClick={sendConfession}
                    disabled={!confessionText.trim()}
                    className="px-4 py-2.5 btn-secondary text-sm disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-faint text-xs text-center">Hot take sent 👀</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ROUND RESULTS — shown after round ends, before next round starts
  if (view === 'round_results' && lastFinishedRound) {
    const roundParts = participants.filter((p) => lastFinishedRound.participant_ids.includes(p.id))
    const roundParticipantGender = getRoundParticipantGender(lastFinishedRound.participant_ids, participants)
    const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))
    const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
    const watchedRound = !!(
      !myVote &&
      myPlayerGender &&
      roundParticipantGender &&
      !canPlayerVoteInRound(myPlayerGender, roundParticipantGender)
    )
    const roundConfessions = allConfessions.filter((c) => c.round_id === lastFinishedRound.id)
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
            {roundGender ? ` · ${roundGender}` : ''}
          </p>
          <h2 className="text-2xl font-black tracking-tight mt-1">Results are in! 🗳️</h2>
          {watchedRound && (
            <p className="text-muted text-sm mt-2">You watched this round — everyone sees the same results</p>
          )}
        </div>

        {/* My vote recap */}
        {myVote && (
          <div className="glass-card border border-[var(--primary)]/30 p-4">
            <p className="text-[var(--primary)] text-xs uppercase tracking-wider mb-2">Your vote</p>
            <div className="flex gap-4 flex-wrap">
              {myVote.kiss_participant_id && (
                <span className="text-pink-300 text-sm font-medium">
                  {assignmentEmoji('kiss')} {participants.find((p) => p.id === myVote.kiss_participant_id)?.name}
                </span>
              )}
              {myVote.marry_participant_id && (
                <span className="text-amber-300 text-sm font-medium">
                  {assignmentEmoji('marry')} {participants.find((p) => p.id === myVote.marry_participant_id)?.name}
                </span>
              )}
              {myVote.kill_participant_id && (
                <span className="text-red-300 text-sm font-medium">
                  {assignmentEmoji('kill')} {participants.find((p) => p.id === myVote.kill_participant_id)?.name}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Per-person vote counts */}
        {(() => {
          const tallies = tallyRoundVotes(
            roundParts.map((p) => p.id),
            lastRoundVotes
          )
          const nameById = new Map(roundParts.map((p) => [p.id, p.name]))
          const voterCount = lastRoundVotes.length

          return (
            <ParticipantRoundResults
              tallies={tallies}
              nameById={nameById}
              voterCount={voterCount}
              renderCard={({ tally, name, maxes, isWinner }) => {
                const myAction =
                  myVote?.kiss_participant_id  === tally.id ? 'kiss'  :
                  myVote?.marry_participant_id === tally.id ? 'marry' :
                  myVote?.kill_participant_id  === tally.id ? 'kill'  : null

                const borderCls =
                  myAction === 'kiss'  ? 'border-pink-500/40'  :
                  myAction === 'marry' ? 'border-amber-500/40' :
                  myAction === 'kill'  ? 'border-red-500/40'   : 'border-white/10'

                return (
                  <div key={tally.id} className={`glass-card border-2 ${borderCls} rounded-2xl p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="avatar w-10 h-10 text-lg shrink-0">
                        {getInitial(name)}
                      </div>
                      <p className="text-white font-bold text-lg">{name}</p>
                      {myAction && (
                        <span className="ml-auto text-xs text-muted italic">
                          you: {myAction ? assignmentEmoji(myAction) : ''}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {(['kiss', 'marry', 'smash'] as const).map((category) => {
                        const meta = VOTE_CATEGORY_META[category]
                        return (
                          <VoteCountStat
                            key={category}
                            emoji={meta.emoji}
                            label={meta.label}
                            count={tally[category]}
                            max={maxes[category]}
                            color={meta.color}
                            isWinner={isWinner(category)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              }}
            />
          )
        })()}

        {/* Hot takes for this round */}
        {roundConfessions.length > 0 && (
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-2">🔥 Hot Takes</p>
            <div className="space-y-2">
              {roundConfessions.map((c) => (
                <div key={c.id} className="glass-card px-4 py-3">
                  <p className="text-white/80 text-sm italic">&ldquo;{c.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className={`text-sm text-center animate-pulse ${isLastRound ? 'text-[var(--primary)]' : 'text-faint'}`}>
          {isLastRound
            ? (game?.auto_reveal ? '⏳ Final leaderboard in a few seconds...' : '⏳ Waiting for final leaderboard...')
            : '⏳ Waiting for next round...'}
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
  kiss:  { emoji: ASSIGNMENT_ACTION_META.kiss.emoji,  label: ASSIGNMENT_ACTION_META.kiss.label,  border: 'border-[var(--kiss)]/50 bg-[var(--kiss)]/10',  active: 'bg-[var(--kiss)]/20 text-orange-200 border-[var(--kiss)]'  },
  marry: { emoji: ASSIGNMENT_ACTION_META.marry.emoji, label: ASSIGNMENT_ACTION_META.marry.label, border: 'border-[var(--marry)]/50 bg-[var(--marry)]/10', active: 'bg-[var(--marry)]/20 text-amber-100 border-[var(--marry)]' },
  kill:  { emoji: ASSIGNMENT_ACTION_META.kill.emoji,  label: ASSIGNMENT_ACTION_META.kill.label,  border: 'border-[var(--kill)]/50 bg-[var(--kill)]/10',  active: 'bg-[var(--kill)]/20 text-red-200 border-[var(--kill)]'   },
}

function ParticipantCard({ participant, action, onAssign, disabled }: {
  participant: Participant
  action: 'kiss' | 'marry' | 'kill' | null
  onAssign: (a: 'kiss' | 'marry' | 'kill') => void
  disabled: boolean
}) {
  const cfg = action ? ACTION_CONFIG[action] : null
  return (
    <div className={`rounded-2xl border-2 p-4 transition-all backdrop-blur-sm ${cfg ? cfg.border : 'glass-card border-white/10'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="avatar w-10 h-10 text-lg shrink-0">
          {getInitial(participant.name)}
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-tight">{participant.name}</p>
          {action && (
            <p className="text-sm font-medium" style={{ color: action === 'kiss' ? '#fdba74' : action === 'marry' ? '#fcd34d' : '#fca5a5' }}>
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
                : `surface-inset border-white/8 text-muted ${!disabled ? 'hover:border-zinc-500 hover:text-white/80' : ''}`
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
      <div className="w-20 h-1.5 progress-track mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
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
  const playedParticipants = filterParticipantsInRounds(participants, rounds)

  return (
    <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-8">
      <div className="text-center">
        <div className="text-4xl mb-2">🎊</div>
        <h1 className="text-3xl font-black text-white">{game.title}</h1>
        <p className="text-muted">{players.length} players · {rounds.length} rounds · {playedParticipants.length} in game</p>
      </div>

      <FinalGenderLeaderboards
        participants={participants}
        rounds={rounds}
        votes={votes}
        TopCard={LeaderCard}
      />

      <FinalGenderBreakdown participants={participants} rounds={rounds} votes={votes} />

      <div>
        <h2 className="text-muted text-xs uppercase tracking-wider mb-4">All round results</h2>
        <div className="space-y-8">
      {/* Round-by-round breakdown — all rounds visible to everyone */}
      {rounds.map((round) => {
        const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))
        const roundVotes = votes.filter((v) => v.round_id === round.id)
        const myVote = roundVotes.find((v) => v.player_id === myPlayerId)
        const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))

        return (
          <div key={round.id}>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">
              Round {round.round_number}{roundGender ? ` · ${roundGender}` : ''}
            </h2>
            {myVote && (
              <div className="glass-card border border-[var(--primary)]/25 px-4 py-2.5 mb-3 flex gap-4 flex-wrap">
                <span className="text-muted text-xs uppercase tracking-wider self-center">Your vote:</span>
                {myVote.kiss_participant_id  && <span className="text-orange-300 text-sm">{assignmentEmoji('kiss')} {participants.find((p) => p.id === myVote.kiss_participant_id)?.name}</span>}
                {myVote.marry_participant_id && <span className="text-amber-300 text-sm">{assignmentEmoji('marry')} {participants.find((p) => p.id === myVote.marry_participant_id)?.name}</span>}
                {myVote.kill_participant_id  && <span className="text-red-300 text-sm">{assignmentEmoji('kill')} {participants.find((p) => p.id === myVote.kill_participant_id)?.name}</span>}
              </div>
            )}
            <div className="space-y-4">
              {(() => {
                const tallies = tallyRoundVotes(
                  roundParts.map((p) => p.id),
                  roundVotes
                )
                const nameById = new Map(roundParts.map((p) => [p.id, p.name]))
                return (
                  <ParticipantRoundResults
                    tallies={tallies}
                    nameById={nameById}
                    voterCount={roundVotes.length}
                    renderCard={({ tally, name, maxes, isWinner }) => (
                      <div key={tally.id} className="glass-card p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="avatar w-8 h-8 shrink-0">
                            {getInitial(name)}
                          </div>
                          <p className="text-white font-bold">{name}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {(['kiss', 'marry', 'smash'] as const).map((category) => {
                            const meta = VOTE_CATEGORY_META[category]
                            return (
                              <VoteCountStat
                                key={category}
                                emoji={meta.emoji}
                                label={meta.label}
                                count={tally[category]}
                                max={maxes[category]}
                                color={meta.color}
                                isWinner={isWinner(category)}
                              />
                            )
                          })}
                        </div>
                      </div>
                    )}
                  />
                )
              })()}
            </div>
          </div>
        )
      })}
        </div>
      </div>

      {/* All hot takes */}
      {confessions.length > 0 && (
        <div>
          <h2 className="text-muted text-xs uppercase tracking-wider mb-3">🔥 All Hot Takes</h2>
          <div className="space-y-2">
            {confessions.map((c) => (
              <div key={c.id} className="glass-card px-4 py-3">
                <p className="text-white/80 text-sm italic">&ldquo;{c.text}&rdquo;</p>
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
    amber: 'glass-card border-[var(--marry)]/30 bg-[var(--marry)]/8',
    pink:  'glass-card border-[var(--kiss)]/30 bg-[var(--kiss)]/8',
    red:   'glass-card border-[var(--kill)]/30 bg-[var(--kill)]/8',
  }
  return (
    <div className={`border rounded-2xl p-3 text-center ${cls[color]}`}>
      <p className="text-2xl">{emoji}</p>
      <p className="text-muted text-xs mt-1 leading-tight">{label}</p>
      <p className="text-white font-bold text-sm mt-1 truncate">{name ?? '—'}</p>
      {count !== undefined && <p className="text-muted text-xs">{count} votes</p>}
    </div>
  )
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-wrap flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm glass-card-strong p-6 space-y-6">{children}</div>
    </div>
  )
}

function FullLoader() {
  return (
    <div className="page-wrap flex items-center justify-center">
      <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function NotFound({ onHome }: { onHome: () => void }) {
  return (
    <div className="page-wrap flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-6xl">🤷</p>
        <h1 className="text-2xl font-black text-white">Game not found</h1>
        <p className="text-muted">Check the code and try again</p>
        <button onClick={onHome} className={primaryBtnCls + ' max-w-xs mx-auto'}>Back Home</button>
      </div>
    </div>
  )
}

const inputCls = 'input-field'
const primaryBtnCls = 'btn-primary'
