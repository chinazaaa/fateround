import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Game, Player } from '@fateround/shared'
import { batch3GameLabel } from '@fateround/shared/batch-3-games'
import { playerIsViewer } from '@fateround/shared/viewers'
import {
  WORD_GROUPING_MAX_MISTAKES,
  WORD_GROUPING_MISTAKE_PENALTY,
  WORD_GROUPING_TOTAL_GROUPS,
  tallyWordGroupingScores,
  wordGroupingFinishSeconds,
} from '@fateround/shared/word-grouping'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameInfoChips } from '@/components/GameInfoChips'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameScores, useGameStats } from '@/components/session/RosterDrawerContext'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { fetchWordGroupingSolution, postExpireWordGrouping, postWordGroupingSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { WORD_GROUPING_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { formatMinutesSeconds } from '@/components/games/word-search/standings'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

interface Submission {
  id: string
  game_id: string
  round_id: string
  player_id: string
  group_index: number
  difficulty: number
  guess_words: string[]
  is_correct: boolean
  mistakes_at_time: number
  submitted_at: string
}

interface SolutionGroup {
  category: string
  words: string[]
  difficulty: 1 | 2 | 3 | 4
}

/** How long the solved board stays up before the standings take over. Matches web. */
const ANSWER_REVEAL_MS = 2800

const GROUP_COLORS: Record<number, string> = {
  1: '#f9df6d',
  2: '#a0c35a',
  3: '#b0c4ef',
  4: '#ba81c5',
}

export function WordGroupingPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [words, setWords] = useState<string[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [solution, setSolution] = useState<SolutionGroup[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [shaking, setShaking] = useState(false)
  const [oneAway, setOneAway] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  // Hold the solved board for a beat when the game ends mid-play, so the fourth group is
  // actually readable before the standings replace it. Mirrors web's ANSWER_REVEAL_MS. Only
  // the playing → finished transition holds; opening an already-finished game goes straight
  // to the results.
  const [revealingAnswers, setRevealingAnswers] = useState(false)
  const prevScreenRef = useRef<string | null>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }, [])

  const loadGameState = useCallback(
    async (game: Game, _players: Player[]): Promise<{ state: boolean; ok: boolean }> => {
      if (game.status !== 'active' && game.status !== 'finished') {
        return { state: false, ok: true }
      }
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select('id, word_grouping_metadata')
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return { state: false, ok: true }
      const meta = (roundData as { word_grouping_metadata: { words?: string[] } | null }).word_grouping_metadata
      if (meta?.words) setWords(meta.words)
      setRoundId((roundData as { id: string }).id)
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
    loadGameState,
    computeScreen: (game, playerId, hasRound) => {
      if (game.status === 'finished') return 'finished'
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      return hasRound ? 'playing' : 'waiting'
    },
    afterResolve: async (game, playerId) => {
      if (game.status !== 'active' && game.status !== 'finished') return
      const { data: roundData } = await getSupabase()
        .from('rounds')
        .select('id')
        .eq('game_id', gameCode.toUpperCase())
        .eq('round_number', 1)
        .maybeSingle()
      if (!roundData) return
      const rid = (roundData as { id: string }).id
      const { data: subs } = await getSupabase()
        .from('word_grouping_submissions')
        .select(WORD_GROUPING_SUBMISSION_SELECT)
        .eq('round_id', rid)
      setSubmissions((subs as Submission[]) ?? [])
      // Playing again resets the board — otherwise a stale playerId comparison could
      // leak previous-session submissions into `mySubmissions` and lock the grid.
      if (!playerId && game.status !== 'finished') return
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'word_grouping_submissions'],
    () => bootstrap.load(),
    !!bootstrap.game,
    bootstrap.game?.status
  )

  // Reset per-session state on play-again: without this the previous puzzle's `solution`
  // stays cached and reappears on the next finish, and stray `selected`/`oneAway`/`shaking`
  // from the old round would carry into the new one.
  const sessionKey = bootstrap.game?.session_started_at ?? null
  useEffect(() => {
    setSolution(null)
    setSelected([])
    setOneAway(false)
    setShaking(false)
  }, [sessionKey])

  // Fetch canonical solution once the game finishes so we can reveal every group,
  // not just the ones this player solved.
  useEffect(() => {
    if (bootstrap.game?.status !== 'finished' || solution) return
    let cancelled = false
    void fetchWordGroupingSolution(gameCode).then((groups) => {
      if (!cancelled && groups) setSolution(groups)
    })
    return () => {
      cancelled = true
    }
  }, [bootstrap.game?.status, gameCode, solution])

  // Local clock tick so the timer updates once per second while playing.
  useEffect(() => {
    if (bootstrap.screen !== 'playing') return
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [bootstrap.screen])

  useEffect(() => {
    const prev = prevScreenRef.current
    prevScreenRef.current = bootstrap.screen
    if (bootstrap.screen !== 'finished' || prev !== 'playing') return
    setRevealingAnswers(true)
    const t = setTimeout(() => setRevealingAnswers(false), ANSWER_REVEAL_MS)
    return () => clearTimeout(t)
  }, [bootstrap.screen])

  const me = bootstrap.players.find((p) => p.id === bootstrap.myPlayerId)
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  const mySubs = useMemo(
    () => (bootstrap.myPlayerId ? submissions.filter((s) => s.player_id === bootstrap.myPlayerId) : []),
    [bootstrap.myPlayerId, submissions]
  )
  const myMistakes = mySubs.filter((s) => !s.is_correct).length
  const myCorrectCount = mySubs.filter((s) => s.is_correct).length
  const isMyPuzzleDone = myCorrectCount >= WORD_GROUPING_TOTAL_GROUPS || myMistakes >= WORD_GROUPING_MAX_MISTAKES
  const mistakesRemaining = WORD_GROUPING_MAX_MISTAKES - myMistakes

  const myCorrectGroups = useMemo(
    () =>
      mySubs
        .filter((s) => s.is_correct)
        .map((s) => ({
          groupIndex: s.group_index,
          difficulty: s.difficulty,
          words: s.guess_words as string[],
        })),
    [mySubs]
  )
  const revealedWords = useMemo(() => new Set(myCorrectGroups.flatMap((g) => g.words)), [myCorrectGroups])
  const remainingWords = useMemo(() => words.filter((w) => !revealedWords.has(w)), [words, revealedWords])

  const standings = useMemo(() => {
    const playersArr = bootstrap.players.map((p) => ({ id: p.id, name: p.name }))
    return tallyWordGroupingScores(playersArr, submissions)
  }, [bootstrap.players, submissions])

  const myRow = useMemo(
    () => (bootstrap.myPlayerId ? standings.find((r) => r.id === bootstrap.myPlayerId) : undefined),
    [bootstrap.myPlayerId, standings]
  )

  const rosterScores = useMemo(() => Object.fromEntries(standings.map((r) => [r.id, r.points])), [standings])
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(() => {
    const out: Record<string, string> = {}
    for (const r of standings) {
      out[r.id] = `${r.groups}/4 · ${r.mistakes} miss${r.mistakes === 1 ? '' : 'es'}`
    }
    return out
  }, [standings])
  useGameStats(rosterDetails)

  // Timer — derive countdown from the game's session_started_at.
  const timerSeconds = bootstrap.game?.game_duration_seconds ?? 0
  const sessionElapsed = bootstrap.game?.session_started_at
    ? Math.floor((nowMs - new Date(bootstrap.game.session_started_at).getTime()) / 1000)
    : 0
  const timeRemaining = timerSeconds > 0 ? Math.max(0, timerSeconds - sessionElapsed) : null

  // Poke the server to finish the game once the local clock hits zero. Same idea as web:
  // retry every few seconds until the game flips (clock-skew guard on the server).
  const expireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const stop = () => {
      if (expireIntervalRef.current) {
        clearInterval(expireIntervalRef.current)
        expireIntervalRef.current = null
      }
    }
    if (timeRemaining === null || timeRemaining > 0 || bootstrap.screen !== 'playing') {
      stop()
      return
    }
    if (expireIntervalRef.current) return
    let cancelled = false
    const attempt = async () => {
      try {
        const data = await postExpireWordGrouping(gameCode)
        if (cancelled) return
        await bootstrap.load()
        if (data.finished) stop()
      } catch {
        // best-effort; next tick retries.
      }
    }
    void attempt()
    expireIntervalRef.current = setInterval(attempt, 3000)
    return () => {
      cancelled = true
      stop()
    }
  }, [timeRemaining, bootstrap.screen, gameCode, bootstrap])

  const toggleWord = (word: string) => {
    if (submitting || isMyPuzzleDone || isViewer) return
    setSelected((prev) => {
      if (prev.includes(word)) return prev.filter((w) => w !== word)
      if (prev.length >= 4) return prev
      return [...prev, word]
    })
  }

  const handleGuessSubmit = async () => {
    if (selected.length !== 4 || submitting || shaking || isMyPuzzleDone || !bootstrap.myResumeToken) return
    setSubmitting(true)
    try {
      const data = await postWordGroupingSubmit(gameCode, bootstrap.myResumeToken, selected)
      if (data.isCorrect) {
        setSelected([])
        // Optimistic local reveal until the realtime insert lands.
        await bootstrap.load()
      } else {
        if (data.oneAway) {
          setOneAway(true)
          setTimeout(() => setOneAway(false), 1500)
        }
        setShaking(true)
        setTimeout(() => {
          setShaking(false)
          setSelected([])
        }, 500)
        await bootstrap.load()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit that guess'
      showToast(msg)
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
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished' && !revealingAnswers) {
    const entries = bootstrap.players
      .filter((p) => !p.spectator)
      .map((p) => {
        const row = standings.find((r) => r.id === p.id)
        return {
          id: p.id,
          name: p.name,
          points: row?.points ?? 0,
          detail: row
            ? (() => {
                const secs = wordGroupingFinishSeconds(bootstrap.game?.session_started_at, row.lastAt)
                const base = `${row.groups}/4 · ${row.mistakes} mistake${row.mistakes === 1 ? '' : 's'}`
                // Finish time is the tiebreak players actually argue about — web shows it on
                // every row, so mobile should too rather than only in my own header.
                return secs === null ? base : `${base} · ⏱ ${formatMinutesSeconds(secs)}`
              })()
            : undefined,
        }
      })
    const leader = standings[0]
    const winnerId = leader && leader.points > 0 && standings.length > 1 ? leader.id : null
    const answerGroups =
      solution ??
      myCorrectGroups.map((g) => ({
        category: '',
        words: g.words,
        difficulty: g.difficulty as 1 | 2 | 3 | 4,
      }))
    const myScoreSummary = myRow ? (
      <View style={styles.myScoreCard}>
        <Text style={styles.myScorePoints}>{myRow.points} points</Text>
        <Text style={styles.myScoreDetail}>
          {myRow.groups}/4 groups · {myRow.mistakes} mistake{myRow.mistakes === 1 ? '' : 's'}
        </Text>
      </View>
    ) : null
    const answersNotice =
      answerGroups.length > 0 || myScoreSummary ? (
        <View style={styles.answersCard}>
          {myScoreSummary}
          {answerGroups.length > 0 ? <Text style={styles.answersTitle}>Groups</Text> : null}
          {[...answerGroups]
            .sort((a, b) => a.difficulty - b.difficulty)
            .map((group, i) => (
              <View
                key={`${group.category || i}`}
                style={[styles.groupPill, { backgroundColor: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1] }]}
              >
                {group.category ? <Text style={styles.groupPillTitle}>{group.category.toUpperCase()}</Text> : null}
                <Text style={styles.groupPillWords}>{group.words.join(', ')}</Text>
              </View>
            ))}
        </View>
      ) : null
    return (
      <GameShell bootstrap={bootstrap} title={batch3GameLabel('word_grouping')} subtitle={bootstrap.code}>
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

  const timeSecs = bootstrap.game?.session_started_at
    ? Math.max(
        0,
        Math.floor(
          ((myRow?.lastAt ? new Date(myRow.lastAt).getTime() : nowMs) -
            new Date(bootstrap.game.session_started_at).getTime()) /
            1000
        )
      )
    : 0

  return (
    <GameShell
      bootstrap={bootstrap}
      title={batch3GameLabel('word_grouping')}
      subtitle={`${myRow?.points ?? 0} pts · ⏱ ${formatMinutesSeconds(timeSecs)}`}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {toast ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        ) : null}

        {/* Status bar */}
        <View style={styles.statusRow}>
          <View style={styles.mistakesRow}>
            <Text style={styles.statusLabel}>Mistakes</Text>
            <View style={styles.mistakesDots}>
              {Array.from({ length: WORD_GROUPING_MAX_MISTAKES }).map((_, i) => (
                <View key={i} style={[styles.mistakeDot, i < mistakesRemaining ? styles.mistakeDotFilled : null]} />
              ))}
            </View>
          </View>
          <Text style={styles.pointsBadge}>{myRow?.points ?? 0} pts</Text>
          <Text style={[styles.timerText, timeRemaining !== null && timeRemaining <= 10 ? styles.timerLow : null]}>
            {timeRemaining !== null ? formatMinutesSeconds(timeRemaining) : '—'}
          </Text>
        </View>

        <Text style={styles.helpText}>
          Find four groups of four. Wrong guess costs {Math.abs(WORD_GROUPING_MISTAKE_PENALTY)} pts.
        </Text>

        {oneAway ? (
          <View style={styles.oneAway}>
            <Text style={styles.oneAwayText}>One away!</Text>
          </View>
        ) : null}

        {/* Solved groups */}
        {[...myCorrectGroups]
          .sort((a, b) => a.difficulty - b.difficulty)
          .map((group) => (
            <View
              key={group.groupIndex}
              style={[styles.groupPill, { backgroundColor: GROUP_COLORS[group.difficulty] ?? GROUP_COLORS[1] }]}
            >
              <Text style={styles.groupPillWords}>{group.words.join(', ')}</Text>
            </View>
          ))}

        {/* Word grid */}
        {!isMyPuzzleDone && remainingWords.length > 0 ? (
          <View style={[styles.grid, shaking ? styles.gridShake : null]}>
            {remainingWords.map((word, i) => {
              const isSelected = selected.includes(word)
              return (
                <Pressable
                  key={`${word}-${i}`}
                  onPress={() => toggleWord(word)}
                  disabled={isMyPuzzleDone || isViewer}
                  style={[styles.tile, isSelected ? styles.tileSelected : null]}
                >
                  <Text style={[styles.tileText, isSelected ? styles.tileTextSelected : null]}>
                    {word.toUpperCase()}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}

        {/* Action buttons */}
        {!isMyPuzzleDone && remainingWords.length > 0 && !isViewer ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.btnSecondary, selected.length === 0 ? styles.btnDisabled : null]}
              disabled={selected.length === 0}
              onPress={() => setSelected([])}
            >
              <Text style={styles.btnSecondaryText}>Deselect all</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, selected.length !== 4 || submitting || shaking ? styles.btnDisabled : null]}
              disabled={selected.length !== 4 || submitting || shaking}
              onPress={() => void handleGuessSubmit()}
            >
              <Text style={styles.btnPrimaryText}>{submitting ? 'Checking…' : 'Submit'}</Text>
            </Pressable>
          </View>
        ) : null}

        {isMyPuzzleDone ? (
          <View style={styles.doneBanner}>
            <Text style={styles.doneTitle}>
              {myCorrectCount >= WORD_GROUPING_TOTAL_GROUPS ? '🎉 Puzzle solved!' : 'Out of guesses'}
            </Text>
            <Text style={styles.doneSub}>Waiting for other players…</Text>
            <Text style={styles.doneStats}>
              {myCorrectCount}/4 groups · {myMistakes} mistake{myMistakes === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { padding: 16, gap: 12, paddingBottom: 40 },
    toast: {
      alignSelf: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: '#ef4444',
    },
    toastText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    mistakesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    mistakesDots: { flexDirection: 'row', gap: 4 },
    mistakeDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: theme.border,
    },
    mistakeDotFilled: { backgroundColor: theme.textMuted, borderColor: theme.textMuted },
    pointsBadge: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    timerText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
    },
    timerLow: { color: '#ef4444' },
    helpText: { color: theme.textMuted, fontSize: 12, textAlign: 'center' },
    oneAway: {
      alignSelf: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    oneAwayText: { color: theme.text, fontWeight: '700', fontSize: 13 },
    groupPill: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: 'center',
      gap: 2,
    },
    groupPillTitle: {
      color: '#1a1a1a',
      fontWeight: '800',
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    groupPillWords: { color: '#1a1a1a', fontWeight: '700', fontSize: 13, textAlign: 'center' },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'center',
    },
    gridShake: { transform: [{ translateX: 4 }] },
    tile: {
      width: '23%',
      minHeight: 56,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      paddingVertical: 6,
    },
    tileSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.primarySoft,
    },
    tileText: {
      color: theme.text,
      fontWeight: '800',
      fontSize: 12,
      textAlign: 'center',
    },
    tileTextSelected: { color: theme.primaryMuted },
    actions: { flexDirection: 'row', gap: 8 },
    btnSecondary: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: theme.surfaceHover,
      alignItems: 'center',
    },
    btnSecondaryText: { color: theme.text, fontWeight: '800', fontSize: 14 },
    btnPrimary: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: theme.primary,
      alignItems: 'center',
    },
    btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    btnDisabled: { opacity: 0.4 },
    doneBanner: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      gap: 4,
    },
    doneTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
    doneSub: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    doneStats: { color: theme.textSecondary, fontSize: 13, marginTop: 4 },
    answersCard: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: 12,
      marginTop: 12,
      gap: 8,
    },
    myScoreCard: { alignItems: 'center', gap: 2, paddingBottom: theme.space.sm },
    myScorePoints: { color: theme.text, fontSize: 20, fontWeight: '800' },
    myScoreDetail: { color: theme.textMuted, fontSize: theme.type.caption.size },
    answersTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
  })
