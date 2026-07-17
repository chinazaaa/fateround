'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import { parseThemeId } from '@/lib/themes'
import { playRoundStartSound, playVoteSubmittedSound, playRoundEndSound, playGameFinishedSound } from '@/lib/sounds'
import { getRoundParticipantGender, canPlayerVoteInRound, playerVoteGenderForRound } from '@/lib/participants'
import {
  parseGameType,
  isNameOnlyPlayerJoin,
  isBinaryChoiceGame,
  isBinaryPeoplePollGame,
  isNeverHaveIEver,
  isPickANumber,
  isMostLikelyTo,
  isWhoSaidThis,
  pairAssignmentFromVote,
} from '@/lib/game-types'
import { isMltImportGame } from '@/lib/mlt'
import { dedupeWstPool, mergeActiveRound } from '@/lib/who-said-this'
import { isGenderFreeVoting } from '@/lib/gender-based'
import { lobbyAllowsPlayerQuestions } from '@/lib/player-question-pool'
import { isPeoplePollGame, lobbyAllowsPlayerNameSubmissions } from '@/lib/player-participant-pool'
import { preJoinScreen } from '@/lib/viewers'
import { panRoundRevealed } from '@/lib/pick-a-number'
import {
  CONFESSION_SELECT,
  GAME_SELECT,
  PARTICIPANT_SELECT,
  PLAYER_SELECT,
  PLAYER_QUESTION_SELECT,
  ROUND_SELECT,
  VOTE_SELECT,
} from '@/lib/supabase-selects'
import { useGameChannel } from '@/hooks/useGameChannel'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { useTimerTickSound } from '@/hooks/useTimerTickSound'
import type { AutoSubmitRefs, AutoSubmitResult } from '@/hooks/useAutoSubmit'
import type {
  Game,
  Participant,
  Player,
  Round,
  Vote,
  Confession,
  VoteAssignment,
  PairAssignmentMap,
  WyrChoice,
  WstQuotePoolEntry,
  PlayerGender,
} from '@/types'

export type View =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'waiting'
  | 'round'
  | 'round_results'
  | 'results'

function preJoinView(game: Game, hasPlayer: boolean): View {
  const pre = preJoinScreen(game, hasPlayer)
  if (pre === 'game_started_waiting') return 'game_started_waiting'
  if (pre === 'late_join_choice') return 'late_join_choice'
  if (pre === 'game_ended') return 'game_ended'
  return 'join'
}

export interface GameSessionDeps {
  gameCode: string
  // Reset callbacks (via refs to break circular deps)
  resetVoteStateRef: React.RefObject<() => void>
  resetHotSeatStateRef: React.RefObject<() => void>
  resetRoundResultsState: () => void
  resetWstQuoteStateRef: React.RefObject<() => void>
  resetJoinStateRef: React.RefObject<() => void>
  // Setters from useRoundResults
  setLastFinishedRound: React.Dispatch<React.SetStateAction<Round | null>>
  setLastRoundVotes: React.Dispatch<React.SetStateAction<Vote[]>>
  setAllVotes: React.Dispatch<React.SetStateAction<Vote[]>>
  setAllRounds: React.Dispatch<React.SetStateAction<Round[]>>
  setAllConfessions: React.Dispatch<React.SetStateAction<Confession[]>>
  setAllHotSeatSubmissions: React.Dispatch<
    React.SetStateAction<{ id: string; round_id: string; text: string; submission_type: string }[]>
  >
  // Setters from useWstQuotePool
  setWstPool: React.Dispatch<React.SetStateAction<WstQuotePoolEntry[]>>
  fetchWstPool: () => Promise<WstQuotePoolEntry[]>
  // Setters from usePlayerQuestions / usePlayerNameSubmissions
  setPqList: React.Dispatch<React.SetStateAction<any[]>>
  setPnList: React.Dispatch<React.SetStateAction<Participant[]>>
  // Vote state setters needed by initial load and channel handlers
  setWyrChoice: React.Dispatch<React.SetStateAction<WyrChoice | null>>
  setPickedNumber: React.Dispatch<React.SetStateAction<number | null>>
  setMltTargetPlayerId: React.Dispatch<React.SetStateAction<string | null>>
  setPairAssignment: React.Dispatch<React.SetStateAction<PairAssignmentMap>>
  setAssignment: React.Dispatch<React.SetStateAction<VoteAssignment>>
  setSubmitted: React.Dispatch<React.SetStateAction<boolean>>
  setQuoteInput: React.Dispatch<React.SetStateAction<string>>
  // Auto submit
  autoSubmitRefs: AutoSubmitRefs
  triggerAutoSubmit: () => Promise<AutoSubmitResult>
}

