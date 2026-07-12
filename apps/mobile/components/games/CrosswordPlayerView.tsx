import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { type Game, type Round, type CrosswordSubmission, type CrosswordClue, type CrosswordDirection } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  buildCellOwnerGrid,
  buildPlayerLetterGrid,
  buildPlayerSolvedGrid,
  crosswordWordCells,
  parseCrosswordMetadata,
  playerCompletionPercent,
  playerHasSolvedCell,
  playerCompletedWord,
  tallyCrosswordScores,
  CROSSWORD_HINT_PENALTY,
  type CrosswordMetadata,
} from '@fateround/shared/crossword'
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { CrosswordBoardView } from '@/components/games/crossword/CrosswordBoardView'
import { CrosswordGameTimerBar } from '@/components/games/crossword/CrosswordGameTimerBar'
import { useHeaderBadge } from '@/components/session/HeaderBadgeContext'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postCrosswordSubmit, fetchCrosswordSolution } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, CROSSWORD_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import {
  crosswordPlayerColor,
  formatMinutesSeconds,
  getPlayerTimeSpent,
  ordinal,
  CROSSWORD_MY_CELL_COLOR,
} from '@/components/games/crossword/standings'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

const cellKey = (row: number, col: number) => `${row}-${col}`

// Players pick their on-screen keyboard: QWERTY (phone muscle memory) or A–Z (easier to
// scan). Default QWERTY; the choice is remembered on the device.
const KEY_LAYOUTS = {
  qwerty: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'],
  abc: ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ'],
} as const
type KeyboardLayout = keyof typeof KEY_LAYOUTS
const KEYBOARD_LAYOUT_KEY = 'crossword_keyboard_layout'

function emptyLetters(size: number): string[][] {
  return Array.from({ length: size }, () => Array(size).fill(''))
}

function emptyBooleans(size: number): boolean[][] {
  return Array.from({ length: size }, () => Array(size).fill(false))
}

/** Find the clue whose word runs through [row,col] in the given direction. */
function findClueAt(
  metadata: CrosswordMetadata,
  row: number,
  col: number,
  direction: CrosswordDirection
): CrosswordClue | null {
  for (const clue of metadata.clues) {
    if (clue.direction !== direction) continue
    if (crosswordWordCells(clue).some(([r, c]) => r === row && c === col)) return clue
  }
  return null
}

