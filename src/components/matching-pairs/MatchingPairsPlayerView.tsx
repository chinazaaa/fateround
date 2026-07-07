'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { GamePlayerChrome } from '@/components/GamePlayerChrome'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { MatchingPairsStatDetails } from '@/components/matching-pairs/MatchingPairsStatDetails'
import { MatchingPairsGameTimerBar } from '@/components/matching-pairs/MatchingPairsGameTimerBar'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameTypeConfig } from '@/lib/game-types'
import {
  parseMatchingPairsMetadata,
  getPlayerBoard,
  tallyMatchingPairsScore,
  computeStreakBonus,
  MATCHING_PAIRS_FLIP_BACK_MS,
  MATCHING_PAIRS_POINTS_PER_PAIR,
  MATCHING_PAIRS_STREAK_BONUS,
  matchingPairsGridLayout,
  MATCHING_PAIRS_MIN_PLAYERS,
  type MatchingPairsMetadata,
  type MatchingPairsSubmission,
  type MatchingPairsProgress,
} from '@/lib/memory-match'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { ROUND_SELECT, MEMORY_MATCH_SUBMISSION_SELECT, MEMORY_MATCH_PROGRESS_SELECT } from '@/lib/supabase-selects'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { allowLatePlayers, preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { clearPlayerSession } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import type { Game } from '@/types'

// ── Screen type ───────────────────────────────────────────────────────────────

type Screen =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'waiting_for_others' // finished own board, waiting for others to finish
  | 'finished'

// ── Local board state ─────────────────────────────────────────────────────────

type CardState = 'hidden' | 'flipped' | 'matched'

interface LocalBoard {
  /** Shuffled card order: cardOrder[i] = pairIndex */
  cardOrder: number[]
  cardStates: CardState[]
  /** Index of the first flipped (unmatched) card, or null */
  firstFlipped: number | null
  /** Locked while the flip-back animation is running */
  locked: boolean
}

type MatchingPairsGameState = {
  hasBoard: boolean
  ownFinished: boolean
}

type MatchingPairsLeaderboardRow = ReturnType<typeof tallyMatchingPairsScore> & {
  name: string
}

function buildInitialBoard(cardOrder: number[]): LocalBoard {
  return {
    cardOrder,
    cardStates: new Array(cardOrder.length).fill('hidden') as CardState[],
    firstFlipped: null,
    locked: false,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MatchingPairsPlayerView({ gameCode }: { gameCode: string }) {
  const { error: toastError } = useToast()
  const cfg = gameTypeConfig('matching_pairs')
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  // Game data
  const [roundId, setRoundId] = useState<string | null>(null)
  const [meta, setMeta] = useState<MatchingPairsMetadata | null>(null)
  const [mySubmissions, setMySubmissions] = useState<MatchingPairsSubmission[]>([])
  const [allSubmissions, setAllSubmissions] = useState<MatchingPairsSubmission[]>([])
  const [allProgress, setAllProgress] = useState<MatchingPairsProgress[]>([])

  // Local board state (client-only, not persisted — resync from submissions on reconnect)
  const [board, setBoard] = useState<LocalBoard | null>(null)
  const [currentStreak, setCurrentStreak] = useState(0)
  const [totalPoints, setTotalPoints] = useState(0)
  const [finished, setFinished] = useState(false)
  const [finishRank, setFinishRank] = useState<number | null>(null)

  // Memorization phase state
  const getMemorizeSeconds = (gridSizePairs: number) => (gridSizePairs >= 16 ? 5 : 3)
  const [memorizeCountdown, setMemorizeCountdown] = useState<number | null>(null)
  const memorizeRoundRef = useRef<string | null>(null)

  // Flash feedback
  const [lastFlashType, setLastFlashType] = useState<'match' | 'miss' | 'streak' | null>(null)
  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showFlash = useCallback((type: 'match' | 'miss' | 'streak') => {
    if (flashRef.current) clearTimeout(flashRef.current)
    setLastFlashType(type)
    flashRef.current = setTimeout(() => setLastFlashType(null), 1200)
  }, [])

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  const loadGameState = useCallback(async (): Promise<{ state: MatchingPairsGameState; ok: boolean }> => {
    return { state: { hasBoard: false, ownFinished: false }, ok: true }
  }, [])

  const afterResolve = useCallback(
    async (gameData: Game, playerId: string | null): Promise<MatchingPairsGameState> => {
      if (!playerId) {
        setRoundId(null)
        setMeta(null)
        setMySubmissions([])
        setAllSubmissions([])
        setAllProgress([])
        setBoard(null)
        setFinished(false)
        setFinishRank(null)
        return { hasBoard: false, ownFinished: false }
      }

      if (gameData.status === 'active' || gameData.status === 'finished') {
        const { data: roundData } = await supabase
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode)
          .eq('round_number', 1)
          .maybeSingle()

        const parsedMeta = roundData
          ? parseMatchingPairsMetadata((roundData as Record<string, unknown>).memory_match_metadata)
          : null
        setMeta(parsedMeta)

        if (roundData && parsedMeta) {
          setRoundId(roundData.id as string)

          const [{ data: subData }, { data: progData }] = await Promise.all([
            supabase
              .from('memory_match_submissions')
              .select(MEMORY_MATCH_SUBMISSION_SELECT)
              .eq('round_id', roundData.id)
              .order('submitted_at', { ascending: true }),
            supabase.from('memory_match_progress').select(MEMORY_MATCH_PROGRESS_SELECT).eq('round_id', roundData.id),
          ])

          const allSubs = (subData ?? []) as MatchingPairsSubmission[]
          const subs = allSubs.filter((s) => s.player_id === playerId)
          setAllSubmissions(allSubs)
          setMySubmissions(subs)
          setAllProgress((progData ?? []) as MatchingPairsProgress[])

          // Reconstruct local board from submissions
          const cardOrder = getPlayerBoard(parsedMeta, playerId)
          if (cardOrder) {
            const boardState = buildInitialBoard(cardOrder)
            const matchedPairs = new Set(subs.filter((s) => s.is_match).map((s) => s.pair_index))
            for (let i = 0; i < boardState.cardStates.length; i++) {
              if (matchedPairs.has(boardState.cardOrder[i])) {
                boardState.cardStates[i] = 'matched'
              }
            }
            setBoard(boardState)

            // Start memorization phase for fresh games (no submissions yet)
            if (subs.length === 0 && gameData.status === 'active' && memorizeRoundRef.current !== roundData.id) {
              memorizeRoundRef.current = roundData.id
              setMemorizeCountdown(getMemorizeSeconds(parsedMeta.gridSizePairs))
            }

            // Reconstruct streak & points from last submission
            if (subs.length > 0) {
              const last = subs[subs.length - 1]
              setTotalPoints(last.points_after)
              setCurrentStreak(last.streak_at_time)
            } else {
              setTotalPoints(0)
              setCurrentStreak(0)
            }

            // Check if already finished
            const myProg = (progData ?? []).find((p: { player_id: string }) => p.player_id === playerId) as
              | MatchingPairsProgress
              | undefined
            const ownFinished = myProg?.finished === true
            setFinished(ownFinished)
            setFinishRank(myProg?.finish_rank ?? null)
            return { hasBoard: true, ownFinished }
          } else {
            setBoard(null)
            setFinished(false)
            setFinishRank(null)
            return { hasBoard: false, ownFinished: false }
          }
        } else {
          setRoundId(null)
          setMeta(null)
          setMySubmissions([])
          setAllSubmissions([])
          setAllProgress([])
          setBoard(null)
          setFinished(false)
          setFinishRank(null)
          return { hasBoard: false, ownFinished: false }
        }
      } else {
        setRoundId(null)
        setMeta(null)
        setMySubmissions([])
        setAllSubmissions([])
        setAllProgress([])
        setBoard(null)
        setFinished(false)
        setFinishRank(null)
        return { hasBoard: false, ownFinished: false }
      }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, state: MatchingPairsGameState): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        if (pre === 'late_join_choice') return 'late_join_choice'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'finished') return 'finished'
      if (state.ownFinished) return 'waiting_for_others'
      return state.hasBoard ? 'playing' : 'waiting'
    },
    []
  )

  const {
    screen,
    game,
    setGame,
    players,
    setPlayers,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    join,
  } = useGameViewBootstrap<Screen, MatchingPairsGameState>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    afterResolve,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useTurnNotifications({ status: game?.status })

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })

  // Realtime: progress updates (opponents finishing, etc.).
  // Apply optimistically to local state from the realtime payload.
  // We do NOT call load() here because that would rebuild the board from
  // submissions, overwriting the optimistic local flip state and causing
  // matched cards to flicker or a newly-flipped single card to revert.
  useEffect(() => {
    if (!roundId) return
    const channel = supabase
      .channel(`mp_player_progress_${roundId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_match_progress', filter: `round_id=eq.${roundId}` },
        (payload) => {
          const updated = payload.new as MatchingPairsProgress
          // Optimistic local update first so the UI reacts instantly.
          setAllProgress((prev) => {
            const idx = prev.findIndex((p) => p.player_id === updated.player_id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = updated
              return next
            }
            return [...prev, updated]
          })
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roundId])

  // Bug #1 fix: listen for game status changes so non-host players transition
  // from the waiting screen to the live game view when the host starts the game.
  // Previously setGame() was called but load() was not, so computeScreen never
  // ran and the screen stayed on 'waiting'.
  useEffect(() => {
    if (!gameCode) return
    const channel = supabase
      .channel(`mp_game_status_${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (payload) => {
          const updated = payload.new as Game
          setGame(updated)
          // Always call load() so computeScreen re-runs with the new game status.
          // This covers both 'active' (game started) and 'finished' transitions.
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, load, setGame])

  // ── Memorization countdown timer ────────────────────────────────────────────

  useEffect(() => {
    if (memorizeCountdown === null || memorizeCountdown <= 0) return
    const t = setTimeout(() => setMemorizeCountdown((c) => (c !== null ? (c <= 1 ? null : c - 1) : null)), 1000)
    return () => clearTimeout(t)
  }, [memorizeCountdown])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current)
      if (flashRef.current) clearTimeout(flashRef.current)
    }
  }, [])

  // ── Flip handler ───────────────────────────────────────────────────────────

  const handleCardFlip = useCallback(
    async (cardIndex: number) => {
      if (!board || !meta || !myPlayerId || !myResumeToken || !roundId) return
      if (board.locked) return
      if (finished) return
      const state = board.cardStates[cardIndex]
      if (state === 'matched' || state === 'flipped') return

      const pairIndex = board.cardOrder[cardIndex]

      if (board.firstFlipped === null) {
        // First card of a pair — flip it and wait for the second.
        setBoard((prev) => {
          if (!prev) return prev
          const next = { ...prev, cardStates: [...prev.cardStates] }
          next.cardStates[cardIndex] = 'flipped'
          next.firstFlipped = cardIndex
          return next
        })
        return
      }

      // Second card flipped — resolve the pair.
      const firstIndex = board.firstFlipped
      const firstPairIndex = board.cardOrder[firstIndex]
      const isMatch = firstPairIndex === pairIndex

      // Lock board during resolution.
      setBoard((prev) => {
        if (!prev) return prev
        const next = { ...prev, cardStates: [...prev.cardStates], locked: true, firstFlipped: null }
        next.cardStates[cardIndex] = 'flipped'
        return next
      })

      if (isMatch) {
        // Immediately mark both as matched.
        const streakBonus = computeStreakBonus(currentStreak)
        const newStreak = currentStreak + 1
        const delta = MATCHING_PAIRS_POINTS_PER_PAIR + streakBonus
        const newPoints = totalPoints + delta

        setBoard((prev) => {
          if (!prev) return prev
          const next = { ...prev, cardStates: [...prev.cardStates], locked: false, firstFlipped: null }
          next.cardStates[firstIndex] = 'matched'
          next.cardStates[cardIndex] = 'matched'
          return next
        })
        setCurrentStreak(newStreak)
        setTotalPoints(newPoints)
        showFlash(streakBonus > 0 ? 'streak' : 'match')

        // Count how many pairs are now matched
        const newPairsMatched = mySubmissions.filter((s) => s.is_match).length + 1
        const justFinished = newPairsMatched >= meta.gridSizePairs
        if (justFinished) {
          setFinished(true)
        }

        // Submit to server (fire-and-forget for responsiveness; UI is optimistic).
        void fetch('/api/matching-pairs/flip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            resumeToken: myResumeToken,
            pairIndex,
            isMatch: true,
          }),
        }).then(async (res) => {
          if (!res.ok) {
            const d = await res.json()
            toastError(d.error ?? 'Submit error')
          } else {
            const d = await res.json()
            if (d.finishRank) setFinishRank(d.finishRank)
            // Bug #2 fix: call load() after a finishing flip so computeScreen
            // transitions to 'waiting_for_others' immediately. Without this,
            // setFinished(true) updates local state but screen stays on 'playing'
            // because computeScreen only reads state.ownFinished (set inside load).
            if (justFinished) {
              void load()
            } else {
              // Non-finishing match: just refresh submission counts.
              const { data } = await supabase
                .from('memory_match_submissions')
                .select(MEMORY_MATCH_SUBMISSION_SELECT)
                .eq('round_id', roundId)
                .order('submitted_at', { ascending: true })
              const nextSubmissions = (data ?? []) as MatchingPairsSubmission[]
              setAllSubmissions(nextSubmissions)
              setMySubmissions(nextSubmissions.filter((s) => s.player_id === myPlayerId))
            }
          }
        })
      } else {
        // Mismatch — flip back after delay.
        showFlash('miss')
        setCurrentStreak(0)

        flipTimeoutRef.current = setTimeout(() => {
          setBoard((prev) => {
            if (!prev) return prev
            const next = { ...prev, cardStates: [...prev.cardStates], locked: false, firstFlipped: null }
            next.cardStates[firstIndex] = 'hidden'
            next.cardStates[cardIndex] = 'hidden'
            return next
          })
        }, MATCHING_PAIRS_FLIP_BACK_MS)

        // Submit miss to server.
        void fetch('/api/matching-pairs/flip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: gameCode,
            resumeToken: myResumeToken,
            pairIndex,
            isMatch: false,
          }),
        }).then(async (res) => {
          if (!res.ok) {
            const d = await res.json()
            toastError(d.error ?? 'Submit error')
          } else {
            // Refresh submissions to keep local state in sync
            const { data } = await supabase
              .from('memory_match_submissions')
              .select(MEMORY_MATCH_SUBMISSION_SELECT)
              .eq('round_id', roundId)
              .order('submitted_at', { ascending: true })
            const nextSubmissions = (data ?? []) as MatchingPairsSubmission[]
            setAllSubmissions(nextSubmissions)
            setMySubmissions(nextSubmissions.filter((s) => s.player_id === myPlayerId))
          }
        })
      }
    },
    [
      board,
      meta,
      myPlayerId,
      myResumeToken,
      roundId,
      finished,
      currentStreak,
      totalPoints,
      mySubmissions,
      gameCode,
      showFlash,
      toastError,
    ]
  )

  // ── Derived values ─────────────────────────────────────────────────────────

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    screen === 'late_join_choice'
  )

  const playerMap = new Map<string, string>()
  for (const p of players) playerMap.set(p.id, p.name)

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyResumeToken(null)
    void load()
  }

  const handleReady = async () => {
    if (!myResumeToken) return
    await fetch('/api/players/ready', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
    })
    await load()
  }

  // Ready-up ring: readiness = holding a seat, so this reuses /players/ready.
  // `ready:false` sits the player back out.
  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const toggleReplayReady = async (ready: boolean) => {
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setReplayReadyPending(true)
    try {
      await fetch('/api/players/ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
      })
      await load()
    } finally {
      setReplayReadyPending(false)
    }
  }

  const gridLayout = meta ? matchingPairsGridLayout(meta.gridSizePairs) : { cols: 4, rows: 4 }
  const pairsMatched = mySubmissions.filter((s) => s.is_match).length
  const wrongAttempts = mySubmissions.filter((s) => !s.is_match).length

  // Leaderboard for finished screen.
  // Bug #5 fix: sort by finish_rank first (server-assigned, atomic) so the
  // first-to-finish player is always shown in 1st place, even when two players
  // end up with the same score.
  const leaderboard: MatchingPairsLeaderboardRow[] = meta
    ? allProgress
        .map((prog) => {
          const subs = allSubmissions.filter((s) => s.player_id === prog.player_id)
          return {
            ...tallyMatchingPairsScore(subs, prog, meta.gridSizePairs, game?.session_started_at),
            name: playerMap.get(prog.player_id) ?? 'Unknown',
          }
        })
        .sort((a, b) => {
          const rankA = a.placement ?? 999
          const rankB = b.placement ?? 999
          if (rankA !== rankB) return rankA - rankB
          if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
          return (a.timeTakenMs ?? Infinity) - (b.timeTakenMs ?? Infinity)
        })
    : []

  // ── Render ─────────────────────────────────────────────────────────────────

  if (screen === 'loading' || resolvingRoomMember) return null
  if (screen === 'not_found')
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-faint)' }}>Game not found.</div>
  if (!game) return null

  if (screen === 'join') {
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game.title ?? 'Matching Pairs'}
            gameType="matching_pairs"
            subtitle="Flip cards, match icons, and race your friends to the finish."
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          joining={joining}
          gameType="matching_pairs"
          submitLabel="Join game"
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="matching_pairs" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }
  if (screen === 'game_ended') return <GameEndedScreen game={game} />

  if (screen === 'late_join_choice') {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={allowLatePlayers(game)}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
      />
    )
  }

  if (screen === 'waiting') {
    // "Play again · same settings" reopened the lobby with the ready-up ring.
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={MATCHING_PAIRS_MIN_PLAYERS}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
          />
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title={game.title ?? 'Waiting for host to start'}
          description="Memorize card positions, build streaks, and finish your board first."
          rulesLink={<GameRulesLink gameType="matching_pairs" variant="subtle" />}
          isSpectator={isViewer}
          onReady={handleReady}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    const iWon = leaderboard.length > 1 && leaderboard[0]?.playerId === myPlayerId && leaderboard[0]?.finalScore > 0
    return (
      <MatchingPairsPlayShell>
        <div className="glass-card-strong p-8 text-center space-y-2">
          <p className="text-4xl">🏆</p>
          <p className="text-2xl font-black">Puzzle complete!</p>
          {leaderboard[0] && (
            <p className="text-muted text-base">
              {iWon
                ? 'You won! 🎉'
                : `${leaderboard[0].name} wins with ${leaderboard[0].finalScore.toLocaleString()} pts`}
            </p>
          )}
        </div>
        <PaginatedLeaderboard
          title="Final leaderboard"
          rows={leaderboard.map((row, i) => ({
            id: row.playerId,
            rank: i + 1,
            name: row.name,
            score: row.finalScore,
            correctCount: row.pairsMatched,
            expandDetails: <MatchingPairsStatDetails score={row} gridSizePairs={meta?.gridSizePairs ?? 0} />,
          }))}
          totalQuestions={meta?.gridSizePairs}
          highlightId={myPlayerId ?? undefined}
          scoreLabel={(n) => `${n} pts`}
          emphasizeLeader
        />
        {iWon && (
          <PostWinToCommunity
            gameType="matching_pairs"
            gameCode={gameCode}
            winnerName={leaderboard[0]?.name ?? ''}
            roundKey={game?.session_started_at ?? undefined}
          />
        )}
      </MatchingPairsPlayShell>
    )
  }

  if (screen === 'waiting_for_others') {
    return (
      <MatchingPairsPlayShell>
        <MatchingPairsWaitingForOthers
          pairsMatched={pairsMatched}
          gridSizePairs={meta?.gridSizePairs ?? 8}
          finishRank={finishRank}
          allProgress={allProgress}
          playerMap={playerMap}
          totalPoints={totalPoints}
          wrongAttempts={wrongAttempts}
          currentStreak={currentStreak}
        />
      </MatchingPairsPlayShell>
    )
  }

  // screen === 'playing'
  return (
    <MatchingPairsPlayShell>
      {isViewer && (
        <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
      )}
      <MatchingPairsGameTimerBar gameCode={gameCode} game={game} />

      {/* Score header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 0 12px',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <ScoreChip label="Score" value={totalPoints} accent="#f59e0b" />
          <ScoreChip label="Pairs" value={`${pairsMatched}/${meta?.gridSizePairs ?? 8}`} accent="#22c55e" />
          <ScoreChip label="Streak" value={`${currentStreak}🔥`} accent="#f97316" />
        </div>
        {wrongAttempts > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {wrongAttempts} miss{wrongAttempts !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* Memorize countdown banner */}
      {memorizeCountdown !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '10px 16px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            boxShadow: '0 2px 12px rgba(99,102,241,0.3)',
          }}
        >
          <span>Memorize card positions!</span>
          <span style={{ fontSize: 24, fontWeight: 800 }}>{memorizeCountdown}s</span>
        </div>
      )}

      {/* Floating flash feedback */}
      {lastFlashType && (
        <div
          className="animate-float-up-fade"
          style={{
            position: 'fixed',
            left: '50%',
            top: '45%',
            transform: 'translateX(-50%)',
            zIndex: 999,
            fontWeight: 800,
            fontSize: 22,
            textAlign: 'center',
            pointerEvents: 'none',
            color: lastFlashType === 'miss' ? '#ef4444' : lastFlashType === 'streak' ? '#f97316' : '#22c55e',
            textShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {lastFlashType === 'match' && `+${MATCHING_PAIRS_POINTS_PER_PAIR} 🎉`}
          {lastFlashType === 'miss' && 'Miss — flip back!'}
          {lastFlashType === 'streak' && `Streak! +${MATCHING_PAIRS_STREAK_BONUS} 🔥`}
        </div>
      )}

      {/* Card grid */}
      {board && meta ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
            gap: 8,
            width: '100%',
          }}
        >
          {board.cardStates.map((state, i) => {
            const pairIdx = board.cardOrder[i]
            const pair = meta.pairs[pairIdx]
            const memorizing = memorizeCountdown !== null
            return (
              <MemoryCard
                key={i}
                state={memorizing ? 'flipped' : state}
                icon={pair?.icon ?? '?'}
                color={pair?.color ?? '#888'}
                onClick={() => void handleCardFlip(i)}
                disabled={board.locked || finished || memorizing}
              />
            )
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 40 }}>Loading board…</div>
      )}

      {/* Opponent progress bar strip */}
      {allProgress.length > 1 && meta && (
        <OpponentProgressStrip
          allProgress={allProgress}
          myPlayerId={myPlayerId}
          playerMap={playerMap}
          gridSizePairs={meta.gridSizePairs}
        />
      )}

      <style>{`
        @keyframes mpFlash { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes mpCardMatch { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
      `}</style>
    </MatchingPairsPlayShell>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MatchingPairsPlayShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <GamePlayerChrome />
      <main className="pt-16 flex-1 px-4 py-8 max-w-lg mx-auto w-full space-y-6">{children}</main>
    </div>
  )
}

