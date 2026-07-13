import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { type Game, type Round } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import {
  parseWordScrambleMetadata,
  tallyWordScrambleScores,
  wordScrambleCompletionPercent,
  playerCurrentIndex,
  playerSolvedIndices,
  WORD_SCRAMBLE_HINT_PENALTY,
  WORD_SCRAMBLE_CLUE_PENALTY,
  type WordScrambleMetadata,
  type WordScrambleSolve,
  type WordScrambleHint,
} from '@fateround/shared/word-scramble'
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameInfoChips } from '@/components/GameInfoChips'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { WordScrambleGameTimerBar } from '@/components/games/word-scramble/WordScrambleGameTimerBar'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postWordScrambleSubmit, postWordScrambleHint, fetchWordScrambleSolution } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, WORD_SCRAMBLE_SOLVE_SELECT, WORD_SCRAMBLE_HINT_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { formatMinutesSeconds, getPlayerTimeSpent, ordinal } from '@/components/games/word-search/standings'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

/** getPlayerTimeSpent expects `found_at` rows — adapt solves (last solve = finish time). */
function solvesAsTimeRows(solves: WordScrambleSolve[]) {
  return solves.map((s) => ({ player_id: s.player_id, found_at: s.solved_at }))
}

export function WordScramblePlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [metadata, setMetadata] = useState<WordScrambleMetadata | null>(null)
  const [solves, setSolves] = useState<WordScrambleSolve[]>([])
  const [hints, setHints] = useState<WordScrambleHint[]>([])
  const [revealedPrefix, setRevealedPrefix] = useState<Record<number, string>>({})
  const [answers, setAnswers] = useState<string[] | null>(null)
  const [guess, setGuess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const addSolve = useCallback((row: WordScrambleSolve) => {
    setSolves((prev) =>
      prev.some((s) => s.player_id === row.player_id && s.scramble_index === row.scramble_index) ? prev : [...prev, row]
    )
  }, [])

  const addHint = useCallback((row: WordScrambleHint) => {
    setHints((prev) => {
      const i = prev.findIndex((h) => h.player_id === row.player_id && h.scramble_index === row.scramble_index)
      if (i === -1) return [...prev, row]
      if (prev[i].letters >= row.letters) return prev
      const next = [...prev]
      next[i] = row
      return next
    })
  }, [])

  const loadGameState = useCallback(
    async (game: Game): Promise<{ state: boolean; ok: boolean }> => {
      if (game.status !== 'active') return { state: false, ok: true }
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { state: false, ok: true }
      const meta = parseWordScrambleMetadata((roundData as Round).word_scramble_metadata)
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
    loadGameState: (game) => loadGameState(game),
    computeScreen: (game, playerId, state) => {
      if (game.status === 'finished') return 'finished'
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      return state ? 'playing' : 'waiting'
    },
    afterResolve: async (game, playerId) => {
      if (game.status === 'finished') {
        const [roundRes, rowsRes] = await Promise.all([
          getSupabase()
            .from('rounds')
            .select(ROUND_SELECT)
            .eq('game_id', gameCode.toUpperCase())
            .eq('round_number', 1)
            .maybeSingle(),
          getSupabase()
            .from('word_scramble_solves')
            .select(WORD_SCRAMBLE_SOLVE_SELECT)
            .eq('game_id', gameCode.toUpperCase()),
        ])
        const meta = roundRes.data ? parseWordScrambleMetadata((roundRes.data as Round).word_scramble_metadata) : null
        if (meta) setMetadata(meta)
        setSolves((rowsRes.data as WordScrambleSolve[]) ?? [])
        const { data: hintRows } = await getSupabase()
          .from('word_scramble_hints')
          .select(WORD_SCRAMBLE_HINT_SELECT)
          .eq('game_id', gameCode.toUpperCase())
        setHints((hintRows as WordScrambleHint[]) ?? [])
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
      const { data: rows } = await getSupabase()
        .from('word_scramble_solves')
        .select(WORD_SCRAMBLE_SOLVE_SELECT)
        .eq('round_id', roundData.id)
      setSolves((rows as WordScrambleSolve[]) ?? [])
      const { data: hintRows } = await getSupabase()
        .from('word_scramble_hints')
        .select(WORD_SCRAMBLE_HINT_SELECT)
        .eq('round_id', roundData.id)
      setHints((hintRows as WordScrambleHint[]) ?? [])
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'word_scramble_solves', 'word_scramble_hints'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  useEffect(() => {
    if (bootstrap.screen !== 'playing') return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [bootstrap.screen])

  useEffect(() => {
    if (bootstrap.game?.status !== 'finished' || answers) return
    let cancelled = false
    void fetchWordScrambleSolution(gameCode).then((a) => {
      if (!cancelled && a) setAnswers(a)
    })
    return () => {
      cancelled = true
    }
  }, [bootstrap.game?.status, gameCode, answers])

  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const viewing = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))
  const standings = useMemo(
    () => (metadata ? tallyWordScrambleScores(metadata, solves, bootstrap.players, { hints }) : []),
    [metadata, solves, hints, bootstrap.players]
  )
  const myRank = standings.findIndex((r) => r.player_id === bootstrap.myPlayerId) + 1
  const myCompletion =
    metadata && bootstrap.myPlayerId ? wordScrambleCompletionPercent(metadata, solves, bootstrap.myPlayerId) : 0
  const mySolved = bootstrap.myPlayerId ? playerSolvedIndices(solves, bootstrap.myPlayerId).size : 0
  const myCurrent = metadata && bootstrap.myPlayerId ? playerCurrentIndex(metadata, solves, bootstrap.myPlayerId) : 0
  const allSolved = !!metadata && mySolved >= metadata.count
  const currentScramble = metadata && myCurrent < metadata.count ? metadata.scrambles[myCurrent] : null
  const hintAvailable = !!(metadata?.hints && myCurrent < metadata.count && (metadata.hints[myCurrent] ?? '').trim())

  // ── Spectator: pick a player and watch their scrambles fill in live ──
  const activePlayers = useMemo(() => bootstrap.players.filter((p) => p.spectator !== true), [bootstrap.players])
  const effectiveWatchedId =
    (watchedPlayerId && activePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    standings[0]?.player_id ??
    activePlayers[0]?.id ??
    null
  const watchedPlayer = bootstrap.players.find((p) => p.id === effectiveWatchedId)
  const watchedSolvedCount = metadata && effectiveWatchedId ? playerSolvedIndices(solves, effectiveWatchedId).size : 0
  const watchedCurrent = metadata && effectiveWatchedId ? playerCurrentIndex(metadata, solves, effectiveWatchedId) : 0
  const watchedPct =
    metadata && effectiveWatchedId ? wordScrambleCompletionPercent(metadata, solves, effectiveWatchedId) : 0
  // index → the solved answer word for the watched player (only solved indices appear).
  const watchedWords = useMemo(() => {
    const m = new Map<number, string>()
    if (effectiveWatchedId)
      for (const s of solves) if (s.player_id === effectiveWatchedId) m.set(s.scramble_index, s.word)
    return m
  }, [solves, effectiveWatchedId])

  const submit = useCallback(
    async (hint: boolean) => {
      if (!bootstrap.myPlayerId || !bootstrap.myResumeToken || !metadata || submitting) return
      if (myCurrent >= metadata.count) return
      const index = myCurrent
      const submittedGuess = guess
      // Clear the field right away so it feels instant and the next word can be typed immediately.
      if (!hint) setGuess('')
      setSubmitting(true)
      try {
        const res = await postWordScrambleSubmit(gameCode, bootstrap.myResumeToken, index, submittedGuess, hint)
        if (res.correct) {
          addSolve({
            id: `local-${index}-${bootstrap.myPlayerId}`,
            game_id: gameCode.toUpperCase(),
            round_id: '',
            player_id: bootstrap.myPlayerId,
            scramble_index: index,
            word: res.word ?? '',
            via_hint: !!hint,
            solved_at: new Date().toISOString(),
          })
          showToast(hint ? `Revealed ${res.word} · ${WORD_SCRAMBLE_HINT_PENALTY} pts` : 'Correct!', true)
          // The race ends on the last solve — refetch so the finished screen shows immediately
          // instead of briefly flashing "waiting for others".
          if (res.finished) void bootstrap.load()
        } else {
          setWrong(true)
          setTimeout(() => setWrong(false), 400)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Submission failed'
        if (msg.toLowerCase().includes('time')) await bootstrap.load()
        else showToast(msg, false)
      } finally {
        setSubmitting(false)
      }
    },
    [bootstrap, metadata, myCurrent, guess, submitting, gameCode, addSolve, showToast]
  )

  const myClue = revealedPrefix[myCurrent] ?? ''

  const revealClue = useCallback(async () => {
    if (!bootstrap.myPlayerId || !bootstrap.myResumeToken || !metadata || submitting) return
    if (myCurrent >= metadata.count) return
    const index = myCurrent
    setSubmitting(true)
    try {
      const res = await postWordScrambleHint(gameCode, bootstrap.myResumeToken, index)
      if (!res.available) {
        showToast('No clue for this word', false)
        return
      }
      const clue = typeof res.clue === 'string' ? res.clue : (metadata.hints?.[index] ?? '')
      setRevealedPrefix((prev) => ({ ...prev, [index]: clue }))
      addHint({ player_id: bootstrap.myPlayerId, scramble_index: index, letters: 1 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not get a hint'
      if (msg.toLowerCase().includes('time')) await bootstrap.load()
      else showToast(msg, false)
    } finally {
      setSubmitting(false)
    }
  }, [bootstrap, metadata, myCurrent, submitting, gameCode, addHint, showToast])

  const confirmRevealClue = useCallback(() => {
    Alert.alert(
      'Reveal the clue?',
      `Shows a clue for this word — costs ${Math.abs(WORD_SCRAMBLE_CLUE_PENALTY)} point.`,
      [
        { text: 'Keep trying', style: 'cancel' },
        { text: 'Reveal clue', onPress: () => void revealClue() },
      ]
    )
  }, [revealClue])

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
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const entries = bootstrap.players
      .filter((p) => !p.spectator)
      .map((p) => {
        const row = standings.find((r) => r.player_id === p.id)
        const pct = metadata ? wordScrambleCompletionPercent(metadata, solves, p.id) : 0
        const timeSecs = getPlayerTimeSpent(bootstrap.game, solvesAsTimeRows(solves), p.id, pct, nowMs, p.joined_at)
        return {
          id: p.id,
          name: p.name,
          points: row?.points ?? 0,
          detail: bootstrap.game?.session_started_at ? `⏱ ${formatMinutesSeconds(timeSecs)}` : undefined,
        }
      })
    const leader = standings[0]
    const winnerId = leader && leader.solved > 0 ? leader.player_id : null
    const answersNotice = answers ? (
      <View style={styles.answersCard}>
        <Text style={styles.answersTitle}>Answers</Text>
        <View style={styles.answerChips}>
          {answers.map((a, i) => (
            <View key={i} style={styles.answerChip}>
              <Text style={styles.answerChipText}>{a}</Text>
            </View>
          ))}
        </View>
      </View>
    ) : null
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('word_scramble')} subtitle={bootstrap.code}>
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

  return (
    <GameShell bootstrap={bootstrap} title={batch3GameLabel('word_scramble')} subtitle={bootstrap.code}>
      <KeyboardAwareGameScroll contentContainerStyle={styles.content}>
        <WordScrambleGameTimerBar
          gameCode={bootstrap.code}
          game={bootstrap.game}
          onExpired={() => void bootstrap.load()}
        />

        {toast ? (
          <View style={[styles.toast, toast.ok ? styles.toastOk : styles.toastBad]}>
            <Text style={styles.toastText}>{toast.msg}</Text>
          </View>
        ) : null}

        {metadata ? (
          <>
            <View style={styles.statusRow}>
              <Text style={styles.statusName}>{viewing ? (watchedPlayer?.name ?? 'Player') : (me?.name ?? 'Me')}</Text>
              <Text style={styles.statusMeta}>
                {!viewing && myRank > 0 ? `${ordinal(myRank)} · ` : ''}
                {viewing ? watchedSolvedCount : mySolved}/{metadata.count} · {viewing ? watchedPct : myCompletion}%
              </Text>
            </View>

            {viewing ? (
              activePlayers.length === 0 ? (
                <Text style={styles.watching}>No players yet — pick one to watch once they join.</Text>
              ) : (
                <>
                  <View style={styles.watchCard}>
                    <Text style={styles.watchLabel}>Watching a player</Text>
                    <View style={styles.watchChips}>
                      {activePlayers.map((p) => {
                        const active = p.id === effectiveWatchedId
                        return (
                          <Pressable
                            key={p.id}
                            style={[styles.watchChip, active && styles.watchChipActive]}
                            onPress={() => setWatchedPlayerId(p.id)}
                          >
                            <Text
                              style={[styles.watchChipText, active && styles.watchChipTextActive]}
                              numberOfLines={1}
                            >
                              {p.name}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>

                  <View style={styles.scrambleList}>
                    {metadata.scrambles.map((scr, i) => {
                      const solvedWord = watchedWords.get(i)
                      const isCurrent = i === watchedCurrent && !solvedWord
                      return (
                        <View
                          key={i}
                          style={[
                            styles.scrambleRow,
                            solvedWord ? styles.scrambleRowSolved : null,
                            isCurrent ? styles.scrambleRowCurrent : null,
                          ]}
                        >
                          <Text style={styles.scrambleIndex}>{i + 1}.</Text>
                          <Text style={[styles.scrambleWord, solvedWord ? styles.scrambleWordSolved : null]}>
                            {solvedWord ?? scr}
                          </Text>
                          <Text style={styles.scrambleStatus}>{solvedWord ? '✓' : isCurrent ? '✍️' : ''}</Text>
                        </View>
                      )
                    })}
                  </View>
                </>
              )
            ) : allSolved ? (
              <View style={styles.doneBanner}>
                <Text style={styles.doneTitle}>🎉 All solved!</Text>
                <Text style={styles.doneSub}>
                  Nicely done — waiting for the other players
                  {bootstrap.game?.game_duration_seconds ? ' or the timer' : ''} to finish.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.dots}>
                  {Array.from({ length: metadata.count }, (_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        i < myCurrent ? styles.dotDone : i === myCurrent ? styles.dotCurrent : styles.dotTodo,
                      ]}
                    />
                  ))}
                </View>

                <View style={styles.tiles}>
                  {(currentScramble ?? '').split('').map((ch, i) => (
                    <View key={i} style={[styles.tile, wrong && styles.tileWrong]}>
                      <Text style={styles.tileText}>{ch}</Text>
                    </View>
                  ))}
                </View>
                {myClue ? (
                  <Text style={styles.revealedPrefix}>
                    Clue: <Text style={styles.revealedClueText}>{myClue}</Text>
                  </Text>
                ) : null}

                <View style={styles.inputRow}>
                  <TextInput
                    value={guess}
                    onChangeText={setGuess}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="Type the word…"
                    placeholderTextColor="#9ca3af"
                    style={styles.input}
                    onSubmitEditing={() => {
                      if (guess.trim() && !submitting) void submit(false)
                    }}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={[styles.goBtn, (!guess.trim() || submitting) && styles.btnDisabled]}
                    disabled={!guess.trim() || submitting}
                    onPress={() => void submit(false)}
                  >
                    <Text style={styles.goText}>Go</Text>
                  </Pressable>
                </View>

                <View style={styles.helpRow}>
                  <Pressable
                    style={[styles.hintBtn, (submitting || !hintAvailable || !!myClue) && styles.btnDisabled]}
                    disabled={submitting || !hintAvailable || !!myClue}
                    onPress={confirmRevealClue}
                  >
                    <Text style={styles.hintText}>🔎 Clue ({WORD_SCRAMBLE_CLUE_PENALTY})</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.revealBtn, submitting && styles.btnDisabled]}
                    disabled={submitting}
                    onPress={() =>
                      Alert.alert(
                        'Reveal the answer?',
                        `This shows the word but costs you ${Math.abs(WORD_SCRAMBLE_HINT_PENALTY)} points.`,
                        [
                          { text: 'Keep trying', style: 'cancel' },
                          { text: 'Reveal', style: 'destructive', onPress: () => void submit(true) },
                        ]
                      )
                    }
                  >
                    <Text style={styles.revealText}>💡 Reveal ({WORD_SCRAMBLE_HINT_PENALTY})</Text>
                  </Pressable>
                </View>
              </>
            )}

            <View style={styles.standings}>
              <Text style={styles.standingsTitle}>Live scores</Text>
              {standings.map((row, i) => (
                <View
                  key={row.player_id}
                  style={[styles.standRow, row.player_id === bootstrap.myPlayerId && styles.standRowMe]}
                >
                  <Text style={styles.standName} numberOfLines={1}>
                    {i + 1}. {row.name}
                  </Text>
                  <Text style={styles.standMeta}>
                    {row.solved}/{metadata.count} · {row.points} pts
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.watching}>Waiting for the race…</Text>
        )}
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 14, paddingBottom: 40 },
    toast: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
    toastOk: { backgroundColor: '#10b981' },
    toastBad: { backgroundColor: '#ef4444' },
    toastText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
    statusName: { color: theme.text, fontWeight: '800', fontSize: 15 },
    statusMeta: { color: theme.textMuted, fontSize: 13 },
    watching: { color: theme.textMuted, textAlign: 'center', marginTop: 24 },
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
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    watchChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    watchChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    watchChipActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    watchChipText: { color: theme.textSecondary, fontSize: 13, fontWeight: '700', maxWidth: 140 },
    watchChipTextActive: { color: theme.primaryMuted },
    scrambleList: { gap: 6 },
    scrambleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    scrambleRowSolved: { borderColor: '#10b98155', backgroundColor: 'rgba(16,185,129,0.08)' },
    scrambleRowCurrent: { borderColor: theme.primary },
    scrambleIndex: { color: theme.textMuted, fontSize: 13, width: 24, fontVariant: ['tabular-nums'] },
    scrambleWord: { flex: 1, color: theme.text, fontSize: 17, fontWeight: '800', letterSpacing: 2 },
    scrambleWordSolved: { color: '#059669' },
    scrambleStatus: { fontSize: 14, width: 22, textAlign: 'center' },
    doneBanner: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      gap: 2,
    },
    doneTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
    doneSub: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
    dot: { width: 8, height: 8, borderRadius: 4 },
    dotDone: { backgroundColor: '#10b981' },
    dotCurrent: { backgroundColor: theme.primary },
    dotTodo: { backgroundColor: theme.surfaceHover },
    tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingVertical: 8 },
    tile: {
      width: 44,
      height: 52,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileWrong: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.12)' },
    tileText: { color: theme.text, fontSize: 24, fontWeight: '900' },
    hint: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
    revealedPrefix: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    revealedClueText: { color: theme.text, fontWeight: '700' },
    inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.text,
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: 3,
      textAlign: 'center',
    },
    goBtn: { backgroundColor: theme.primary, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 13 },
    goText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    btnDisabled: { opacity: 0.4 },
    helpRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    hintBtn: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: 'rgba(14,165,233,0.15)',
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    hintText: { color: '#0369a1', fontWeight: '800', fontSize: 13 },
    revealBtn: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: 'rgba(245,158,11,0.15)',
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    revealText: { color: '#b45309', fontWeight: '800', fontSize: 13 },
    standings: { gap: 8, marginTop: 8 },
    standingsTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    standRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surfaceHover,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    standRowMe: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
    standName: { color: theme.text, fontWeight: '600', fontSize: 14, flex: 1, minWidth: 0 },
    standMeta: { color: theme.textMuted, fontSize: 12 },
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
    answerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    answerChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: theme.surfaceHover },
    answerChipText: { color: theme.textSecondary, fontSize: 12, fontWeight: '700' },
  })
