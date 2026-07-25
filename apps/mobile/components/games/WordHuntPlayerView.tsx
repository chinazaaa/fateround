import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Player, type Round, type WordHuntSubmission } from '@fateround/shared'
import { batch5GameLabel } from '@fateround/shared/batch-5-games'
import { parseWordHuntMetadata, tallyWordHuntScores, wordHuntPoints } from '@fateround/shared/word-hunt'
import { validateWordHuntSubmissionClient, validWordsSetFromMetadata } from '@fateround/shared/word-hunt-client'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { JoinScreen } from '@/components/JoinScreen'
import { GameInfoChips } from '@/components/GameInfoChips'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameScores, useGameStats } from '@/components/session/RosterDrawerContext'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postWordHuntSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, WORD_HUNT_SUBMISSION_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { pointsLeaderboard } from '@/lib/finish-leaderboards'
import { useWordHuntTimer } from '@/components/games/word-hunt/useWordHuntTimer'
import { WordHuntPlaySurface } from '@/components/games/word-hunt/WordHuntPlaySurface'
import { WordHuntResultsReview } from '@/components/games/word-hunt/WordHuntResultsReview'
import { WordHuntPersonalResults } from '@/components/games/word-hunt/WordHuntPersonalResults'

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

export function WordHuntPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [roundId, setRoundId] = useState<string | null>(null)
  const [grid, setGrid] = useState<string[][] | null>(null)
  const [validWords, setValidWords] = useState<Set<string>>(new Set())
  const [submissions, setSubmissions] = useState<WordHuntSubmission[]>([])
  const [selectedPath, setSelectedPath] = useState<number[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [watchedPlayerId, setWatchedPlayerId] = useState<string | null>(null)

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
    if (!playerId) {
      const pre = preJoinScreen(game, false)
      if (pre === 'game_ended') return 'game_ended'
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'late_join_choice') return 'late_join_choice'
      return 'join'
    }
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
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'word_hunt_submissions'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const {
    label: timeLabel,
    timeUp,
    secondsLeft,
  } = useWordHuntTimer(gameCode, bootstrap.game, () => void bootstrap.load())

  const me = useMemo(
    () => bootstrap.players.find((p) => p.id === bootstrap.myPlayerId),
    [bootstrap.players, bootstrap.myPlayerId]
  )
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))

  const mySubmissions = useMemo(
    () => submissions.filter((s) => s.player_id === bootstrap.myPlayerId),
    [submissions, bootstrap.myPlayerId]
  )
  const foundWords = useMemo(() => new Set(mySubmissions.map((s) => s.word.toLowerCase())), [mySubmissions])
  const myPoints = useMemo(() => mySubmissions.reduce((sum, s) => sum + s.points_awarded, 0), [mySubmissions])

  const leaderboard = useMemo(
    () => tallyWordHuntScores(submissions, bootstrap.players),
    [submissions, bootstrap.players]
  )

  // Feed the roster drawer scoreboard: points headline + words-found detail.
  const rosterScores = useMemo(() => Object.fromEntries(leaderboard.map((r) => [r.player_id, r.points])), [leaderboard])
  useGameScores(rosterScores, { suffix: ' pts' })
  const rosterDetails = useMemo(
    () =>
      Object.fromEntries(
        leaderboard.map((r) => [r.player_id, `✅ ${r.word_count} word${r.word_count === 1 ? '' : 's'}`])
      ),
    [leaderboard]
  )
  useGameStats(rosterDetails)

  // Viewers watch one player's hunt at a time — the shared grid is static, so the
  // interesting part is a chosen player's words and score filling in live.
  const watchablePlayers = useMemo(
    () => (bootstrap.game ? bootstrap.players.filter((p) => !playerIsViewer(p, bootstrap.game!)) : []),
    [bootstrap.players, bootstrap.game]
  )
  const effectiveWatchedId =
    (watchedPlayerId && watchablePlayers.some((p) => p.id === watchedPlayerId) ? watchedPlayerId : null) ??
    leaderboard.find((row) => watchablePlayers.some((p) => p.id === row.player_id))?.player_id ??
    watchablePlayers[0]?.id ??
    null
  const watchedSubmissions = useMemo(
    () => (effectiveWatchedId ? submissions.filter((s) => s.player_id === effectiveWatchedId) : []),
    [submissions, effectiveWatchedId]
  )
  const watchedFoundWords = watchedSubmissions.map((s) => s.word)
  const watchedPoints = watchedSubmissions.reduce((sum, s) => sum + s.points_awarded, 0)

  const submitWord = useCallback(
    async (pathOverride?: number[]) => {
      const path = pathOverride ?? selectedPath
      if (!bootstrap.myResumeToken || !grid || !roundId || submitting || timeUp) return
      const check = validateWordHuntSubmissionClient(grid, path, validWords, foundWords)
      if (!check.ok) {
        setMessage(check.error)
        if (check.clearPath) setSelectedPath([])
        return
      }
      setSubmitting(true)
      try {
        const result = await postWordHuntSubmit(bootstrap.code, bootstrap.myResumeToken, check.normalized, path)
        setSelectedPath([])
        setMessage(`+${result.pointsAwarded ?? wordHuntPoints(check.normalized.length)} pts`)
        await bootstrap.load()
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Submit failed')
      } finally {
        setSubmitting(false)
      }
    },
    [bootstrap, grid, roundId, submitting, timeUp, validWords, foundWords, selectedPath]
  )

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
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const top = leaderboard[0]
    const entries = leaderboard.map((s) => ({
      id: s.player_id,
      name: s.name,
      points: s.points,
      detail: `${s.word_count} word${s.word_count === 1 ? '' : 's'}`,
    }))
    // Name the leader whenever they actually scored — a solo player who found words
    // is still the winner (matches web, which never shows "Game over" here). Only a
    // round where nobody scored anything falls back to "Game over".
    const winnerId = top && top.points > 0 ? top.player_id : null
    const validWordsArray = validWords.size > 0 ? Array.from(validWords) : undefined
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('word_hunt')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winnerId ? `${top!.name} wins!` : 'Game over'}
          subtitle="Final standings"
          leaderboard={pointsLeaderboard(entries, bootstrap.myPlayerId)}
          winnerPlayerId={winnerId}
          notice={
            <View style={styles.finishExtras}>
              {submissions.length > 0 ? (
                <WordHuntResultsReview
                  submissions={submissions}
                  leaderboard={leaderboard}
                  highlightPlayerId={bootstrap.myPlayerId}
                />
              ) : null}
              {!isViewer ? <WordHuntPersonalResults submissions={mySubmissions} validWords={validWordsArray} /> : null}
            </View>
          }
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
    <GameShell
      bootstrap={bootstrap}
      title={batch5GameLabel('word_hunt')}
      subtitle={isViewer ? 'Watching' : `${mySubmissions.length} words found`}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isViewer ? (
          watchablePlayers.length > 0 ? (
            <View style={styles.watchCard}>
              <Text style={styles.watchLabel}>Watching a player&apos;s board</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.watchChips}>
                {watchablePlayers.map((p) => {
                  const active = p.id === effectiveWatchedId
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setWatchedPlayerId(p.id)}
                      style={[styles.watchChip, active && styles.watchChipActive]}
                    >
                      <Text style={[styles.watchChipText, active && styles.watchChipTextActive]}>{p.name}</Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>
          ) : (
            <Text style={styles.watchEmpty}>
              No players have joined the hunt yet — you&apos;ll see their board here once they do.
            </Text>
          )
        ) : null}

        <WordHuntPlaySurface
          grid={grid}
          selectedPath={isViewer ? [] : selectedPath}
          onPathChange={(path) => {
            setSelectedPath(path)
            setMessage(null)
          }}
          onStrokeEnd={(path) => void submitWord(path)}
          foundWords={isViewer ? watchedFoundWords : mySubmissions.map((s) => s.word)}
          validWords={validWords}
          myPoints={isViewer ? watchedPoints : myPoints}
          timeLabel={timeUp ? '0:00' : timeLabel}
          timeUp={timeUp}
          secondsLeft={secondsLeft}
          disabled={timeUp || isViewer}
        />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        {/* Live standings removed — the roster side-drawer now shows the live leaderboard. */}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
    scroll: { flex: 1 },
    scrollContent: { gap: 12, paddingBottom: 24 },
    message: { color: theme.primaryMuted, textAlign: 'center', fontWeight: '600' },
    watchCard: {
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 12,
      gap: 8,
    },
    watchLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    watchChips: { gap: 8 },
    watchChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceHover,
    },
    watchChipActive: { backgroundColor: theme.primarySoft, borderColor: theme.borderAccent },
    watchChipText: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    watchChipTextActive: { color: theme.primaryMuted },
    watchEmpty: {
      color: theme.textMuted,
      fontSize: 12,
      textAlign: 'center',
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 12,
    },
    standingsToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    standingsTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    standingsHint: { color: theme.textFaint, fontSize: 11, marginTop: 2 },
    standingsChevron: { color: theme.textMuted, fontSize: 16 },
    standingsList: {
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      padding: 12,
      gap: 8,
      marginTop: -4,
    },
    standingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    standingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
    standingsRank: { color: theme.textFaint, fontSize: 13, width: 20, fontVariant: ['tabular-nums'] },
    standingsName: { color: theme.textMuted, fontSize: 14, flexShrink: 1 },
    standingsNameMe: { color: theme.text, fontWeight: '800' },
    standingsMeta: { color: theme.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
    finishExtras: { gap: 12 },
  })
