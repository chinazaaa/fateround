import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType } from '@fateround/shared'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import {
  gradeWordleGuess,
  normalizeWordleWord,
  tallyWordleRoomScores,
  WORDLE_ROOM_HINT_COST,
  type WordleLetterState,
  type WordleRoomProgressRow,
  type WordleRoomStandingRow,
} from '@fateround/shared/wordle-room'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameInfoChips } from '@/components/GameInfoChips'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { usePlayerSessionActions } from '@/lib/player-session'
import { postWordleRoomStatus, postWordleRoomGuess, postWordleRoomRevealHint } from '@/lib/game-api'
import { gameLabel } from '@/lib/mobile-registry'
import { getSupabase } from '@/lib/supabase'
import type { Theme } from '@/constants/theme'
import { useThemedStyles, useTheme } from '@/constants/theme-context'

type Screen =
  | 'loading'
  | 'not_found'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'

type GradedGuess = { word: string; states: WordleLetterState[] }

const KEYBOARD_ROWS: readonly (readonly string[])[] = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'BACK'],
]

export function WordleRoomPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    // Wordle Room's per-player state comes from /api/wordle-room/status and the anon-readable
    // wordle_room_progress table (via a channel below) — nothing extra to preload here.
    return { state: null, ok: true }
  }, [])

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(game, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (game.status === 'waiting') return 'waiting'
    if (game.status === 'finished') return 'finished'
    return 'active'
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

  const [currentWord, setCurrentWord] = useState<string | null>(null)
  const [wordLength, setWordLength] = useState(5)
  const [maxAttempts, setMaxAttempts] = useState(6)
  const [wordIndex, setWordIndex] = useState(0)
  const [wordCount, setWordCount] = useState(5)
  const [wordsSolved, setWordsSolved] = useState(0)
  const [categoryLabel, setCategoryLabel] = useState('Wordle')
  const [myFinished, setMyFinished] = useState(false)
  const [guesses, setGuesses] = useState<GradedGuess[]>([])
  const [current, setCurrent] = useState('')
  // Cursor for tile click-to-edit — same mechanic as web. Defaults to append position.
  const [cursorAt, setCursorAt] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [hintAvailable, setHintAvailable] = useState(false)
  const [hintUsed, setHintUsed] = useState(false)
  const [hintText, setHintText] = useState<string | null>(null)
  const [progressRows, setProgressRows] = useState<WordleRoomProgressRow[]>([])
  // Flips true once the standings query has returned at least once, so we can
  // gate the "active" render on standings + grid both being ready.
  const [progressLoaded, setProgressLoaded] = useState(false)
  const [roundId, setRoundId] = useState<string | null>(null)
  const submitLockRef = useRef(false)
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Absolute deadline (ms since epoch) after which the scheduled advance should have
  // fired. useGameTableSync consults this to skip fetchStatus while the reveal
  // ("Correct!" / "the word was …") should still be visible.
  const advanceDeadlineRef = useRef<number>(0)
  // Track the last (word_index, currentWord) we synced from the server so realtime
  // resyncs on the *same* word don't wipe the letters the user is currently typing.
  const lastSyncedWordRef = useRef<{ index: number; word: string } | null>(null)

  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))

  const fetchStatus = useCallback(async () => {
    if (!bootstrap.myResumeToken || !bootstrap.game) return
    try {
      const data = await postWordleRoomStatus(bootstrap.code, bootstrap.myResumeToken)
      // Only lock the board on an unambiguous per-player completion signal — `finished:true`
      // alone can also mean "game not active yet" or "solutions row missing", neither of
      // which is a real completion. sequenceComplete is only true when progress.finished is.
      if (data.sequenceComplete === true) setMyFinished(true)
      if (data.currentWord) {
        const nextIndex = data.word_index ?? 0
        const prev = lastSyncedWordRef.current
        const wordChanged = !prev || prev.index !== nextIndex || prev.word !== data.currentWord
        setCurrentWord(data.currentWord)
        setWordLength(data.wordLength ?? data.currentWord.length)
        setMaxAttempts(data.maxAttempts ?? data.currentWord.length + 1)
        setWordIndex(nextIndex)
        setWordCount(data.word_count ?? 5)
        setWordsSolved(data.words_solved ?? 0)
        setCategoryLabel(data.categoryLabel ?? 'Wordle')
        setMyFinished(data.sequenceComplete === true)
        setHintAvailable(data.hintAvailable === true)
        setHintUsed(data.hintUsed === true)
        setHintText(data.hint ?? null)
        setGuesses((data.guesses ?? []).map((g) => ({ word: g.guess, states: g.state })))
        // Only wipe the in-progress typed letters + banner when we've actually
        // advanced to a new word. Realtime resyncs on the same word (another
        // player's progress row updating) previously blew away whatever the user
        // was typing.
        if (wordChanged) {
          setCurrent('')
          setCursorAt(0)
          // Clear the previous word's transient banner ("Out of attempts — the word was X",
          // "Correct! +N pts") so it doesn't linger into the next word.
          setMessage(null)
        }
        lastSyncedWordRef.current = { index: nextIndex, word: data.currentWord }
      }
      // Deliberately DO NOT wipe currentWord/guesses when finished:true arrives without a
      // currentWord — the server uses that shape in several non-completion cases (game not
      // yet active, solutions row missing, transient races), and blanking state there hides
      // the grid + hint button for a still-playing user. Real completion locks input via
      // myFinished (see addLetter/submitGuess guards).
      if (data.status === 'finished') void bootstrap.load()
    } catch {
      /* swallowed — will retry on next tick */
    }
  }, [bootstrap])

  const scheduleAdvance = useCallback(
    (delayMs: number) => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
      advanceDeadlineRef.current = Date.now() + delayMs
      advanceTimerRef.current = setTimeout(() => {
        advanceDeadlineRef.current = 0
        void fetchStatus()
      }, delayMs)
    },
    [fetchStatus]
  )

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current)
    }
  }, [])

  // Resolve the round id so anon standings can be filtered by it.
  useEffect(() => {
    let cancelled = false
    if (!bootstrap.game || bootstrap.game.status === 'waiting') return
    void (async () => {
      const res = await getSupabase()
        .from('rounds')
        .select('id')
        .eq('game_id', bootstrap.code)
        .eq('round_number', 1)
        .maybeSingle()
      if (!cancelled && res.data?.id) setRoundId(res.data.id as string)
    })()
    return () => {
      cancelled = true
    }
  }, [bootstrap.code, bootstrap.game])

  const loadProgress = useCallback(async () => {
    if (!roundId) return
    const res = await getSupabase()
      .from('wordle_room_progress')
      .select('*')
      .eq('game_id', bootstrap.code)
      .eq('round_id', roundId)
    if (res.data) setProgressRows(res.data as WordleRoomProgressRow[])
    // Mark loaded even when the row set is empty — the query succeeded, we just
    // have no standings yet. This flips the loading gate below to done.
    setProgressLoaded(true)
  }, [bootstrap.code, roundId])

  useEffect(() => {
    if (!roundId) return
    void loadProgress()
  }, [roundId, loadProgress])

  useEffect(() => {
    if (!bootstrap.myResumeToken || !bootstrap.game) return
    if (bootstrap.game.status !== 'active' && bootstrap.game.status !== 'finished') return
    void fetchStatus()
  }, [bootstrap.myResumeToken, bootstrap.game, fetchStatus])

  // Realtime standings + status re-sync on any progress change. Standings refresh
  // immediately; the status re-fetch is deferred until any pending reveal delay has
  // elapsed so a completed guess's own progress-row update doesn't race the
  // scheduled advance and blow away the "the word was …" banner early.
  useGameTableSync(
    gameCode,
    ['players', { table: 'games', column: 'id' }, 'wordle_room_progress'],
    () => {
      void loadProgress()
      const now = Date.now()
      if (advanceDeadlineRef.current > now) {
        const wait = advanceDeadlineRef.current - now
        setTimeout(() => {
          if (advanceDeadlineRef.current <= Date.now()) void fetchStatus()
        }, wait + 10)
      } else {
        void fetchStatus()
      }
    },
    !!bootstrap.game && !!roundId
  )

  const standings: WordleRoomStandingRow[] = useMemo(
    () => tallyWordleRoomScores(progressRows, bootstrap.players),
    [progressRows, bootstrap.players]
  )
  const myStanding = standings.find((s) => s.player_id === bootstrap.myPlayerId)

  const addLetter = useCallback(
    (raw: string) => {
      const ch = raw.toLowerCase()
      if (!/^[a-z]$/.test(ch)) return
      if (myFinished || !currentWord) return
      setMessage(null)
      if (cursorAt < current.length) {
        setCurrent(current.slice(0, cursorAt) + ch + current.slice(cursorAt + 1))
        setCursorAt(Math.min(cursorAt + 1, wordLength))
      } else if (current.length < wordLength) {
        setCurrent(current + ch)
        setCursorAt(current.length + 1)
      }
    },
    [current, cursorAt, wordLength, myFinished, currentWord]
  )

  const backspace = useCallback(() => {
    setMessage(null)
    if (cursorAt > 0 && cursorAt <= current.length) {
      setCurrent(current.slice(0, cursorAt - 1) + current.slice(cursorAt))
      setCursorAt(cursorAt - 1)
    }
  }, [current, cursorAt])

  const focusTile = useCallback(
    (i: number) => {
      if (i < 0 || i > current.length || i >= wordLength) return
      setCursorAt(i)
    },
    [current.length, wordLength]
  )

  const submitGuess = useCallback(async () => {
    if (!currentWord || !bootstrap.myResumeToken || isViewer || myFinished) return
    if (submitLockRef.current) return
    if (current.length < wordLength) {
      setMessage('Not enough letters')
      setShake(true)
      setTimeout(() => setShake(false), 350)
      return
    }
    const normalized = normalizeWordleWord(current)
    if (normalized.length !== wordLength) {
      setMessage('Letters only')
      setShake(true)
      setTimeout(() => setShake(false), 350)
      return
    }
    const states = gradeWordleGuess(normalized, currentWord)
    const solved = states.every((s) => s === 'correct')
    setGuesses((g) => [...g, { word: normalized, states }])
    setCurrent('')
    setCursorAt(0)
    submitLockRef.current = true
    try {
      const res = await postWordleRoomGuess(bootstrap.code, bootstrap.myResumeToken, normalized)
      if (res.solved) {
        setMessage(`Correct! +${res.pointsAwarded ?? 0} pts`)
      } else if (res.finished || (res.wordIndex ?? 0) > wordIndex) {
        setMessage(`Out of attempts — the word was ${currentWord.toUpperCase()}`)
      }
      const wordDone = res.finished === true || (res.wordIndex ?? wordIndex) !== wordIndex
      // Longer beat on out-of-attempts so the revealed word is actually readable; solved
      // is a shorter delay since the player already knows what the word was.
      if (wordDone) scheduleAdvance(res.solved ? 1400 : 5000)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Guess failed')
    } finally {
      submitLockRef.current = false
    }
  }, [bootstrap, current, currentWord, isViewer, myFinished, scheduleAdvance, wordIndex, wordLength])

  const revealHint = useCallback(() => {
    if (!bootstrap.myResumeToken || !hintAvailable || hintUsed || myFinished) return
    Alert.alert('Reveal hint?', `This costs ${WORDLE_ROOM_HINT_COST} points off this word's score. Are you sure?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Reveal (−${WORDLE_ROOM_HINT_COST})`,
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await postWordleRoomRevealHint(bootstrap.code, bootstrap.myResumeToken!, wordIndex)
            setHintUsed(true)
            if (res.hint) setHintText(res.hint)
          } catch (err) {
            setMessage(err instanceof Error ? err.message : 'Could not reveal hint')
          }
        },
      },
    ])
  }, [bootstrap, hintAvailable, hintUsed, myFinished, wordIndex])

  const label = gameLabel((bootstrap.game?.game_type ?? 'wordle_room') as GameType)

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
  if (bootstrap.screen === 'join' && bootstrap.game) {
    const joiningAsViewer = bootstrap.game.status === 'active'
    const configuredWordCount = (bootstrap.game as unknown as { wordle_room_word_count?: number | null })
      .wordle_room_word_count
    return (
      <JoinScreen
        gameCode={bootstrap.code}
        joinName={bootstrap.joinName}
        joining={bootstrap.joining}
        error={bootstrap.error}
        onChangeName={bootstrap.setJoinName}
        onJoin={() => void bootstrap.join(undefined, joiningAsViewer ? { joinAsViewer: true } : undefined)}
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        kicker={joiningAsViewer ? 'Watch game' : 'Join game'}
        hint={
          joiningAsViewer
            ? 'Game in progress — enter a name to watch as a viewer (read-only).'
            : `Race through ${configuredWordCount ?? 5} Wordle words. Most points wins.`
        }
        submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    // Wait for standings before rendering the finish panel — otherwise the
    // leaderboard is empty and the panel collapses to just the footer buttons.
    if (!progressLoaded) return <GameLoading />
    const top = standings[0]
    const winnerId = top?.total_points && top.total_points > 0 ? top.player_id : null
    const title = winnerId ? (bootstrap.myPlayerId === winnerId ? 'You win!' : `${top!.name} wins!`) : 'Game over'
    return (
      <GameShell bootstrap={bootstrap} title={label} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={title}
          subtitle="Final standings"
          leaderboard={standings.map((s) => ({
            name: s.name,
            score: s.total_points,
            scoreSuffix: 'pts',
            highlight: s.player_id === bootstrap.myPlayerId,
            you: s.player_id === bootstrap.myPlayerId,
            detail: `${s.words_solved} solved${s.hints_used_count ? ` · ${s.hints_used_count} hint${s.hints_used_count > 1 ? 's' : ''}` : ''}`,
          }))}
          winnerPlayerId={winnerId ?? undefined}
          roundKey={roundId ?? bootstrap.code}
          hideDefaultHeader
        />
      </GameShell>
    )
  }

  // Gate the active render on BOTH the grid data (currentWord) and standings
  // (progressLoaded) being ready, so the standings panel doesn't flash before
  // the grid loads in.
  if (bootstrap.screen === 'active' && (!currentWord || !progressLoaded)) return <GameLoading />

  // Active — render the board + keyboard + standings.
  const rows: React.ReactNode[] = []
  for (let r = 0; r < maxAttempts; r++) {
    if (r < guesses.length) {
      const row = guesses[r]!
      rows.push(
        <View key={`g-${r}`} style={styles.row}>
          {row.word.split('').map((ch, i) => (
            <View key={i} style={[styles.tile, tileStateStyle(theme, row.states[i]!)]}>
              <Text style={styles.tileText}>{ch.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      )
    } else if (r === guesses.length && !myFinished) {
      rows.push(
        <View key="current" style={[styles.row, shake && styles.rowShake]}>
          {Array.from({ length: wordLength }).map((_, i) => {
            const ch = current[i] ?? ''
            const focused = cursorAt === i
            const clickable = i < current.length
            const tileStyle = [styles.tile, styles.tileCurrent, focused && styles.tileFocus]
            return (
              <Pressable
                key={i}
                style={tileStyle}
                onPress={clickable ? () => focusTile(i) : undefined}
                accessibilityRole={clickable ? 'button' : undefined}
                accessibilityLabel={clickable ? `Edit letter ${i + 1}: ${ch.toUpperCase()}` : undefined}
              >
                <Text style={styles.tileText}>{ch.toUpperCase()}</Text>
              </Pressable>
            )
          })}
        </View>
      )
    } else {
      rows.push(
        <View key={`e-${r}`} style={styles.row}>
          {Array.from({ length: wordLength }).map((_, i) => (
            <View key={i} style={[styles.tile, styles.tileEmpty]} />
          ))}
        </View>
      )
    }
  }

  return (
    <GameShell bootstrap={bootstrap} title={label} subtitle={`Code ${bootstrap.code}`}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{categoryLabel}</Text>
          </View>
          <Text style={styles.headerMeta}>
            Word {Math.min(wordIndex + 1, wordCount)}/{wordCount}
          </Text>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: '#538d4e' }]} />
            <Text style={styles.legendText}>right letter, right spot</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: '#b59f3b' }]} />
            <Text style={styles.legendText}>in the word, wrong spot</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: '#3a3a3c' }]} />
            <Text style={styles.legendText}>not in the word</Text>
          </View>
        </View>
        {currentWord && <View style={styles.board}>{rows}</View>}
        {message && <Text style={styles.message}>{message}</Text>}
        {currentWord &&
          !myFinished &&
          hintAvailable &&
          (hintUsed && hintText ? (
            <Text style={styles.hintText}>
              Hint: {hintText} <Text style={styles.hintCost}>(−{WORDLE_ROOM_HINT_COST} pts)</Text>
            </Text>
          ) : !hintUsed ? (
            <Pressable style={styles.hintButton} onPress={revealHint}>
              <Text style={styles.hintButtonText}>Reveal hint (−{WORDLE_ROOM_HINT_COST} pts)</Text>
            </Pressable>
          ) : null)}
        {currentWord && !myFinished && (
          <View style={styles.keyboard}>
            {KEYBOARD_ROWS.map((krow, ri) => (
              <View key={ri} style={styles.keyRow}>
                {krow.map((key) => {
                  const wide = key === 'ENTER' || key === 'BACK'
                  const onPress = () => {
                    if (key === 'ENTER') void submitGuess()
                    else if (key === 'BACK') backspace()
                    else addLetter(key)
                  }
                  return (
                    <Pressable key={key} style={[styles.key, wide && styles.keyWide]} onPress={onPress}>
                      <Text style={[styles.keyText, wide && styles.keyTextWide]}>
                        {key === 'BACK' ? '⌫' : key === 'ENTER' ? 'Enter' : key}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </View>
        )}
        {myFinished && (
          <View style={styles.finishedCard}>
            <Text style={styles.finishedNote}>You finished — waiting on others!</Text>
            <Text style={styles.finishedStats}>
              {(() => {
                const rank = standings.findIndex((s) => s.player_id === bootstrap.myPlayerId) + 1
                const suffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'
                const ms = myStanding?.total_time_ms ?? null
                const timeText =
                  ms != null
                    ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`
                    : '—'
                const rankText = rank > 0 ? `${rank}${suffix} so far · ` : ''
                return `${rankText}${myStanding?.total_points ?? 0} pts · time ${timeText}`
              })()}
            </Text>
          </View>
        )}
        <View style={styles.standingsBox}>
          <Text style={styles.standingsTitle}>Race standings</Text>
          {standings.length === 0 ? (
            <Text style={styles.standingsHint}>Waiting for the room to get going…</Text>
          ) : (
            standings.map((row, i) => {
              const isMe = row.player_id === bootstrap.myPlayerId
              return (
                <View key={row.player_id} style={styles.standingsRow}>
                  <Text style={[styles.standingsName, isMe && styles.standingsNameMe]} numberOfLines={1}>
                    {i + 1}. {row.name}
                    {isMe ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.standingsRight}>
                    {row.total_points} pts · {row.words_solved} solved
                    {row.hints_used_count > 0
                      ? ` · ${row.hints_used_count} hint${row.hints_used_count > 1 ? 's' : ''}`
                      : ''}
                  </Text>
                </View>
              )
            })
          )}
        </View>
        {myStanding && (
          <Text style={styles.myStats}>
            You: {myStanding.total_points} pts · {myStanding.words_solved}/{wordCount} solved
          </Text>
        )}
      </ScrollView>
    </GameShell>
  )
}

function tileStateStyle(theme: Theme, state: WordleLetterState) {
  const bg = state === 'correct' ? '#538d4e' : state === 'present' ? '#b59f3b' : '#3a3a3c'
  return { backgroundColor: bg, borderColor: 'transparent' }
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingHorizontal: 12, paddingBottom: 32, gap: 10, alignItems: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      maxWidth: 420,
    },
    badge: {
      backgroundColor: '#538d4e',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
    },
    badgeText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
    headerMeta: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      columnGap: 12,
      rowGap: 4,
      width: '100%',
      maxWidth: 420,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendSwatch: { width: 10, height: 10, borderRadius: 2 },
    legendText: { color: theme.textMuted, fontSize: 11 },
    board: { gap: 5, alignItems: 'center' },
    row: { flexDirection: 'row', gap: 5 },
    rowShake: { transform: [{ translateX: 3 }] },
    tile: {
      width: 52,
      height: 52,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.surface,
    },
    tileEmpty: { borderColor: theme.border, opacity: 0.6 },
    tileCurrent: { borderColor: theme.text },
    tileFocus: { borderColor: theme.primary, borderWidth: 3 },
    tileText: { color: theme.text, fontSize: 22, fontWeight: '800', textTransform: 'uppercase' },
    message: { color: theme.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
    hintText: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    hintCost: { color: theme.textFaint, fontSize: 11 },
    hintButton: {
      alignSelf: 'center',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    hintButtonText: { color: theme.text, fontSize: 13, fontWeight: '600' },
    keyboard: { width: '100%', maxWidth: 480, gap: 6, marginTop: 4 },
    keyRow: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
    key: {
      flex: 1,
      minWidth: 0,
      height: 44,
      borderRadius: 6,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    keyWide: { flex: 1.5 },
    keyText: { color: theme.text, fontSize: 15, fontWeight: '700', textTransform: 'uppercase' },
    keyTextWide: { fontSize: 12 },
    finishedNote: { color: theme.primary, fontWeight: '700', textAlign: 'center' },
    finishedCard: {
      alignSelf: 'stretch',
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 10,
      gap: 4,
    },
    finishedStats: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
    standingsBox: {
      width: '100%',
      maxWidth: 420,
      padding: 12,
      borderRadius: 12,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      gap: 6,
    },
    standingsTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    standingsHint: { color: theme.textMuted, fontSize: 12 },
    standingsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    standingsName: { color: theme.text, fontSize: 13, fontWeight: '500', flexShrink: 1 },
    standingsNameMe: { color: theme.primary },
    standingsRight: { color: theme.textMuted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    myStats: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
  })
