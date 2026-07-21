import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Round, type SudokuSubmission } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  buildPlayerDisplayGrid,
  buildPlayerSolvedGrid,
  parseSudokuMetadata,
  playerHasSolvedCell,
} from '@fateround/shared/sudoku'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameScores, useGameStats } from '@/components/session/RosterDrawerContext'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { SudokuGameTimerBar } from '@/components/games/sudoku/SudokuGameTimerBar'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postSudokuSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, SUDOKU_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import {
  boardCompletionPercent,
  buildCellOwnerGrid,
  completedSudokuNumbersForPlayer,
  countEmptyCells,
  formatMinutesSeconds,
  getNewlyCompletedUnits,
  getPlayerTimeSpent,
  isCellInFlashingUnits,
  ordinal,
  playerCompletionPercent,
  sudokuPlayerColor,
  SUDOKU_MY_CELL_COLOR,
  SUDOKU_WRONG_PENALTY,
  tallySudokuScores,
  type SudokuUnitFlash,
} from '@/components/games/sudoku/standings'

type Screen =
  | 'loading'
  | 'join'
  | 'late_join_choice'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'playing'
  | 'finished'
  | 'not_found'

// Shared read-only "no local drafts" grid for rendering a watched player's board.
const EMPTY_DRAFTS: number[][] = Array.from({ length: 9 }, () => Array(9).fill(0))