export function useGameSession(deps: GameSessionDeps) {
  const {
    gameCode,
    resetVoteStateRef,
    resetHotSeatStateRef,
    resetRoundResultsState,
    resetWstQuoteStateRef,
    resetJoinStateRef,
    setLastFinishedRound,
    setLastRoundVotes,
    setAllVotes,
    setAllRounds,
    setAllConfessions,
    setAllHotSeatSubmissions,
    setWstPool,
    fetchWstPool,
    setPqList,
    setPnList,
    setWyrChoice,
    setPickedNumber,
    setMltTargetPlayerId,
    setPairAssignment,
    setAssignment,
    setSubmitted,
    setQuoteInput,
    autoSubmitRefs,
    triggerAutoSubmit,
  } = deps

  const { currentRoundRef, gameRef, participantsRef, myPlayerIdRef, myPlayerGenderRef } = autoSubmitRefs

  // ── Core state ──────────────────────────────────────────────────────────
  const [view, setView] = useState<View>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [currentRound, setCurrentRound] = useState<Round | null>(null)
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState<string | null>(null)
  const [myPlayerGender, setMyPlayerGender] = useState<PlayerGender | null>(null)

  // ── Refs ─────────────────────────────────────────────────────────────────
  const announcedRoundIdRef = useRef<string | null>(null)
  const suppressRoundSoundRef = useRef(true)
  const roundFormIdRef = useRef<string | null>(null)
  const prevViewRef = useRef<View | null>(null)

  // ── Derived (used internally) ────────────────────────────────────────────
  const isWstGame = isWhoSaidThis(game?.game_type)
  const isNhieGame = isNeverHaveIEver(game?.game_type)
  const isBinaryGame = isBinaryChoiceGame(game?.game_type)

  // ── Functions ────────────────────────────────────────────────────────────
  const patchCurrentRound = (patch: Partial<Round>) => {
    setCurrentRound((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  async function loadAllResults() {
    const [{ data: rounds }, { data: votes }, { data: confs }, { data: subs }] = await Promise.all([
      supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
      supabase.from('votes').select('*').eq('game_id', gameCode),
      supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
      supabase.from('hot_seat_submissions').select('id, round_id, text, submission_type').eq('game_id', gameCode),
    ])
    setAllRounds(rounds || [])
    setAllVotes(votes || [])
    setAllConfessions(confs || [])
    setAllHotSeatSubmissions(subs ?? [])
  }

  function resetRoundPlayerState() {
    resetVoteStateRef.current()
    setQuoteInput('')
    resetHotSeatStateRef.current()
  }

  function applyActiveRound(round: Round, options?: { switchView?: boolean }) {
    setCurrentRound((prev) => mergeActiveRound(prev, round))
    if (roundFormIdRef.current !== round.id) {
      roundFormIdRef.current = round.id
      resetRoundPlayerState()
      if (options?.switchView !== false) setView('round')
    }
  }

  function resetPlayerForLobby(hasSession: boolean) {
    setCurrentRound(null)
    resetRoundResultsState()
    roundFormIdRef.current = null
    resetRoundPlayerState()
    resetWstQuoteStateRef.current()
    announcedRoundIdRef.current = null
    setView(hasSession ? 'waiting' : 'join')
  }

  const reloadPlayers = useCallback(async () => {
    const { data: plrs } = await supabase
      .from('players')
      .select(PLAYER_SELECT)
      .eq('game_id', gameCode)
      .order('joined_at')
    if (plrs) setPlayers(plrs)
  }, [gameCode])

  // ── Initial load effect ─────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const { data: gameData } = await supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle()
        if (!gameData) {
          setView('not_found')
          return
        }
        setGame(gameData)

        const [{ data: parts }, { data: plrs }] = await Promise.all([
          supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
          supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
        ])
        setParticipants(parts || [])
        setPlayers(plrs || [])

        const session = await resolvePlayerSession(gameCode, plrs || [])
        if (session) {
          setMyPlayerId(session.playerId)
          setMyPlayerName(session.playerName)
          const me = (plrs || []).find((p) => p.id === session.playerId)
          const voteGender = me ? playerVoteGenderForRound(me, parts || []) : session.playerGender
          setMyPlayerGender(voteGender)
          if (me && voteGender) {
            // resume_token is no longer readable from the client (migration 0122); it lives
            // only in the local session, which resolvePlayerSession already returns.
            setPlayerSession(gameCode, me.id, me.name, voteGender, session.resumeToken)
          }
        }

        if (gameData.status === 'active') {
          const { data: activeRound } = await supabase
            .from('rounds')
            .select('*')
            .eq('game_id', gameCode)
            .eq('status', 'active')
            .maybeSingle()

          if (activeRound) {
            roundFormIdRef.current = activeRound.id
            setCurrentRound(activeRound)
            announcedRoundIdRef.current = activeRound.id
            if (session) {
              const { data: existingVote } = await supabase
                .from('votes')
                .select('*')
                .eq('player_id', session.playerId)
                .eq('round_id', activeRound.id)
                .maybeSingle()
              if (existingVote) {
                const gameType = parseGameType(gameData.game_type)
                if (isBinaryChoiceGame(gameType)) {
                  setWyrChoice(existingVote.wyr_choice)
                } else if (isNeverHaveIEver(gameType)) {
                  setWyrChoice(existingVote.wyr_choice)
                } else if (isPickANumber(gameType)) {
                  setPickedNumber(existingVote.picked_number ?? null)
                } else if (isMostLikelyTo(gameType)) {
                  const targetId = isMltImportGame(gameData)
                    ? existingVote.target_participant_id
                    : existingVote.target_player_id
                  setMltTargetPlayerId(targetId)
                } else if (isWhoSaidThis(gameType)) {
                  setMltTargetPlayerId(existingVote.target_participant_id)
                } else if (isBinaryPeoplePollGame(gameType)) {
                  setPairAssignment(pairAssignmentFromVote(existingVote, activeRound.participant_ids))
                } else {
                  setAssignment({
                    kiss: existingVote.kiss_participant_id,
                    marry: existingVote.marry_participant_id,
                    kill: existingVote.kill_participant_id,
                  })
                }
                autoSubmitRefs.submittedRef.current = true
                setSubmitted(true)
              }
            }
            setView(session ? 'round' : preJoinView(gameData, false))
          } else {
            const { data: finishedRound } = await supabase
              .from('rounds')
              .select('*')
              .eq('game_id', gameCode)
              .eq('status', 'finished')
              .order('round_number', { ascending: false })
              .limit(1)
              .maybeSingle()

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
              setView(session ? 'waiting' : preJoinView(gameData, false))
            }
          }
          return
        }

        if (gameData.status === 'finished') {
          if (!session) {
            setView('game_ended')
            return
          }
          await loadAllResults()
          setView('results')
          return
        }

        setView(session ? 'waiting' : 'join')
        if (gameData.status === 'waiting' && isWhoSaidThis(parseGameType(gameData.game_type))) {
          const { data: pool } = await supabase
            .from('wst_quote_pool')
            .select('*')
            .eq('game_id', gameCode)
            .order('created_at')
          setWstPool(dedupeWstPool(pool ?? []))
        }
      } finally {
        suppressRoundSoundRef.current = false
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- polling on mount only
  }, [gameCode])

  // ── Round-start sound effect ────────────────────────────────────────────
  useEffect(() => {
    if (view !== 'round' || !currentRound?.id || suppressRoundSoundRef.current) return
    if (announcedRoundIdRef.current === currentRound.id) return
    announcedRoundIdRef.current = currentRound.id
    playRoundStartSound()
  }, [view, currentRound?.id])

  // ── Round-end / game-finished sound effect ──────────────────────────────
  useEffect(() => {
    if (view === 'round_results' && prevViewRef.current !== 'round_results' && !suppressRoundSoundRef.current) {
      playRoundEndSound()
    }
    if (view === 'results' && prevViewRef.current !== 'results') {
      playGameFinishedSound()
    }
    prevViewRef.current = view
  }, [view])

  // ── Player gender sync effect ───────────────────────────────────────────
  useEffect(() => {
    if (!myPlayerId) return
    const me = players.find((p) => p.id === myPlayerId)
    const parsed = me ? playerVoteGenderForRound(me, participants) : null
    if (parsed) setMyPlayerGender(parsed)
  }, [myPlayerId, players, participants])

  // ── Game theme effect ───────────────────────────────────────────────────
  // Each theme's palette (light + dark) lives in globals.css under
  // `[data-game-theme='<id>']`; just toggle the attribute so CSS resolves the
  // right colors for the active light/dark mode.
  useEffect(() => {
    const themeId = parseThemeId(game?.theme)
    const root = document.documentElement
    if (themeId === 'default') {
      root.removeAttribute('data-game-theme')
      return
    }
    root.setAttribute('data-game-theme', themeId)
    return () => {
      root.removeAttribute('data-game-theme')
    }
  }, [game?.theme])

  // ── Lobby open notification ─────────────────────────────────────────────
  useLobbyOpenNotification(game?.status, () => {
    if (myPlayerIdRef.current) {
      resetPlayerForLobby(true)
    } else {
      setView('join')
    }
  })

  // ── Real-time subscriptions ─────────────────────────────────────────────
  useGameChannel(
    gameCode,
    `game-player-${gameCode}`,
    {
      setGame,
      setPlayers,
      setParticipants,
      setWstPool,
      setConfessions: setAllConfessions,
    },
    {
      onGameUpdate: async (newGame) => {
        if (newGame.status === 'active' && !myPlayerIdRef.current) {
          setView(preJoinView(newGame, false))
        }
        if (newGame.status === 'active' && myPlayerIdRef.current) {
          const [{ data: activeRound }, { data: parts }] = await Promise.all([
            supabase.from('rounds').select('*').eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
            supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
          ])
          if (parts) setParticipants(parts)
          if (activeRound) {
            applyActiveRound(activeRound)
          }
        }
        if (newGame.status === 'finished') {
          if (!myPlayerIdRef.current) {
            setView('game_ended')
            return
          }
          await loadAllResults()
          setView('results')
        }
        if (newGame.status === 'waiting') {
          resetPlayerForLobby(!!myPlayerIdRef.current)
        }
      },
      onRoundInsert: async (round) => {
        if (round.status === 'active' && myPlayerIdRef.current) {
          const { data: parts } = await supabase
            .from('participants')
            .select('*')
            .eq('game_id', gameCode)
            .order('display_order')
          if (parts) setParticipants(parts)
          applyActiveRound(round)
        }
      },
      onRoundUpdate: async (round) => {
        if (round.status === 'active') {
          const priorId = roundFormIdRef.current
          applyActiveRound(round, { switchView: priorId !== round.id })
          if (
            isPickANumber(parseGameType(gameRef.current?.game_type)) &&
            panRoundRevealed(round) &&
            round.submitter_player_id
          ) {
            const { data: pickerVote } = await supabase
              .from('votes')
              .select('picked_number')
              .eq('round_id', round.id)
              .eq('player_id', round.submitter_player_id)
              .maybeSingle()
            if (pickerVote?.picked_number) setPickedNumber(pickerVote.picked_number)
          }
        }
        if (round.status === 'finished') {
          const [{ data: rv }, { data: rc }] = await Promise.all([
            supabase.from('votes').select('*').eq('round_id', round.id),
            supabase.from('confessions').select('*').eq('round_id', round.id).order('created_at'),
          ])
          setLastFinishedRound(round)
          setLastRoundVotes(rv || [])
          setAllConfessions((prev) => {
            const ids = new Set(prev.map((c) => c.id))
            return [...prev, ...(rc || []).filter((c) => !ids.has(c.id))]
          })
          setAllVotes((prev) => {
            const ids = new Set(prev.map((v) => v.id))
            return [...prev, ...(rv || []).filter((v) => !ids.has(v.id))]
          })
          setAllRounds((prev) => {
            const ids = new Set(prev.map((r) => r.id))
            return ids.has(round.id) ? prev.map((r) => (r.id === round.id ? round : r)) : [...prev, round]
          })
          setView('round_results')
        }
      },
      onPlayerUpdate: (p) => {
        if (p.id === myPlayerIdRef.current) {
          setMyPlayerName(p.name)
          const voteGender = playerVoteGenderForRound(p, participantsRef.current)
          if (voteGender) {
            setMyPlayerGender(voteGender)
            const existing = getPlayerSession(gameCode)
            // Never persist a token from the realtime row — resume_token is no longer
            // exposed to anon (migration 0122); rely on the local session only.
            setPlayerSession(gameCode, p.id, p.name, voteGender, existing?.resumeToken ?? null)
          }
        }
      },
      onPlayerDelete: (p) => {
        if (p.id === myPlayerIdRef.current) {
          clearPlayerSession(gameCode)
          setMyPlayerId(null)
          setMyPlayerName(null)
          setMyPlayerGender(null)
          resetJoinStateRef.current()
          setView('join')
        }
      },
      onConfessionInsert: () => {
        // Trigger re-render for live confessions in round results
        setLastRoundVotes((prev) => prev)
      },
    }
  )

  // ── Polling: final results ──────────────────────────────────────────────
  usePolling(
    async () => {
      const res = await supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle()
      if (!supabasePollOk(res)) return false
      if (res.data?.status === 'waiting') {
        setGame(res.data)
        resetPlayerForLobby(!!myPlayerIdRef.current)
      }
      return true
    },
    [gameCode, view],
    { intervalMs: POLL_INTERVALS.results, enabled: view === 'results' }
  )

  // ── Polling: lobby / join ───────────────────────────────────────────────
  usePolling(
    async () => {
      const [plrsRes, partsRes, gameRes] = await Promise.all([
        supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
        supabase.from('participants').select(PARTICIPANT_SELECT).eq('game_id', gameCode).order('display_order'),
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      ])
      if (!supabasePollOk(plrsRes, partsRes, gameRes)) return false
      if (plrsRes.data) setPlayers(plrsRes.data)
      if (partsRes.data) setParticipants(partsRes.data)
      if (gameRes.data) setGame(gameRes.data)
      if (!myPlayerIdRef.current && gameRes.data) {
        setView((current) => {
          const next = preJoinView(gameRes.data as Game, false)
          if (current === 'join' || current === 'game_started_waiting' || current === 'late_join_choice') {
            return next
          }
          return current
        })
      }
      if (gameRes.data && isWhoSaidThis(parseGameType(gameRes.data.game_type))) {
        await fetchWstPool()
      }

      if (view === 'waiting' && gameRes.data?.status === 'active' && myPlayerIdRef.current) {
        const roundRes = await supabase
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode)
          .eq('status', 'active')
          .maybeSingle()
        if (!supabasePollOk(roundRes)) return false
        if (roundRes.data) {
          applyActiveRound(roundRes.data)
        }
      }
      return true
    },
    [gameCode, view],
    {
      intervalMs: POLL_INTERVALS.lobby,
      enabled: view === 'waiting' || view === 'join' || view === 'game_started_waiting' || view === 'late_join_choice',
    }
  )

  // ── Polling: player-submitted questions ─────────────────────────────────
  usePolling(
    async () => {
      const res = await supabase
        .from('player_questions')
        .select(PLAYER_QUESTION_SELECT)
        .eq('game_id', gameCode)
        .order('created_at')
      if (!supabasePollOk(res)) return false
      if (res.data) setPqList(res.data)
      return true
    },
    [gameCode, game?.game_type, game?.player_questions_enabled, isBinaryGame],
    {
      intervalMs: POLL_INTERVALS.lobby,
      enabled:
        view === 'waiting' &&
        !!game &&
        (isBinaryGame || isNhieGame || isMostLikelyTo(game.game_type)) &&
        lobbyAllowsPlayerQuestions(game),
    }
  )

  // ── Polling: player-submitted names ─────────────────────────────────────
  usePolling(
    async () => {
      const res = await fetch(`/api/player-participants?gameId=${gameCode}`)
      if (!res.ok) return false
      const { participants: subs } = await res.json()
      setPnList(subs ?? [])
      return true
    },
    [gameCode, game?.game_type, game?.player_questions_enabled],
    {
      intervalMs: POLL_INTERVALS.lobby,
      enabled:
        view === 'waiting' && !!game && isPeoplePollGame(game.game_type) && lobbyAllowsPlayerNameSubmissions(game),
    }
  )

  // ── Polling: active round / round results ───────────────────────────────
  usePolling(
    async () => {
      const [gameRes, activeRoundRes, finishedRoundRes] = await Promise.all([
        supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
        supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).eq('status', 'active').maybeSingle(),
        supabase
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode)
          .eq('status', 'finished')
          .order('round_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (!supabasePollOk(gameRes, activeRoundRes, finishedRoundRes)) return false

      const gameData = gameRes.data
      const activeRound = activeRoundRes.data
      const finishedRound = finishedRoundRes.data

      if (gameData) setGame(gameData)

      if (gameData?.status === 'waiting') {
        resetPlayerForLobby(!!myPlayerIdRef.current)
        return true
      }

      if (gameData?.status === 'finished') {
        if (!myPlayerIdRef.current) {
          setView('game_ended')
          return true
        }
        await loadAllResults()
        setView('results')
        return true
      }

      if (activeRound && myPlayerIdRef.current) {
        applyActiveRound(activeRound, {
          switchView: view === 'round_results' || activeRound.id !== roundFormIdRef.current,
        })
        return true
      }

      if (finishedRound && myPlayerIdRef.current) {
        const [votesRes, confsRes] = await Promise.all([
          supabase.from('votes').select(VOTE_SELECT).eq('round_id', finishedRound.id),
          supabase.from('confessions').select(CONFESSION_SELECT).eq('round_id', finishedRound.id).order('created_at'),
        ])
        if (!supabasePollOk(votesRes, confsRes)) return false
        setLastFinishedRound(finishedRound)
        setLastRoundVotes(votesRes.data || [])
        if (confsRes.data?.length) {
          setAllConfessions((prev) => {
            const ids = new Set(prev.map((c) => c.id))
            return [...prev, ...confsRes.data!.filter((c) => !ids.has(c.id))]
          })
        }
        setView('round_results')
      }
      return true
    },
    [gameCode, view, currentRound?.id],
    { intervalMs: POLL_INTERVALS.activeGame, enabled: view === 'round' || view === 'round_results' }
  )

  // ── Round timer + auto-submit on expiry ─────────────────────────────────
  const timeLeft = useRoundTimer({
    game,
    currentRound,
    active: view === 'round' && !!currentRound?.started_at && !!game,
    onExpire: () => {
      if (autoSubmitRefs.submittedRef.current) return

      const roundGender = getRoundParticipantGender(
        currentRoundRef.current?.participant_ids ?? [],
        participantsRef.current
      )
      const gameType = parseGameType(gameRef.current?.game_type)
      const playerGender = myPlayerGenderRef.current ?? getPlayerSession(gameCode)?.playerGender ?? null
      const r = currentRoundRef.current
      const isWstRound = isWhoSaidThis(gameType)
      const isPanRound = isPickANumber(gameType)
      const isPanPicker = isPanRound && r?.submitter_player_id === myPlayerIdRef.current
      const isSubmitter = isWstRound && r?.submitter_player_id === myPlayerIdRef.current
      const genderFreeVoting = !!gameRef.current && isGenderFreeVoting(gameRef.current)
      const canVote = isWstRound
        ? !!myPlayerIdRef.current && !isSubmitter && !!r?.quote_text
        : isNameOnlyPlayerJoin(gameType) || genderFreeVoting
          ? !!myPlayerIdRef.current
          : !!roundGender && !!playerGender && canPlayerVoteInRound(playerGender, roundGender)

      if (canVote && (!isPanRound || isPanPicker)) {
        void triggerAutoSubmit().then((result) => {
          if (result.submitted) {
            autoSubmitRefs.submittedRef.current = true
            setSubmitted(true)
            if (result.revealedQuestion && currentRoundRef.current) {
              setCurrentRound({ ...currentRoundRef.current, mlt_question: result.revealedQuestion })
            }
            if (typeof result.pickedNumber === 'number') setPickedNumber(result.pickedNumber)
            playVoteSubmittedSound()
          }
        })
      }
    },
  })

  useTimerTickSound(timeLeft, view === 'round')

  return {
    // Core state
    view,
    setView,
    game,
    setGame,
    players,
    setPlayers,
    participants,
    setParticipants,
    currentRound,
    setCurrentRound,
    myPlayerId,
    setMyPlayerId,
    myPlayerName,
    setMyPlayerName,
    myPlayerGender,
    setMyPlayerGender,
    // Functions
    applyActiveRound,
    resetPlayerForLobby,
    loadAllResults,
    reloadPlayers,
    patchCurrentRound,
    resetRoundPlayerState,
    // Timer
    timeLeft,
  }
}

export type GameSessionState = ReturnType<typeof useGameSession>
