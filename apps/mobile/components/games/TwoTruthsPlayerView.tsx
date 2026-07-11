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
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postTtlGuess, postTtlStatements } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { ROUND_SELECT, TTL_GUESS_SELECT, TTL_STATEMENT_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

export function TwoTruthsPlayerView({ gameCode }: { gameCode: string }) {
  const [statements, setStatements] = useState<TtlStatement[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<TtlGuess[]>([])
  const [stmtA, setStmtA] = useState('')
  const [stmtB, setStmtB] = useState('')
  const [stmtC, setStmtC] = useState('')
  const [lieIndex, setLieIndex] = useState(0)
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
    if (game.status === 'finished') return 'finished'
    if (!playerId) return 'join'
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

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'ttl_statements', 'ttl_guesses'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const myStatement = bootstrap.myPlayerId
    ? statements.find((s) => s.player_id === bootstrap.myPlayerId)
    : undefined

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
  const revealSeconds =
    currentRound?.status === 'finished' ? revealCountdownSeconds(currentRound.ended_at) : null

  // Running standings shown throughout play (mirrors web's live PaginatedLeaderboard).
  const liveScores = useMemo(
    () => tallyTtlScores(guesses, bootstrap.players, rounds),
    [guesses, bootstrap.players, rounds]
  )

  // Round countdown + auto-lock when the guessing time runs out.
  const timerSeconds = bootstrap.game?.timer_seconds ?? 0
  const timerActive =
    !!currentRound && currentRound.status === 'active' && !isFeatured && timerSeconds > 0
  const secondsLeft = useDeadlineCountdown(currentRound?.started_at, timerSeconds, timerActive)

  // Reset the per-round expiry flag whenever the round changes.
  useEffect(() => {
    setTimeExpired(false)
  }, [currentRound?.id])

  useEffect(() => {
    if (timerActive && !myGuess && secondsLeft <= 0) setTimeExpired(true)
  }, [timerActive, myGuess, secondsLeft])

  const submitStatements = async () => {
    if (!bootstrap.myResumeToken || submitting) return
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
    if (!bootstrap.myResumeToken || !currentRound || submitting || myGuess) return
    setSubmitting(true)
    try {
      await postTtlGuess(bootstrap.code, bootstrap.myResumeToken, currentRound.id, index)
      await bootstrap.load()
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
    if (myStatement && !editingStatements) {
      return (
        <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={bootstrap.code}>
          <Text style={styles.waiting}>Statements submitted — waiting for host to start…</Text>
          <View style={styles.reviewCard}>
            {[myStatement.statement_a, myStatement.statement_b, myStatement.statement_c].map(
              (text, index) => (
                <View key={index} style={styles.reviewRow}>
                  <Text style={[styles.reviewBadge, index === myStatement.lie_index && styles.reviewBadgeLie]}>
                    {index === myStatement.lie_index ? 'LIE' : formatTtlChoiceLabel(index)}
                  </Text>
                  <Text style={styles.reviewText}>{text}</Text>
                </View>
              )
            )}
          </View>
          <Pressable style={styles.secondaryBtn} onPress={startEditing}>
            <Text style={styles.secondaryText}>Edit my statements</Text>
          </Pressable>
        </GameShell>
      )
    }
    return (
      <GameShell
        bootstrap={bootstrap}
        title={batch4GameLabel('two_truths')}
        subtitle={editingStatements ? 'Update your statements' : 'Submit your statements'}
      >
        <ScrollView contentContainerStyle={styles.form}>
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
          <Pressable style={styles.primaryBtn} disabled={submitting} onPress={() => void submitStatements()}>
            <Text style={styles.primaryText}>
              {submitting
                ? 'Submitting…'
                : editingStatements
                  ? 'Update statements'
                  : 'Submit statements'}
            </Text>
          </Pressable>
          {editingStatements && myStatement ? (
            <Pressable
              style={styles.secondaryBtn}
              disabled={submitting}
              onPress={() => setEditingStatements(false)}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </GameShell>
    )
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyTtlScores(guesses, bootstrap.players, rounds)
    const top = scores[0]
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title="Game over" subtitle="Final standings" detail={top ? `${top.name} — ${top.score} pts` : undefined} leaderboard={scoreListLeaderboard(scores)} />
      </GameShell>
    )
  }

  if (!currentRound || currentRound.status === 'pending') {
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={bootstrap.code}>
        <Text style={styles.waiting}>Waiting for the next round…</Text>
      </GameShell>
    )
  }

  const featuredName = playerDisplayName(currentRound.submitter_player_id, bootstrap.players)

  const liveBoard = (
    <LeaderboardPanel
      title="Leaderboard"
      rows={liveScores.map((row) => ({
        id: row.id,
        name: row.name,
        score: row.score,
        highlight: row.id === bootstrap.myPlayerId,
      }))}
      highlightId={bootstrap.myPlayerId}
    />
  )

  if (currentRound.status === 'finished') {
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={`Round ${currentRound.round_number}`}>
        <Text style={styles.featured}>{featuredName}&apos;s round</Text>
        {metadata ? (
          <View style={styles.choices}>
            {metadata.statements.map((text, index) => (
              <View
                key={index}
                style={[styles.choice, index === metadata.lie_index && styles.choiceReveal]}
              >
                <Text style={styles.choiceBadge}>{formatTtlChoiceLabel(index)}</Text>
                <Text style={styles.choiceText}>{text}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={styles.waiting}>
          {revealSeconds && revealSeconds > 0 ? `Next round in ${revealSeconds}s…` : 'Waiting for next round…'}
        </Text>
        {liveBoard}
      </GameShell>
    )
  }

  if (isFeatured) {
    return (
      <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={`Round ${currentRound.round_number}`}>
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
        {liveBoard}
      </GameShell>
    )
  }

  const lockedOut = !myGuess && timeExpired

  return (
    <GameShell bootstrap={bootstrap} title={batch4GameLabel('two_truths')} subtitle={`Round ${currentRound.round_number}`}>
      <Text style={styles.featured}>Which is {featuredName}&apos;s lie?</Text>
      {timerActive && !myGuess && !timeExpired ? <TimerBadge seconds={secondsLeft} /> : null}
      {metadata ? (
        <View style={styles.choices}>
          {metadata.statements.map((text, index) => {
            const selected = myGuess?.guessed_index === index
            return (
              <Pressable
                key={index}
                style={[styles.choice, selected && styles.choiceSelected]}
                disabled={submitting || !!myGuess || lockedOut}
                onPress={() => void submitGuess(index)}
              >
                <Text style={styles.choiceBadge}>{formatTtlChoiceLabel(index)}</Text>
                <Text style={styles.choiceText}>{text}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
      {myGuess ? (
        <Text style={styles.locked}>
          Guess locked — {myGuess.is_correct ? 'correct!' : 'wrong'}
        </Text>
      ) : lockedOut ? (
        <Text style={styles.locked}>Time&apos;s up — waiting for results…</Text>
      ) : null}
      {liveBoard}
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
  help: { color: theme.textSecondary, fontSize: 15, lineHeight: 22 },
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
})
