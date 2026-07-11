import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type Game, type Round, type SudokuSubmission } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  buildPlayerDisplayGrid,
  buildPlayerSolvedGrid,
  parseSudokuMetadata,
  playerHasSolvedCell,
} from '@fateround/shared/sudoku'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postSudokuSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import {
  buildCellOwnerGrid,
  formatMinutesSeconds,
  getPlayerTimeSpent,
  ordinal,
  playerCompletionPercent,
  sudokuPlayerColor,
  SUDOKU_MY_CELL_COLOR,
  tallySudokuScores,
} from '@/components/games/sudoku/standings'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function SudokuPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  const [drafts, setDrafts] = useState<number[][]>(() => Array.from({ length: 9 }, () => Array(9).fill(0)))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

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

  // Tick once a second while playing so the live time column stays fresh.
  useEffect(() => {
    if (bootstrap.screen !== 'playing') return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [bootstrap.screen])

  const displayGrid = useMemo(() => {
    if (!puzzle || !bootstrap.myPlayerId) return null
    return buildPlayerDisplayGrid(puzzle, submissions, bootstrap.myPlayerId, drafts)
  }, [puzzle, submissions, bootstrap.myPlayerId, drafts])

  // First correct solver per empty cell — drives each cell's owner color.
  const cellOwners = useMemo(() => buildCellOwnerGrid(submissions), [submissions])
  const mySolvedCells = useMemo(
    () => (bootstrap.myPlayerId ? buildPlayerSolvedGrid(submissions, bootstrap.myPlayerId) : undefined),
    [submissions, bootstrap.myPlayerId]
  )

  // Per-player colors assigned by join order (spectators excluded, matching web).
  const activePlayers = useMemo(
    () => bootstrap.players.filter((p) => p.spectator !== true),
    [bootstrap.players]
  )
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = sudokuPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const standings = useMemo(
    () => tallySudokuScores(submissions, activePlayers),
    [submissions, activePlayers]
  )

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
    const entries = bootstrap.players
      .filter((p) => !p.spectator)
      .map((p) => ({
        id: p.id,
        name: p.name,
        points: submissions
          .filter((s) => s.player_id === p.id && s.is_correct)
          .reduce((sum, s) => sum + s.points_awarded, 0),
      }))
    const top = [...entries].sort((a, b) => b.points - a.points)[0]
    const winnerId = top && top.points > 0 ? top.id : null
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('sudoku')} subtitle={bootstrap.code}>
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

  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const myRank = standings.findIndex((r) => r.player_id === bootstrap.myPlayerId) + 1
  const myCompletion =
    puzzle && bootstrap.myPlayerId ? playerCompletionPercent(puzzle, submissions, bootstrap.myPlayerId) : 0
  const myTime = getPlayerTimeSpent(
    bootstrap.game,
    submissions,
    bootstrap.myPlayerId || '',
    myCompletion,
    nowMs,
    me?.joined_at
  )

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('sudoku')} subtitle={bootstrap.code}>
      {!displayGrid ? (
        <Text style={styles.waiting}>Waiting for puzzle…</Text>
      ) : (
        <>
          {/* My status header */}
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <View style={[styles.swatch, { backgroundColor: SUDOKU_MY_CELL_COLOR }]} />
              <View>
                <Text style={styles.statusName}>{me?.name ?? 'Me'}</Text>
                <Text style={styles.statusMeta}>
                  {myRank > 0 ? ordinal(myRank) : '—'} · {myCompletion}%
                </Text>
              </View>
            </View>
            {bootstrap.game?.session_started_at ? (
              <View style={styles.timePill}>
                <Text style={styles.timePillText}>⏱ {formatMinutesSeconds(myTime)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.board}>
            {displayGrid.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((value, c) => {
                  const given = puzzle![r]![c] !== 0
                  const mine = mySolvedCells?.[r]?.[c] === true
                  const owner = !given && !mine ? cellOwners[r]![c] : null
                  const ownerColor = owner ? playerColors[owner] ?? sudokuPlayerColor(0) : null
                  const selectedCell = selected?.[0] === r && selected?.[1] === c
                  const bg = mine ? SUDOKU_MY_CELL_COLOR : ownerColor ?? undefined
                  return (
                    <Pressable
                      key={`${r}-${c}`}
                      style={[
                        styles.cell,
                        given && styles.cellGiven,
                        bg ? { backgroundColor: bg } : null,
                        selectedCell && styles.cellSelected,
                      ]}
                      disabled={given || mine}
                      onPress={() => setSelected([r, c])}
                    >
                      <Text style={[styles.cellText, mine && styles.cellTextSolved]}>
                        {value > 0 ? value : ''}
                      </Text>
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

          {/* Live standings */}
          {standings.length > 0 ? (
            <View style={styles.standings}>
              {standings.map((rowData, i) => {
                const pct = puzzle ? playerCompletionPercent(puzzle, submissions, rowData.player_id) : 0
                const color = playerColors[rowData.player_id] ?? sudokuPlayerColor(0)
                const playerSolved = buildPlayerSolvedGrid(submissions, rowData.player_id)
                const timeSecs = getPlayerTimeSpent(
                  bootstrap.game,
                  submissions,
                  rowData.player_id,
                  pct,
                  nowMs,
                  activePlayers.find((p) => p.id === rowData.player_id)?.joined_at
                )
                const isMe = rowData.player_id === bootstrap.myPlayerId
                return (
                  <View key={rowData.player_id} style={[styles.standRow, isMe && styles.standRowMe]}>
                    <MiniGrid puzzle={puzzle} playerSolved={playerSolved} color={color} styles={styles} />
                    <View style={[styles.swatchSm, { backgroundColor: color }]} />
                    <View style={styles.standInfo}>
                      <Text style={styles.standName} numberOfLines={1}>
                        {rowData.name}
                      </Text>
                      <Text style={styles.standMeta} numberOfLines={1}>
                        {ordinal(i + 1)} of {standings.length} · {pct}%
                        {bootstrap.game?.session_started_at ? ` · ⏱ ${formatMinutesSeconds(timeSecs)}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.standPoints}>{rowData.points} pts</Text>
                  </View>
                )
              })}
            </View>
          ) : null}
        </>
      )}
    </GameShell>
  )
}

function MiniGrid({
  puzzle,
  playerSolved,
  color,
  styles,
}: {
  puzzle: number[][] | null
  playerSolved: boolean[][]
  color: string
  styles: ReturnType<typeof makeStyles>
}) {
  if (!puzzle) return <View style={styles.miniGrid} />
  return (
    <View style={styles.miniGrid}>
      {Array.from({ length: 81 }, (_, i) => {
        const row = Math.floor(i / 9)
        const col = i % 9
        const owned = playerSolved[row]?.[col]
        const given = puzzle[row]?.[col] !== 0
        const bg = owned ? color : given ? 'rgba(148,163,184,0.35)' : 'transparent'
        return <View key={i} style={[styles.miniCell, { backgroundColor: bg }]} />
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    waiting: { color: theme.textMuted, textAlign: 'center', marginTop: 24 },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 2,
    },
    statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    swatch: { width: 16, height: 16, borderRadius: 4 },
    statusName: { color: theme.text, fontWeight: '700', fontSize: 15 },
    statusMeta: { color: theme.textMuted, fontSize: 13, marginTop: 1 },
    timePill: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    timePillText: { color: theme.textMuted, fontWeight: '600', fontSize: 13 },
    // Sudoku grid is a functional board (Step D) — frame + cell state colors left as-is.
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
    cellSelected: { borderColor: '#f43f5e' },
    // White digit on the dark grid cell — intentional (case 2).
    cellText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    // Dark digit on the pastel-green "my solved" cell so the value stays readable.
    cellTextSolved: { color: '#0b1220' },
    pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 16 },
    padKey: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    padText: { color: theme.text, fontSize: 18, fontWeight: '700' },
    message: { color: '#fcd34d', textAlign: 'center', marginTop: 12 },
    standings: { marginTop: 20, gap: 8 },
    standRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: theme.surfaceHover,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    standRowMe: { borderColor: theme.border, backgroundColor: theme.surface },
    standInfo: { flex: 1, minWidth: 0 },
    standName: { color: theme.text, fontWeight: '600', fontSize: 14 },
    standMeta: { color: theme.textMuted, fontSize: 12, marginTop: 1 },
    standPoints: { color: theme.text, fontWeight: '700', fontSize: 14 },
    swatchSm: { width: 12, height: 12, borderRadius: 3 },
    miniGrid: {
      width: 36,
      height: 36,
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    miniCell: { width: '11.11%', height: '11.11%' },
  })
