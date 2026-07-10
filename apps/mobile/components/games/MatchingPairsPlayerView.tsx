import { useCallback, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
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
  MATCHING_PAIRS_WRONG_ATTEMPT_PENALTY,
  computeStreakBonus,
  getPlayerBoard,
  matchingPairsGridLayout,
  pairColor,
  pairIcon,
  parseMatchingPairsMetadata,
} from '@fateround/shared/memory-match'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { FinishedPanel, GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postMatchingPairsFlip } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import {
  MEMORY_MATCH_PROGRESS_SELECT,
  MEMORY_MATCH_SUBMISSION_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'
type CardState = 'hidden' | 'flipped' | 'matched'

type BoardState = {
  cardOrder: number[]
  cardStates: CardState[]
  firstFlipped: number | null
  locked: boolean
}

export function MatchingPairsPlayerView({ gameCode }: { gameCode: string }) {
  const [round, setRound] = useState<Round | null>(null)
  const [meta, setMeta] = useState<MatchingPairsMetadata | null>(null)
  const [submissions, setSubmissions] = useState<MatchingPairsSubmission[]>([])
  const [progress, setProgress] = useState<MatchingPairsProgress | null>(null)
  const [board, setBoard] = useState<BoardState | null>(null)
  const [points, setPoints] = useState(0)
  const [streak, setStreak] = useState(0)
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
        getSupabase().from('memory_match_progress').select(MEMORY_MATCH_PROGRESS_SELECT).eq('game_id', gameCode.toUpperCase()),
      ])

      if (roundRes.error || subsRes.error || progRes.error) return { state: null, ok: false }

      const roundData = roundRes.data as Round | null
      const parsedMeta = roundData ? parseMatchingPairsMetadata(roundData.memory_match_metadata) : null
      setRound(roundData)
      setMeta(parsedMeta)

      const allSubs = (subsRes.data as MatchingPairsSubmission[]) ?? []
      setSubmissions(allSubs)
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
        getSupabase()
          .from('memory_match_progress')
          .select(MEMORY_MATCH_PROGRESS_SELECT)
          .eq('round_id', roundData.id)
          .eq('player_id', playerId)
          .maybeSingle(),
      ])

      const mySubs = ((subs as MatchingPairsSubmission[]) ?? []).filter((s) => s.player_id === playerId)
      setProgress((prog as MatchingPairsProgress | null) ?? null)

      const cardOrder = getPlayerBoard(parsedMeta, playerId)
      if (!cardOrder) return

      const cardStates: CardState[] = new Array(cardOrder.length).fill('hidden')
      const matchedPairs = new Set(mySubs.filter((s) => s.is_match).map((s) => s.pair_index))
      for (let i = 0; i < cardOrder.length; i++) {
        if (matchedPairs.has(cardOrder[i]!)) cardStates[i] = 'matched'
      }

      setBoard({ cardOrder, cardStates, firstFlipped: null, locked: false })
      const lastPoints = mySubs.filter((s) => s.is_match).length > 0 ? mySubs[mySubs.length - 1]?.points_after ?? 0 : 0
      setPoints(lastPoints)

      let currentStreak = 0
      for (let i = mySubs.length - 1; i >= 0; i--) {
        if (mySubs[i]?.is_match) currentStreak++
        else break
      }
      setStreak(currentStreak)
    },
  })

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'memory_match_submissions', 'memory_match_progress'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const mySubs = useMemo(
    () =>
      bootstrap.myPlayerId
        ? submissions.filter((s) => s.player_id === bootstrap.myPlayerId && s.round_id === round?.id)
        : [],
    [bootstrap.myPlayerId, submissions, round?.id]
  )

  const finished = progress?.finished ?? false
  const layout = meta ? matchingPairsGridLayout(meta.gridSizePairs) : { cols: 4, rows: 4 }

  const onCardPress = async (index: number) => {
    if (!board || !meta || !bootstrap.myResumeToken || finished || board.locked) return
    if (board.cardStates[index] === 'matched' || board.cardStates[index] === 'flipped') return

    if (board.firstFlipped === null) {
      setBoard({ ...board, cardStates: board.cardStates.map((s, i) => (i === index ? 'flipped' : s)), firstFlipped: index })
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
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    return (
      <GameShell title={batch3GameLabel('matching_pairs')} subtitle={bootstrap.code}>
        <FinishedPanel title="Game over" detail={`Your score: ${points}`} />
      </GameShell>
    )
  }

  return (
    <GameShell title={batch3GameLabel('matching_pairs')} subtitle={`Score ${points} · Streak ${streak}`}>
      {!board || !meta ? (
        <Text style={styles.waiting}>Loading board…</Text>
      ) : finished ? (
        <Text style={styles.waiting}>Board complete — waiting for others…</Text>
      ) : (
        <View style={[styles.grid, { width: layout.cols * 72 }]}>
          {board.cardOrder.map((pairIndex, index) => {
            const state = board.cardStates[index]
            const showFace = state === 'flipped' || state === 'matched'
            return (
              <Pressable
                key={index}
                style={[
                  styles.card,
                  showFace && { borderColor: pairColor(meta, pairIndex), backgroundColor: '#1f2937' },
                  state === 'matched' && styles.cardMatched,
                ]}
                disabled={state === 'matched' || board.locked}
                onPress={() => void onCardPress(index)}
              >
                <Text style={styles.cardText}>{showFace ? pairIcon(meta, pairIndex) : '?'}</Text>
              </Pressable>
            )
          })}
        </View>
      )}
      <Text style={styles.meta}>
        Matched {mySubs.filter((s) => s.is_match).length}/{meta?.gridSizePairs ?? 0}
      </Text>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  waiting: { color: '#9ca3af', textAlign: 'center', marginTop: 24, fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignSelf: 'center', marginTop: 12 },
  card: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#374151',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMatched: { opacity: 0.55 },
  cardText: { fontSize: 28 },
  meta: { color: '#9ca3af', textAlign: 'center', marginTop: 16 },
})
