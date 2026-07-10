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
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postWordHuntSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, WORD_HUNT_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function WordHuntPlayerView({ gameCode }: { gameCode: string }) {
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
    setSelectedPath((path) => toggleWordHuntPath(path, index))
    setMessage(null)
  }

  const submitWord = async () => {
    if (!bootstrap.myResumeToken || !grid || !roundId || submitting) return
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
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_hunt')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap}
          title="Game over"
          detail={top ? `${top.name} — ${top.points} pts (${top.word_count} words)` : undefined}
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
      <View style={styles.grid}>
        {grid.flatMap((row, rowIndex) =>
          row.map((letter, colIndex) => {
            const index = rowIndex * 4 + colIndex
            const selected = selectedPath.includes(index)
            return (
              <Pressable
                key={index}
                style={[styles.cell, selected && styles.cellSelected]}
                onPress={() => tapCell(index)}
              >
                <Text style={styles.cellText}>{letter}</Text>
              </Pressable>
            )
          })
        )}
      </View>

      <View style={styles.wordRow}>
        <Text style={styles.currentWord}>{currentWord || 'Tap letters in order'}</Text>
        {currentWord ? <Text style={styles.points}>{previewPoints} pts</Text> : null}
      </View>

      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={[styles.primaryBtn, (!currentWord || submitting) && styles.primaryBtnDisabled]}
        disabled={!currentWord || submitting}
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

const styles = StyleSheet.create({
  waiting: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginTop: 24 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
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
  cellText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  wordRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  currentWord: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  points: { color: '#fbbf24', fontWeight: '700' },
  message: { color: '#fbbf24', textAlign: 'center', marginTop: 8 },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  foundList: { marginTop: 12, maxHeight: 160 },
  foundWord: { color: '#9ca3af', fontSize: 14, paddingVertical: 2 },
})
