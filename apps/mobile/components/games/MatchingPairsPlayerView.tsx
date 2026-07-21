import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  type Game,
  type MatchingPairsMetadata,
  type MatchingPairsProgress,
  type MatchingPairsSubmission,
  type Player,
  type Round,
} from '@fateround/shared'
import {
  MATCHING_PAIRS_FLIP_BACK_MS,
  MATCHING_PAIRS_POINTS_PER_PAIR,
  MATCHING_PAIRS_STREAK_BONUS,
  MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY,
  computeStreakBonus,
  getPlayerBoard,
  matchingPairsGridLayout,
  pairColor,
  pairIcon,
  parseMatchingPairsMetadata,
} from '@fateround/shared/memory-match'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameScores, useGameStats } from '@/components/session/RosterDrawerContext'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postMatchingPairsFlip } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { MEMORY_MATCH_PROGRESS_SELECT, MEMORY_MATCH_SUBMISSION_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { MatchingPairsGameTimerBar } from '@/components/games/matching-pairs/MatchingPairsGameTimerBar'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { MatchingPairsOpponentStrip } from '@/components/games/matching-pairs/MatchingPairsOpponentStrip'
import { MatchingPairsWaitingForOthers } from '@/components/games/matching-pairs/MatchingPairsWaitingForOthers'
import {
  MatchingPairsFlash,
  MatchingPairsScoreHeader,
  MemoryCard,
  type FlashType,
} from '@/components/games/matching-pairs/MatchingPairsPlayUi'
import {
  buildCumulativeMatchingPairsScores,
  type MatchingPairsProgressWithTiming,
} from '@/components/games/matching-pairs/matchingPairsScore'
import { MatchingPairsBreakdownList } from '@/components/games/matching-pairs/MatchingPairsBreakdown'
import { MatchingPairsRoundResults } from '@/components/games/matching-pairs/MatchingPairsRoundResults'

// The shared MEMORY_MATCH_PROGRESS_SELECT / MatchingPairsProgress type omit the
// `finished_at` + `created_at` columns (both exist on memory_match_progress).
// Fetch them here so the speed-par bonus + time-taken can be scored at web
// parity without editing the shared select/type.
const MEMORY_MATCH_PROGRESS_SELECT_TIMED = `${MEMORY_MATCH_PROGRESS_SELECT},finished_at,created_at`

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'
type CardState = 'hidden' | 'flipped' | 'matched'

type BoardState = {
  cardOrder: number[]
  cardStates: CardState[]
  firstFlipped: number | null
  locked: boolean
}

/** Face-up preview time before the board flips down: longer for the big grid. */
const getMemorizeSeconds = (gridSizePairs: number) => (gridSizePairs >= 16 ? 5 : 3)

export function MatchingPairsPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [round, setRound] = useState<Round | null>(null)
  const [meta, setMeta] = useState<MatchingPairsMetadata | null>(null)
  const [submissions, setSubmissions] = useState<MatchingPairsSubmission[]>([])
  const [progress, setProgress] = useState<MatchingPairsProgress | null>(null)
  const [allProgress, setAllProgress] = useState<MatchingPairsProgress[]>([])
  // Progress rows across every round (for cumulative final scoring). Timed
  // variant includes finished_at/created_at for the speed-par bonus.
  const [gameProgress, setGameProgress] = useState<MatchingPairsProgressWithTiming[]>([])
  const [finishRank, setFinishRank] = useState<number | null>(null)
  const [board, setBoard] = useState<BoardState | null>(null)
  const [points, setPoints] = useState(0)
  const [streak, setStreak] = useState(0)
  // Floating feedback pop (+points / streak / miss). `id` forces a re-fire even
  // when the same type repeats back-to-back.
  const [flash, setFlash] = useState<{ type: FlashType; id: number } | null>(null)
  const flashIdRef = useRef(0)
  // Memorization phase — null when inactive, else the seconds remaining.
  const [memorizeCountdown, setMemorizeCountdown] = useState<number | null>(null)
  const memorizeRoundRef = useRef<string | null>(null)
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadGameState = useCallback(
    async (game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      if (game.status !== 'active' && game.status !== 'finished') {
        setRound(null)
        setMeta(null)
        return { state: null, ok: true }
      }

      const roundNumber = game.current_round_number ?? 1
      const [roundRes, subsRes, progRes] = await Promise.all([
        getSupabase()
          .from('rounds')
          .select(ROUND_SELECT)
          .eq('game_id', gameCode.toUpperCase())
          .eq('round_number', roundNumber)
          .maybeSingle(),
        getSupabase()
          .from('memory_match_submissions')
          .select(MEMORY_MATCH_SUBMISSION_SELECT)
          .eq('game_id', gameCode.toUpperCase()),
        getSupabase()
          .from('memory_match_progress')
          .select(MEMORY_MATCH_PROGRESS_SELECT_TIMED)
          .eq('game_id', gameCode.toUpperCase()),
      ])

      if (roundRes.error || subsRes.error || progRes.error) return { state: null, ok: false }

      const roundData = roundRes.data as Round | null
      const parsedMeta = roundData ? parseMatchingPairsMetadata(roundData.memory_match_metadata) : null
      setRound(roundData)
      setMeta(parsedMeta)

      const allSubs = (subsRes.data as MatchingPairsSubmission[]) ?? []
      setSubmissions(allSubs)
      setGameProgress((progRes.data as MatchingPairsProgressWithTiming[]) ?? [])
      return { state: null, ok: true }
    },
    [gameCode]
  )

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId) => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'finished') return 'finished'
      return 'playing'
    },
    afterResolve: async (game, playerId) => {
      if (!playerId || !game) return
      const roundNumber = game.current_round_number ?? 1
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', roundNumber)
        .maybeSingle()
      const parsedMeta = roundData ? parseMatchingPairsMetadata((roundData as Round).memory_match_metadata) : null
      if (!roundData || !parsedMeta) return

      const [{ data: subs }, { data: prog }] = await Promise.all([
        getSupabase()
          .from('memory_match_submissions')
          .select(MEMORY_MATCH_SUBMISSION_SELECT)
          .eq('game_id', gameCode.toUpperCase())
          .eq('round_id', roundData.id),
        getSupabase().from('memory_match_progress').select(MEMORY_MATCH_PROGRESS_SELECT).eq('round_id', roundData.id),
      ])

      const mySubs = ((subs as MatchingPairsSubmission[]) ?? []).filter((s) => s.player_id === playerId)
      const roundProgress = (prog as MatchingPairsProgress[]) ?? []
      const myProg = roundProgress.find((p) => p.player_id === playerId) ?? null
      setAllProgress(roundProgress)
      setProgress(myProg)
      setFinishRank(myProg?.finish_rank ?? null)

      const cardOrder = getPlayerBoard(parsedMeta, playerId)
      if (!cardOrder) return

      const cardStates: CardState[] = new Array(cardOrder.length).fill('hidden')
      const matchedPairs = new Set(mySubs.filter((s) => s.is_match).map((s) => s.pair_index))
      for (let i = 0; i < cardOrder.length; i++) {
        if (matchedPairs.has(cardOrder[i]!)) cardStates[i] = 'matched'
      }

      setBoard({ cardOrder, cardStates, firstFlipped: null, locked: false })
      const lastPoints =
        mySubs.filter((s) => s.is_match).length > 0 ? (mySubs[mySubs.length - 1]?.points_after ?? 0) : 0
      setPoints(lastPoints)

      let currentStreak = 0
      for (let i = mySubs.length - 1; i >= 0; i--) {
        if (mySubs[i]?.is_match) currentStreak++
        else break
      }
      setStreak(currentStreak)

      // Start the memorize preview for a fresh round (no flips yet, round still active).
      const roundActive = (roundData as Round).status !== 'finished'
      if (mySubs.length === 0 && game.status === 'active' && roundActive && memorizeRoundRef.current !== roundData.id) {
        memorizeRoundRef.current = roundData.id
        setMemorizeCountdown(getMemorizeSeconds(parsedMeta.gridSizePairs))
      }
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'memory_match_submissions', 'memory_match_progress'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  // ── Memorization countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (memorizeCountdown === null || memorizeCountdown <= 0) return
    const t = setTimeout(() => setMemorizeCountdown((c) => (c !== null ? (c <= 1 ? null : c - 1) : null)), 1000)
    return () => clearTimeout(t)
  }, [memorizeCountdown])

  useEffect(() => {
    return () => {
      if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current)
    }
  }, [])

  const mySubs = useMemo(
    () =>
      bootstrap.myPlayerId
        ? submissions.filter((s) => s.player_id === bootstrap.myPlayerId && s.round_id === round?.id)
        : [],
    [bootstrap.myPlayerId, submissions, round?.id]
  )

  const finished = progress?.finished ?? false
  const memorizing = memorizeCountdown !== null
  const wrongAttempts = mySubs.filter((s) => !s.is_match).length
  const pairsMatched = mySubs.filter((s) => s.is_match).length
  const playerNameOf = useCallback(
    (id: string) => bootstrap.players.find((p) => p.id === id)?.name ?? 'Player',
    [bootstrap.players]
  )
  const layout = meta ? matchingPairsGridLayout(meta.gridSizePairs) : { cols: 4, rows: 4 }
  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  // ── Multi-round state ─────────────────────────────────────────────────────
  const totalRounds = bootstrap.game?.rounds_count ?? 1
  const currentRoundNumber = bootstrap.game?.current_round_number ?? 1
  const isLastRound = currentRoundNumber >= totalRounds
  const showingRoundResults =
    bootstrap.screen === 'playing' && bootstrap.game?.status === 'active' && round?.status === 'finished'

  // Per-round standings for the interstitial (best points this round per player).
  const roundStandings = useMemo(() => {
    if (!round) return []
    const roundSubs = submissions.filter((s) => s.round_id === round.id)
    return bootstrap.players
      .filter((p) => !p.spectator)
      .map((p) => {
        const ps = roundSubs.filter((s) => s.player_id === p.id)
        const pts = ps.reduce((max, s) => Math.max(max, s.points_after), 0)
        const pairs = ps.filter((s) => s.is_match).length
        return { id: p.id, name: p.name, points: pts, detail: `${pairs} pair${pairs === 1 ? '' : 's'}` }
      })
  }, [round, submissions, bootstrap.players])

  const onCardPress = async (index: number) => {
    if (!board || !meta || !bootstrap.myResumeToken || finished || board.locked || memorizing) return
    if (board.cardStates[index] === 'matched' || board.cardStates[index] === 'flipped') return

    if (board.firstFlipped === null) {
      setBoard({
        ...board,
        cardStates: board.cardStates.map((s, i) => (i === index ? 'flipped' : s)),
        firstFlipped: index,
      })
      return
    }

    if (board.firstFlipped === index) return

    const firstIndex = board.firstFlipped
    const pairA = board.cardOrder[firstIndex]!
    const pairB = board.cardOrder[index]!
    const isMatch = pairA === pairB

    setBoard({
      ...board,
      cardStates: board.cardStates.map((s, i) => (i === index ? 'flipped' : s)),
      locked: true,
    })

    if (isMatch) {
      const bonus = computeStreakBonus(streak)
      setStreak((s) => s + 1)
      setPoints((p) => p + 1000 + bonus)
      setFlash({ type: bonus > 0 ? 'streak' : 'match', id: ++flashIdRef.current })
      setBoard((prev) => {
        if (!prev) return prev
        const nextStates = [...prev.cardStates]
        nextStates[firstIndex] = 'matched'
        nextStates[index] = 'matched'
        return { ...prev, cardStates: nextStates, firstFlipped: null, locked: false }
      })
      void postMatchingPairsFlip(bootstrap.code, bootstrap.myResumeToken, pairA, true).then(() => bootstrap.load())
    } else {
      setStreak(0)
      setPoints((p) => Math.max(0, p - MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY))
      setFlash({ type: 'miss', id: ++flashIdRef.current })
      if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current)
      flipTimeoutRef.current = setTimeout(() => {
        setBoard((prev) => {
          if (!prev) return prev
          const nextStates = [...prev.cardStates]
          nextStates[firstIndex] = 'hidden'
          nextStates[index] = 'hidden'
          return { ...prev, cardStates: nextStates, firstFlipped: null, locked: false }
        })
      }, MATCHING_PAIRS_FLIP_BACK_MS)
      void postMatchingPairsFlip(bootstrap.code, bootstrap.myResumeToken, pairA, false).then(() => bootstrap.load())
    }
  }

  const gameTimer =
    (bootstrap.game?.timer_seconds ?? 0) > 0 && bootstrap.game?.status === 'active' ? (
      <MatchingPairsGameTimerBar
        gameCode={bootstrap.code}
        game={bootstrap.game}
        roundStartedAt={round?.started_at ?? null}
        onExpired={() => void bootstrap.load()}
      />
    ) : null
  const gameTimerPinned = useStickyTimer(gameTimer, [bootstrap.code, bootstrap.game, round?.started_at])

  // Feed the roster drawer scoreboard: cumulative points headline + pairs detail.
  const rosterScored = useMemo(() => {
    const gridSizePairs = meta?.gridSizePairs ?? 8
    const sessionStartedAt = bootstrap.game?.session_started_at ?? null
    const timerSeconds = bootstrap.game?.timer_seconds ?? null
    const roundStartedAtMap = new Map<string, string>()
    for (const p of gameProgress) {
      if (p.created_at && !roundStartedAtMap.has(p.round_id)) roundStartedAtMap.set(p.round_id, p.created_at)
    }
    return buildCumulativeMatchingPairsScores(
      submissions,
      gameProgress,
      gridSizePairs,
      sessionStartedAt,
      roundStartedAtMap,
      timerSeconds
    )
  }, [meta, bootstrap.game?.session_started_at, bootstrap.game?.timer_seconds, submissions, gameProgress])
  useGameScores(
    useMemo(() => Object.fromEntries(rosterScored.map((r) => [r.playerId, r.finalScore])), [rosterScored]),
    { suffix: ' pts' }
  )
  useGameStats(
    useMemo(
      () =>
        Object.fromEntries(
          rosterScored.map((r) => [r.playerId, `🃏 ${r.pairsMatched} pair${r.pairsMatched === 1 ? '' : 's'}`])
        ),
      [rosterScored]
    )
  )

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'join' && bootstrap.game) {
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join()}
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    // Authoritative scoring parity: score each round via tallyMatchingPairsScore
    // (base + streak + placement + perfect + clean-streak + speed-par, minus
    // penalty) and sum across rounds — matching the web final standings. The
    // speed-par bonus uses finished_at/created_at fetched via the timed select.
    const gridSizePairs = meta?.gridSizePairs ?? 8
    const sessionStartedAt = bootstrap.game?.session_started_at ?? null
    const timerSeconds = bootstrap.game?.timer_seconds ?? null
    const totalRoundsPlayed = bootstrap.game?.rounds_count ?? 1
    // Round start anchors (per round) from each round's earliest progress row —
    // mirrors web's roundStartedAtMap; used for the speed-par bonus.
    const roundStartedAtMap = new Map<string, string>()
    for (const p of gameProgress) {
      if (p.created_at && !roundStartedAtMap.has(p.round_id)) roundStartedAtMap.set(p.round_id, p.created_at)
    }
    const scored = buildCumulativeMatchingPairsScores(
      submissions,
      gameProgress,
      gridSizePairs,
      sessionStartedAt,
      roundStartedAtMap,
      timerSeconds
    )
    const nameOf = (id: string) => bootstrap.players.find((p) => p.id === id)?.name ?? 'Player'
    const visibleRows = scored.filter((row) => bootstrap.players.some((p) => p.id === row.playerId && !p.spectator))
    const entries = visibleRows.map((row) => {
      const bits = [`${row.pairsMatched} pair${row.pairsMatched === 1 ? '' : 's'}`]
      if (row.longestStreak > 1) bits.push(`🔥${row.longestStreak}`)
      if (row.wrongAttempts > 0) bits.push(`${row.wrongAttempts} miss${row.wrongAttempts === 1 ? '' : 'es'}`)
      if (row.speedParBonusTotal > 0) bits.push(`⚡+${row.speedParBonusTotal}`)
      if (row.perfectGame) bits.push('⭐ Perfect')
      return { id: row.playerId, name: nameOf(row.playerId), points: row.finalScore, detail: bits.join(' · ') }
    })
    const top = [...entries].sort((a, b) => b.points - a.points)[0]
    const winnerId = top && top.points > 0 ? top.id : null
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('matching_pairs')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          emoji="🏆"
          title={winnerId ? `${top!.name} wins!` : 'Puzzle complete!'}
          subtitle="Final standings"
          leaderboard={pointsLeaderboard(entries, bootstrap.myPlayerId)}
          winnerPlayerId={winnerId}
          roundKey={bootstrap.game?.session_started_at ?? undefined}
          notice={
            <MatchingPairsBreakdownList
              entries={visibleRows.map((row) => ({
                playerId: row.playerId,
                name: nameOf(row.playerId),
                finalScore: row.finalScore,
              }))}
              allSubmissions={submissions}
              allProgress={gameProgress}
              gridSizePairs={gridSizePairs}
              sessionStartedAt={sessionStartedAt}
              roundStartedAtMap={roundStartedAtMap}
              totalRounds={totalRoundsPlayed}
              timerSeconds={timerSeconds}
              myPlayerId={bootstrap.myPlayerId}
            />
          }
        />
      </GameShell>
    )
  }

  const roundLabel = totalRounds > 1 ? `Round ${currentRoundNumber}/${totalRounds} · ` : ''

  // ── Round-results interstitial (multi-round, between rounds) ───────────────
  if (showingRoundResults) {
    const roundBoard = pointsLeaderboard(roundStandings, bootstrap.myPlayerId)
    const myTotal = roundBoard.find((r) => r.you)
    return (
      <GameShell
        bootstrap={bootstrap}
        title={batch3GameLabel('matching_pairs')}
        subtitle={`${roundLabel}Score ${points}`}
      >
        <MatchingPairsRoundResults
          currentRoundNumber={currentRoundNumber}
          totalRounds={totalRounds}
          isLastRound={isLastRound}
          endedAt={round?.ended_at ?? null}
          gameType={bootstrap.game?.game_type}
          detail={myTotal ? `Your score: ${myTotal.score} pts` : undefined}
          leaderboard={roundBoard}
        />
      </GameShell>
    )
  }

  return (
    <GameShell
      bootstrap={bootstrap}
      title={batch3GameLabel('matching_pairs')}
      subtitle={`${roundLabel}Score ${points} · Streak ${streak}`}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {gameTimerPinned ? null : gameTimer}
        {finished && meta ? (
          <MatchingPairsWaitingForOthers
            pairsMatched={pairsMatched}
            gridSizePairs={meta.gridSizePairs}
            finishRank={finishRank}
            allProgress={allProgress}
            myPlayerId={bootstrap.myPlayerId}
            playerName={playerNameOf}
            totalPoints={points}
            wrongAttempts={wrongAttempts}
            currentStreak={streak}
            roundId={round?.id ?? null}
          />
        ) : isViewer ? (
          <Text style={styles.waiting}>Watching — matches resolve on each player's own board.</Text>
        ) : (
          <>
            {totalRounds > 1 && (
              <Text style={styles.roundIndicator}>
                Round {currentRoundNumber}/{totalRounds}
              </Text>
            )}
            <MatchingPairsScoreHeader
              points={points}
              pairsMatched={pairsMatched}
              gridSizePairs={meta?.gridSizePairs ?? 0}
              streak={streak}
              wrongAttempts={wrongAttempts}
            />
            {memorizing && (
              <View style={styles.memorizeBanner}>
                <Text style={styles.memorizeText}>Memorize card positions!</Text>
                <Text style={styles.memorizeCount}>{memorizeCountdown}s</Text>
              </View>
            )}
            {!board || !meta ? (
              <Text style={styles.waiting}>Loading board…</Text>
            ) : (
              <View style={styles.boardWrap}>
                <MatchingPairsFlash
                  flash={flash}
                  pointsPerPair={MATCHING_PAIRS_POINTS_PER_PAIR}
                  streakBonus={MATCHING_PAIRS_STREAK_BONUS}
                />
                <View style={[styles.grid, { width: layout.cols * 72 }]}>
                  {board.cardOrder.map((pairIndex, index) => {
                    const state = board.cardStates[index]
                    const showFace = memorizing || state === 'flipped' || state === 'matched'
                    return (
                      <MemoryCard
                        key={index}
                        state={state}
                        showFace={showFace}
                        icon={pairIcon(meta, pairIndex)}
                        color={pairColor(meta, pairIndex)}
                        size={64}
                        disabled={memorizing || state === 'matched' || board.locked}
                        onPress={() => void onCardPress(index)}
                      />
                    )
                  })}
                </View>
              </View>
            )}
            {meta && allProgress.length > 1 && (
              <MatchingPairsOpponentStrip
                allProgress={allProgress}
                myPlayerId={bootstrap.myPlayerId}
                playerName={playerNameOf}
                gridSizePairs={meta.gridSizePairs}
                roundId={round?.id ?? null}
              />
            )}
          </>
        )}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
    waiting: { color: theme.textMuted, textAlign: 'center', marginTop: 24, fontSize: 16 },
    roundIndicator: {
      color: theme.textMuted,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
    boardWrap: { position: 'relative', alignSelf: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'center', marginTop: 12 },
    memorizeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginTop: 8,
      // Preview banner — brand indigo, kept consistent across themes.
      backgroundColor: '#6366f1',
    },
    memorizeText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    memorizeCount: { color: '#fff', fontWeight: '800', fontSize: 24 },
  })
