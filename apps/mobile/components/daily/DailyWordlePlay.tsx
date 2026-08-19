/**
 * Daily Wordle play surface (mobile).
 *
 * Native port of `src/components/daily/DailyWordlePlay.tsx`. Grades every
 * guess locally for instant feedback (server re-grades on submit and remains
 * scoring authority — see the "Anti-cheat note" in src/lib/daily-wordle.ts).
 * Uses an on-screen QWERTY keyboard so the OS keyboard never covers the
 * board, matching the web look.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { useDailyChallengeTimer } from '@/hooks/useDailyChallengeTimer'
import { getOrCreateStartedAt, loadDailyAnswers, saveDailyAnswers } from '@/lib/daily-progress'
import { gradeWordleGuess, wordleKeyBestStates, type WordleLetterState } from '@/lib/daily-wordle'
import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/identity'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

interface Props {
  challengeId: string
  puzzle: Record<string, unknown>
  timer: number
  onSubmit: (payload: { timeSeconds: number; submission: Record<string, unknown> }) => void
}

interface WordleProgress {
  guesses: string[]
  current: string
  hintUsed?: boolean
}

const KEYBOARD_ROWS: ReadonlyArray<readonly string[]> = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
]

// Wordle palette — same values as the web CSS variables in DailyWordlePlay.
const TILE_BG: Record<WordleLetterState, string> = {
  correct: '#538d4e',
  present: '#b59f3b',
  absent: '#3a3a3c',
}

export function DailyWordlePlay({ challengeId, puzzle, timer: maxSeconds, onSubmit }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const word = typeof puzzle.word === 'string' ? puzzle.word.toLowerCase() : ''
  const categoryLabel = typeof puzzle.categoryLabel === 'string' ? puzzle.categoryLabel : 'Wordle'
  const hint = typeof puzzle.hint === 'string' ? puzzle.hint : ''
  const wordLength = typeof puzzle.length === 'number' ? puzzle.length : word.length
  const maxAttempts = typeof puzzle.maxAttempts === 'number' ? puzzle.maxAttempts : wordLength + 1

  const [hydrated, setHydrated] = useState(false)
  const [startAtMs, setStartAtMs] = useState<number | null>(null)
  const [guesses, setGuesses] = useState<string[]>([])
  const [current, setCurrent] = useState('')
  const [hintUsed, setHintUsed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [countdown, setCountdown] = useState<number | null>(null)
  const submitRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      const started = await getOrCreateStartedAt(challengeId)
      const saved = await loadDailyAnswers<WordleProgress>(challengeId)
      if (cancelled) return
      setStartAtMs(started)
      if (saved) {
        setGuesses(saved.guesses ?? [])
        setCurrent(saved.current ?? '')
        setHintUsed(!!saved.hintUsed)
      }
      setHydrated(true)
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [challengeId])

  useEffect(() => {
    if (!hydrated || submitted) return
    void saveDailyAnswers<WordleProgress>(challengeId, { guesses, current, hintUsed })
  }, [challengeId, guesses, current, hintUsed, hydrated, submitted])

  const { elapsed, formatted, isTimeUp } = useDailyChallengeTimer({
    mode: 'countdown',
    maxSeconds,
    running: hydrated && !submitted,
    startAtMs: startAtMs ?? undefined,
  })

  const won = guesses.length > 0 && guesses[guesses.length - 1] === word
  const gameOver = won || guesses.length >= maxAttempts

  // Keep the latest elapsed available to handleSubmit without recreating it every tick — same
  // fix as web: an every-second re-created callback would reset the "going to scoreboard"
  // countdown effect. Ref stays stable.
  const elapsedRef = useRef(elapsed)
  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])

  const handleSubmit = useCallback(() => {
    if (submitRef.current) return
    submitRef.current = true
    setSubmitted(true)
    onSubmit({ timeSeconds: elapsedRef.current, submission: { guesses, hintUsed } })
  }, [guesses, hintUsed, onSubmit])

  const REVEAL_DELAY_MS = won ? 1200 : 2000
  useEffect(() => {
    if (!gameOver || submitted || submitRef.current) return
    const id = setTimeout(() => setCountdown(5), REVEAL_DELAY_MS)
    return () => clearTimeout(id)
  }, [gameOver, submitted, REVEAL_DELAY_MS])

  useEffect(() => {
    if (countdown == null) return
    if (countdown <= 0) {
      handleSubmit()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown, handleSubmit])

  useEffect(() => {
    if (isTimeUp && !submitted && !submitRef.current) handleSubmit()
  }, [isTimeUp, submitted, handleSubmit])

  const revealHint = useCallback(() => {
    if (submitted || hintUsed) return
    Alert.alert('Reveal hint?', 'This costs 300 points off your final score. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reveal (−300)',
        style: 'destructive',
        onPress: async () => {
          // Persist the reveal server-side first so a modified client can't dodge the
          // deduction. Best-effort — the local flag still travels with the submission.
          try {
            const headers = await authHeaders()
            await fetch(apiUrl('/api/daily-challenges/wordle/reveal-hint'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
              body: JSON.stringify({ challengeId }),
            })
          } catch {
            /* network hiccup — hintUsed still travels in submission */
          }
          setHintUsed(true)
        },
      },
    ])
  }, [challengeId, hintUsed, submitted])

  const addLetter = useCallback(
    (key: string) => {
      const ch = key.toLowerCase()
      if (!/^[a-z]$/.test(ch)) return
      setMessage(null)
      setCurrent((prev) => (prev.length < wordLength ? prev + ch : prev))
    },
    [wordLength]
  )

  const backspace = useCallback(() => {
    setMessage(null)
    setCurrent((prev) => prev.slice(0, -1))
  }, [])

  const submitGuess = useCallback(() => {
    if (gameOver || submitted || submitRef.current) return
    if (current.length < wordLength) {
      setMessage('Not enough letters')
      return
    }
    const guess = current.toLowerCase()
    setGuesses((g) => [...g, guess])
    setCurrent('')
    setMessage(null)
  }, [current, gameOver, submitted, wordLength])

  const bestStates = wordleKeyBestStates(guesses, word)
  const remainingGuesses = Math.max(0, maxAttempts - guesses.length)
  const timerColor = isTimeUp ? theme.error : theme.text

  const gameOverBase = gameOver ? (won ? 'Correct!' : `The word was ${word.toUpperCase()}`) : null
  const gameOverMessage =
    gameOverBase && countdown != null && countdown > 0
      ? `${gameOverBase} — going to scoreboard in ${countdown}s`
      : gameOverBase

  // Build the rows once so we don't repeat the logic on each render below.
  const rows: Array<{ kind: 'graded' | 'current' | 'empty' | 'reveal'; word: string; states?: WordleLetterState[] }> =
    []
  for (let r = 0; r < maxAttempts; r++) {
    if (r < guesses.length) {
      const g = guesses[r]
      rows.push({ kind: 'graded', word: g, states: gradeWordleGuess(g, word) })
    } else if (r === guesses.length && !gameOver) {
      rows.push({ kind: 'current', word: current })
    } else {
      rows.push({ kind: 'empty', word: '' })
    }
  }
  if (gameOver && !won) rows.push({ kind: 'reveal', word })

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={[styles.catBadge, { backgroundColor: TILE_BG.correct }]}>
          <Text style={styles.catBadgeText}>{categoryLabel}</Text>
        </View>
        <Text style={styles.remaining}>
          {gameOver ? 'Game over' : `${remainingGuesses} guess${remainingGuesses === 1 ? '' : 'es'} left`}
        </Text>
        <Text style={[styles.timer, { color: timerColor }]}>{formatted}</Text>
      </View>

      <Text style={styles.instructions}>
        Guess the {wordLength}-letter word in {maxAttempts} tries. Green = right letter + spot, yellow = right letter
        wrong spot, grey = not in the word.
      </Text>

      <View style={styles.board}>
        {rows.map((row, r) => (
          <View key={r} style={styles.boardRow}>
            {Array.from({ length: wordLength }).map((_, i) => {
              const ch = row.word[i] ?? ''
              const state = row.states?.[i]
              const bg =
                row.kind === 'graded' && state ? TILE_BG[state] : row.kind === 'reveal' ? theme.surface : theme.surface
              const border =
                row.kind === 'graded' && state ? 'transparent' : row.kind === 'reveal' ? theme.primary : theme.border
              const color = row.kind === 'graded' && state ? '#fff' : theme.text
              return (
                <View key={i} style={[styles.tile, { backgroundColor: bg, borderColor: border, borderWidth: 1.5 }]}>
                  <Text style={[styles.tileText, { color }]}>{ch.toUpperCase()}</Text>
                </View>
              )
            })}
          </View>
        ))}
      </View>

      {message || gameOverMessage ? <Text style={styles.messageText}>{message ?? gameOverMessage}</Text> : null}

      {/* Hint reveal (−300 pts). Hidden if this puzzle has no hint (General English). */}
      {hint && !gameOver ? (
        hintUsed ? (
          <Text style={styles.hintText}>
            Hint: {hint} <Text style={styles.hintCost}>(−300 pts)</Text>
          </Text>
        ) : (
          <Pressable
            style={[styles.hintButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={revealHint}
            disabled={submitted}
          >
            <Text style={styles.hintButtonText}>Reveal hint (−300 pts)</Text>
          </Pressable>
        )
      ) : null}
      {gameOver && hintUsed && hint ? (
        <Text style={styles.hintText}>
          Hint: {hint} <Text style={styles.hintCost}>(−300 pts)</Text>
        </Text>
      ) : null}

      <View style={styles.keyboard}>
        {KEYBOARD_ROWS.map((row, ri) => (
          <View key={ri} style={styles.keyRow}>
            {row.map((key) => {
              if (key === 'ENTER') {
                return <KeyboardKey key={key} label="Enter" wide onPress={submitGuess} disabled={submitted} />
              }
              if (key === 'BACK') {
                return <KeyboardKey key={key} label="⌫" wide onPress={backspace} disabled={submitted} />
              }
              const state = bestStates.get(key.toLowerCase())
              return (
                <KeyboardKey
                  key={key}
                  label={key}
                  onPress={() => addLetter(key)}
                  disabled={submitted}
                  bg={state ? TILE_BG[state] : undefined}
                  fg={state ? '#fff' : undefined}
                />
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
}

function KeyboardKey({
  label,
  onPress,
  disabled,
  wide,
  bg,
  fg,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  wide?: boolean
  bg?: string
  fg?: string
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.key,
        wide && styles.keyWide,
        {
          backgroundColor: bg ?? theme.surface,
          borderColor: bg ? 'transparent' : theme.border,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.keyText, { color: fg ?? theme.text, fontSize: wide ? 12 : 15 }]}>{label}</Text>
    </Pressable>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md, padding: theme.space.md },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    catBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    catBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    remaining: { color: theme.textMuted, fontSize: theme.type.body.size, fontWeight: '600' },
    timer: { fontSize: theme.type.body.size, fontWeight: '800', fontVariant: ['tabular-nums'] },
    instructions: { color: theme.textFaint, fontSize: theme.type.caption.size, textAlign: 'center' },
    board: { gap: 5, alignSelf: 'center' },
    boardRow: { flexDirection: 'row', gap: 5 },
    tile: {
      width: 52,
      height: 52,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // alignSelf:'stretch' + textAlign:'center' — RN New Arch measures a narrow
    // lone glyph inside a flexed Text to zero and renders nothing (the "I" tile
    // and "I" key were blank). Stretching the Text and centering the glyph
    // sidesteps the intrinsic-width measurement.
    tileText: { fontSize: 22, fontWeight: '800', alignSelf: 'stretch', textAlign: 'center' },
    messageText: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center', fontWeight: '600' },
    hintText: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    hintCost: { color: theme.textFaint },
    hintButton: {
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
    },
    hintButtonText: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    keyboard: { gap: 6, marginTop: 4 },
    keyRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
    key: {
      flex: 1,
      minWidth: 0,
      height: 44,
      borderRadius: 4,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyWide: { flex: 1.5 },
    keyText: { fontWeight: '800', alignSelf: 'stretch', textAlign: 'center' },
  })