export function SudokuPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [puzzle, setPuzzle] = useState<number[][] | null>(null)
  const [submissions, setSubmissions] = useState<SudokuSubmission[]>([])
  // Local working grid: holds the player's draft entries (including a wrong guess kept in
  // place, shown red). Correct cells are sourced from `submissions`, never from here.
  const [drafts, setDrafts] = useState<number[][]>(() => Array.from({ length: 9 }, () => Array(9).fill(0)))
  const [wrongDrafts, setWrongDrafts] = useState<boolean[][]>(() =>
    Array.from({ length: 9 }, () => Array(9).fill(false))
  )
  const [undoStack, setUndoStack] = useState<Array<{ row: number; col: number; prev: number; prevWrong: boolean }>>([])
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [highlightNumber, setHighlightNumber] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [flashUnits, setFlashUnits] = useState<SudokuUnitFlash[]>([])
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  // Value that just landed correctly — every visible cell holding it briefly scale-pulses.
  // A single shared Animated.Value drives all matching cells at once (no per-cell values):
  // simpler than the web's 81 staggered cell animations but reads the same.
  const [pulseValue, setPulseValue] = useState<number | null>(null)
  const pulseAnim = useRef(new Animated.Value(1)).current
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Viewers watch one player's board at a time (null = auto-pick the leader).
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)

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
      if (!playerId) {
        const pre = preJoinScreen(game, false)
        if (pre === 'game_ended') return 'game_ended'
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'late_join_choice') return 'late_join_choice'
        return 'join'
      }
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
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

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
  const completedNumbers = useMemo(
    () =>
      puzzle && bootstrap.myPlayerId ? completedSudokuNumbersForPlayer(puzzle, submissions, bootstrap.myPlayerId) : [],
    [puzzle, submissions, bootstrap.myPlayerId]
  )
  const boardCompletion = useMemo(() => (puzzle ? boardCompletionPercent(puzzle, cellOwners) : 0), [puzzle, cellOwners])
  const completedSet = useMemo(() => new Set(completedNumbers), [completedNumbers])
  const mySolvedCells = useMemo(
    () => (bootstrap.myPlayerId ? buildPlayerSolvedGrid(submissions, bootstrap.myPlayerId) : undefined),
    [submissions, bootstrap.myPlayerId]
  )

  // Per-player colors assigned by join order (spectators excluded, matching web).
  const activePlayers = useMemo(() => bootstrap.players.filter((p) => p.spectator !== true), [bootstrap.players])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = sudokuPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const standings = useMemo(() => tallySudokuScores(submissions, activePlayers), [submissions, activePlayers])

  // Feed the roster drawer scoreboard: points headline + "cells left · time" detail.
  const rosterScores = useMemo(() => Object.fromEntries(standings.map((r) => [r.player_id, r.points])), [standings])
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(() => {
    const map: Record<string, string> = {}
    for (const r of standings) {
      const claimed = submissions.filter(
        (s) => s.player_id === r.player_id && s.is_correct && s.cell_row != null && s.cell_col != null
      ).length
      const cellsLeft = puzzle ? countEmptyCells(puzzle) - claimed : 0
      const timeSecs = getPlayerTimeSpent(
        bootstrap.game,
        submissions,
        r.player_id,
        puzzle ? playerCompletionPercent(puzzle, submissions, r.player_id) : 0,
        nowMs,
        activePlayers.find((p) => p.id === r.player_id)?.joined_at
      )
      map[r.player_id] = `⬜ ${cellsLeft} left · ⏱ ${formatMinutesSeconds(timeSecs)}`
    }
    return map
  }, [standings, submissions, puzzle, bootstrap.game, nowMs, activePlayers])
  useGameStats(rosterDetails)

  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const viewing = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  // Viewer watches one active player's personal board (their solved cells filled +
  // highlighted, everyone else's just claimed). Defaults to the current leader.
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    standings.find((row) => activePlayers.some((p) => p.id === row.player_id))?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedPlayer = bootstrap.players.find((p) => p.id === effectiveWatchedId)
  const watchedGrid = useMemo(
    () =>
      puzzle && effectiveWatchedId
        ? buildPlayerDisplayGrid(puzzle, submissions, effectiveWatchedId, EMPTY_DRAFTS)
        : puzzle,
    [puzzle, submissions, effectiveWatchedId]
  )
  const watchedSolvedCells = useMemo(
    () => (effectiveWatchedId ? buildPlayerSolvedGrid(submissions, effectiveWatchedId) : undefined),
    [submissions, effectiveWatchedId]
  )
  const watchedRank = standings.findIndex((r) => r.player_id === effectiveWatchedId) + 1
  const watchedCompletion =
    puzzle && effectiveWatchedId ? playerCompletionPercent(puzzle, submissions, effectiveWatchedId) : 0
  const watchedTime = getPlayerTimeSpent(
    bootstrap.game,
    submissions,
    effectiveWatchedId || '',
    watchedCompletion,
    nowMs,
    watchedPlayer?.joined_at
  )

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const triggerUnitFlash = useCallback((units: SudokuUnitFlash[]) => {
    if (units.length === 0) return
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setFlashUnits(units)
    flashTimerRef.current = setTimeout(() => {
      setFlashUnits([])
      flashTimerRef.current = null
    }, 550)
  }, [])

  // Scale-pulse every visible cell showing the just-placed value (grow, then settle).
  const triggerCorrectPulse = useCallback(
    (value: number) => {
      setPulseValue(value)
      pulseAnim.setValue(1)
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.22, duration: 160, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start(() => setPulseValue(null))
    },
    [pulseAnim]
  )

  // Clean up timers on unmount.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  // Reset the local working grid whenever a new session (incl. a replay) starts.
  const sessionKey = bootstrap.game?.session_started_at ?? null
  useEffect(() => {
    setDrafts(Array.from({ length: 9 }, () => Array(9).fill(0)))
    setWrongDrafts(Array.from({ length: 9 }, () => Array(9).fill(false)))
    setUndoStack([])
    setSelected(null)
    setHighlightNumber(null)
    setPulseValue(null)
    pulseAnim.setValue(1)
  }, [sessionKey, pulseAnim])

  const isCellEditable = useCallback(
    (row: number, col: number): boolean => {
      if (viewing || !puzzle || !bootstrap.myPlayerId) return false
      if (puzzle[row]![col] !== 0) return false
      return !playerHasSolvedCell(submissions, bootstrap.myPlayerId, row, col)
    },
    [viewing, puzzle, bootstrap.myPlayerId, submissions]
  )

  // Tapping a filled/given/solved cell highlights every cell holding that same number;
  // tapping an editable empty cell selects it and clears any highlight.
  const handleCellSelect = (row: number, col: number) => {
    if (viewing || !puzzle) return
    const givenVal = puzzle[row]?.[col]
    if (givenVal && givenVal !== 0) {
      setHighlightNumber(givenVal)
      setSelected(null)
      return
    }
    if (!isCellEditable(row, col)) {
      // Filled by a correct submission (mine or another player's) — highlight its value.
      const filledVal = displayGrid?.[row]?.[col]
      if (filledVal && filledVal > 0) {
        setHighlightNumber(filledVal)
        setSelected(null)
      }
      return
    }
    setHighlightNumber(null)
    setSelected([row, col])
  }

  const setWrongDraft = (row: number, col: number, wrong: boolean) => {
    setWrongDrafts((prev) => {
      const next = prev.map((r) => [...r])
      next[row]![col] = wrong
      return next
    })
  }

  const clearLocalDraft = (row: number, col: number) => {
    setDrafts((prev) => {
      const next = prev.map((r) => [...r])
      next[row]![col] = 0
      return next
    })
    setWrongDraft(row, col, false)
  }

  const submitCell = async (row: number, col: number, value: number) => {
    if (!bootstrap.myResumeToken || !bootstrap.myPlayerId) return
    setSubmitting(true)
    try {
      const result = await postSudokuSubmit(bootstrap.code, bootstrap.myResumeToken, row, col, value)
      if (result.isCorrect) {
        showToast(`✓ Correct! +${result.pointsAwarded} pts`, true)
        if (puzzle && bootstrap.myPlayerId) {
          triggerUnitFlash(getNewlyCompletedUnits(puzzle, submissions, bootstrap.myPlayerId, row, col))
        }
        triggerCorrectPulse(value)
        setWrongDraft(row, col, false)
      } else {
        showToast(`✗ Wrong! ${SUDOKU_WRONG_PENALTY} pts`, false)
        setWrongDraft(row, col, true)
      }
      await bootstrap.load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Submit failed', false)
    } finally {
      setSubmitting(false)
    }
  }

  const handleNumberPress = (value: number) => {
    if (viewing || submitting || !selected) return
    const [row, col] = selected
    if (!isCellEditable(row, col)) return
    const prev = drafts[row]?.[col] ?? 0
    const prevWrong = wrongDrafts[row]?.[col] ?? false
    setDrafts((prevGrid) => {
      const next = prevGrid.map((r) => [...r])
      next[row]![col] = value
      return next
    })
    setWrongDraft(row, col, false)
    setUndoStack((stack) => [...stack, { row, col, prev, prevWrong }])
    void submitCell(row, col, value)
  }

  const handleErase = () => {
    if (viewing || submitting || !selected) return
    const [row, col] = selected
    if (!isCellEditable(row, col)) return
    const current = drafts[row]?.[col] ?? 0
    const isWrong = wrongDrafts[row]?.[col] ?? false
    if (!current && !isWrong) return
    setUndoStack((stack) => [...stack, { row, col, prev: current, prevWrong: isWrong }])
    clearLocalDraft(row, col)
  }

  const handleUndo = () => {
    if (viewing || submitting) return
    const stack = [...undoStack]
    while (stack.length > 0) {
      const last = stack.pop()!
      if (!isCellEditable(last.row, last.col)) continue
      setUndoStack(stack)
      setDrafts((prev) => {
        const grid = prev.map((r) => [...r])
        grid[last.row]![last.col] = last.prev
        return grid
      })
      setWrongDraft(last.row, last.col, last.prevWrong)
      setSelected([last.row, last.col])
      setHighlightNumber(null)
      return
    }
    setUndoStack([])
  }

  const gameTimer =
    (bootstrap.game?.game_duration_seconds ?? 0) > 0 && bootstrap.game?.status === 'active' ? (
      <SudokuGameTimerBar gameCode={bootstrap.code} game={bootstrap.game} onExpired={() => void bootstrap.load()} />
    ) : null
  const gameTimerPinned = useStickyTimer(gameTimer, [bootstrap.code, bootstrap.game])

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'game_ended') return <GameEndedScreen game={bootstrap.game} />
  if (bootstrap.screen === 'game_started_waiting' && bootstrap.game) {
    return (
      <GameStartedWaitingScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        onLobbyOpen={() => void bootstrap.load()}
      />
    )
  }
  if (bootstrap.screen === 'late_join_choice' && bootstrap.game) {
    return (
      <LateJoinChoiceScreen
        gameCode={bootstrap.code}
        game={bootstrap.game}
        context={lateJoin.context}
        contextLoading={lateJoin.loading}
        nameInput={bootstrap.joinName}
        onNameChange={bootstrap.setJoinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        onJoinAsPlayer={() => void bootstrap.join(undefined, { joinAsViewer: false })}
      />
    )
  }
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
    const entries = bootstrap.players
      .filter((p) => !p.spectator)
      .map((p) => {
        const pct = puzzle ? playerCompletionPercent(puzzle, submissions, p.id) : 0
        const timeSecs = getPlayerTimeSpent(bootstrap.game, submissions, p.id, pct, nowMs, p.joined_at)
        return {
          id: p.id,
          name: p.name,
          points: submissions
            .filter((s) => s.player_id === p.id && s.is_correct)
            .reduce((sum, s) => sum + s.points_awarded, 0),
          detail: bootstrap.game?.session_started_at ? `⏱ ${formatMinutesSeconds(timeSecs)}` : undefined,
        }
      })
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
          roundKey={bootstrap.game?.session_started_at ?? undefined}
        />
      </GameShell>
    )
  }

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

  // Viewer watches a chosen player's read-only board; a player edits their own.
  const boardGrid = viewing ? watchedGrid : displayGrid
  const boardSolvedCells = viewing ? watchedSolvedCells : mySolvedCells
  const headerName = viewing ? (watchedPlayer?.name ?? 'Player') : (me?.name ?? 'Me')
  const headerRank = viewing ? watchedRank : myRank
  const headerCompletion = viewing ? watchedCompletion : myCompletion
  const headerTime = viewing ? watchedTime : myTime

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('sudoku')} subtitle={bootstrap.code}>
      <ScrollView contentContainerStyle={styles.content}>
        {gameTimerPinned ? null : gameTimer}

        {toast ? (
          <View style={[styles.toast, toast.ok ? styles.toastOk : styles.toastBad]}>
            <Text style={styles.toastText}>{toast.msg}</Text>
          </View>
        ) : null}

        {/* Viewer player-picker: switch whose board you're watching. */}
        {viewing ? (
          activePlayers.length > 0 ? (
            <View style={styles.watchCard}>
              <Text style={styles.watchLabel}>Watching a player&apos;s board</Text>
              <View style={styles.watchChips}>
                {activePlayers.map((p) => {
                  const active = p.id === effectiveWatchedId
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.watchChip, active && styles.watchChipActive]}
                      onPress={() => setWatchedPlayerId(p.id)}
                    >
                      <View
                        style={[styles.watchChipDot, { backgroundColor: playerColors[p.id] ?? sudokuPlayerColor(0) }]}
                      />
                      <Text style={[styles.watchChipText, active && styles.watchChipTextActive]} numberOfLines={1}>
                        {p.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : (
            <Text style={styles.waiting}>
              No players have joined the puzzle yet — pick a player to watch once they do.
            </Text>
          )
        ) : null}

        {!boardGrid ? (
          <Text style={styles.waiting}>Waiting for puzzle…</Text>
        ) : (
          <>
            {/* Status header (mine, or the watched player's) */}
            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <View style={[styles.swatch, { backgroundColor: SUDOKU_MY_CELL_COLOR }]} />
                <View>
                  <Text style={styles.statusName}>{headerName}</Text>
                  <Text style={styles.statusMeta}>
                    {headerRank > 0 ? ordinal(headerRank) : '—'} · {headerCompletion}%
                  </Text>
                </View>
              </View>
              {bootstrap.game?.session_started_at ? (
                <View style={styles.timePill}>
                  <Text style={styles.timePillText}>⏱ {formatMinutesSeconds(headerTime)}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.board}>
              {boardGrid.map((row, r) => (
                <View key={r} style={styles.row}>
                  {row.map((value, c) => {
                    const given = puzzle![r]![c] !== 0
                    const mine = boardSolvedCells?.[r]?.[c] === true
                    const owner = !given && !mine ? cellOwners[r]![c] : null
                    const ownerColor = owner ? (playerColors[owner] ?? sudokuPlayerColor(0)) : null
                    const selectedCell = !viewing && selected?.[0] === r && selected?.[1] === c
                    const wrong = !viewing && wrongDrafts[r]?.[c] === true && value > 0
                    const flashing = !viewing && isCellInFlashingUnits(r, c, flashUnits)
                    const highlighted =
                      highlightNumber != null && value === highlightNumber && value > 0 && !selectedCell
                    const pulsing = !viewing && pulseValue != null && value === pulseValue && value > 0
                    const baseBg = mine ? SUDOKU_MY_CELL_COLOR : (ownerColor ?? undefined)
                    const bg = flashing ? '#fbbf24' : highlighted ? 'rgba(56,189,248,0.30)' : baseBg
                    return (
                      <Pressable
                        key={`${r}-${c}`}
                        style={[
                          styles.cell,
                          given && styles.cellGiven,
                          bg ? { backgroundColor: bg } : null,
                          selectedCell && styles.cellSelected,
                        ]}
                        disabled={viewing}
                        onPress={() => handleCellSelect(r, c)}
                      >
                        <Animated.Text
                          style={[
                            styles.cellText,
                            mine && styles.cellTextSolved,
                            wrong && styles.cellTextWrong,
                            pulsing ? { transform: [{ scale: pulseAnim }] } : null,
                          ]}
                        >
                          {value > 0 ? value : ''}
                        </Animated.Text>
                      </Pressable>
                    )
                  })}
                </View>
              ))}
            </View>
            {viewing ? (
              <Text style={styles.viewingHint}>You are watching — tap a name above to switch boards.</Text>
            ) : (
              <>
                {/* Toolbar: completion % star, Undo, Erase */}
                <View style={styles.toolbar}>
                  <View style={styles.toolBtn}>
                    <Text style={styles.toolIcon}>★</Text>
                    <Text style={styles.toolLabel}>{boardCompletion}%</Text>
                  </View>
                  <Pressable
                    style={styles.toolBtn}
                    disabled={undoStack.length === 0 || submitting}
                    onPress={handleUndo}
                  >
                    <Text style={[styles.toolIcon, (undoStack.length === 0 || submitting) && styles.toolDisabled]}>
                      ↺
                    </Text>
                    <Text style={[styles.toolLabel, (undoStack.length === 0 || submitting) && styles.toolDisabled]}>
                      Undo
                    </Text>
                  </Pressable>
                  <Pressable style={styles.toolBtn} disabled={!selected || submitting} onPress={handleErase}>
                    <Text style={[styles.toolIcon, (!selected || submitting) && styles.toolDisabled]}>⌫</Text>
                    <Text style={[styles.toolLabel, (!selected || submitting) && styles.toolDisabled]}>Erase</Text>
                  </Pressable>
                </View>
                <View style={styles.pad}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
                    const complete = completedSet.has(n)
                    return (
                      <Pressable
                        key={n}
                        style={[styles.padKey, complete && styles.padKeyComplete]}
                        disabled={!selected || submitting}
                        onPress={() => handleNumberPress(n)}
                      >
                        <Text style={[styles.padText, complete && styles.padTextComplete]}>{complete ? '✓' : n}</Text>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            )}

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
      </ScrollView>
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
    content: { paddingBottom: 32, gap: 12 },
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
    watchCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    watchLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    watchChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    watchChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
    },
    watchChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    watchChipDot: { width: 10, height: 10, borderRadius: 3 },
    watchChipText: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', maxWidth: 120 },
    // White label on the solid rose active chip — intentional.
    watchChipTextActive: { color: '#fff' },
    viewingHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 16 },
    // Theme-aware grid: light cells + dark digits in light mode, dark cells + light digits in
    // dark mode. (Was hardcoded dark, so the board stayed black in light mode.) textFaint gives
    // grid lines that read on both a white and a near-black background.
    board: { alignSelf: 'center', borderWidth: 2, borderColor: theme.textFaint, marginTop: 8 },
    row: { flexDirection: 'row' },
    cell: {
      width: 34,
      height: 34,
      borderWidth: 1,
      borderColor: theme.textFaint,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    // Pre-filled clue cells sit one step off the base surface so they read as fixed.
    cellGiven: { backgroundColor: theme.surfaceHover },
    cellSelected: { borderColor: '#f43f5e' },
    // Digit follows the theme text colour (dark on light cells, light on dark cells).
    cellText: { color: theme.text, fontWeight: '700', fontSize: 14 },
    // Dark digit on the pastel-green "my solved" cell so the value stays readable.
    cellTextSolved: { color: '#0b1220' },
    // Red digit marks a wrong guess left in place.
    cellTextWrong: { color: '#ef4444' },
    toolbar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      marginTop: 14,
      paddingHorizontal: 8,
    },
    toolBtn: { alignItems: 'center', gap: 2, minWidth: 56, paddingVertical: 4 },
    toolIcon: { color: theme.textSecondary, fontSize: 20, lineHeight: 22 },
    toolLabel: { color: theme.textMuted, fontSize: 11, fontWeight: '600' },
    toolDisabled: { opacity: 0.4 },
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
    padKeyComplete: { backgroundColor: 'rgba(16,185,129,0.18)', borderColor: 'rgba(16,185,129,0.5)' },
    padText: { color: theme.text, fontSize: 18, fontWeight: '700' },
    padTextComplete: { color: '#10b981' },
    message: { color: '#fcd34d', textAlign: 'center', marginTop: 12 },
    toast: {
      alignSelf: 'center',
      marginTop: 8,
      marginBottom: 4,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
    },
    toastOk: { backgroundColor: '#10b981' },
    toastBad: { backgroundColor: '#ef4444' },
    toastText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
