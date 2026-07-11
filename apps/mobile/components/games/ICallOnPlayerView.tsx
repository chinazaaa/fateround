import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { type Game, type NpatAnswer, type NpatMark, type Player, type Round } from '@fateround/shared'
import { batch5GameLabel } from '@fateround/shared/batch-5-games'
import {
  NPAT_CATEGORIES,
  NPAT_CATEGORY_LABELS,
  availableLettersForPick,
  parseNpatMetadata,
  reviewTargetForMarker,
  roundCallerPlayerId,
  tallyNpatScores,
  trimNpatAnswerFields,
  validateNpatAnswerFields,
} from '@fateround/shared/npat'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postNpatCallerApprove, postNpatLetter, postNpatMark, postNpatSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { NPAT_ANSWER_SELECT, NPAT_MARK_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { ICallOnScoreboard } from '@/components/games/i_call_on/ICallOnScoreboard'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

const EMPTY_FORM = { name: '', animal: '', place: '', thing: '', food: '' }

export function ICallOnPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<NpatAnswer[]>([])
  const [marks, setMarks] = useState<NpatMark[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [validFlags, setValidFlags] = useState({
    validName: true,
    validAnimal: true,
    validPlace: true,
    validThing: true,
    validFood: true,
  })
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [rdsRes, ansRes, marksRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        getSupabase().from('npat_answers').select(NPAT_ANSWER_SELECT).eq('game_id', code),
        getSupabase().from('npat_marks').select(NPAT_MARK_SELECT).eq('game_id', code),
      ])
      if (rdsRes.error || ansRes.error || marksRes.error) return { state: null, ok: false }
      setRounds((rdsRes.data as Round[]) ?? [])
      setAnswers((ansRes.data as NpatAnswer[]) ?? [])
      setMarks((marksRes.data as NpatMark[]) ?? [])
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
    [{ table: 'games', column: 'id' }, 'rounds', 'npat_answers', 'npat_marks'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer = rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    return active ?? byPointer
  }, [bootstrap.game, rounds])

  const metadata = currentRound ? parseNpatMetadata(currentRound.npat_metadata) : null
  const callerId = currentRound ? roundCallerPlayerId(currentRound, metadata) : null
  const isCaller = callerId === bootstrap.myPlayerId
  const myAnswer = currentRound ? answers.find((a) => a.player_id === bootstrap.myPlayerId && a.round_id === currentRound.id) : undefined
  const reviewTargetId = metadata && bootstrap.myPlayerId ? reviewTargetForMarker(metadata, bootstrap.myPlayerId) : null
  const reviewTargetAnswer = reviewTargetId
    ? answers.find((a) => a.player_id === reviewTargetId && a.round_id === currentRound?.id)
    : undefined
  const myMark = currentRound
    ? marks.find((m) => m.marker_player_id === bootstrap.myPlayerId && m.round_id === currentRound.id)
    : undefined
  const availableLetters = availableLettersForPick(rounds)

  const act = async (fn: () => Promise<unknown>) => {
    if (!bootstrap.myResumeToken || acting) return
    setActing(true)
    try {
      await fn()
      await bootstrap.load()
    } finally {
      setActing(false)
    }
  }

  const pickLetter = (letter: string) => {
    if (!currentRound) return
    void act(() => postNpatLetter(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, letter))
  }

  const submitAnswers = () => {
    if (!currentRound || !metadata?.letter) return
    const trimmed = trimNpatAnswerFields(form)
    const error = validateNpatAnswerFields(metadata.letter, trimmed)
    if (error) return
    void act(() => postNpatSubmit(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, trimmed))
  }

  const submitMarks = () => {
    if (!currentRound) return
    void act(() => postNpatMark(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, validFlags))
  }

  const approveRound = () => {
    if (!currentRound) return
    void act(() => postNpatCallerApprove(bootstrap.code, bootstrap.myResumeToken!, currentRound.id))
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
    const scores = tallyNpatScores(answers, bootstrap.players)
    const top = scores[0]
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title="Game over" subtitle="Final standings" detail={top ? `${top.name} — ${top.score} pts` : undefined} leaderboard={scoreListLeaderboard(scores)} />
      </GameShell>
    )
  }

  if (!currentRound || !metadata) {
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={bootstrap.code}>
        <Text style={styles.waiting}>Waiting for the next round…</Text>
      </GameShell>
    )
  }

  const roundAnswers = answers.filter((a) => a.round_id === currentRound.id)
  const roundMarks = marks.filter((m) => m.round_id === currentRound.id)
  const scoreboard = (showScores: boolean, maskAnswers: boolean) => (
    <ICallOnScoreboard
      letter={metadata.letter}
      players={bootstrap.players}
      answers={roundAnswers}
      marks={roundMarks}
      metadata={metadata}
      showScores={showScores}
      maskAnswers={maskAnswers}
      myPlayerId={bootstrap.myPlayerId}
    />
  )

  if (metadata.phase === 'letter_pick') {
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={`Round ${currentRound.round_number}`}>
        {isCaller ? (
          <>
            <Text style={styles.section}>Pick a letter</Text>
            <View style={styles.letterGrid}>
              {availableLetters.map((letter) => (
                <Pressable key={letter} style={styles.letterBtn} disabled={acting} onPress={() => pickLetter(letter)}>
                  <Text style={styles.letterText}>{letter}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.waiting}>Waiting for the caller to pick a letter…</Text>
        )}
      </GameShell>
    )
  }

  if (metadata.phase === 'writing') {
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={`Letter ${metadata.letter ?? '?'}`}>
        <ScrollView contentContainerStyle={styles.form}>
          {myAnswer?.submitted_at ? (
            <Text style={styles.locked}>Answers submitted — waiting for marking…</Text>
          ) : (
            <>
              {NPAT_CATEGORIES.map((category) => (
                <View key={category} style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>{NPAT_CATEGORY_LABELS[category]}</Text>
                  <TextInput
                    style={styles.input}
                    value={form[category]}
                    onChangeText={(text) => setForm((prev) => ({ ...prev, [category]: text }))}
                    placeholder={`${NPAT_CATEGORY_LABELS[category]} starting with ${metadata.letter}`}
                    placeholderTextColor={theme.textFaint}
                  />
                </View>
              ))}
              <Pressable style={styles.primaryBtn} disabled={acting} onPress={submitAnswers}>
                <Text style={styles.primaryText}>Submit answers</Text>
              </Pressable>
            </>
          )}
          {scoreboard(false, true)}
        </ScrollView>
      </GameShell>
    )
  }

  if (metadata.phase === 'marking') {
    const targetName = bootstrap.players.find((p) => p.id === reviewTargetId)?.name ?? 'Player'
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={`Mark ${targetName}'s answers`}>
        <ScrollView contentContainerStyle={styles.form}>
        {!reviewTargetAnswer ? (
          <Text style={styles.waiting}>Waiting for assignment…</Text>
        ) : myMark?.marked_at ? (
          <Text style={styles.locked}>Marks submitted</Text>
        ) : (
          <>
            {NPAT_CATEGORIES.map((category) => {
              const flagKey =
                category === 'name'
                  ? 'validName'
                  : category === 'animal'
                    ? 'validAnimal'
                    : category === 'place'
                      ? 'validPlace'
                      : category === 'thing'
                        ? 'validThing'
                        : 'validFood'
              return (
              <View key={category} style={styles.markRow}>
                <View style={styles.markCopy}>
                  <Text style={styles.fieldLabel}>{NPAT_CATEGORY_LABELS[category]}</Text>
                  <Text style={styles.markAnswer}>{reviewTargetAnswer[category] || '—'}</Text>
                </View>
                <Switch
                  value={validFlags[flagKey]}
                  onValueChange={(value) => setValidFlags((prev) => ({ ...prev, [flagKey]: value }))}
                />
              </View>
              )
            })}
            <Pressable style={styles.primaryBtn} disabled={acting} onPress={submitMarks}>
              <Text style={styles.primaryText}>Submit marks</Text>
            </Pressable>
          </>
        )}
        {scoreboard(false, false)}
        </ScrollView>
      </GameShell>
    )
  }

  if (metadata.phase === 'host_review') {
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={`Letter ${metadata.letter ?? '?'}`}>
        <ScrollView contentContainerStyle={styles.form}>
          {isCaller ? (
            <Pressable style={styles.primaryBtn} disabled={acting} onPress={approveRound}>
              <Text style={styles.primaryText}>Approve round</Text>
            </Pressable>
          ) : (
            <Text style={styles.waiting}>Waiting for caller approval…</Text>
          )}
          {scoreboard(false, false)}
        </ScrollView>
      </GameShell>
    )
  }

  return (
    <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={`Round ${currentRound.round_number}`}>
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.waiting}>Reveal — next round starting soon…</Text>
        {scoreboard(true, false)}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 24 },
  section: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  letterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  letterBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  letterText: { color: theme.text, fontSize: 18, fontWeight: '700' },
  form: { gap: 12, paddingBottom: 24 },
  fieldBlock: { gap: 6 },
  fieldLabel: { color: theme.textSecondary, fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    color: theme.text,
    padding: 12,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  // white on the solid rose primary button — intentional
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  locked: { color: theme.textMuted, textAlign: 'center', marginTop: 12 },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  markCopy: { flex: 1, paddingRight: 12 },
  markAnswer: { color: theme.text, fontSize: 16, marginTop: 4 },
})
