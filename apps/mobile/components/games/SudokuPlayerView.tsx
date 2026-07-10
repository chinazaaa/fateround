import { useCallback, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type Game, type Round, type SudokuSubmission } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  buildPlayerDisplayGrid,
  parseSudokuMetadata,
  playerHasSolvedCell,
} from '@fateround/shared/sudoku'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postSudokuSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function SudokuPlayerView({ gameCode }: { gameCode: string }) {
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  const [drafts, setDrafts] = useState<number[][]>(() => Array.from({ length: 9 }, () => Array(9).fill(0)))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const loadGameState = useCallback(
    async (game: Game): Promise<{ state: boolean; ok: boolean }> => {
      if (game.status !== 'active') {
        setPuzzle(null)
        return { state: false, ok: true }
      }
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { state: false, ok: true }
      const meta = parseSudokuMetadata((roundData as Round).sudoku_metadata)
      if (!meta) return { state: false, ok: true }
      setPuzzle(meta.puzzle)
      return { state: true, ok: true }
    },
    [gameCode]
  )

  const bootstrap = useGameViewBootstrap<Screen, boolean>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState: (game, _players) => loadGameState(game),
    computeScreen: (game, playerId, state) => {
      if (!playerId) return 'join'
      if (game.status === 'finished') return 'finished'
      if (game.status === 'waiting') return 'waiting'
      return state ? 'playing' : 'waiting'
    },
    afterResolve: async (game, playerId) => {
      if (!playerId || game.status !== 'active') return
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return
      const { data: subs } = await getSupabase()
        .from('sudoku_submissions')
        .select(SUDOKU_SUBMISSION_SELECT)
        .eq('round_id', roundData.id)
      setSubmissions((subs as SudokuSubmission[]) ?? [])
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'sudoku_submissions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const displayGrid = useMemo(() => {
    if (!puzzle || !bootstrap.myPlayerId) return null
    return buildPlayerDisplayGrid(puzzle, submissions, bootstrap.myPlayerId, drafts)
  }, [puzzle, submissions, bootstrap.myPlayerId, drafts])

  const pickNumber = async (value: number) => {
    if (!selected || !puzzle || !bootstrap.myResumeToken || !bootstrap.myPlayerId || submitting) return
    const [row, col] = selected
    if (puzzle[row]![col] !== 0) return
    if (playerHasSolvedCell(submissions, bootstrap.myPlayerId, row, col)) return

    setSubmitting(true)
    setMessage(null)
    try {
      const result = await postSudokuSubmit(bootstrap.code, bootstrap.myResumeToken, row, col, value)
      setMessage(result.isCorrect ? `+${result.pointsAwarded} pts` : 'Wrong — try again')
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
    const myPoints = submissions
      .filter((s) => s.player_id === bootstrap.myPlayerId && s.is_correct)
      .reduce((sum, s) => sum + s.points_awarded, 0)
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('sudoku')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title="Game over" detail={`Your score: ${myPoints}`} />
      </GameShell>
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('sudoku')} subtitle={bootstrap.code}>
      {!displayGrid ? (
        <Text style={styles.waiting}>Waiting for puzzle…</Text>
      ) : (
        <>
          <View style={styles.board}>
            {displayGrid.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((value, c) => {
                  const given = puzzle![r]![c] !== 0
                  const solved =
                    bootstrap.myPlayerId != null &&
                    playerHasSolvedCell(submissions, bootstrap.myPlayerId, r, c)
                  const selectedCell = selected?.[0] === r && selected?.[1] === c
                  return (
                    <Pressable
                      key={`${r}-${c}`}
                      style={[
                        styles.cell,
                        given && styles.cellGiven,
                        solved && styles.cellSolved,
                        selectedCell && styles.cellSelected,
                      ]}
                      disabled={given || solved}
                      onPress={() => setSelected([r, c])}
                    >
                      <Text style={styles.cellText}>{value > 0 ? value : ''}</Text>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
          <View style={styles.pad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <Pressable
                key={n}
                style={styles.padKey}
                disabled={!selected || submitting}
                onPress={() => void pickNumber(n)}
              >
                <Text style={styles.padText}>{n}</Text>
              </Pressable>
            ))}
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </>
      )}
    </GameShell>
  )
}

const styles = StyleSheet.create({
  waiting: { color: '#9ca3af', textAlign: 'center', marginTop: 24 },
  board: { alignSelf: 'center', borderWidth: 2, borderColor: '#374151', marginTop: 8 },
  row: { flexDirection: 'row' },
  cell: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: '#374151',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  cellGiven: { backgroundColor: '#1f2937' },
  cellSolved: { backgroundColor: '#14532d' },
  cellSelected: { borderColor: '#f43f5e' },
  cellText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 },
  padKey: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#17171d',
    borderWidth: 1,
    borderColor: '#2a2a35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  message: { color: '#fcd34d', textAlign: 'center', marginTop: 12 },
})
