import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player, type Round, type WordHuntSubmission } from '@fateround/shared'
import { batch5GameLabel } from '@fateround/shared/batch-5-games'
import { parseWordHuntMetadata, tallyWordHuntScores, wordFromPath, wordHuntPoints } from '@fateround/shared/word-hunt'
import { toggleWordHuntPath, validateWordHuntSubmissionClient, validWordsSetFromMetadata } from '@fateround/shared/word-hunt-client'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postWordHuntSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, WORD_HUNT_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useWordHuntTimer } from '@/components/games/word-hunt/useWordHuntTimer'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function WordHuntPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [grid, setGrid] = useState<string[][] | null>(null)
  const [validWords, setValidWords] = useState<Set<string>>(new Set())
  const [submissions, setSubmissions] = useState<WordHuntSubmission[]>([])
  const [selectedPath, setSelectedPath] = useState<number[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadGameState = useCallback(
    async (game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      if (game.status === 'waiting') {
        setGrid(null)
        setRoundId(null)
        setSubmissions([])
        return { state: null, ok: true }
      }
      const roundRes = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', code)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundRes.error) return { state: null, ok: false }
      const round = roundRes.data as Round | null
      const meta = round ? parseWordHuntMetadata(round.word_hunt_metadata) : null
      if (round && meta) {
        setGrid(meta.grid)
        setValidWords(validWordsSetFromMetadata(meta.valid_words))
        setRoundId(round.id)
        const subsRes = await getSupabase()
          .from('word_hunt_submissions')
          .select(WORD_HUNT_SUBMISSION_SELECT)
          .eq('round_id', round.id)
        if (subsRes.error) return { state: null, ok: false }
        setSubmissions((subsRes.data as WordHuntSubmission[]) ?? [])
      } else {
        setGrid(null)
        setRoundId(null)
        setSubmissions([])
      }
      return { state: null, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) return 'join'
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'playing'
  }, [])

  const bootstrap = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen,
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'word_hunt_submissions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const { label: timeLabel, timeUp, secondsLeft } = useWordHuntTimer(
    gameCode,
    bootstrap.game,
    () => void bootstrap.load()
  )
  const urgent = secondsLeft <= 10

  const mySubmissions = useMemo(
    () => submissions.filter((s) => s.player_id === bootstrap.myPlayerId),
    [submissions, bootstrap.myPlayerId]
  )
  const foundWords = useMemo(
    () => new Set(mySubmissions.map((s) => s.word.toLowerCase())),
    [mySubmissions]
  )
  const currentWord = grid ? wordFromPath(grid, selectedPath) : ''
  const previewPoints = currentWord ? wordHuntPoints(currentWord.length) : 0

  const tapCell = (index: number) => {
    if (timeUp) return
    setSelectedPath((path) => toggleWordHuntPath(path, index))
    setMessage(null)
  }

  const submitWord = async () => {
    if (!bootstrap.myResumeToken || !grid || !roundId || submitting || timeUp) return
    const check = validateWordHuntSubmissionClient(grid, selectedPath, validWords, foundWords)
    if (!check.ok) {
      setMessage(check.error)
      if (check.clearPath) setSelectedPath([])
      return
    }
    setSubmitting(true)
    try {
      const result = await postWordHuntSubmit(
        bootstrap.code,
        bootstrap.myResumeToken,
        check.normalized,
        selectedPath
      )
      setSelectedPath([])
      setMessage(`+${result.pointsAwarded ?? wordHuntPoints(check.normalized.length)} pts`)
      await bootstrap.load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
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
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyWordHuntScores(submissions, bootstrap.players)
    const top = scores[0]
    const entries = scores.map((s) => ({
      id: s.player_id,
      name: s.name,
      points: s.points,
      detail: `${s.word_count} word${s.word_count === 1 ? '' : 's'}`,
    }))
    const winnerId = top && top.points > 0 ? top.player_id : null
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_hunt')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winnerId ? `${top!.name} wins!` : 'Game over'}
          subtitle="Final standings"
          leaderboard={pointsLeaderboard(entries, bootstrap.myPlayerId)}
          winnerPlayerId={winnerId}
        />
      </GameShell>
    )
  }

  if (!grid) {
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_hunt')} subtitle={bootstrap.code}>
        <Text style={styles.waiting}>Waiting for the board…</Text>
      </GameShell>
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_hunt')} subtitle={`${mySubmissions.length} words found`}>
      <View style={[styles.timerPill, urgent && styles.timerPillUrgent, timeUp && styles.timerPillUp]}>
        <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>
          {timeUp ? '0:00' : timeLabel}
        </Text>
      </View>

      {timeUp ? <Text style={styles.timeUpNotice}>Time's up!</Text> : null}

      <View style={[styles.grid, timeUp && styles.gridDisabled]}>
        {grid.flatMap((row, rowIndex) =>
          row.map((letter, colIndex) => {
            const index = rowIndex * 4 + colIndex
            const selected = !timeUp && selectedPath.includes(index)
            return (
              <Pressable
                key={index}
                style={[styles.cell, selected && styles.cellSelected]}
                disabled={timeUp}
                onPress={() => tapCell(index)}
              >
                <Text style={styles.cellText}>{letter}</Text>
              </Pressable>
            )
          })
        )}
      </View>

      <View style={styles.wordRow}>
        <Text style={styles.currentWord}>
          {timeUp ? 'Time is up' : currentWord || 'Tap letters in order'}
        </Text>
        {!timeUp && currentWord ? <Text style={styles.points}>{previewPoints} pts</Text> : null}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, (!currentWord || submitting || timeUp) && styles.primaryBtnDisabled]}
        disabled={!currentWord || submitting || timeUp}
        onPress={() => void submitWord()}
      >
        <Text style={styles.primaryText}>Submit word</Text>
      </Pressable>

      <ScrollView style={styles.foundList}>
        {mySubmissions.map((sub) => (
          <Text key={sub.id} style={styles.foundWord}>
            {sub.word} · {sub.points_awarded}
          </Text>
        ))}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
  timerPill: {
    alignSelf: 'center',
    backgroundColor: theme.surface,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 6,
    marginBottom: 12,
  },
  // Functional urgent-red state color, not in the token table — kept fixed.
  timerPillUrgent: { backgroundColor: '#dc2626' },
  timerPillUp: { backgroundColor: '#dc2626' },
  timerText: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  // White on the solid red urgent pill — correct in both schemes.
  timerTextUrgent: { color: '#fff' },
  timeUpNotice: {
    color: '#dc2626',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  gridDisabled: { opacity: 0.5 },
  // Word-hunt letter grid is a functional board (Step D) — cell colors left as-is.
  cell: {
    width: '22%',
    aspectRatio: 1,
    backgroundColor: '#17171d',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  cellSelected: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  // White letter on the dark board cell — intentional (case 2).
  cellText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  wordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  currentWord: { color: theme.text, fontSize: 18, fontWeight: '700', flex: 1 },
  points: { color: '#fbbf24', fontWeight: '700' },
  message: { color: '#fbbf24', textAlign: 'center', marginTop: 8 },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  // White on the solid primary button — intentional (case 2).
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  foundList: { marginTop: 12, maxHeight: 160 },
  foundWord: { color: theme.textMuted, fontSize: 14, paddingVertical: 2 },
})
