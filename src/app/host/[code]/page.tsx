'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getInitial, filterParticipantsInRounds } from '@/lib/utils'
import { roundGenderLabel, genderLabel, resolvePlayerIdentity, getRoundParticipantGender, eligibleVotersForRound, roundVoterLabel, hasEnoughForRounds, countByGender, hasVotersForPolls, participantsWhoJoined, maxRecommendedRounds, roundLimitHint } from '@/lib/participants'
import type { ParticipantGender } from '@/types'
import { tallyRoundVotes, getCategoryMeta, getVoteCategories, tallyWyrVotes, tallyMltVotes } from '@/lib/vote-stats'
import { parseGameType, roundPoolSize, isPairGame, isWouldYouRather, isMostLikelyTo, isNameOnlyPlayerJoin } from '@/lib/game-types'
import { WYR_QUESTION_COUNT } from '@/lib/would-you-rather-questions'
import { MLT_QUESTION_COUNT } from '@/lib/most-likely-to-questions'
import { isMltImportGame, mltTargetIdFromVote, mltVoteTargets } from '@/lib/mlt'
import { ParticipantRoundResults, VoteCountStat, WyrRoundResults, MltRoundResults } from '@/components/VoteResults'
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
  const [adminBusy, setAdminBusy] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addGender, setAddGender] = useState<ParticipantGender>('female')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [updatingRounds, setUpdatingRounds] = useState(false)
  const [listSearch, setListSearch] = useState('')
  const [playersSearch, setPlayersSearch] = useState('')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const advancingRef = useRef(false)
  const autoFinishTriggeredRef = useRef(false)

  const filteredListParticipants = useMemo(() => {
    const q = listSearch.trim().toLowerCase()
    if (!q) return participants
    return participants.filter((p) => p.name.toLowerCase().includes(q))
  }, [participants, listSearch])

  const joinerParticipantsWithPlayers = useMemo(
    () => participants.filter((part) => players.some((p) => p.name === part.name)),
    [participants, players]
  )

  const filteredPlayers = useMemo(() => {
    const q = playersSearch.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) => p.name.toLowerCase().includes(q))
  }, [players, playersSearch])

  const filteredJoinerParticipants = useMemo(() => {
    const q = playersSearch.trim().toLowerCase()
    if (!q) return joinerParticipantsWithPlayers
    return joinerParticipantsWithPlayers.filter((p) => p.name.toLowerCase().includes(q))
  }, [joinerParticipantsWithPlayers, playersSearch])

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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          setPlayers((prev) => prev.map((x) => x.id === p.id ? p : x))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.old as Player
          setPlayers((prev) => prev.filter((x) => x.id !== p.id))
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Participant
          setParticipants((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, p])
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Participant
          setParticipants((prev) => prev.map((x) => x.id === p.id ? p : x))
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.old as Participant
          setParticipants((prev) => prev.filter((x) => x.id !== p.id))
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

    async function refreshLobby() {
      const [{ data: plrs }, { data: parts }] = await Promise.all([
        supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
        supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
      ])
      if (plrs) setPlayers(plrs)
      if (parts) setParticipants(parts)
    }

    refreshLobby()
    const id = setInterval(refreshLobby, 3000)
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
    const eligible = eligibleVotersForRound(roundGender, players, game?.game_type)
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

  async function refreshLobbyLists() {
    const [{ data: plrs }, { data: parts }] = await Promise.all([
      supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
      supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
    ])
    if (plrs) setPlayers(plrs)
    if (parts) setParticipants(parts)
  }

  async function hostUpdateRounds(roundsCount: number) {
    if (updatingRounds || game?.rounds_count === roundsCount) return
    setUpdatingRounds(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, rounds_count: roundsCount }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to update rounds')
        return
      }
      if (data.game) setGame(data.game)
    } finally {
      setUpdatingRounds(false)
    }
  }

  async function hostAddParticipant() {
    const name = addName.trim()
    if (!name || adding) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, name, gender: addGender }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAddError(data.error || 'Failed to add')
        return
      }
      setAddName('')
      await refreshLobbyLists()
    } finally {
      setAdding(false)
    }
  }

  async function hostUpdateParticipant(participantId: string, gender: ParticipantGender) {
    setAdminBusy(participantId)
    try {
      const res = await fetch('/api/participants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, participantId, gender }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to update')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
  }

  async function hostRemoveParticipant(participantId: string, name: string) {
    if (!confirm(`Remove ${name} from the list?`)) return
    setAdminBusy(participantId)
    try {
      const res = await fetch('/api/participants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, participantId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to remove')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
  }

  async function hostUpdatePlayerIdentity(playerId: string, identityGender: ParticipantGender) {
    setAdminBusy(playerId)
    try {
      const res = await fetch('/api/players', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          hostToken,
          playerId,
          identityGender,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to update')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
  }

  async function hostRemovePlayer(playerId: string, name: string) {
    if (!confirm(`Remove ${name}?`)) return
    setAdminBusy(playerId)
    try {
      const res = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, hostToken, playerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to remove')
        return
      }
      await refreshLobbyLists()
    } finally {
      setAdminBusy(null)
    }
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
    const gameType = parseGameType(game.game_type)
    const isWyr = isWouldYouRather(gameType)
    const isMlt = isMostLikelyTo(gameType)
    const isMltImport = isMltImportGame(game)
    const minPool = roundPoolSize(gameType)
    const isJoinersMode = (game.participant_mode ?? 'import') === 'joiners'
    const roundParticipants = isJoinersMode
      ? participants
      : isMltImport
      ? participants
      : participantsWhoJoined(participants, players)
    const participantInputs = roundParticipants.map((p) => ({ name: p.name, gender: p.gender }))
    const genderCounts = countByGender(participantInputs)
    const maxRounds = maxRecommendedRounds(participantInputs, gameType)
    const roundsHint = roundLimitHint(participantInputs, gameType)
    const roundsTooHigh = maxRounds > 0 && game.rounds_count > maxRounds
    const roundOptions = isWyr
      ? [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= WYR_QUESTION_COUNT)
      : isMlt
      ? [2, 3, 4, 5, 6, 8, 10, 12, 15, 20].filter((n) => n <= MLT_QUESTION_COUNT)
      : [1, 2, 3, 4, 5, 6, 8, 10].filter((n) => n <= Math.max(maxRounds, 1))
    const voterCheck = hasVotersForPolls(roundParticipants, players)
    const canStart = isMltImport
      ? participants.length >= 2 && players.length > 0 && !roundsTooHigh
      : isMlt
      ? players.length >= 2 && !roundsTooHigh
      : isWyr
      ? players.length > 0 && !roundsTooHigh
      : isJoinersMode
      ? players.length > 0 &&
        participants.length >= minPool &&
        hasEnoughForRounds(participantInputs, gameType) &&
        !roundsTooHigh &&
        voterCheck.ok
      : players.length > 0 &&
        roundParticipants.length >= minPool &&
        hasEnoughForRounds(participantInputs, gameType) &&
        !roundsTooHigh &&
        voterCheck.ok

    return (
      <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">Host Panel</p>
            <h1 className="text-2xl font-black text-white mt-1">{game.title}</h1>
            <p className="text-muted text-sm">{game.rounds_count} rounds · {game.timer_seconds}s each</p>
            <p className="text-[var(--primary)] text-xs mt-1 font-medium">
              {isMltImport
                ? 'Most Likely To — everyone on the list is in the poll; players join to vote'
                : isMlt
                ? 'Most Likely To — players join and vote for a friend each round'
                : isWyr
                ? 'Would You Rather — players join and pick A or B each round'
                : isJoinersMode
                  ? 'Join & play — joiners are the names in the poll'
                  : 'Import list — voters join separately'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted text-xs uppercase tracking-wider">Code</p>
            <p className="text-white font-mono font-black text-2xl tracking-[0.2em]">{gameCode}</p>
          </div>
        </div>

        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted text-xs uppercase tracking-wider">Rounds</p>
            <span className="text-faint text-xs">{game.timer_seconds}s each</span>
          </div>
          {isWyr || isMlt || (roundParticipants.length >= minPool && hasEnoughForRounds(participantInputs, gameType)) ? (
            <>
              {roundsHint && (
                <p className="text-faint text-xs">{roundsHint}</p>
              )}
              <div className="flex gap-2 flex-wrap">
                {(roundOptions.length > 0 ? roundOptions : [1, 2, 3]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={updatingRounds || n > maxRounds}
                    onClick={() => hostUpdateRounds(n)}
                    className={`min-w-[2.5rem] px-3 py-2 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-40 ${
                      game.rounds_count === n ? 'chip-active' : 'chip'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {roundsTooHigh && (
                <p className="text-amber-200/90 text-xs">
                  {game.rounds_count} rounds is too many for {roundParticipants.length} in the game — pick {maxRounds} or fewer
                </p>
              )}
            </>
          ) : (
            <p className="text-faint text-xs">
              {isWyr || isMlt ? 'Set how many questions to play' : `Need at least ${minPool} joined people of one gender before you can set rounds`}
            </p>
          )}
        </div>

        {/* Share link */}
        <div className="glass-card p-4 space-y-2">
          <p className="text-muted text-xs uppercase tracking-wider">Player Link</p>
          <p className="text-white font-mono text-sm break-all">{typeof window !== 'undefined' ? `${window.location.origin}/game/${gameCode}` : ''}</p>
          <button onClick={copyPlayerLink} className="text-[var(--primary)] text-sm font-semibold hover:text-white transition-colors">Copy Link →</button>
        </div>

        {/* Players / in-the-game list */}
        <div className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-muted text-xs uppercase tracking-wider">
              {isMltImport ? 'Voters joined' : isJoinersMode ? 'In the game' : 'Players joined'}
            </p>
            <span className="bg-[var(--primary-strong)] text-white text-xs font-bold px-2 py-0.5 rounded-full">{players.length}</span>
          </div>
          {!isJoinersMode && (
            <p className="text-faint text-xs">
              {roundParticipants.length} of {participants.length} on the list have joined — only joined names appear in rounds
            </p>
          )}
          {!isJoinersMode && (
            <p className="text-faint text-xs">Tap Male/Female to fix identity · Remove to kick someone out</p>
          )}
          {isJoinersMode && participants.length > 0 && (
            <p className="text-faint text-xs">Tap to fix poll placement or gender · Remove to kick out</p>
          )}
          {(isJoinersMode ? joinerParticipantsWithPlayers.length : players.length) > 8 && (
            <div className="space-y-1">
              <div className="relative">
                <input
                  type="search"
                  value={playersSearch}
                  onChange={(e) => setPlayersSearch(e.target.value)}
                  placeholder={isJoinersMode ? 'Search in the game…' : 'Search players…'}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="input-field py-2 text-sm pr-9"
                />
                {playersSearch && (
                  <button
                    type="button"
                    onClick={() => setPlayersSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-white text-sm"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              {playersSearch.trim() && (
                <p className="text-faint text-[10px] uppercase tracking-wider px-0.5">
                  {(isJoinersMode ? filteredJoinerParticipants.length : filteredPlayers.length)} of{' '}
                  {isJoinersMode ? joinerParticipantsWithPlayers.length : players.length} shown
                </p>
              )}
            </div>
          )}
          {isWyr || (isMlt && isJoinersMode) ? (
            filteredPlayers.length === 0 ? (
              <p className="text-faint text-sm">Waiting for people to join...</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredPlayers.map((player) => (
                  <div key={player.id} className="surface-inset border border-white/8 rounded-xl px-3 py-2 flex items-center gap-2">
                    <div className="avatar w-6 h-6 text-xs shrink-0">{getInitial(player.name)}</div>
                    <span className="text-white/90 text-sm font-medium truncate flex-1">{player.name}</span>
                  </div>
                ))}
              </div>
            )
          ) : isJoinersMode ? (
            participants.length === 0 ? (
              <p className="text-faint text-sm">Waiting for people to join...</p>
            ) : filteredJoinerParticipants.length === 0 ? (
              <p className="text-faint text-sm text-center py-4">No names match your search</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredJoinerParticipants.map((part) => {
                  const player = players.find((p) => p.name === part.name)
                  if (!player) return null
                  const busy = adminBusy === part.id || adminBusy === player.id
                  const identity = resolvePlayerIdentity(player, participants)
                  return (
                    <div key={part.id} className="surface-inset border border-white/8 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="avatar w-6 h-6 text-xs shrink-0">{getInitial(part.name)}</div>
                        <span className="text-white/90 text-sm font-medium truncate flex-1">{part.name}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => hostRemoveParticipant(part.id, part.name)}
                          className="text-red-400/80 text-xs shrink-0 hover:text-red-300 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] uppercase text-faint w-10 shrink-0">Poll</span>
                        {(['female', 'male'] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            disabled={busy}
                            onClick={() => hostUpdateParticipant(part.id, g)}
                            className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                              part.gender === g ? 'chip-active' : 'chip'
                            }`}
                          >
                            {g === 'male' ? 'Men' : 'Women'}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] uppercase text-faint w-10 shrink-0">Gender</span>
                        {(['female', 'male'] as const).map((g) => (
                          <button
                            key={g}
                            type="button"
                            disabled={busy}
                            onClick={() => hostUpdatePlayerIdentity(player.id, g)}
                            className={`text-[10px] px-2 py-1 rounded-lg border transition-colors ${
                              identity === g ? 'chip-active' : 'chip'
                            }`}
                          >
                            {genderLabel(g)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : players.length === 0 ? (
            <p className="text-faint text-sm">Waiting for players to join...</p>
          ) : filteredPlayers.length === 0 ? (
            <p className="text-faint text-sm text-center py-4">No names match your search</p>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {filteredPlayers.map((p) => {
                const identity = resolvePlayerIdentity(p, participants)
                return (
                <div key={p.id} className="flex items-center gap-2 min-w-0 surface-inset border border-white/8 rounded-xl px-3 py-2">
                  <div className="avatar w-6 h-6 text-xs shrink-0">{getInitial(p.name)}</div>
                  <span className="text-white/80 text-sm truncate flex-1">{p.name}</span>
                  <div className="flex gap-1 shrink-0">
                    {(['female', 'male'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        disabled={adminBusy === p.id}
                        onClick={() => hostUpdatePlayerIdentity(p.id, g)}
                        className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                          identity === g ? 'chip-active' : 'chip'
                        }`}
                      >
                        {g === 'male' ? 'M' : 'F'}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={adminBusy === p.id}
                    onClick={() => hostRemovePlayer(p.id, p.name)}
                    className="text-red-400/80 text-xs shrink-0 hover:text-red-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              )})}
            </div>
          )}
          {isJoinersMode && !isWyr && !isMlt && participants.length > 0 && (
            <p className="text-faint text-xs text-center">
              {genderCounts.female} female · {genderCounts.male} male
            </p>
          )}
          {isJoinersMode && !isWyr && !isMlt && participants.length > 0 && !hasEnoughForRounds(participantInputs, gameType) && (
            <p className="text-amber-200/90 text-xs text-center">
              Need at least {minPool} people of the same gender to start
            </p>
          )}
          {!voterCheck.ok && players.length > 0 && roundParticipants.length >= minPool && (
            <p className="text-amber-200/90 text-xs text-center">{voterCheck.message}</p>
          )}
          {!isJoinersMode && roundParticipants.length < minPool && players.length > 0 && (
            <p className="text-amber-200/90 text-xs text-center">
              Need at least {minPool} people to join before starting ({roundParticipants.length}/{minPool} joined)
            </p>
          )}
        </div>

        {/* Participants preview (import mode only) */}
        {!isJoinersMode && (
        <div className="glass-card p-4 space-y-3">
          <p className="text-muted text-xs uppercase tracking-wider">On the list ({participants.length})</p>
          <div className="surface-inset border border-white/10 rounded-xl p-3 space-y-2">
            <p className="text-faint text-xs">Add someone to the list</p>
            <div className="flex gap-2">
              <input
                value={addName}
                onChange={(e) => {
                  setAddName(e.target.value)
                  if (addError) setAddError(null)
                }}
                onKeyDown={(e) => e.key === 'Enter' && hostAddParticipant()}
                placeholder="Name"
                className="input-field flex-1 py-2 text-sm"
              />
              {!isMltImport && (
              <div className="flex gap-1 shrink-0">
                {(['female', 'male'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setAddGender(g)}
                    className={`text-[10px] px-2.5 py-2 rounded-lg border transition-colors ${
                      addGender === g ? 'chip-active' : 'chip'
                    }`}
                  >
                    {g === 'male' ? 'M' : 'F'}
                  </button>
                ))}
              </div>
              )}
              <button
                type="button"
                onClick={hostAddParticipant}
                disabled={!addName.trim() || adding}
                className="btn-secondary text-sm px-4 py-2 shrink-0 disabled:opacity-40"
              >
                {adding ? '…' : 'Add'}
              </button>
            </div>
            {addError && <p className="text-red-300/90 text-xs">{addError}</p>}
          </div>
          <p className="text-faint text-xs">
            {isMltImport
              ? 'Everyone on the list can be voted for — players join separately to vote'
              : 'Tap gender to correct · Remove if someone shouldn\'t be in the poll'}
          </p>
          {isMltImport && (
            <p className="text-faint text-xs text-center">
              {participants.length} on the list · {players.length} voter{players.length === 1 ? '' : 's'} joined
            </p>
          )}
          {participants.length > 8 && (
            <div className="space-y-1">
              <div className="relative">
                <input
                  type="search"
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder="Search the list…"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="input-field py-2 text-sm pr-9"
                />
                {listSearch && (
                  <button
                    type="button"
                    onClick={() => setListSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-white text-sm"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              {listSearch.trim() && (
                <p className="text-faint text-[10px] uppercase tracking-wider px-0.5">
                  {filteredListParticipants.length} of {participants.length} shown
                </p>
              )}
            </div>
          )}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {filteredListParticipants.length === 0 ? (
              <p className="text-faint text-sm text-center py-6">
                {listSearch.trim() ? 'No names match your search' : 'No one on the list yet'}
              </p>
            ) : (
            filteredListParticipants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 min-w-0 surface-inset border border-white/8 rounded-xl px-3 py-2">
                <span className="text-white/80 text-sm truncate flex-1">{p.name}</span>
                {!isMltImport && (
                <div className="flex gap-1 shrink-0">
                  {(['female', 'male'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      disabled={adminBusy === p.id}
                      onClick={() => hostUpdateParticipant(p.id, g)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        p.gender === g ? 'chip-active' : 'chip'
                      }`}
                    >
                      {g === 'male' ? 'M' : 'F'}
                    </button>
                  ))}
                </div>
                )}
                <button
                  type="button"
                  disabled={adminBusy === p.id}
                  onClick={() => hostRemoveParticipant(p.id, p.name)}
                  className="text-red-400/80 text-xs shrink-0 hover:text-red-300 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))
            )}
          </div>
        </div>
        )}

        <button
          onClick={handleStart}
          disabled={!canStart || starting}
          className="btn-primary"
        >
          {starting
            ? 'Starting...'
            : !canStart
              ? isMltImport && participants.length < 2
                ? `Need at least 2 names on the list (${participants.length}/2)`
              : isMltImport && players.length === 0
                ? 'Waiting for voters to join...'
              : isMlt && !isMltImport && players.length < 2
                ? `Need at least 2 players (${players.length}/2)`
              : isWyr && players.length === 0
                ? 'Waiting for players...'
              : isJoinersMode
                ? participants.length < minPool
                  ? `Need ${minPool - participants.length} more to start`
                  : roundsTooHigh
                    ? `Lower to ${maxRounds} rounds max`
                  : `Need ${minPool}+ of one gender to start`
                : players.length === 0
                  ? 'Waiting for players...'
                  : roundParticipants.length < minPool
                    ? `Need ${minPool - roundParticipants.length} more to join (${roundParticipants.length}/${minPool})`
                  : roundsTooHigh
                    ? `Lower to ${maxRounds} rounds max`
                  : !voterCheck.ok
                    ? 'Need voters for each list'
                  : `Need ${minPool}+ joined of one gender`
              : `Start Game (${players.length} players)`}
        </button>
      </div>
    )
  }

  // ── ACTIVE ────────────────────────────────────────────────────────────────
  if (game?.status === 'active' && currentRound) {
    const gameType = parseGameType(game.game_type)
    const isNameOnly = isNameOnlyPlayerJoin(gameType)
    const isMlt = isMostLikelyTo(gameType)
    const isWyr = isWouldYouRather(gameType)
    const roundVotes = votes.filter((v) => v.round_id === currentRound.id)
    const roundParts = participants.filter((p) => currentRound.participant_ids.includes(p.id))
    const roundParticipantGender = getRoundParticipantGender(currentRound.participant_ids, participants)
    const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))
    const voterHint = roundVoterLabel(roundParticipantGender)
    const eligible = eligibleVotersForRound(roundParticipantGender, players, gameType)
    const eligibleIds = new Set(eligible.map((p) => p.id))
    const eligibleVotes = isNameOnly
      ? roundVotes
      : roundVotes.filter((v) => eligibleIds.has(v.player_id))
    const voteDenominator = isNameOnly ? players.length : eligible.length
    const allVoted = eligibleVotes.length >= voteDenominator && voteDenominator > 0

    if (isMlt) {
      return (
        <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-xs uppercase tracking-wider">Round</p>
              <p className="text-white font-black text-3xl">
                {currentRound.round_number}
                <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
              </p>
            </div>
            <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
          </div>

          <div className="glass-card p-5 space-y-3">
            <p className="text-muted text-xs uppercase tracking-wider text-center">Most likely to…</p>
            <p className="text-white/90 text-base leading-snug text-center font-medium">
              {currentRound.mlt_question}
            </p>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted text-xs uppercase tracking-wider">Votes In</p>
              <span className={`text-sm font-bold ${allVoted ? 'text-green-400' : 'text-white/80'}`}>
                {eligibleVotes.length} / {players.length}
                {allVoted && ' · ending round...'}
              </span>
            </div>
            <div className="h-2 bg-white/8 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allVoted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
                style={{ width: players.length > 0 ? `${(eligibleVotes.length / players.length) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-faint text-xs text-center">Votes are anonymous — winner is shown after the round</p>
          </div>

          <button
            onClick={handleEndRound}
            disabled={ending || eligibleVotes.length === 0}
            className="btn-secondary"
          >
            {ending ? 'Ending...' : 'End Round Early'}
          </button>
        </div>
      )
    }

    if (isWyr) {
      return (
        <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-xs uppercase tracking-wider">Round</p>
              <p className="text-white font-black text-3xl">
                {currentRound.round_number}
                <span className="text-faint font-normal text-lg"> / {game.rounds_count}</span>
              </p>
            </div>
            <TimerDisplay seconds={timeLeft} total={game.timer_seconds} />
          </div>

          <div className="glass-card p-5 space-y-3">
            <p className="text-muted text-xs uppercase tracking-wider text-center">Would you rather…</p>
            <p className="text-white/90 text-sm leading-relaxed text-center">
              <span className="text-violet-200 font-medium">{currentRound.wyr_option_a}</span>
              {' '}or{' '}
              <span className="text-sky-200 font-medium">{currentRound.wyr_option_b}</span>?
            </p>
          </div>

          <div className="glass-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-muted text-xs uppercase tracking-wider">Votes In</p>
              <span className={`text-sm font-bold ${allVoted ? 'text-green-400' : 'text-white/80'}`}>
                {eligibleVotes.length} / {players.length}
                {allVoted && ' · ending round...'}
              </span>
            </div>
            <div className="h-2 bg-white/8 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${allVoted ? 'bg-emerald-500' : 'bg-[var(--primary-strong)]'}`}
                style={{ width: players.length > 0 ? `${(eligibleVotes.length / players.length) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-faint text-xs text-center">Votes are anonymous — only totals are shown after the round</p>
          </div>

          <button
            onClick={handleEndRound}
            disabled={ending || eligibleVotes.length === 0}
            className="btn-secondary"
          >
            {ending ? 'Ending...' : 'End Round Early'}
          </button>
        </div>
      )
    }

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
                const counts = getVoteCategories(gameType).map((category) => {
                  const field = category === 'kiss' ? 'kiss_participant_id'
                    : category === 'marry' ? 'marry_participant_id'
                    : 'kill_participant_id'
                  return {
                    meta: getCategoryMeta(gameType, category),
                    count: roundVotes.filter((v) => v[field] === p.id).length,
                  }
                })
                return (
                  <div key={p.id} className="glass-card px-4 py-3 flex items-center gap-4">
                    <p className="text-white font-semibold w-24 truncate">{p.name}</p>
                    <div className="flex gap-3 text-sm">
                      {counts.map(({ meta, count }) => (
                        <span key={meta.label} style={{ color: meta.color }}>
                          {meta.emoji} {count}
                        </span>
                      ))}
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
    const gameType = parseGameType(game.game_type)
    const isWyr = isWouldYouRather(gameType)
    const isMlt = isMostLikelyTo(gameType)
    const isMltImport = isMltImportGame(game)
    const roundVotes = votes.filter((v) => v.round_id === lastFinishedRound.id)
    const roundParts = participants.filter((p) => lastFinishedRound.participant_ids.includes(p.id))
    const roundConfessions = confessions.filter((c) => c.round_id === lastFinishedRound.id)
    const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))
    const isLastRound = lastFinishedRound.round_number >= game.rounds_count
    const { countA, countB, voterCount } = tallyWyrVotes(roundVotes)
    const mltKind = isMltImport ? 'participant' : 'player'
    const mltTargets = mltVoteTargets(game, participants, players)
    const mltTally = tallyMltVotes(roundVotes, mltTargets, mltKind)

    return (
      <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-6">
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game.rounds_count}
            {!isWyr && !isMlt && roundGender ? ` · ${roundGender}` : ''}
          </p>
          <h1 className="text-3xl font-black tracking-tight mt-1">Results are in! 🗳️</h1>
          <p className="text-muted text-sm mt-1">Players can see these results on their screens</p>
        </div>

        {isMlt ? (
          <MltRoundResults
            question={lastFinishedRound.mlt_question ?? ''}
            rows={mltTally.rows}
            voterCount={mltTally.voterCount}
            maxCount={mltTally.maxCount}
            winnerNames={mltTally.winnerNames}
          />
        ) : isWyr ? (
          <WyrRoundResults
            optionA={lastFinishedRound.wyr_option_a ?? ''}
            optionB={lastFinishedRound.wyr_option_b ?? ''}
            countA={countA}
            countB={countB}
            voterCount={voterCount}
          />
        ) : (
        (() => {
          const tallies = tallyRoundVotes(
            roundParts.map((p) => p.id),
            roundVotes
          )
          const nameById = new Map(roundParts.map((p) => [p.id, p.name]))

          return (
            <ParticipantRoundResults
              gameType={gameType}
              tallies={tallies}
              nameById={nameById}
              voterCount={roundVotes.length}
              participantDetails={roundParts.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))}
              renderCard={
                isPairGame(gameType)
                  ? undefined
                  : ({ tally, name, maxes, isWinner }) => (
                <div key={tally.id} className="glass-card p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="avatar w-9 h-9 shrink-0">
                      {getInitial(name)}
                    </div>
                    <p className="text-white font-bold text-lg">{name}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {getVoteCategories(gameType).map((category) => {
                      const meta = getCategoryMeta(gameType, category)
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
        })()
        )}

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
    const gameType = parseGameType(game.game_type)
    const isWyr = isWouldYouRather(gameType)
    const isMlt = isMostLikelyTo(gameType)
    const isMltImport = isMltImportGame(game)
    const playedParticipants = filterParticipantsInRounds(participants, allRounds)
    const pollCount = mltVoteTargets(game, participants, players).length

    return (
      <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-8">
        <div className="text-center">
          <div className="text-4xl mb-2">🏆</div>
          <h1 className="text-3xl font-black text-white">{game.title}</h1>
          <p className="text-muted">
            {players.length} players · {allRounds.length} rounds
            {isMltImport
              ? ` · ${pollCount} in poll`
              : !isWyr && !isMlt
                ? ` · ${playedParticipants.length} in game`
                : ''}
          </p>
        </div>

        {isWyr ? (
          <div className="space-y-8">
            {allRounds.map((round) => {
              const roundVotes = votes.filter((v) => v.round_id === round.id)
              const { countA, countB, voterCount } = tallyWyrVotes(roundVotes)
              return (
                <div key={round.id}>
                  <h2 className="text-muted text-xs uppercase tracking-wider mb-3">
                    Round {round.round_number}
                  </h2>
                  <WyrRoundResults
                    optionA={round.wyr_option_a ?? ''}
                    optionB={round.wyr_option_b ?? ''}
                    countA={countA}
                    countB={countB}
                    voterCount={voterCount}
                  />
                </div>
              )
            })}
          </div>
        ) : isMlt ? (
          <div className="space-y-8">
            {allRounds.map((round) => {
              const roundVotes = votes.filter((v) => v.round_id === round.id)
              const mltKind = isMltImport ? 'participant' : 'player'
              const mltTargets = mltVoteTargets(game, participants, players)
              const { rows, voterCount, maxCount, winnerNames } = tallyMltVotes(
                roundVotes,
                mltTargets,
                mltKind
              )
              return (
                <div key={round.id}>
                  <h2 className="text-muted text-xs uppercase tracking-wider mb-3">
                    Round {round.round_number}
                  </h2>
                  <MltRoundResults
                    question={round.mlt_question ?? ''}
                    rows={rows}
                    voterCount={voterCount}
                    maxCount={maxCount}
                    winnerNames={winnerNames}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <FinalGenderLeaderboards
              gameType={gameType}
              participants={participants}
              rounds={allRounds}
              votes={votes}
              TopCard={StatCard}
            />
            <FinalGenderBreakdown gameType={gameType} participants={participants} rounds={allRounds} votes={votes} />
          </>
        )}

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

function StatCard({ emoji, label, name, count, accentColor }: { emoji: string; label: string; name?: string; count?: number; accentColor: string }) {
  return (
    <div
      className="glass-card border rounded-2xl p-3 text-center"
      style={{ borderColor: `${accentColor}55`, backgroundColor: `${accentColor}14` }}
    >
      <p className="text-2xl">{emoji}</p>
      <p className="text-muted text-xs mt-1 leading-tight">{label}</p>
      <p className="text-white font-bold text-sm mt-1 truncate">{name ?? '—'}</p>
      {count !== undefined && <p className="text-muted text-xs">{count}v</p>}
    </div>
  )
}