function ScoreChip({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 56 }}>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 17, fontWeight: 700, color: accent }}>{value}</span>
    </div>
  )
}

function MemoryCard({
  state,
  icon,
  color,
  onClick,
  disabled,
}: {
  state: CardState
  icon: string
  color: string
  onClick: () => void
  disabled: boolean
}) {
  const isHidden = state === 'hidden'
  const isMatched = state === 'matched'
  const showFront = !isHidden

  return (
    <button
      onClick={disabled && !isMatched ? undefined : onClick}
      disabled={disabled && !isMatched}
      aria-label={isHidden ? 'Hidden card' : `Card: ${icon}`}
      className="memory-card-btn"
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 12,
        border: 'none',
        background: 'transparent',
        cursor: isHidden || isMatched ? (isHidden ? 'pointer' : 'default') : 'pointer',
        padding: 0,
        perspective: '600px',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        className="memory-card-inner"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          transition: 'transform 0.4s ease',
          transform: showFront ? 'rotateY(180deg)' : 'rotateY(0deg)',
          border: isMatched ? `2px solid ${color}` : '2px solid var(--border-strong)',
          borderRadius: 12,
          boxSizing: 'border-box' as const,
          animation: isMatched ? 'mpCardMatch 0.3s ease' : undefined,
        }}
      >
        {/* Back face — shown when card is hidden */}
        <div
          className="memory-card-back"
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '42%',
              height: '42%',
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 'clamp(16px, 3.5vw, 26px)',
              color: 'rgba(255,255,255,0.45)',
              fontWeight: 700,
            }}
          >
            ?
          </div>
        </div>
        {/* Front face — shown when flipped or matched */}
        <div
          className="memory-card-front"
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            borderRadius: 10,
            transform: 'rotateY(180deg)',
            background: isMatched ? `${color}22` : `${color}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // Bug #3 fix: emoji was too small on mobile.
            // Cards are 25% of the viewport on a 4-col grid; use a larger clamp
            // so the icon reads clearly on small screens (≥22px floor).
            fontSize: 'clamp(22px, 7vw, 36px)',
            opacity: isMatched ? 0.85 : 1,
          }}
        >
          <span role="img" aria-hidden="true" style={{ userSelect: 'none', lineHeight: 1 }}>
            {icon}
          </span>
        </div>
      </div>
    </button>
  )
}

function OpponentProgressStrip({
  allProgress,
  myPlayerId,
  playerMap,
  gridSizePairs,
}: {
  allProgress: MatchingPairsProgress[]
  myPlayerId: string | null
  playerMap: Map<string, string>
  gridSizePairs: number
}) {
  const others = allProgress.filter((p) => p.player_id !== myPlayerId)
  if (others.length === 0) return null
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <p
        style={{
          fontSize: 11,
          color: 'var(--text-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 8,
        }}
      >
        Opponents
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {others
          .sort((a, b) => b.pairs_matched - a.pairs_matched)
          .map((prog) => {
            const name = playerMap.get(prog.player_id) ?? 'Unknown'
            const pct = Math.round((prog.pairs_matched / gridSizePairs) * 100)
            return (
              <div key={prog.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    minWidth: 80,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--text-faint)',
                  }}
                >
                  {name}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 5,
                    background: 'var(--border-strong)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: prog.finished ? '#22c55e' : '#f59e0b',
                      borderRadius: 99,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 44, textAlign: 'right' }}>
                  {prog.finished ? '✓' : `${prog.pairs_matched}/${gridSizePairs}`}
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}

function MatchingPairsWaitingForOthers({
  pairsMatched,
  gridSizePairs,
  finishRank,
  allProgress,
  playerMap,
  totalPoints,
  wrongAttempts,
  currentStreak,
}: {
  pairsMatched: number
  gridSizePairs: number
  finishRank: number | null
  allProgress: MatchingPairsProgress[]
  playerMap: Map<string, string>
  totalPoints: number
  wrongAttempts: number
  currentStreak: number
}) {
  const stillPlaying = allProgress.filter((p) => !p.finished).length
  const placementLabel =
    finishRank === 1 ? '1st 🥇' : finishRank === 2 ? '2nd 🥈' : finishRank === 3 ? '3rd 🥉' : `${finishRank}th`

  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 8 }}>🎉</div>
      <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 4 }}>
        You finished! {finishRank ? placementLabel : ''}
      </h2>
      <p style={{ color: 'var(--text-faint)', fontSize: 14, marginBottom: 20 }}>
        {stillPlaying > 0
          ? `Waiting for ${stillPlaying} more player${stillPlaying !== 1 ? 's' : ''} to finish…`
          : 'All done! Results coming up.'}
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 24 }}>
        <ScoreChip label="Score" value={totalPoints} accent="#f59e0b" />
        <ScoreChip label="Pairs" value={`${pairsMatched}/${gridSizePairs}`} accent="#22c55e" />
        <ScoreChip label="Misses" value={wrongAttempts} accent={wrongAttempts === 0 ? '#22c55e' : '#ef4444'} />
        <ScoreChip label="Streak" value={`${currentStreak}🔥`} accent="#f97316" />
      </div>

      {wrongAttempts === 0 && pairsMatched >= gridSizePairs && (
        <div
          style={{
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 12,
            padding: '10px 16px',
            display: 'inline-block',
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#22c55e', fontWeight: 700 }}>⭐ Perfect game! +2000 bonus</span>
        </div>
      )}

      {/* Live opponent progress */}
      <div style={{ maxWidth: 340, margin: '0 auto', textAlign: 'left' }}>
        {allProgress
          .sort((a, b) => b.pairs_matched - a.pairs_matched)
          .map((prog) => {
            const name = playerMap.get(prog.player_id) ?? 'Unknown'
            const pct = Math.round((prog.pairs_matched / gridSizePairs) * 100)
            return (
              <div key={prog.player_id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span
                  style={{
                    fontSize: 12,
                    minWidth: 90,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: 'var(--border-strong)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: prog.finished ? '#22c55e' : '#f59e0b',
                      borderRadius: 99,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 40 }}>
                  {prog.finished ? '✓ Done' : `${prog.pairs_matched}/${gridSizePairs}`}
                </span>
              </div>
            )
          })}
      </div>
    </div>
  )
}
