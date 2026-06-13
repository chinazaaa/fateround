'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getInitial, filterParticipantsInRounds } from '@/lib/utils'
import { roundGenderLabel, genderLabel, getRoundParticipantGender, eligibleVotersForRound, roundVoterLabel } from '@/lib/participants'
import { tallyRoundVotes, VOTE_CATEGORY_META } from '@/lib/vote-stats'
import { ParticipantRoundResults, VoteCountStat } from '@/components/VoteResults'
import { FinalGenderLeaderboards, FinalGenderBreakdown } from '@/components/FinalLeaderboard'
import type { Game, Participant, Player, Round, Vote, Confession, VoteAssignment } from '@/types'

export default function HostPage() {
  const { code } = useParams<{ code: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const gameCode = (Array.isArray(code) ? code[0] : code).toUpperCase()
  const hostToken = searchParams.get('token') ?? ''

  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [game, setGame] = useState<Game | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [lastFinishedRound, setLastFinishedRound] = useState<Round | null>(null)
  const [allRounds, setAllRounds] = useState<Round[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [confessions, setConfessions] = useState<Confession[]>([])

  const [starting, setStarting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [ending, setEnding] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const advancingRef = useRef(false)
  const autoFinishTriggeredRef = useRef(false)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: gameData } = await supabase.from('games').select('*').eq('id', gameCode).maybeSingle()
      if (!gameData) { setAuthError(true); setLoading(false); return }
      if (gameData.host_token !== hostToken) { setAuthError(true); setLoading(false); return }

      setGame(gameData)

      const [{ data: parts }, { data: plrs }] = await Promise.all([
        supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
      ])
      setParticipants(parts || [])
      setPlayers(plrs || [])

      if (gameData.status === 'active') {
        const [{ data: roundData }, { data: finishedRound }, { data: votesData }, { data: confs }] = await Promise.all([
          supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
          supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'finished').order('round_number', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('votes').select('*').eq('game_id', gameCode),
          supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
        ])
        if (roundData) {
          setCurrentRound(roundData)
        } else if (finishedRound) {
          setLastFinishedRound(finishedRound)
        }
        setVotes(votesData || [])
        setConfessions(confs || [])
      }

      if (gameData.status === 'finished') {
        await loadResults()
      }

      setLoading(false)
    }
    load()
  }, [gameCode, hostToken])

  async function loadResults() {
    const [{ data: rounds }, { data: vs }, { data: confs }] = await Promise.all([
      supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
      supabase.from('votes').select('*').eq('game_id', gameCode),
      supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
    ])
    setAllRounds(rounds || [])
    setVotes(vs || [])
    setConfessions(confs || [])
  }

  function mergeVote(prev: Vote[], vote: Vote) {
    const idx = prev.findIndex((v) => v.id === vote.id || (v.player_id === vote.player_id && v.round_id === vote.round_id))
    if (idx >= 0) {
      const next = [...prev]
      next[idx] = vote
      return next
    }
    return [...prev, vote]
  }

  async function syncGameState() {
    const [{ data: gameData }, { data: activeRound }, { data: finishedRound }, { data: vs }, { data: confs }] = await Promise.all([
      supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
      supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
      supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'finished').order('round_number', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('votes').select('*').eq('game_id', gameCode),
      supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
    ])

    if (gameData) setGame(gameData)
    if (vs) setVotes(vs)
    if (confs) setConfessions(confs)

    if (gameData?.status === 'finished') {
      await loadResults()
      advancingRef.current = false
      setEnding(false)
      setAdvancing(false)
      return
    }

    if (activeRound) {
      setCurrentRound(activeRound)
      setLastFinishedRound(null)
      return
    }

    if (finishedRound) {
      setCurrentRound(null)
      setLastFinishedRound(finishedRound)
      advancingRef.current = false
      setEnding(false)
      setAdvancing(false)
    }
  }

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`host-${gameCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        async (payload) => {
          const g = payload.new as Game
          setGame(g)
          if (g.status === 'active') {
            const { data: roundData } = await supabase
              .from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle()
            if (roundData) { setCurrentRound(roundData); advancingRef.current = false }
          }
          if (g.status === 'finished') {
            await loadResults()
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          setPlayers((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, p])
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        (payload) => setVotes((prev) => mergeVote(prev, payload.new as Vote))
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        (payload) => setVotes((prev) => mergeVote(prev, payload.new as Vote))
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const r = payload.new as Round
          if (r.status === 'active') {
            setCurrentRound(r)
            setLastFinishedRound(null)
            advancingRef.current = false
            setAdvancing(false)
          }
          if (r.status === 'finished') {
            setCurrentRound(null)
            setLastFinishedRound(r)
            advancingRef.current = false
            setEnding(false)
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'confessions', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const c = payload.new as Confession
          setConfessions((prev) => prev.some((x) => x.id === c.id) ? prev : [...prev, c])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [gameCode])

  // Poll lobby while waiting for players — fallback if realtime is slow or unavailable
  useEffect(() => {
    if (game?.status !== 'waiting') return

    async function refreshPlayers() {
      const { data: plrs } = await supabase
        .from('players').select('*').eq('game_id', gameCode).order('joined_at')
      if (plrs) setPlayers(plrs)
    }

    refreshPlayers()
    const id = setInterval(refreshPlayers, 3000)
    return () => clearInterval(id)
  }, [game?.status, gameCode])

  // Poll during active game — fallback when realtime misses votes or round transitions
  useEffect(() => {
    if (game?.status !== 'active') return

    syncGameState()
    const id = setInterval(syncGameState, 2000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, gameCode, currentRound?.id, lastFinishedRound?.id])

  // Auto-reveal: after the final round results, show the leaderboard automatically
  useEffect(() => {
    if (game?.status !== 'active' || currentRound || !lastFinishedRound) return
    if (lastFinishedRound.round_number < (game?.rounds_count ?? 0)) return
    if (!game.auto_reveal || autoFinishTriggeredRef.current) return

    autoFinishTriggeredRef.current = true
    const timer = setTimeout(() => {
      handleFinishGame()
    }, 8000)

    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.auto_reveal, game?.rounds_count, currentRound?.id, lastFinishedRound?.id])

  useEffect(() => {
    if (!lastFinishedRound || lastFinishedRound.round_number < (game?.rounds_count ?? 0)) {
      autoFinishTriggeredRef.current = false
    }
  }, [lastFinishedRound?.id, game?.rounds_count])

  // ── Timer (host) ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!currentRound?.started_at || !game || game.status !== 'active') return

    const endMs = new Date(currentRound.started_at).getTime() + game.timer_seconds * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) {
        handleEndRound()
      }
    }
    tick()
    timerRef.current = setInterval(tick, 500)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [currentRound?.id, currentRound?.started_at, game?.timer_seconds, game?.status])

  // Auto-end round as soon as every eligible voter has voted; timer is the fallback
  useEffect(() => {
    if (!currentRound || !game || game.status !== 'active' || players.length === 0) return

    const roundGender = getRoundParticipantGender(currentRound.participant_ids, participants)
    const eligible = eligibleVotersForRound(roundGender, players)
    if (eligible.length === 0) return

    const eligibleIds = new Set(eligible.map((p) => p.id))
    const roundVotes = votes.filter((v) => v.round_id === currentRound.id && eligibleIds.has(v.player_id))
    if (roundVotes.length >= eligible.length) {
      handleEndRound()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.id, votes, players, participants, game?.status])

  const handleStart = async () => {
    if (starting) return
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || 'Failed to start')
        return
      }

      const [{ data: gameData }, { data: roundData }] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
        supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
      ])
      if (gameData) setGame(gameData)
      if (roundData) setCurrentRound(roundData)
    } finally {
      setStarting(false)
    }
  }

  const handleEndRound = async () => {
    if (advancingRef.current || ending) return
    advancingRef.current = true
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/end-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || 'Failed to end round')
        advancingRef.current = false
        setEnding(false)
        return
      }
      await syncGameState()
      advancingRef.current = false
      setEnding(false)
    } catch {
      advancingRef.current = false
      setEnding(false)
    }
  }

  const handleNextRound = async () => {
    if (advancing) return
    setAdvancing(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/next-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || 'Failed to start next round')
        setAdvancing(false)
        return
      }
      await syncGameState()
      setAdvancing(false)
    } catch {
      setAdvancing(false)
    }
  }

  const handleFinishGame = async () => {
    if (finishing) return
    setFinishing(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || 'Failed to show final results')
        setFinishing(false)
        return
      }
      await syncGameState()
      setFinishing(false)
    } catch {
      setFinishing(false)
    }
  }

  const copyPlayerLink = () => {
    const url = `${window.location.origin}/game/${gameCode}`
    navigator.clipboard.writeText(url).catch(() => null)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (authError) {
    return (
      <div className="page-wrap flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-6xl">🔒</p>
          <h1 className="text-2xl font-black text-white">Access Denied</h1>
          <p className="text-muted">Invalid or missing host token</p>
          <button onClick={() => router.push('/')} className="btn-secondary px-6 py-3">
            Go Home
          </button>
        </div>
      </div>
    )
  }

  // ── WAITING ───────────────────────────────────────────────────────────────
  if (game?.status === 'waiting') {
    return (
      <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">Host Panel</p>
            <h1 className="text-2xl font-black text-white mt-1">{game.title}</h1>
            <p className="text-muted text-sm">{game.rounds_count} rounds · {game.timer_seconds}s each</p>
          </div>
          <div className="text-right">
            <p className="text-muted text-xs uppercase tracking-wider">Code</p>
            <p className="text-white font-mono font-black text-2xl tracking-[0.2em]">{gameCode}</p>
          </div>
        </div>

        {/* Share link */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-muted text-xs uppercase tracking-wider">Player Link</p>
          <p className="text-white font-mono text-sm break-all">{typeof window !== 'undefined' ? `${window.location.origin}/game/${gameCode}` : ''}</p>
          <button onClick={copyPlayerLink} className="text-[var(--primary)] text-sm font-semibold hover:text-white transition-colors">Copy Link →</button>
        </div>

        {/* Players */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs uppercase tracking-wider">Players Joined</p>
            <span className="bg-[var(--primary-strong)] text-white text-xs font-bold px-2 py-0.5 rounded-full">{players.length}</span>
          </div>
          {players.length === 0 ? (
            <p className="text-faint text-sm">Waiting for players to join...</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-2 min-w-0">
                  <div className="avatar w-6 h-6 text-xs shrink-0">
                    {getInitial(p.name)}
                  </div>
                  <span className="text-white/80 text-sm truncate flex-1">{p.name}</span>
                  <span className="text-[9px] uppercase text-faint shrink-0">{genderLabel(p.gender)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Participants preview */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-muted text-xs uppercase tracking-wider">Participants ({participants.length})</p>
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <span key={p.id} className="surface-inset border border-white/8 text-white/80 text-sm px-3 py-1 rounded-full">
                {p.name}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={players.length === 0 || starting}
          className="btn-primary"
        >
          {starting ? 'Starting...' : players.length === 0 ? 'Waiting for players...' : `Start Game (${players.length} players)`}
        </button>
      </div>
    )
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if (game?.status === 'active' && currentRound) {
    const roundVotes = votes.filter((v) => v.round_id === currentRound.id)
    const roundParts = participants.filter((p) => currentRound.participant_ids.includes(p.id))
    const roundParticipantGender = getRoundParticipantGender(currentRound.participant_ids, participants)
    const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))
    const voterHint = roundVoterLabel(roundParticipantGender)
    const eligible = eligibleVotersForRound(roundParticipantGender, players)
    const eligibleIds = new Set(eligible.map((p) => p.id))
    const eligibleVotes = roundVotes.filter((v) => eligibleIds.has(v.player_id))
    const allVoted = eligibleVotes.length >= eligible.length && eligible.length > 0

    return (
      <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">Round</p>
            <p className="text-white font-black text-3xl">{currentRound.round_number}<span className="text-faint font-normal text-lg"> / {game.rounds_count}</span></p>
          </div>
          <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
        </div>

        {/* Current trio */}
        <div>
          <p className="text-muted text-xs uppercase tracking-wider mb-2">
            This Round{roundGender ? ` · ${roundGender}` : ''}
          </p>
          {voterHint && (
            <p className="text-[var(--primary)] text-xs mb-2">{voterHint}</p>
          )}
          <div className="flex gap-2">
            {roundParts.map((p) => (
              <div key={p.id} className="flex-1 glass-card p-3 text-center">
                <div className="avatar w-10 h-10 mx-auto mb-1">
                  {getInitial(p.name)}
                </div>
                <p className="text-white text-sm font-semibold truncate">{p.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Vote progress */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs uppercase tracking-wider">Votes In</p>
            <span className={`text-sm font-bold ${allVoted ? 'text-green-400' : 'text-white/80'}`}>
              {eligibleVotes.length} / {eligible.length || 0}
              {allVoted && ' · ending round...'}
            </span>
          </div>
          <div className="h-2 bg-white/8 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${allVoted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
              style={{ width: eligible.length > 0 ? `${(eligibleVotes.length / eligible.length) * 100}%` : '0%' }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {!game.anonymous && players.map((pl) => {
              const canVote = eligibleIds.has(pl.id)
              const voted = roundVotes.some((v) => v.player_id === pl.id)
              return (
                <div
                  key={pl.id}
                  className={`flex items-center gap-1.5 text-xs ${
                    !canVote ? 'text-faint' : voted ? 'text-green-400' : 'text-white/50'
                  }`}
                >
                  <span>{!canVote ? '—' : voted ? '✓' : '○'}</span>
                  <span className="truncate">{pl.name}</span>
                  {!canVote && <span className="text-[10px] shrink-0">watch</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Live vote counts (if not anonymous) */}
        {!game.anonymous && roundVotes.length > 0 && (
          <div>
            <p className="text-muted text-xs uppercase tracking-wider mb-2">Live Tally</p>
            <div className="space-y-2">
              {roundParts.map((p) => {
                const k = roundVotes.filter((v) => v.kiss_participant_id  === p.id).length
                const m = roundVotes.filter((v) => v.marry_participant_id === p.id).length
                const d = roundVotes.filter((v) => v.kill_participant_id  === p.id).length
                return (
                  <div key={p.id} className="glass-card px-4 py-3 flex items-center gap-4">
                    <p className="text-white font-semibold w-24 truncate">{p.name}</p>
                    <div className="flex gap-3 text-sm">
                      <span className="text-orange-400">{VOTE_CATEGORY_META.kiss.emoji} {k}</span>
                      <span className="text-amber-400">{VOTE_CATEGORY_META.marry.emoji} {m}</span>
                      <span className="text-red-400">{VOTE_CATEGORY_META.smash.emoji} {d}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* End round button */}
        <button
          onClick={handleEndRound}
          disabled={ending}
          className={allVoted || timeLeft === 0 ? 'btn-primary animate-pulse' : 'btn-secondary text-muted'}
        >
          {ending ? 'Ending round...' :
           currentRound.round_number >= game.rounds_count
             ? (allVoted ? '🏁 End Round & Show Results' : `End Round (${eligibleVotes.length}/${eligible.length} voted)`)
             : (allVoted ? '✓ End Round & Show Results' : `End Round (${eligibleVotes.length}/${eligible.length} voted)`)}
        </button>
      </div>
    )
  }

  // ── BETWEEN ROUNDS (results) ──────────────────────────────────────────────
  if (game?.status === 'active' && !currentRound && lastFinishedRound) {
    const roundVotes = votes.filter((v) => v.round_id === lastFinishedRound.id)
    const roundParts = participants.filter((p) => lastFinishedRound.participant_ids.includes(p.id))
    const roundConfessions = confessions.filter((c) => c.round_id === lastFinishedRound.id)
    const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))
    const isLastRound = lastFinishedRound.round_number >= game.rounds_count

    return (
      <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game.rounds_count}
            {roundGender ? ` · ${roundGender}` : ''}
          </p>
          <h1 className="text-3xl font-black tracking-tight mt-1">Results are in! 🗳️</h1>
          <p className="text-muted text-sm mt-1">Players can see these results on their screens</p>
        </div>

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
                  <div className="flex items-center gap-3 mb-3">
                    <div className="avatar w-9 h-9 shrink-0">
                      {getInitial(name)}
                    </div>
                    <p className="text-white font-bold text-lg">{name}</p>
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

        {roundConfessions.length > 0 && (
          <div>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">🔥 Hot Takes ({roundConfessions.length})</h2>
            <div className="space-y-2">
              {roundConfessions.map((c) => (
                <div key={c.id} className="glass-card px-4 py-3">
                  <p className="text-white/80 text-sm italic">&ldquo;{c.text}&rdquo;</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isLastRound ? (
          game.auto_reveal ? (
            <p className="text-[var(--primary)] text-sm text-center animate-pulse">
              Final leaderboard in a few seconds...
            </p>
          ) : (
            <button
              onClick={handleFinishGame}
              disabled={finishing}
              className="btn-primary"
            >
              {finishing ? 'Loading...' : '🏆 Show Final Leaderboard'}
            </button>
          )
        ) : (
          <button
            onClick={handleNextRound}
            disabled={advancing}
            className="btn-primary"
          >
            {advancing ? 'Starting...' : `→ Start Round ${lastFinishedRound.round_number + 1}`}
          </button>
        )}
      </div>
    )
  }

  // ── FINISHED ──────────────────────────────────────────────────────────────
  if (game?.status === 'finished') {
    const playedParticipants = filterParticipantsInRounds(participants, allRounds)

    return (
      <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-8">
        <div className="text-center">
          <div className="text-4xl mb-2">🏆</div>
          <h1 className="text-3xl font-black text-white">{game.title}</h1>
          <p className="text-muted">{players.length} players · {allRounds.length} rounds · {playedParticipants.length} in game</p>
        </div>

        <FinalGenderLeaderboards
          participants={participants}
          rounds={allRounds}
          votes={votes}
          TopCard={StatCard}
        />

        <FinalGenderBreakdown participants={participants} rounds={allRounds} votes={votes} />

        {/* Confessions / hot takes */}
        {confessions.length > 0 && (
          <div>
            <h2 className="text-muted text-xs uppercase tracking-wider mb-3">🔥 Hot Takes ({confessions.length})</h2>
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

  return null
}

// ── Sub-components ────────────────────────────────────────────────────────

function TimerDisplay({ seconds, total }: { seconds: number; total: number }) {
  const color = seconds <= 5 ? 'text-red-400' : seconds <= 10 ? 'text-amber-400' : 'text-green-400'
  return (
    <div className="text-right">
      <p className={`text-4xl font-black tabular-nums ${color} ${seconds <= 5 ? 'animate-pulse' : ''}`}>{seconds}</p>
      <div className="w-20 h-1.5 progress-track mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${seconds <= 5 ? 'bg-red-500' : seconds <= 10 ? 'bg-amber-500' : 'bg-green-500'}`}
          style={{ width: total > 0 ? `${(seconds / total) * 100}%` : '0%' }}
        />
      </div>
    </div>
  )
}

function StatCard({ emoji, label, name, count, color }: { emoji: string; label: string; name?: string; count?: number; color: string }) {
  const map: Record<string, string> = {
    amber: 'glass-card border-[var(--marry)]/30 bg-[var(--marry)]/8',
    pink: 'glass-card border-[var(--kiss)]/30 bg-[var(--kiss)]/8',
    red: 'glass-card border-[var(--kill)]/30 bg-[var(--kill)]/8',
  }
  return (
    <div className={`border rounded-2xl p-3 text-center ${map[color]}`}>
      <p className="text-2xl">{emoji}</p>
      <p className="text-muted text-xs mt-1 leading-tight">{label}</p>
      <p className="text-white font-bold text-sm mt-1 truncate">{name ?? '—'}</p>
      {count !== undefined && <p className="text-muted text-xs">{count}v</p>}
    </div>
  )
}
