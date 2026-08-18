/**
 * Daily Crossword / Mini Crossword play surface (mobile).
 *
 * Port of `src/components/daily/DailyCrosswordPlay.tsx`, but the board and
 * keyboard-input pattern reuse the same primitives the multiplayer mobile
 * crossword already uses (see `CrosswordPlayerView` and `CrosswordBoardView`)
 * so the daily surface looks and feels like the normal game:
 *
 *   - board rendered by `CrosswordBoardView` (its cell scaling handles both
 *     the 15×15 crossword and the 5×5 mini),
 *   - typing driven by a hidden `TextInput` that raises the OS keyboard —
 *     backspace via `onKeyPress`, letters via `onChangeText` — same as the
 *     multiplayer view. Better UX than an in-app QWERTY (native word bar,
 *     autocorrect off, etc.).
 *
 * Live correctness is via per-clue `answer_hashes` — the solution never
 * ships to the client, same as web. Auto-submits on full solve or timeout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { CrosswordMetadata } from '@fateround/shared'
import { CrosswordBoardView } from '@/components/games/crossword/CrosswordBoardView'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import {
  clearDailyProgress,
  getOrCreateStartedAt,
  loadDailyAnswers,
  saveDailyAnswers,
} from '@/lib/daily-progress'
import { hashWord } from '@/lib/daily-word-hash'
import { AppButton } from '@/components/ui/AppButton'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

const cellKey = (r: number, c: number) => `${r}-${c}`

export function DailyCrosswordPlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const metadata = puzzle.metadata as CrosswordMetadata
  const size = metadata?.size ?? 0
  const answerHashes = (puzzle.answer_hashes as string[] | undefined) ?? []
  const clues = useMemo(() => metadata?.clues ?? [], [metadata?.clues])

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [letterGrid, setLetterGrid] = useState<string[][]>(() =>
    Array.from({ length: size }, () => Array<string>(size).fill(''))
  )
  const [selectedCell, setSelectedCellState] = useState<[number, number] | null>(null)
  const [direction, setDirectionState] = useState<'across' | 'down'>('across')
  const [submitted, setSubmitted] = useState(false)
  const submitRef = useRef(false)

  // Latest-value refs so the typing helpers, invoked from OS keyboard callbacks,
  // never target a stale cell after a rapid double-tap.
  const selectedRef = useRef<[number, number] | null>(null)
  const directionRef = useRef<'across' | 'down'>('across')
  const setSelectedCell = useCallback((cell: [number, number] | null) => {
    selectedRef.current = cell
    setSelectedCellState(cell)
  }, [])
  const setDirection = useCallback((d: 'across' | 'down') => {
    directionRef.current = d
    setDirectionState(d)
  }, [])

  const inputRef = useRef<TextInput | null>(null)
  const focusInput = useCallback(() => {
    // requestAnimationFrame gives layout a beat before the focus call — matching how the
    // multiplayer view handles it — so iOS reliably raises the keyboard on the first tap.
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<string[][]>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (Array.isArray(saved) && saved.length === size) setLetterGrid(saved)
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId, size])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers(challengeId, letterGrid)
  }, [challengeId, letterGrid, hydrated, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const fillableCount = useMemo(() => {
    let n = 0
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!metadata.blocked[r][c]) n++
    return n
  }, [metadata, size])

  const filledCount = useMemo(() => {
    let n = 0
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++) if (!metadata.blocked[r][c] && letterGrid[r][c]) n++
    return n
  }, [metadata, letterGrid, size])

  const allFilled = fillableCount > 0 && filledCount >= fillableCount

  // Live per-clue correctness via hashed answers — the solution never ships to the client.
  const { solvedCells, solvedClues } = useMemo(() => {
    const cellsGrid: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
    const solved = new Set<number>()
    clues.forEach((clue, i) => {
      const hash = answerHashes[i]
      if (!hash) return
      let word = ''
      const cells: Array<[number, number]> = []
      for (let k = 0; k < clue.length; k++) {
        const r = clue.direction === 'across' ? clue.row : clue.row + k
        const c = clue.direction === 'across' ? clue.col + k : clue.col
        cells.push([r, c])
        word += letterGrid[r]?.[c] ?? ''
      }
      if (word.length === clue.length && hashWord(word) === hash) {
        solved.add(i)
        for (const [r, c] of cells) cellsGrid[r][c] = true
      }
    })
    return { solvedCells: cellsGrid, solvedClues: solved }
  }, [clues, answerHashes, letterGrid, size])

  const solvedCellsRef = useRef(solvedCells)
  useEffect(() => {
    solvedCellsRef.current = solvedCells
  }, [solvedCells])

  const solvedCount = solvedClues.size

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    void clearDailyProgress(challengeId)
    const cells: Array<{ row: number; col: number; letter: string }> = []
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!metadata.blocked[r][c] && letterGrid[r][c]) {
          cells.push({ row: r, col: c, letter: letterGrid[r][c] })
        }
      }
    }
    onSubmit({ timeSeconds: elapsed, submission: { cells, hintsUsed: 0 } })
  }, [challengeId, elapsed, letterGrid, metadata, onSubmit, size])

  useEffect(() => {
    if (isTimeUp && !submitted) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  useEffect(() => {
    if (!submitted && clues.length > 0 && solvedCount === clues.length) handleSubmit()
  }, [solvedCount, clues.length, submitted, handleSubmit])

  const activeCells = useMemo(() => {
    if (!selectedCell) return new Set<string>()
    const [sr, sc] = selectedCell
    const cells = new Set<string>()
    if (direction === 'across') {
      let c = sc
      while (c > 0 && !metadata.blocked[sr][c - 1]) c--
      while (c < size && !metadata.blocked[sr][c]) {
        cells.add(cellKey(sr, c))
        c++
      }
    } else {
      let r = sr
      while (r > 0 && !metadata.blocked[r - 1][sc]) r--
      while (r < size && !metadata.blocked[r][sc]) {
        cells.add(cellKey(r, sc))
        r++
      }
    }
    return cells
  }, [selectedCell, direction, metadata, size])

  const onCellSelect = useCallback(
    (row: number, col: number) => {
      if (submitted || metadata.blocked[row][col]) return
      const cur = selectedRef.current
      if (cur && cur[0] === row && cur[1] === col) {
        setDirection(directionRef.current === 'across' ? 'down' : 'across')
        focusInput()
        return
      }
      // Auto-orient to whichever axis actually has neighbors.
      const hasAcross =
        (col > 0 && !metadata.blocked[row][col - 1]) || (col < size - 1 && !metadata.blocked[row][col + 1])
      const hasDown =
        (row > 0 && !metadata.blocked[row - 1][col]) || (row < size - 1 && !metadata.blocked[row + 1][col])
      if (hasAcross && !hasDown) setDirection('across')
      else if (hasDown && !hasAcross) setDirection('down')

      // Skip past already-solved cells so tapping a solved letter drops the cursor on
      // the next editable cell in the current direction — same as web.
      if (solvedCellsRef.current[row]?.[col]) {
        const dir = directionRef.current
        const dr = dir === 'down' ? 1 : 0
        const dc = dir === 'across' ? 1 : 0
        let r = row + dr
        let c = col + dc
        while (r >= 0 && r < size && c >= 0 && c < size && !metadata.blocked[r][c]) {
          if (!solvedCellsRef.current[r]?.[c]) {
            setSelectedCell([r, c])
            focusInput()
            return
          }
          r += dr
          c += dc
        }
      }
      setSelectedCell([row, col])
      focusInput()
    },
    [focusInput, metadata, setDirection, setSelectedCell, size, submitted]
  )

  const typeLetter = useCallback(
    (raw: string) => {
      const cell = selectedRef.current
      if (submitted || !cell) return
      const letter = raw.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return
      const dir = directionRef.current
      const dr = dir === 'down' ? 1 : 0
      const dc = dir === 'across' ? 1 : 0

      let [row, col] = cell
      // Skip past solved cells before typing.
      while (solvedCellsRef.current[row]?.[col]) {
        const nr = row + dr
        const nc = col + dc
        if (nr < 0 || nr >= size || nc < 0 || nc >= size || metadata.blocked[nr][nc]) return
        row = nr
        col = nc
      }

      setSelectedCell([row, col])
      setLetterGrid((prev) => {
        const next = prev.map((r) => [...r])
        next[row][col] = letter
        return next
      })
      const nr = row + dr
      const nc = col + dc
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && !metadata.blocked[nr][nc]) {
        setSelectedCell([nr, nc])
      }
    },
    [metadata, setSelectedCell, size, submitted]
  )

  const backspace = useCallback(() => {
    const cell = selectedRef.current
    if (submitted || !cell) return
    const [row, col] = cell
    if (solvedCellsRef.current[row]?.[col]) return
    setLetterGrid((prev) => {
      const next = prev.map((r) => [...r])
      next[row][col] = ''
      return next
    })
    const dir = directionRef.current
    const dr = dir === 'down' ? -1 : 0
    const dc = dir === 'across' ? -1 : 0
    const nr = row + dr
    const nc = col + dc
    if (nr >= 0 && nr < size && nc >= 0 && nc < size && !metadata.blocked[nr][nc]) {
      setSelectedCell([nr, nc])
    }
  }, [metadata, setSelectedCell, size, submitted])

  // The hidden input's value is pinned to ''; each keystroke arrives here, gets applied to the
  // grid, and the field snaps back so the next keystroke reads as fresh. Backspace comes through
  // onKeyPress even when the field is already empty — same trick the multiplayer view uses.
  const handleInputChange = (text: string) => {
    const char = text.slice(-1)
    if (/^[a-zA-Z]$/.test(char)) typeLetter(char)
  }
  const handleKeyPress = ({ nativeEvent }: { nativeEvent: { key: string } }) => {
    if (nativeEvent.key === 'Backspace') backspace()
  }

  const confirmSubmit = () => {
    Alert.alert('Submit crossword?', "You can't undo this — the leaderboard uses the grid as it stands now.", [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Submit', style: 'destructive', onPress: handleSubmit },
    ])
  }

  const timerColor = isTimeUp ? theme.error : theme.text

  // The clue the cursor is currently editing — shown above the board so the player never has to
  // scroll the clue list to see what they're solving.
  const currentClue = useMemo(() => {
    if (!selectedCell) return null
    return clues.find((c) => c.direction === direction && activeCells.has(cellKey(c.row, c.col))) ?? null
  }, [selectedCell, direction, clues, activeCells])

  return (
    <View style={styles.wrap}>
      <View style={[styles.timerBar, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.timerLabel}>
          Solved: <Text style={styles.timerNumber}>{solvedCount}/{clues.length}</Text>
        </Text>
        <Text style={[styles.timerClock, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Tap a cell and type your answer. Tap the same cell again to toggle across/down.
      </Text>

      {currentClue ? (
        <View style={[styles.currentClue, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={[styles.currentClueLabel, { color: theme.primary }]}>
            {currentClue.number}
            {currentClue.direction === 'across' ? 'A' : 'D'}
          </Text>
          <Text style={styles.currentClueText}>{currentClue.clue}</Text>
        </View>
      ) : null}

      <Pressable onPress={focusInput}>
        <CrosswordBoardView
          metadata={metadata}
          letterGrid={letterGrid}
          mySolvedCells={solvedCells}
          selectedCell={selectedCell}
          activeCells={activeCells}
          onCellSelect={onCellSelect}
          readOnly={submitted || isTimeUp}
        />
      </Pressable>

      {/* Hidden text input drives the OS keyboard — same pattern as CrosswordPlayerView. */}
      {!submitted && !isTimeUp ? (
        <TextInput
          ref={inputRef}
          value=""
          onChangeText={handleInputChange}
          onKeyPress={handleKeyPress}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          keyboardType="ascii-capable"
          returnKeyType="done"
          caretHidden
          contextMenuHidden
          style={styles.hiddenInput}
        />
      ) : null}

      <View style={[styles.cluesCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Text style={styles.cluesTitle}>Clues</Text>
        <ScrollView style={styles.cluesScroll}>
          {clues.map((clue, i) => {
            const solved = solvedClues.has(i)
            const isCurrent = currentClue === clue
            return (
              <Pressable
                key={i}
                onPress={() => {
                  setDirection(clue.direction)
                  setSelectedCell([clue.row, clue.col])
                  focusInput()
                }}
                style={styles.clueRow}
              >
                <Text
                  style={[
                    styles.clueLabel,
                    { color: isCurrent ? theme.primary : theme.textFaint },
                  ]}
                >
                  {clue.number}
                  {clue.direction === 'across' ? 'A' : 'D'}
                </Text>
                <Text
                  style={[
                    styles.clueText,
                    {
                      color: solved ? theme.primary : isCurrent ? theme.text : theme.textMuted,
                      textDecorationLine: solved ? 'line-through' : 'none',
                      fontWeight: isCurrent ? '700' : '500',
                    },
                  ]}
                >
                  {clue.clue}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {allFilled && !submitted ? (
        <AppButton label="Submit crossword" size="lg" fullWidth onPress={confirmSubmit} />
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md, padding: theme.space.md },
    timerBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    timerLabel: { color: theme.textMuted, fontSize: theme.type.body.size },
    timerNumber: { color: theme.text, fontWeight: '800', fontVariant: ['tabular-nums'] },
    timerClock: { fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    currentClue: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      borderWidth: 1,
    },
    currentClueLabel: { fontSize: 13, fontWeight: '800', minWidth: 28 },
    currentClueText: { flex: 1, color: theme.text, fontSize: theme.type.body.size, fontWeight: '600' },
    hiddenInput: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0 },
    cluesCard: { padding: 12, borderRadius: 12, borderWidth: 1 },
    cluesTitle: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    cluesScroll: { maxHeight: 240 },
    clueRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
    clueLabel: { fontSize: theme.type.body.size, fontWeight: '800', minWidth: 32 },
    clueText: { flex: 1, fontSize: theme.type.body.size },
  })