export function CrosswordPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [metadata, setMetadata] = useState<CrosswordMetadata | null>(null)
  const [submissions, setSubmissions] = useState<CrosswordSubmission[]>([])
  const [localLetters, setLocalLetters] = useState<string[][]>([])
  const [wrongDrafts, setWrongDrafts] = useState<boolean[][]>([])
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null)
  const [direction, setDirection] = useState<CrosswordDirection>('across')
  const [submitting, setSubmitting] = useState(false)
  // Letters submit concurrently per cell — a single global lock would drop taps entered
  // faster than the round-trip. Keyed by cell+letter so a re-typed correction still fires
  // while an identical duplicate tap is coalesced. `submitting` now gates only the hint.
  const inFlightSubmits = useRef<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)
  const [keyboardLayout, setKeyboardLayout] = useState<KeyboardLayout>('qwerty')
  const [solutionGrid, setSolutionGrid] = useState<string[][] | null>(null)

  // Load the saved keyboard-layout preference (per device).
  useEffect(() => {
    void SecureStore.getItemAsync(KEYBOARD_LAYOUT_KEY).then((v) => {
      if (v === 'abc' || v === 'qwerty') setKeyboardLayout(v)
    })
  }, [])
  const toggleKeyboardLayout = useCallback(() => {
    setKeyboardLayout((prev) => {
      const next: KeyboardLayout = prev === 'qwerty' ? 'abc' : 'qwerty'
      void SecureStore.setItemAsync(KEYBOARD_LAYOUT_KEY, next)
      return next
    })
  }, [])

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const loadGameState = useCallback(
    async (game: Game): Promise<{ state: boolean; ok: boolean }> => {
      if (game.status !== 'active') {
        // Don't null the metadata here. On the finished screen every realtime
        // reload runs through this branch, and blanking metadata mid-reload
        // empties `standings` (points → 0 → winnerId → null), which flips the
        // finish title to "Game over" until afterResolve restores it — the
        // title flickers between "Game over" and "<name> wins!". Leave whatever
        // metadata we have; afterResolve refetches it for the finished screen.
        return { state: false, ok: true }
      }
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { state: false, ok: true }
      const meta = parseCrosswordMetadata((roundData as Round).crossword_metadata)
      if (!meta) return { state: false, ok: true }
      setMetadata(meta)
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
      if (game.status === 'finished') return 'finished'
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      return state ? 'playing' : 'waiting'
    },
    afterResolve: async (game, playerId) => {
      // Finished games show the leaderboard to everyone; active games load the round's subs.
      if (game.status === 'finished') {
        // Fetch round + submissions together and commit both in the same tick so
        // the finished screen never renders with metadata set but submissions
        // empty (which would zero the standings and flash the "Game over" title).
        const [roundRes, subsRes] = await Promise.all([
          getSupabase()
            .from('rounds')
            .select(ROUND_SELECT)
            .eq('game_id', gameCode.toUpperCase())
            .eq('round_number', 1)
            .maybeSingle(),
          getSupabase()
            .from('crossword_submissions')
            .select(CROSSWORD_SUBMISSION_SELECT)
            .eq('game_id', gameCode.toUpperCase()),
        ])
        const meta = roundRes.data ? parseCrosswordMetadata((roundRes.data as Round).crossword_metadata) : null
        if (meta) setMetadata(meta)
        setSubmissions((subsRes.data as CrosswordSubmission[]) ?? [])
        return
      }
      if (!playerId || game.status !== 'active') return
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return
      const { data: subs } = await getSupabase()
        .from('crossword_submissions')
        .select(CROSSWORD_SUBMISSION_SELECT)
        .eq('round_id', roundData.id)
      setSubmissions((subs as CrosswordSubmission[]) ?? [])
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'crossword_submissions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  // Tick once a second while playing so the live time column stays fresh.
  useEffect(() => {
    if (bootstrap.screen !== 'playing') return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [bootstrap.screen])

  // Pull the answer grid once the game is finished, so the finished screen can show the key.
  useEffect(() => {
    if (bootstrap.game?.status !== 'finished' || solutionGrid) return
    let cancelled = false
    void fetchCrosswordSolution(bootstrap.code).then((grid) => {
      if (!cancelled && grid) setSolutionGrid(grid)
    })
    return () => {
      cancelled = true
    }
  }, [bootstrap.game?.status, bootstrap.code, solutionGrid])

  // Reset the local working grid whenever a new session (incl. a replay) starts.
  const sessionKey = bootstrap.game?.session_started_at ?? null
  const gridSize = metadata?.size ?? 0
  useEffect(() => {
    setLocalLetters(gridSize > 0 ? emptyLetters(gridSize) : [])
    setWrongDrafts(gridSize > 0 ? emptyBooleans(gridSize) : [])
    setSelectedCell(null)
    setDirection('across')
  }, [sessionKey, gridSize])

  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const viewing = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  const activePlayers = useMemo(() => bootstrap.players.filter((p) => p.spectator !== true), [bootstrap.players])
  const playerColors = useMemo(() => {
    const map: Record<string, string> = {}
    activePlayers.forEach((p, i) => {
      map[p.id] = crosswordPlayerColor(i)
    })
    return map
  }, [activePlayers])

  const cellOwners = useMemo(
    () => (metadata ? buildCellOwnerGrid(metadata, submissions) : []),
    [metadata, submissions]
  )
  const mySolvedCells = useMemo(
    () => (metadata && bootstrap.myPlayerId ? buildPlayerSolvedGrid(metadata, submissions, bootstrap.myPlayerId) : undefined),
    [metadata, submissions, bootstrap.myPlayerId]
  )
  const displayGrid = useMemo(() => {
    if (!metadata || !bootstrap.myPlayerId) return localLetters
    return buildPlayerLetterGrid(metadata, submissions, bootstrap.myPlayerId, localLetters)
  }, [metadata, submissions, bootstrap.myPlayerId, localLetters])

  // Toast when the player completes a word.
  const completedWordsRef = useRef<Set<string>>(new Set())
  const completionReadyRef = useRef(false)
  useEffect(() => {
    const pid = bootstrap.myPlayerId
    if (!metadata || !pid) return
    const newlyDone: CrosswordClue[] = []
    for (const clue of metadata.clues) {
      const key = `${clue.number}-${clue.direction}`
      if (completedWordsRef.current.has(key)) continue
      if (playerCompletedWord(submissions, pid, clue)) {
        completedWordsRef.current.add(key)
        newlyDone.push(clue)
      }
    }
    if (completionReadyRef.current) {
      for (const clue of newlyDone) {
        showToast(`Solved ${clue.number} ${clue.direction === 'across' ? 'Across' : 'Down'}! 🎉`, true)
      }
    }
    completionReadyRef.current = true
  }, [submissions, metadata, bootstrap.myPlayerId, showToast])

  const standings = useMemo(
    () => (metadata ? tallyCrosswordScores(metadata, submissions, bootstrap.players) : []),
    [metadata, submissions, bootstrap.players]
  )

  const myRank = standings.findIndex((r) => r.player_id === bootstrap.myPlayerId) + 1
  const myCompletion =
    metadata && bootstrap.myPlayerId ? playerCompletionPercent(metadata, submissions, bootstrap.myPlayerId) : 0

  // Active word (across/down) covering the selected cell.
  const activeClue = useMemo(() => {
    if (!metadata || !selectedCell) return null
    return findClueAt(metadata, selectedCell[0], selectedCell[1], direction)
  }, [metadata, selectedCell, direction])
  const activeCells = useMemo(() => {
    const set = new Set<string>()
    if (activeClue) for (const [r, c] of crosswordWordCells(activeClue)) set.add(cellKey(r, c))
    return set
  }, [activeClue])

  // Viewer watches one active player's personal board (their solved cells filled).
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    standings.find((row) => activePlayers.some((p) => p.id === row.player_id))?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedPlayer = bootstrap.players.find((p) => p.id === effectiveWatchedId)
  const watchedGrid = useMemo(
    () =>
      metadata && effectiveWatchedId
        ? buildPlayerLetterGrid(metadata, submissions, effectiveWatchedId, emptyLetters(metadata.size))
        : [],
    [metadata, submissions, effectiveWatchedId]
  )
  const watchedSolvedCells = useMemo(
    () => (metadata && effectiveWatchedId ? buildPlayerSolvedGrid(metadata, submissions, effectiveWatchedId) : undefined),
    [metadata, submissions, effectiveWatchedId]
  )
  const watchedCompletion =
    metadata && effectiveWatchedId ? playerCompletionPercent(metadata, submissions, effectiveWatchedId) : 0

  // Surface the difficulty as a header pill during play instead of a floating subtitle.
  const difficultyLabel = metadata?.difficulty
    ? metadata.difficulty.charAt(0).toUpperCase() + metadata.difficulty.slice(1)
    : null
  useHeaderBadge(bootstrap.screen === 'playing' && difficultyLabel ? difficultyLabel : null)

  const isCellEditable = useCallback(
    (row: number, col: number): boolean => {
      if (viewing || !metadata || !bootstrap.myPlayerId) return false
      if (metadata.blocked[row]?.[col]) return false
      return !playerHasSolvedCell(submissions, bootstrap.myPlayerId, row, col)
    },
    [viewing, metadata, bootstrap.myPlayerId, submissions]
  )

  const setLetterDraft = (row: number, col: number, letter: string, wrong: boolean) => {
    setLocalLetters((prev) => {
      const next = prev.map((r) => [...r])
      if (next[row]) next[row]![col] = letter
      return next
    })
    setWrongDrafts((prev) => {
      const next = prev.map((r) => [...r])
      if (next[row]) next[row]![col] = wrong
      return next
    })
  }

  /** Move the cursor to the next un-solved cell along the active word. */
  const advanceCursor = (row: number, col: number) => {
    if (!metadata) return
    const clue = findClueAt(metadata, row, col, direction)
    if (!clue) return
    const cells = crosswordWordCells(clue)
    const idx = cells.findIndex(([r, c]) => r === row && c === col)
    for (let i = idx + 1; i < cells.length; i++) {
      const [r, c] = cells[i]!
      if (isCellEditable(r, c)) {
        setSelectedCell([r, c])
        return
      }
    }
    if (idx + 1 < cells.length) setSelectedCell(cells[idx + 1]!)
  }

  const stepBack = (row: number, col: number) => {
    if (!metadata) return
    const clue = findClueAt(metadata, row, col, direction)
    if (!clue) return
    const cells = crosswordWordCells(clue)
    const idx = cells.findIndex(([r, c]) => r === row && c === col)
    if (idx > 0) setSelectedCell(cells[idx - 1]!)
  }

  const handleCellSelect = (row: number, col: number) => {
    if (viewing || !metadata || metadata.blocked[row]?.[col]) return
    // Re-tapping the active cell flips across/down.
    if (selectedCell && selectedCell[0] === row && selectedCell[1] === col) {
      const next: CrosswordDirection = direction === 'across' ? 'down' : 'across'
      if (findClueAt(metadata, row, col, next)) setDirection(next)
      return
    }
    const acrossClue = findClueAt(metadata, row, col, 'across')
    const downClue = findClueAt(metadata, row, col, 'down')
    // Prefer the direction whose word STARTS at the tapped cell (so tapping a numbered
    // cell shows that word's clue), then the current direction, then whatever's available.
    const startsAcross = acrossClue && acrossClue.row === row && acrossClue.col === col
    const startsDown = downClue && downClue.row === row && downClue.col === col
    if (startsAcross && !startsDown) setDirection('across')
    else if (startsDown && !startsAcross) setDirection('down')
    else if (direction === 'across' && !acrossClue && downClue) setDirection('down')
    else if (direction === 'down' && !downClue && acrossClue) setDirection('across')
    setSelectedCell([row, col])
  }

  const selectClue = (clue: CrosswordClue) => {
    setDirection(clue.direction)
    setSelectedCell([clue.row, clue.col])
  }

  const submitLetter = async (row: number, col: number, letter: string, hint: boolean) => {
    if (!bootstrap.myResumeToken || !bootstrap.myPlayerId) return
    // Per-cell in-flight guard: distinct cells submit concurrently (so tapping a word fast
    // never drops letters), while an identical duplicate tap for the same cell is skipped.
    const key = `${row}-${col}-${letter}-${hint ? 'h' : ''}`
    if (inFlightSubmits.current.has(key)) return
    inFlightSubmits.current.add(key)
    if (hint) setSubmitting(true)
    try {
      const result = await postCrosswordSubmit(bootstrap.code, bootstrap.myResumeToken, row, col, letter, hint)
      const resolved = String(result.letter ?? letter).toUpperCase()
      if (result.isCorrect) {
        setLetterDraft(row, col, resolved, false)
        if (hint) showToast(`Revealed ${resolved} · ${CROSSWORD_HINT_PENALTY} pts`, false)
      } else {
        setLetterDraft(row, col, resolved, true)
      }
      await bootstrap.load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Submission failed'
      // Timer expiry (or a finish race) flips the game — refetch to land on results.
      if (msg.toLowerCase().includes('time')) await bootstrap.load()
      else showToast(msg, false)
    } finally {
      inFlightSubmits.current.delete(key)
      if (hint) setSubmitting(false)
    }
  }

  const handleTypeLetter = (letter: string) => {
    if (viewing || !selectedCell) return
    const [row, col] = selectedCell
    if (!isCellEditable(row, col)) return
    const upper = letter.toUpperCase()
    setLetterDraft(row, col, upper, false)
    void submitLetter(row, col, upper, false)
    advanceCursor(row, col)
  }

  const handleBackspace = () => {
    if (viewing || !selectedCell) return
    const [row, col] = selectedCell
    if (isCellEditable(row, col) && localLetters[row]?.[col]) {
      setLetterDraft(row, col, '', false)
    } else {
      stepBack(row, col)
    }
  }

  const handleReveal = () => {
    if (viewing || submitting || !selectedCell) return
    const [row, col] = selectedCell
    if (!isCellEditable(row, col)) return
    Alert.alert(
      'Reveal this letter?',
      `Fills the correct letter here for a ${CROSSWORD_HINT_PENALTY}-point penalty.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reveal letter',
          onPress: () => {
            void submitLetter(row, col, localLetters[row]?.[col] || 'A', true)
            advanceCursor(row, col)
          },
        },
      ]
    )
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
      .map((p) => {
        const row = standings.find((r) => r.player_id === p.id)
        const pct = metadata ? playerCompletionPercent(metadata, submissions, p.id) : 0
        const timeSecs = getPlayerTimeSpent(bootstrap.game, submissions, p.id, pct, nowMs, p.joined_at)
        return {
          id: p.id,
          name: p.name,
          points: row?.points ?? 0,
          detail: bootstrap.game?.session_started_at ? `⏱ ${formatMinutesSeconds(timeSecs)}` : undefined,
        }
      })
    // `standings` is already sorted best-first with full tiebreaks (points → words →
    // name), so its leader is the winner. Declare them the winner whenever they solved
    // at least one word — net points can dip to/below 0 after hint penalties, and a
    // real winner shouldn't collapse to "Game over". Only a puzzle where nobody solved
    // anything falls back to "Game over".
    const leader = standings[0]
    const winnerId = leader && leader.wordsCompleted > 0 ? leader.player_id : null
    const answersNotice =
      solutionGrid && metadata ? (
        <View style={styles.answersCard}>
          <Text style={styles.answersTitle}>Answers</Text>
          {(['across', 'down'] as const).map((dir) => {
            const clues = metadata.clues.filter((c) => c.direction === dir)
            if (clues.length === 0) return null
            return (
              <View key={dir} style={{ gap: 4 }}>
                <Text style={styles.answerGroupTitle}>{dir}</Text>
                {clues.map((c) => {
                  const word = crosswordWordCells(c)
                    .map(([r, col]) => solutionGrid[r]?.[col] ?? '')
                    .join('')
                  return (
                    <View key={`${c.number}-${c.direction}`} style={styles.answerRow}>
                      <Text style={styles.answerClue}>
                        <Text style={styles.answerNum}>{c.number}. </Text>
                        {c.clue}
                      </Text>
                      <Text style={styles.answerWord}>{word}</Text>
                    </View>
                  )
                })}
              </View>
            )
          })}
        </View>
      ) : null
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('crossword')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winnerId ? `${leader!.name} wins!` : 'Game over'}
          subtitle="Final standings"
          leaderboard={pointsLeaderboard(entries, bootstrap.myPlayerId)}
          winnerPlayerId={winnerId}
          roundKey={bootstrap.game?.session_started_at ?? undefined}
          notice={answersNotice}
        />
      </GameShell>
    )
  }

  const boardGrid = viewing ? watchedGrid : displayGrid
  const boardSolvedCells = viewing ? watchedSolvedCells : mySolvedCells
  const headerName = viewing ? (watchedPlayer?.name ?? 'Player') : (me?.name ?? 'Me')
  const headerCompletion = viewing ? watchedCompletion : myCompletion
  const acrossClues = metadata?.clues.filter((c) => c.direction === 'across') ?? []
  const downClues = metadata?.clues.filter((c) => c.direction === 'down') ?? []

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('crossword')} subtitle={bootstrap.code}>
      <View style={styles.playArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <CrosswordGameTimerBar gameCode={bootstrap.code} game={bootstrap.game} />

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
                        style={[styles.watchChipDot, { backgroundColor: playerColors[p.id] ?? crosswordPlayerColor(0) }]}
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

        {!metadata || boardGrid.length === 0 ? (
          <Text style={styles.waiting}>Waiting for puzzle…</Text>
        ) : (
          <>
            {/* Status header (mine, or the watched player's) */}
            <View style={styles.statusRow}>
              <View style={styles.statusLeft}>
                <View style={[styles.swatch, { backgroundColor: CROSSWORD_MY_CELL_COLOR }]} />
                <View>
                  <Text style={styles.statusName}>{headerName}</Text>
                  <Text style={styles.statusMeta}>
                    {!viewing && myRank > 0 ? `${ordinal(myRank)} · ` : ''}
                    {headerCompletion}%
                  </Text>
                </View>
              </View>
              {bootstrap.game?.session_started_at ? (
                <View style={styles.timePill}>
                  <Text style={styles.timePillText}>
                    ⏱{' '}
                    {formatMinutesSeconds(
                      getPlayerTimeSpent(
                        bootstrap.game,
                        submissions,
                        (viewing ? effectiveWatchedId : bootstrap.myPlayerId) || '',
                        headerCompletion,
                        nowMs,
                        (viewing ? watchedPlayer : me)?.joined_at
                      )
                    )}
                  </Text>
                </View>
              ) : null}
            </View>

            <CrosswordBoardView
              metadata={metadata}
              letterGrid={boardGrid}
              cellOwners={cellOwners}
              mySolvedCells={boardSolvedCells}
              playerColors={playerColors}
              myPlayerId={viewing ? effectiveWatchedId : bootstrap.myPlayerId}
              selectedCell={viewing ? null : selectedCell}
              activeCells={viewing ? undefined : activeCells}
              wrongCells={viewing ? undefined : wrongDrafts}
              onCellSelect={handleCellSelect}
              readOnly={viewing}
            />

            {viewing ? (
              <Text style={styles.viewingHint}>You are watching — tap a name above to switch boards.</Text>
            ) : (
              <>
                {/* Clue lists */}
                <View style={styles.clueLists}>
                  <ClueList
                    title="Across"
                    clues={acrossClues}
                    submissions={submissions}
                    myPlayerId={bootstrap.myPlayerId}
                    activeNumber={activeClue?.direction === 'across' ? activeClue.number : null}
                    onSelect={selectClue}
                    styles={styles}
                  />
                  <ClueList
                    title="Down"
                    clues={downClues}
                    submissions={submissions}
                    myPlayerId={bootstrap.myPlayerId}
                    activeNumber={activeClue?.direction === 'down' ? activeClue.number : null}
                    onSelect={selectClue}
                    styles={styles}
                  />
                </View>
              </>
            )}

            {/* Live standings */}
            {standings.length > 0 ? (
              <View style={styles.standings}>
                {standings.map((rowData, i) => {
                  const pct = metadata ? playerCompletionPercent(metadata, submissions, rowData.player_id) : 0
                  const color = playerColors[rowData.player_id] ?? crosswordPlayerColor(0)
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
                      <View style={[styles.swatchSm, { backgroundColor: color }]} />
                      <View style={styles.standInfo}>
                        <Text style={styles.standName} numberOfLines={1}>
                          {rowData.name}
                        </Text>
                        <Text style={styles.standMeta} numberOfLines={1}>
                          {ordinal(i + 1)} of {standings.length} · {rowData.wordsCompleted} words · {pct}%
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

        <View style={styles.rulesRow}>
          <GameRulesLink gameType="crossword" variant="subtle" />
        </View>
      </ScrollView>

      {/* Pinned input dock — always visible so every key (and Erase) is reachable. */}
      {metadata && boardGrid.length > 0 && !viewing && bootstrap.game?.status !== 'finished' ? (
        <View style={styles.inputDock}>
          <View style={styles.clueBar}>
            <View style={styles.clueBarText}>
              {activeClue ? (
                <Text style={styles.clueBarLine} numberOfLines={2}>
                  <Text style={styles.clueBarNum}>
                    {activeClue.number} {activeClue.direction === 'across' ? 'Across' : 'Down'}
                  </Text>
                  {'  '}
                  {activeClue.clue}
                </Text>
              ) : (
                <Text style={styles.clueBarHint}>Tap a cell to start filling the grid.</Text>
              )}
            </View>
            <Pressable
              style={[
                styles.revealBtn,
                (!selectedCell || submitting || !isCellEditable(selectedCell[0], selectedCell[1])) &&
                  styles.revealBtnDisabled,
              ]}
              disabled={!selectedCell || submitting || !isCellEditable(selectedCell[0], selectedCell[1])}
              onPress={handleReveal}
            >
              <Text style={styles.revealText}>💡 Reveal</Text>
            </Pressable>
          </View>

          {/* On-screen keyboard (QWERTY or A–Z, player's choice) */}
          <View style={styles.keyboard}>
            <Pressable style={styles.layoutToggle} onPress={toggleKeyboardLayout} hitSlop={8}>
              <Text style={styles.layoutToggleText}>
                ⌨ {keyboardLayout === 'qwerty' ? 'Switch to A–Z' : 'Switch to QWERTY'}
              </Text>
            </Pressable>
            {KEY_LAYOUTS[keyboardLayout].map((rowLetters, ri) => (
              <View key={ri} style={styles.keyRow}>
                {rowLetters.split('').map((letter) => (
                  <Pressable
                    key={letter}
                    style={[styles.key, !selectedCell && styles.keyDisabled]}
                    disabled={!selectedCell}
                    onPress={() => handleTypeLetter(letter)}
                  >
                    <Text style={styles.keyText}>{letter}</Text>
                  </Pressable>
                ))}
                {ri === KEY_LAYOUTS[keyboardLayout].length - 1 ? (
                  <Pressable
                    style={[styles.key, styles.keyErase, !selectedCell && styles.keyDisabled]}
                    disabled={!selectedCell}
                    onPress={handleBackspace}
                  >
                    <Text style={styles.keyEraseText}>⌫ Erase</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}
      </View>
    </GameShell>
  )
}

function ClueList({
  title,
  clues,
  submissions,
  myPlayerId,
  activeNumber,
  onSelect,
  styles,
}: {
  title: string
  clues: CrosswordClue[]
  submissions: CrosswordSubmission[]
  myPlayerId: string | null | undefined
  activeNumber: number | null
  onSelect: (clue: CrosswordClue) => void
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.clueCol}>
      <Text style={styles.clueColTitle}>{title}</Text>
      <ScrollView style={styles.clueScroll} nestedScrollEnabled>
        {clues.map((clue) => {
          const done = myPlayerId
            ? crosswordWordCells(clue).every(([r, c]) => playerHasSolvedCell(submissions, myPlayerId, r, c))
            : false
          const isActive = clue.number === activeNumber
          return (
            <Pressable
              key={`${clue.number}-${clue.direction}`}
              style={[styles.clueItem, isActive && styles.clueItemActive]}
              onPress={() => onSelect(clue)}
            >
              <Text style={[styles.clueItemNum, done && styles.clueItemDone]}>{clue.number}.</Text>
              <Text style={[styles.clueItemText, done && styles.clueItemDone]} numberOfLines={2}>
                {clue.clue}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    playArea: { flex: 1 },
    scroll: { flex: 1 },
    content: { paddingBottom: 16, gap: 12 },
    inputDock: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
      backgroundColor: theme.bg,
      paddingTop: 8,
      gap: 8,
    },
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
    watchChipTextActive: { color: '#fff' },
    viewingHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 12 },
    clueBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    clueBarText: {
      flex: 1,
      minWidth: 0,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    clueBarLine: { color: theme.text, fontSize: 14 },
    clueBarNum: { fontWeight: '800' },
    clueBarHint: { color: theme.textMuted, fontSize: 14 },
    revealBtn: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: 'rgba(245,158,11,0.15)',
    },
    revealBtnDisabled: { opacity: 0.4 },
    revealText: { color: '#b45309', fontWeight: '800', fontSize: 13 },
    keyboard: { gap: 6, marginTop: 4 },
    layoutToggle: { alignSelf: 'flex-end', paddingVertical: 2, paddingHorizontal: 4 },
    layoutToggleText: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
    keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
    key: {
      flex: 1,
      maxWidth: 34,
      height: 42,
      borderRadius: 6,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyWide: { maxWidth: 48, flex: 1.4 },
    keyErase: { maxWidth: 96, flex: 2.6, paddingHorizontal: 6 },
    keyEraseText: { color: theme.text, fontSize: 13, fontWeight: '800' },
    keyDisabled: { opacity: 0.4 },
    keyText: { color: theme.text, fontSize: 16, fontWeight: '700' },
    clueLists: { flexDirection: 'row', gap: 10, marginTop: 12 },
    clueCol: {
      flex: 1,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 8,
    },
    clueColTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 6,
    },
    clueScroll: { maxHeight: 220 },
    clueItem: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 6,
      paddingVertical: 5,
      borderRadius: 6,
    },
    clueItemActive: { backgroundColor: theme.primarySoft },
    clueItemNum: { color: theme.textSecondary, fontWeight: '800', fontSize: 12 },
    clueItemText: { flex: 1, color: theme.textSecondary, fontSize: 12 },
    clueItemDone: { color: theme.textMuted, textDecorationLine: 'line-through' },
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
    rulesRow: { alignItems: 'center', marginTop: 16 },
    answersCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
      gap: 8,
    },
    answersTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    answerRow: { flexDirection: 'row', gap: 6 },
    answerClue: { flex: 1, color: theme.textSecondary, fontSize: 13 },
    answerNum: { color: theme.text, fontWeight: '800' },
    answerWord: { color: theme.text, fontWeight: '800', fontSize: 13 },
    answerGroupTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 4,
    },
  })
