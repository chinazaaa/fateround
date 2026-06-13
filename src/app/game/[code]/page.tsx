'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, clearPlayerSession, getInitial, filterParticipantsInRounds } from '@/lib/utils'
import { playRoundStartSound, unlockAudio } from '@/lib/sounds'
import { roundGenderLabel, playerGenderLabel, playerIdentityLabel, genderLabel, getRoundParticipantGender, canPlayerVoteInRound, roundVoterLabel, spectatorMessage, activeVoteBanner, parsePlayerGenderFromDb, parseParticipantGenderFromDb, playerGenderFromJoin, joinGenderHint, playerVoteGenderForRound } from '@/lib/participants'
import type { ParticipantGender, PlayerGender } from '@/types'
import { tallyRoundVotes, getCategoryMeta, getVoteCategories, assignmentEmojiFor, myActionBorderClass } from '@/lib/vote-stats'
import { gameTypeConfig, slotMeta, voteSlots, emptyAssignment, isAssignmentComplete, assignedCount, parseGameType, assignmentTargetCount, isThreeChoiceGame } from '@/lib/game-types'
import { ParticipantRoundResults, VoteCountStat } from '@/components/VoteResults'
import { FinalGenderLeaderboards, FinalGenderBreakdown } from '@/components/FinalLeaderboard'
import { NameSearchPicker } from '@/components/NameSearchPicker'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import type { Game, Participant, Player, Round, Vote, VoteAssignment, Confession, GameType } from '@/types'

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
  const [assignment, setAssignment] = useState<VoteAssignment>(emptyAssignment())
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
  const [myPlayerGender, setMyPlayerGender] = useState<PlayerGender | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null)
  const [joinIdentityGender, setJoinIdentityGender] = useState<ParticipantGender>('female')
  const [voteBothGenders, setVoteBothGenders] = useState(false)
  const [joinPollGender, setJoinPollGender] = useState<ParticipantGender>('female')
  const [joining, setJoining] = useState(false)
  const [editingJoin, setEditingJoin] = useState(false)

  const isJoinersMode = game?.participant_mode === 'joiners'
  const joinPlayerGender: PlayerGender = playerGenderFromJoin(joinIdentityGender, voteBothGenders)

  const setJoinIdentity = (gender: ParticipantGender) => {
    setJoinIdentityGender(gender)
    if (isJoinersMode && !voteBothGenders) setJoinPollGender(gender)
  }

  const namePickerOptions = useMemo(() => {
    if (isJoinersMode) return []
    const claimedParticipantIds = new Set(
      players
        .filter((p) => p.id !== myPlayerId && p.participant_id)
        .map((p) => p.participant_id as string)
    )
    const takenNames = new Set(
      players.filter((p) => p.id !== myPlayerId).map((p) => p.name.toLowerCase())
    )
    return participants
      .filter(
        (p) =>
          !claimedParticipantIds.has(p.id) &&
          !takenNames.has(p.name.toLowerCase())
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: genderLabel(p.gender),
      }))
  }, [isJoinersMode, participants, players, myPlayerId])

  const handleSelectParticipant = (id: string, name: string) => {
    setSelectedParticipantId(id)
    setNameInput(name)
    const p = participants.find((x) => x.id === id)
    if (p && !isJoinersMode) {
      setJoinIdentityGender(p.gender)
      setVoteBothGenders(false)
      setJoinPollGender(p.gender)
    }
  }

  const canSubmitJoin = isJoinersMode
    ? nameInput.trim().length > 0
    : selectedParticipantId !== null

  // If someone else claims this name while you're still on the join screen, clear your pick
  useEffect(() => {
    if (isJoinersMode || view !== 'join' || !selectedParticipantId) return
    const stillAvailable = namePickerOptions.some((o) => o.id === selectedParticipantId)
    if (!stillAvailable) {
      setSelectedParticipantId(null)
      setNameInput('')
    }
  }, [namePickerOptions, selectedParticipantId, isJoinersMode, view])
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
  const announcedRoundIdRef = useRef<string | null>(null)
  const suppressRoundSoundRef = useRef(true)

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
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
        const me = (plrs || []).find((p) => p.id === session.playerId)
        const voteGender = me ? playerVoteGenderForRound(me, parts || []) : session.playerGender
        setMyPlayerGender(voteGender)
        if (me && voteGender) setPlayerSession(gameCode, me.id, me.name, voteGender)
      }

      if (gameData.status === 'active') {
        const { data: activeRound } = await supabase
          .from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle()

        if (activeRound) {
          setCurrentRound(activeRound)
          announcedRoundIdRef.current = activeRound.id
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
      } finally {
        suppressRoundSoundRef.current = false
      }
    }
    load()
  }, [gameCode])

  useEffect(() => {
    if (view !== 'round' || !currentRound?.id || suppressRoundSoundRef.current) return
    if (announcedRoundIdRef.current === currentRound.id) return
    announcedRoundIdRef.current = currentRound.id
    playRoundStartSound()
  }, [view, currentRound?.id])

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
            const [{ data: activeRound }, { data: parts }] = await Promise.all([
              supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
              supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
            ])
            if (parts) setParticipants(parts)
            if (activeRound) {
              setCurrentRound(activeRound)
              submittedRef.current = false
              setSubmitted(false)
              setAssignment(emptyAssignment())
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
        async (payload) => {
          const round = payload.new as Round
          if (round.status === 'active' && myPlayerIdRef.current) {
            const { data: parts } = await supabase
              .from('participants').select('*').eq('game_id', gameCode).order('display_order')
            if (parts) setParticipants(parts)
            setCurrentRound(round)
            submittedRef.current = false
            setSubmitted(false)
            setAssignment(emptyAssignment())
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
            setAssignment(emptyAssignment())
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
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Player
          setPlayers((prev) => prev.map((x) => x.id === p.id ? p : x))
          if (p.id === myPlayerIdRef.current) {
            setMyPlayerName(p.name)
            const voteGender = playerVoteGenderForRound(p, participantsRef.current)
            if (voteGender) {
              setMyPlayerGender(voteGender)
              setPlayerSession(gameCode, p.id, p.name, voteGender)
            }
          }
        }
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.old as Player
          setPlayers((prev) => prev.filter((x) => x.id !== p.id))
          if (p.id === myPlayerIdRef.current) {
            clearPlayerSession(gameCode)
            setMyPlayerId(null)
            setMyPlayerName(null)
            setMyPlayerGender(null)
            setEditingJoin(false)
            setView('join')
          }
        }
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const p = payload.new as Participant
          setParticipants((prev) =>
            prev.some((x) => x.id === p.id)
              ? prev
              : [...prev, p].sort((a, b) => a.display_order - b.display_order)
          )
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

  // Poll lobby / join — keep claimed names in sync if realtime is slow
  useEffect(() => {
    if (view !== 'waiting' && view !== 'join') return

    async function refreshLobby() {
      const [{ data: plrs }, { data: parts }, { data: gameData }] = await Promise.all([
        supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
        supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
      ])
      if (plrs) setPlayers(plrs)
      if (parts) setParticipants(parts)
      if (gameData) setGame(gameData)

      if (view === 'waiting' && gameData?.status === 'active' && myPlayerIdRef.current) {
        const { data: activeRound } = await supabase
          .from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle()
        if (activeRound) {
          setCurrentRound(activeRound)
          submittedRef.current = false
          setSubmitted(false)
          setAssignment(emptyAssignment())
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
          setAssignment(emptyAssignment())
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
    const parsed = me ? playerVoteGenderForRound(me, participants) : null
    if (parsed) setMyPlayerGender(parsed)
  }, [myPlayerId, players, participants])

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
      const playerGender = myPlayerGenderRef.current ?? getPlayerSession(gameCode)?.playerGender ?? null
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
      const gameType = parseGameType(g?.game_type)
      const actions = voteSlots(gameType)
      const unassigned = actions.filter((k) => !a[k])
      const available = roundParts.filter((p) => !Object.values(a).includes(p.id))
      unassigned.forEach((act, i) => { if (available[i]) a[act] = available[i].id })
    }

    const gameType = parseGameType(g?.game_type)
    fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: pid,
        roundId: r.id,
        gameId: gameCode,
        kiss: a.kiss,
        marry: isThreeChoiceGame(gameType) ? a.marry : null,
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
    const submitGameType = parseGameType(game?.game_type)
    await fetch('/api/votes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: myPlayerId,
        roundId: currentRound.id,
        gameId: gameCode,
        kiss: assignment.kiss,
        marry: isThreeChoiceGame(submitGameType) ? assignment.marry : null,
        kill: assignment.kill,
      }),
    })
  }

  const joinGame = async () => {
    if (joining) return
    if (isJoinersMode ? !nameInput.trim() : !selectedParticipantId) return
    unlockAudio()
    setJoining(true)
    try {
      const body = {
        gameCode,
        playerName: nameInput.trim(),
        gender: joinPlayerGender,
        identityGender: joinIdentityGender,
        ...(!isJoinersMode && selectedParticipantId ? { participantId: selectedParticipantId } : {}),
        ...(isJoinersMode && voteBothGenders ? { pollGender: joinPollGender } : {}),
      }

      const res = await fetch('/api/players', {
        method: editingJoin && myPlayerId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingJoin && myPlayerId
            ? { ...body, playerId: myPlayerId }
            : body
        ),
      })
      const data = await res.json()
      if (data.playerId) {
        const [{ data: plrs }, { data: parts }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        ])
        setPlayers(plrs || [])
        setParticipants(parts || [])
        const me = plrs?.find((p) => p.id === data.playerId)
        const voteGender = me
          ? playerVoteGenderForRound(me, parts || [])
          : parsePlayerGenderFromDb(data.playerGender)
        if (voteGender) {
          setPlayerSession(gameCode, data.playerId, data.playerName, voteGender)
          setMyPlayerGender(voteGender)
        }
        setMyPlayerId(data.playerId)
        setMyPlayerName(data.playerName)
        setEditingJoin(false)
        setView('waiting')
      } else {
        const msg = data.error ?? 'Failed to join'
        alert(msg.toLowerCase().includes('taken') ? 'That name was just taken — pick another' : msg)
      }
    } finally {
      setJoining(false)
    }
  }

  const openEditJoin = () => {
    const me = players.find((p) => p.id === myPlayerId)
    const votePref = me ? parsePlayerGenderFromDb(me.gender) : parsePlayerGenderFromDb(getPlayerSession(gameCode)?.playerGender ?? '')
    const voteBoth = votePref === 'both'
    setNameInput(myPlayerName ?? '')
    const part =
      participants.find((p) => p.id === me?.participant_id) ??
      participants.find((p) => p.name === myPlayerName)
    setSelectedParticipantId(part?.id ?? null)
    setJoinIdentityGender(
      me?.identity_gender
        ? (parseParticipantGenderFromDb(me.identity_gender) ?? 'female')
        : (part?.gender ?? 'female')
    )
    setVoteBothGenders(voteBoth)
    setJoinPollGender(part?.gender ?? 'female')
    setEditingJoin(true)
    setView('join')
  }

  const cancelEditJoin = () => {
    setEditingJoin(false)
    if (myPlayerId) setView('waiting')
  }

  const leaveGame = async () => {
    if (!myPlayerId || joining) return
    if (!confirm('Leave this game? You can rejoin with a new name or gender.')) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId: myPlayerId }),
      })
      if (res.ok) {
        clearPlayerSession(gameCode)
        setMyPlayerId(null)
        setMyPlayerName(null)
        setMyPlayerGender(null)
        setNameInput('')
        setSelectedParticipantId(null)
        setJoinIdentityGender('female')
        setVoteBothGenders(false)
        setJoinPollGender('female')
        setEditingJoin(false)
        setView('join')
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to leave')
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
          <div className="text-4xl">{gameTypeConfig(game?.game_type).headerEmoji}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
          <GameTypeBadge gameType={game?.game_type} />
          <p className="text-muted text-sm">{game?.rounds_count} rounds · {game?.timer_seconds}s each</p>
        </div>
        <div className="space-y-4">
          <p className="text-muted font-medium text-center">
            {editingJoin
              ? 'Update your name or vote preference'
              : isJoinersMode
                ? 'Join the game — your name goes in the poll'
                : 'Select your name from the list'}
          </p>
          {isJoinersMode ? (
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && canSubmitJoin && joinGame()}
              placeholder="Your name"
              autoFocus
              className={inputCls}
            />
          ) : (
            <NameSearchPicker
              options={namePickerOptions}
              valueId={selectedParticipantId}
              onChange={handleSelectParticipant}
              searchPlaceholder="Search your name…"
              emptyMessage={namePickerOptions.length === 0 ? 'All names have been claimed' : 'No names match your search'}
            />
          )}
          <div>
            <p className="text-faint text-xs mb-2 text-center">I am</p>
            <div className="flex gap-2">
              {(['female', 'male'] as const).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => setJoinIdentity(gender)}
                  className={`flex-1 chip ${joinIdentityGender === gender ? 'chip-active' : ''}`}
                >
                  {genderLabel(gender)}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-3 surface-inset border border-white/10 rounded-xl px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={voteBothGenders}
              onChange={(e) => setVoteBothGenders(e.target.checked)}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span className="text-sm text-white/85 leading-snug">
              Vote on both genders
              <span className="block text-faint text-xs mt-0.5">
                You&apos;ll vote on men&apos;s and women&apos;s rounds
              </span>
            </span>
          </label>
          {isJoinersMode && voteBothGenders && (
            <div>
              <p className="text-faint text-xs mb-2 text-center">Your name appears in the</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setJoinPollGender('female')}
                  className={`flex-1 chip ${joinPollGender === 'female' ? 'chip-active' : ''}`}
                >
                  Women&apos;s poll
                </button>
                <button
                  type="button"
                  onClick={() => setJoinPollGender('male')}
                  className={`flex-1 chip ${joinPollGender === 'male' ? 'chip-active' : ''}`}
                >
                  Men&apos;s poll
                </button>
              </div>
            </div>
          )}
          <p className="text-faint text-xs text-center">
            {joinGenderHint(joinIdentityGender, voteBothGenders, !!isJoinersMode, joinPollGender)}
          </p>
          <button onClick={joinGame} disabled={!canSubmitJoin || joining} className={primaryBtnCls}>
            {joining
              ? editingJoin ? 'Saving...' : 'Joining...'
              : editingJoin ? 'Save changes' : 'Join Game'}
          </button>
          {editingJoin ? (
            <button type="button" onClick={cancelEditJoin} className="w-full text-faint text-sm hover:text-white transition-colors">
              Cancel
            </button>
          ) : null}
        </div>
      </CenteredCard>
    )
  }

  // WAITING
  if (view === 'waiting') {
    return (
      <CenteredCard>
        <PlayerNameBar name={myPlayerName} />
        <div className="text-center space-y-1">
          <div className="text-4xl">⏳</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game?.title}</h1>
          <GameTypeBadge gameType={game?.game_type} />
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
                  {playerIdentityLabel(p, participants)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={openEditJoin} className="btn-secondary text-sm py-2.5">
            Change name or gender
          </button>
          <button type="button" onClick={leaveGame} disabled={joining} className="text-faint text-xs hover:text-red-300 transition-colors">
            Leave game
          </button>
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
    const effectiveGender = myPlayerGender ?? getPlayerSession(gameCode)?.playerGender ?? null
    const canVote = !!(
      effectiveGender &&
      roundParticipantGender &&
      canPlayerVoteInRound(effectiveGender, roundParticipantGender)
    )
    const voteBanner = canVote ? activeVoteBanner(effectiveGender) : null
    const gameType = parseGameType(game?.game_type)
    const allAssigned = isAssignmentComplete(assignment, gameType)
    const assignTarget = assignmentTargetCount(gameType)
    const typeConfig = gameTypeConfig(gameType)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full">
        <PlayerNameBar name={myPlayerName} />
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-muted text-xs uppercase tracking-wider">{game?.title}</p>
            <GameTypeBadge gameType={gameType} className="mt-1 mb-1" />
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
            {voteBanner && (
              <p className="text-green-400/90 text-xs font-medium mt-1">{voteBanner}</p>
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
            <p className="text-white/90 text-sm">{spectatorMessage(roundParticipantGender, effectiveGender)}</p>
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
                gameType={gameType}
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
              : `Assign all ${assignTarget} (${assignedCount(assignment, gameType)}/${assignTarget})`}
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
    const gameType = parseGameType(game?.game_type)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        <PlayerNameBar name={myPlayerName} />
        {/* Header */}
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
            {roundGender ? ` · ${roundGender}` : ''}
          </p>
          <GameTypeBadge gameType={gameType} className="mt-2" />
          <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🗳️</h2>
          {watchedRound && (
            <p className="text-muted text-sm mt-2">You watched this round — everyone sees the same results</p>
          )}
        </div>

        {/* My vote recap */}
        {myVote && (
          <div className="glass-card border border-[var(--primary)]/30 p-4">
            <p className="text-[var(--primary)] text-xs uppercase tracking-wider mb-2">Your vote</p>
            <div className="flex gap-4 flex-wrap">
              {voteSlots(gameType).map((slot) => {
                const participantId = slot === 'kiss' ? myVote.kiss_participant_id
                  : slot === 'marry' ? myVote.marry_participant_id
                  : myVote.kill_participant_id
                if (!participantId) return null
                const meta = slotMeta(gameType, slot)
                return (
                  <span key={slot} className="text-sm font-medium" style={{ color: meta.textColor }}>
                    {meta.emoji} {participants.find((p) => p.id === participantId)?.name}
                  </span>
                )
              })}
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
              gameType={gameType}
              tallies={tallies}
              nameById={nameById}
              voterCount={voterCount}
              renderCard={({ tally, name, maxes, isWinner }) => {
                const myAction =
                  myVote?.kiss_participant_id  === tally.id ? 'kiss'  :
                  myVote?.marry_participant_id === tally.id ? 'marry' :
                  myVote?.kill_participant_id  === tally.id ? 'kill'  : null

                const borderCls = myActionBorderClass(gameType, myAction)

                return (
                  <div key={tally.id} className={`glass-card border-2 ${borderCls} rounded-2xl p-4`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="avatar w-10 h-10 text-lg shrink-0">
                        {getInitial(name)}
                      </div>
                      <p className="text-white font-bold text-lg">{name}</p>
                      {myAction && (
                        <span className="ml-auto text-xs text-muted italic">
                          you: {myAction ? assignmentEmojiFor(gameType, myAction) : ''}
                        </span>
                      )}
                    </div>
                    <div className={`grid gap-3 ${getVoteCategories(gameType).length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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
        myPlayerName={myPlayerName}
      />
    )
  }

  return <FullLoader />
}

// ── Sub-components ────────────────────────────────────────────────────────

function ParticipantCard({ gameType, participant, action, onAssign, disabled }: {
  gameType: GameType
  participant: Participant
  action: 'kiss' | 'marry' | 'kill' | null
  onAssign: (a: 'kiss' | 'marry' | 'kill') => void
  disabled: boolean
}) {
  const cfg = action ? slotMeta(gameType, action) : null
  return (
    <div className={`rounded-2xl border-2 p-4 transition-all backdrop-blur-sm ${cfg ? cfg.borderClass : 'glass-card border-white/10'}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="avatar w-10 h-10 text-lg shrink-0">
          {getInitial(participant.name)}
        </div>
        <div>
          <p className="text-white font-bold text-lg leading-tight">{participant.name}</p>
          {action && cfg && (
            <p className="text-sm font-medium" style={{ color: cfg.textColor }}>
              {cfg.emoji} {cfg.label}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {voteSlots(gameType).map((a) => {
          const slot = slotMeta(gameType, a)
          return (
          <button
            key={a}
            onClick={() => onAssign(a)}
            disabled={disabled}
            className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition-all active:scale-95 ${
              action === a
                ? slot.activeClass
                : `surface-inset border-white/8 text-muted ${!disabled ? 'hover:border-zinc-500 hover:text-white/80' : ''}`
            } disabled:cursor-not-allowed`}
          >
            {slot.emoji}
          </button>
        )})}
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

function FinalResultsView({ game, participants, rounds, votes, confessions, players, myPlayerId, myPlayerName }: {
  game: Game
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
  confessions: Confession[]
  players: Player[]
  myPlayerId: string | null
  myPlayerName: string | null
}) {
  const gameType = parseGameType(game.game_type)
  const playedParticipants = filterParticipantsInRounds(participants, rounds)

  return (
    <div className="page-wrap px-4 py-8 max-w-2xl mx-auto w-full space-y-8">
      <PlayerNameBar name={myPlayerName} />
      <div className="text-center">
        <div className="text-4xl mb-2">🎊</div>
        <h1 className="text-3xl font-black text-white">{game.title}</h1>
        <GameTypeBadge gameType={gameType} className="mt-2" />
        <p className="text-muted mt-2">{players.length} players · {rounds.length} rounds · {playedParticipants.length} in game</p>
      </div>

      <FinalGenderLeaderboards
        gameType={gameType}
        participants={participants}
        rounds={rounds}
        votes={votes}
        TopCard={LeaderCard}
      />

      <FinalGenderBreakdown gameType={gameType} participants={participants} rounds={rounds} votes={votes} />

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
                {voteSlots(gameType).map((slot) => {
                  const participantId = slot === 'kiss' ? myVote.kiss_participant_id
                    : slot === 'marry' ? myVote.marry_participant_id
                    : myVote.kill_participant_id
                  if (!participantId) return null
                  const meta = slotMeta(gameType, slot)
                  return (
                    <span key={slot} className="text-sm" style={{ color: meta.textColor }}>
                      {meta.emoji} {participants.find((p) => p.id === participantId)?.name}
                    </span>
                  )
                })}
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
                    gameType={gameType}
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
                        <div className={`grid gap-2 ${getVoteCategories(gameType).length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
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

function LeaderCard({ emoji, label, name, count, accentColor }: {
  emoji: string; label: string; name?: string; count?: number; accentColor: string
}) {
  return (
    <div
      className="glass-card border rounded-2xl p-3 text-center"
      style={{ borderColor: `${accentColor}55`, backgroundColor: `${accentColor}14` }}
    >
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

function PlayerNameBar({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/8 mb-4">
      <div className="avatar w-7 h-7 text-xs shrink-0">{getInitial(name)}</div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-faint leading-none">Playing as</p>
        <p className="text-sm font-semibold text-white truncate">{name}</p>
      </div>
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
