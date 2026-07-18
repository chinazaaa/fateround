import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { type Game, type Player, type Round, type TtlGuess, type TtlStatement } from '@fateround/shared'
import { batch4GameLabel } from '@fateround/shared/batch-4-games'
import {
  TTL_MAX_STATEMENT_LENGTH,
  formatTtlChoiceLabel,
  parseTtlMetadata,
  playerDisplayName,
  revealCountdownSeconds,
  tallyTtlScores,
} from '@fateround/shared/two-truths'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { useGameScores } from '@/components/session/RosterDrawerContext'
import { CountdownTimerBadge } from '@/components/party/CountdownTimerBadge'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { TwoTruthsSubmitterBadge } from '@/components/games/TwoTruthsSubmitterBadge'
import { useDeadlineExpiry } from '@/hooks/useDeadlineExpiry'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useAdvancePolling } from '@/hooks/useAdvancePolling'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { postTtlGuess, postTtlStatements } from '@/lib/game-api'
import { playSound } from '@/lib/sounds'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, TTL_GUESS_SELECT, TTL_STATEMENT_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

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

export function TwoTruthsPlayerView({ gameCode }: { gameCode: string }) {
  const [statements, setStatements] = useState<TtlStatement[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<TtlGuess[]>([])
  const [stmtA, setStmtA] = useState('')
  const [stmtB, setStmtB] = useState('')
  const [stmtC, setStmtC] = useState('')
  const [lieIndex, setLieIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingStatements, setEditingStatements] = useState(false)
  const [timeExpired, setTimeExpired] = useState(false)
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [stmtsRes, rdsRes, gssRes] = await Promise.all([
        getSupabase().from('ttl_statements').select(TTL_STATEMENT_SELECT).eq('game_id', code),
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        getSupabase().from('ttl_guesses').select(TTL_GUESS_SELECT).eq('game_id', code),
      ])
      if (stmtsRes.error || rdsRes.error || gssRes.error) return { state: null, ok: false }
      setStatements((stmtsRes.data as TtlStatement[]) ?? [])
      setRounds((rdsRes.data as Round[]) ?? [])
      setGuesses((gssRes.data as TtlGuess[]) ?? [])
      return { state: null, ok: true }
    },
    [gameCode]
  )

  const computeScreen = useCallback((game: Game, playerId: string | null): Screen => {
    // Resolve the no-identity case BEFORE 'finished' so a non-participant opening a
    // finished game gets the game_ended screen instead of a results view that
    // assumes a seated player.
    if (!playerId) {
      const pre = preJoinScreen(game, false)
      if (pre === 'game_ended') return 'game_ended'
      // Viewers disabled mid-game → "game in progress, wait for the next lobby".
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      // Late opener with viewers allowed: offer watch-or-play instead of a bare join.
      if (pre === 'late_join_choice') return 'late_join_choice'
      return 'join'
    }
    if (game.status === 'finished') return 'finished'
    if (game.status === 'waiting') return 'waiting'
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

  // Watch-or-play prompt for a late opener (fetched only on that screen).
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'ttl_statements', 'ttl_guesses'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  // Deadline-driven round changes (incl. the last reveal → finished) need a
  // client to nudge the server — web polls /api/two-truths/advance; mobile had no
  // poller, so a round could stall and never reach the finished screen. Poll while
  // active and reload on advance (matches Quiplash/Trivia).
  useAdvancePolling({
    endpoint: '/api/two-truths/advance',
    gameCode,
    game: bootstrap.game,
    enabled: !!bootstrap.game,
    onAdvanced: () => bootstrap.load(),
  })

  const myStatement = bootstrap.myPlayerId ? statements.find((s) => s.player_id === bootstrap.myPlayerId) : undefined

  const me = bootstrap.myPlayerId ? bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) : undefined
  // Watch-only: a spectator/eliminated/late player watches the live round read-only.
  const isViewer = !!(me && bootstrap.game && playerIsViewer(me, bootstrap.game))

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer = rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [bootstrap.game, rounds])

  const metadata = currentRound ? parseTtlMetadata(currentRound.ttl_metadata) : null
  const isFeatured = currentRound?.submitter_player_id === bootstrap.myPlayerId
  const myGuess = currentRound
    ? guesses.find((g) => g.player_id === bootstrap.myPlayerId && g.round_id === currentRound.id)
    : undefined
  const revealSeconds = currentRound?.status === 'finished' ? revealCountdownSeconds(currentRound.ended_at) : null

  // Running standings shown throughout play (mirrors web's live PaginatedLeaderboard).
  const liveScores = useMemo(
    () => tallyTtlScores(guesses, bootstrap.players, rounds),
    [guesses, bootstrap.players, rounds]
  )
  useGameScores(
    useMemo(() => Object.fromEntries(liveScores.map((row) => [row.id, row.score])), [liveScores]),
    { suffix: ' pts' }
  )

  // Next player whose statements are coming up (for the between-round preview).
  const upcomingRound = useMemo(() => {
    if (bootstrap.game?.status !== 'active') return null
    return rounds.filter((r) => r.status === 'pending').sort((a, b) => a.round_number - b.round_number)[0] ?? null
  }, [rounds, bootstrap.game?.status])

  // Round countdown + auto-lock when the guessing time runs out. The countdown
  // itself lives in a self-ticking leaf (badge); here we only need the expiry
  // edge, so a one-shot timeout drives it instead of a 2Hz tick (M1).
  const timerSeconds = bootstrap.game?.timer_seconds ?? 0
  const timerActive = !!currentRound && currentRound.status === 'active' && !isFeatured && timerSeconds > 0

  // Reset the per-round expiry flag whenever the round changes.
  useEffect(() => {
    setTimeExpired(false)
  }, [currentRound?.id])

  useDeadlineExpiry(currentRound?.started_at, timerSeconds, timerActive && !myGuess, () => setTimeExpired(true))

  // Pinned countdown — visible under the header while the guessing body scrolls.
  const ttlTimer = (
    <CountdownTimerBadge
      anchorTime={currentRound?.started_at}
      delaySeconds={timerSeconds}
      active={timerActive && !myGuess && !timeExpired}
    />
  )
  const ttlTimerPinned = useStickyTimer(ttlTimer, [currentRound, timerSeconds, timerActive, myGuess, timeExpired])

  const canSubmitStatements = !!stmtA.trim() && !!stmtB.trim() && !!stmtC.trim() && lieIndex != null

  const submitStatements = async () => {
    if (!bootstrap.myResumeToken || submitting || lieIndex == null || !canSubmitStatements) return
    setSubmitting(true)
    try {
      await postTtlStatements(
        bootstrap.code,
        bootstrap.myResumeToken,
        stmtA.trim(),
        stmtB.trim(),
        stmtC.trim(),
        lieIndex
      )
      setEditingStatements(false)
      await bootstrap.load()
    } finally {
      setSubmitting(false)
    }
  }

  const startEditing = () => {
    if (!myStatement) return
    setStmtA(myStatement.statement_a)
    setStmtB(myStatement.statement_b)
    setStmtC(myStatement.statement_c)
    setLieIndex(myStatement.lie_index)
    setEditingStatements(true)
  }

  const submitGuess = async (index: number) => {
    if (!bootstrap.myResumeToken || !currentRound || submitting || myGuess || isViewer) return
    setSubmitting(true)
    try {
      await postTtlGuess(bootstrap.code, bootstrap.myResumeToken, currentRound.id, index)
      playSound('pop')
      await bootstrap.load()
    } finally {
      setSubmitting(false)
    }
  }

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
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    if (myStatement && !editingStatements) {
      return (
        <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={bootstrap.code}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.waiting}>Statements submitted — waiting for host to start…</Text>
            <View style={styles.reviewCard}>
              {[myStatement.statement_a, myStatement.statement_b, myStatement.statement_c].map((text, index) => (
                <View key={index} style={styles.reviewRow}>
                  <Text style={[styles.reviewBadge, index === myStatement.lie_index && styles.reviewBadgeLie]}>
                    {index === myStatement.lie_index ? 'LIE' : formatTtlChoiceLabel(index)}
                  </Text>
                  <Text style={styles.reviewText}>{text}</Text>
                </View>
              ))}
            </View>
            <Pressable style={styles.secondaryBtn} onPress={startEditing}>
              <Text style={styles.secondaryText}>Edit my statements</Text>
            </Pressable>
            <View style={styles.rulesRowCentered}>
              <GameRulesLink gameType="two_truths" variant="subtle" />
            </View>
          </ScrollView>
        </GameShell>
      )
    }
    return (
      <GameShell
        bootstrap={bootstrap}
        title={batch4GameLabel('two_truths')}
        subtitle={editingStatements ? 'Update your statements' : 'Submit your statements'}
      >
        <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
          <Text style={styles.help}>Write two truths and one lie. Tap which one is the lie.</Text>
          {[0, 1, 2].map((index) => {
            const value = index === 0 ? stmtA : index === 1 ? stmtB : stmtC
            const setValue = index === 0 ? setStmtA : index === 1 ? setStmtB : setStmtC
            return (
              <View key={index} style={styles.fieldBlock}>
                <Pressable style={styles.lieToggle} onPress={() => setLieIndex(index)}>
                  <Text style={[styles.lieBadge, lieIndex === index && styles.lieBadgeActive]}>
                    {lieIndex === index ? 'LIE' : formatTtlChoiceLabel(index)}
                  </Text>
                </Pressable>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={setValue}
                  placeholder={`Statement ${formatTtlChoiceLabel(index)}`}
                  placeholderTextColor={theme.textFaint}
                  maxLength={TTL_MAX_STATEMENT_LENGTH}
                  multiline
                />
              </View>
            )
          })}
          <Text style={styles.lieHint}>
            {lieIndex == null ? 'Tap LIE on the statement that is the fib.' : 'Lie selected — ready to submit.'}
          </Text>
          <Pressable
            style={[styles.primaryBtn, (submitting || !canSubmitStatements) && styles.primaryBtnDisabled]}
            disabled={submitting || !canSubmitStatements}
            onPress={() => void submitStatements()}
          >
            <Text style={styles.primaryText}>
              {submitting ? 'Submitting…' : editingStatements ? 'Update statements' : 'Submit statements'}
            </Text>
          </Pressable>
          {editingStatements && myStatement ? (
            <Pressable style={styles.secondaryBtn} disabled={submitting} onPress={() => setEditingStatements(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          ) : null}
          <View style={styles.rulesRow}>
            <GameRulesLink gameType="two_truths" variant="subtle" />
          </View>
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyTtlScores(guesses, bootstrap.players, rounds)
    const top = scores[0]
    // "Best guesser" achievement = whoever read the most lies correctly (a
    // separate community leaderboard from raw score). Only a contested win with
    // at least one correct guess counts. Mirrors the web finished screen.
    const bestGuesser =
      [...scores].sort(
        (a, b) => b.correctGuesses - a.correctGuesses || b.score - a.score || a.name.localeCompare(b.name)
      )[0] ?? null
    const iAmBestGuesser =
      !isViewer &&
      !!bestGuesser &&
      scores.length > 1 &&
      bestGuesser.correctGuesses > 0 &&
      bestGuesser.id === bootstrap.myPlayerId
    // Per-session dedup token: last round's id changes on a fresh session.
    const roundKey = rounds.length > 0 ? (rounds[rounds.length - 1]?.id ?? null) : null
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Game over"
          subtitle="Final standings"
          detail={top ? `${top.name} — ${top.score} pts` : undefined}
          leaderboard={scoreListLeaderboard(scores)}
          notice={
            iAmBestGuesser && bestGuesser ? (
              <PostWinToCommunity
                gameType="two_truths_guesser"
                gameCode={bootstrap.code}
                winnerName={bestGuesser.name}
                roundKey={roundKey}
              />
            ) : null
          }
        />
      </GameShell>
    )
  }

  // Mirrors web's <EliminationBanner> on the live-play screen: an eliminated
  // player gets a clear "you're out, keep watching" message instead of only the
  // generic Spectating banner (whose late-join copy is wrong for elimination).
  // The spectator banner itself is rendered centrally by GameShell, so we only
  // prepend the elimination notice here.
  const liveBanners = me?.is_eliminated ? (
    <View style={styles.elimBanner}>
      <Text style={styles.elimTitle}>You have been eliminated</Text>
      <Text style={styles.elimBody}>You can still watch and chat</Text>
    </View>
  ) : null

  if (!currentRound || currentRound.status === 'pending') {
    const upcomingName = upcomingRound ? playerDisplayName(upcomingRound.submitter_player_id, bootstrap.players) : null
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={bootstrap.code}>
        {liveBanners}
        <Text style={styles.waiting}>Waiting for the next round…</Text>
        {upcomingRound ? (
          <View style={styles.upNext}>
            <TwoTruthsSubmitterBadge
              submitterId={upcomingRound.submitter_player_id}
              players={bootstrap.players}
              highlightPlayerId={bootstrap.myPlayerId}
              size="sm"
            />
            {upcomingName ? <Text style={styles.upNextLabel}>Up next: {upcomingName}&apos;s statements</Text> : null}
          </View>
        ) : null}
      </GameShell>
    )
  }

  const featuredName = playerDisplayName(currentRound.submitter_player_id, bootstrap.players)
  const roundSubtitle = bootstrap.game.rounds_count
    ? `Round ${currentRound.round_number} of ${bootstrap.game.rounds_count}`
    : `Round ${currentRound.round_number}`
  const submitterBadge = (
    <View style={styles.badgeRow}>
      <TwoTruthsSubmitterBadge
        submitterId={currentRound.submitter_player_id}
        players={bootstrap.players}
        highlightPlayerId={bootstrap.myPlayerId}
      />
    </View>
  )

  if (currentRound.status === 'finished') {
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={roundSubtitle}>
        <ScrollView contentContainerStyle={styles.content}>
          {liveBanners}
          {submitterBadge}
          <Text style={styles.featured}>{featuredName}&apos;s two truths &amp; a lie</Text>
          {metadata ? (
            <View style={styles.choices}>
              {metadata.statements.map((text, index) => {
                const isLie = index === metadata.lie_index
                return (
                  <View key={index} style={[styles.choice, isLie && styles.choiceReveal]}>
                    <Text style={styles.choiceBadge}>{formatTtlChoiceLabel(index)}</Text>
                    <View style={styles.choiceBody}>
                      <Text style={styles.choiceText}>{text}</Text>
                      {isLie ? <Text style={styles.lieTag}>🤥 The lie</Text> : null}
                    </View>
                  </View>
                )
              })}
            </View>
          ) : null}
          {myGuess ? (
            <Text style={[styles.revealResult, myGuess.is_correct && styles.revealResultWin]}>
              {myGuess.is_correct ? `Correct! +${myGuess.points} pts` : 'Not the lie — better luck next round'}
            </Text>
          ) : null}
          <Text style={styles.waiting}>
            {revealSeconds && revealSeconds > 0 ? `Next round in ${revealSeconds}s…` : 'Waiting for next round…'}
          </Text>
        </ScrollView>
      </GameShell>
    )
  }

  if (isFeatured) {
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={roundSubtitle}>
        <ScrollView contentContainerStyle={styles.content}>
          {liveBanners}
          {submitterBadge}
          <Text style={styles.featured}>Your turn — others are guessing your lie</Text>
          {metadata ? (
            <View style={styles.choices}>
              {metadata.statements.map((text, index) => (
                <View key={index} style={styles.choice}>
                  <Text style={styles.choiceBadge}>{formatTtlChoiceLabel(index)}</Text>
                  <Text style={styles.choiceText}>{text}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </GameShell>
    )
  }

  const lockedOut = !myGuess && timeExpired

  return (
    <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={roundSubtitle}>
      <ScrollView contentContainerStyle={styles.content}>
        {liveBanners}
        {submitterBadge}
        <Text style={styles.featured}>Which is {featuredName}&apos;s lie?</Text>
        {ttlTimerPinned ? null : ttlTimer}
        {metadata ? (
          <View style={styles.choices}>
            {metadata.statements.map((text, index) => {
              const selected = myGuess?.guessed_index === index
              return (
                <Pressable
                  key={index}
                  style={[styles.choice, selected && styles.choiceSelected]}
                  disabled={submitting || !!myGuess || lockedOut || isViewer}
                  onPress={() => void submitGuess(index)}
                >
                  <Text style={styles.choiceBadge}>{formatTtlChoiceLabel(index)}</Text>
                  <Text style={styles.choiceText}>{text}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
        {isViewer ? (
          <Text style={styles.locked}>Watching only — you can&apos;t guess this round.</Text>
        ) : myGuess ? (
          <Text style={styles.locked}>Guess locked in — results when everyone finishes or time runs out.</Text>
        ) : lockedOut ? (
          <Text style={styles.locked}>Time&apos;s up — waiting for results…</Text>
        ) : null}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
    waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
    help: { color: theme.textSecondary, fontSize: 15, lineHeight: 22 },
    rulesRow: { alignItems: 'flex-start' },
    rulesRowCentered: { alignItems: 'center', marginTop: 16 },
    lieHint: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
    upNext: { alignItems: 'center', gap: 8, marginTop: 16 },
    upNextLabel: { color: theme.textMuted, fontSize: 14, textAlign: 'center' },
    badgeRow: { alignItems: 'center', marginBottom: 4 },
    choiceBody: { flex: 1, gap: 4 },
    lieTag: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700' },
    revealResult: {
      color: theme.textMuted,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: 12,
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 12,
      paddingHorizontal: 14,
      overflow: 'hidden',
    },
    revealResultWin: { color: '#059669', borderColor: '#05966955' },
    form: { gap: 12, paddingBottom: 24 },
    fieldBlock: { gap: 8 },
    lieToggle: { alignSelf: 'flex-start' },
    lieBadge: {
      color: theme.textMuted,
      fontWeight: '700',
      fontSize: 13,
      backgroundColor: theme.surface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
    },
    // white text on the solid rose "LIE" badge — intentional
    lieBadgeActive: { color: '#fff', backgroundColor: theme.primary },
    input: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
      padding: 12,
      minHeight: 72,
      fontSize: 16,
    },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      padding: 14,
      alignItems: 'center',
      marginTop: 8,
    },
    primaryBtnDisabled: { opacity: 0.5 },
    // white on the solid rose button — intentional
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    secondaryBtn: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      alignItems: 'center',
      marginTop: 12,
    },
    secondaryText: { color: theme.text, fontWeight: '700', fontSize: 15 },
    reviewCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 10,
      marginTop: 16,
    },
    reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    reviewBadge: {
      color: theme.textMuted,
      fontWeight: '800',
      fontSize: 12,
      backgroundColor: theme.bg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      minWidth: 34,
      textAlign: 'center',
    },
    // white text on the solid rose "LIE" badge — intentional
    reviewBadgeLie: { color: '#fff', backgroundColor: theme.primary },
    reviewText: { color: theme.text, fontSize: 15, flex: 1, lineHeight: 21 },
    featured: { color: theme.text, fontSize: 18, fontWeight: '700' },
    choices: { gap: 10, marginTop: 8 },
    choice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.border,
    },
    choiceSelected: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    choiceReveal: { borderColor: '#fbbf24' },
    choiceBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: theme.primary,
      // white on the solid rose badge — intentional
      color: '#fff',
      textAlign: 'center',
      lineHeight: 32,
      fontWeight: '800',
    },
    choiceText: { color: theme.text, fontSize: 16, flex: 1, lineHeight: 22 },
    locked: { color: theme.textMuted, textAlign: 'center', marginTop: 12 },
    // Eliminated notice — red accent, mirrors web's <EliminationBanner>.
    elimBanner: {
      backgroundColor: '#ef44441a',
      borderColor: '#ef444455',
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      gap: 2,
    },
    elimTitle: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
    elimBody: { color: theme.textFaint, fontSize: 12 },
  })
