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
import { FinishedPanel, GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postNpatCallerApprove, postNpatLetter, postNpatMark, postNpatSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { NPAT_ANSWER_SELECT, NPAT_MARK_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

const EMPTY_FORM = { name: '', animal: '', place: '', thing: '', food: '' }

export function ICallOnPlayerView({ gameCode }: { gameCode: string }) {
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
  if (bootstrap.screen === 'waiting' && bootstrap.game) {
    return <LobbyView game={bootstrap.game} players={bootstrap.players} myPlayerId={bootstrap.myPlayerId} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyNpatScores(answers, bootstrap.players)
    const top = scores[0]
    return (
      <GameShell title={batch5GameLabel('i_call_on')} subtitle={bootstrap.code}>
        <FinishedPanel title="Game over" detail={top ? `${top.name} — ${top.score} pts` : undefined} />
      </GameShell>
    )
  }

  if (!currentRound || !metadata) {
    return (
      <GameShell title={batch5GameLabel('i_call_on')} subtitle={bootstrap.code}>
        <Text style={styles.waiting}>Waiting for the next round…</Text>
      </GameShell>
    )
  }

  if (metadata.phase === 'letter_pick') {
    return (
      <GameShell title={batch5GameLabel('i_call_on')} subtitle={`Round ${currentRound.round_number}`}>
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
      <GameShell title={batch5GameLabel('i_call_on')} subtitle={`Letter ${metadata.letter ?? '?'}`}>
        {myAnswer?.submitted_at ? (
          <Text style={styles.locked}>Answers submitted — waiting for marking…</Text>
        ) : (
          <ScrollView contentContainerStyle={styles.form}>
            {NPAT_CATEGORIES.map((category) => (
              <View key={category} style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{NPAT_CATEGORY_LABELS[category]}</Text>
                <TextInput
                  style={styles.input}
                  value={form[category]}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, [category]: text }))}
                  placeholder={`${NPAT_CATEGORY_LABELS[category]} starting with ${metadata.letter}`}
                  placeholderTextColor="#6b7280"
                />
              </View>
            ))}
            <Pressable style={styles.primaryBtn} disabled={acting} onPress={submitAnswers}>
              <Text style={styles.primaryText}>Submit answers</Text>
            </Pressable>
          </ScrollView>
        )}
      </GameShell>
    )
  }

  if (metadata.phase === 'marking') {
    const targetName = bootstrap.players.find((p) => p.id === reviewTargetId)?.name ?? 'Player'
    return (
      <GameShell title={batch5GameLabel('i_call_on')} subtitle={`Mark ${targetName}'s answers`}>
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
      </GameShell>
    )
  }

  if (metadata.phase === 'host_review') {
    return (
      <GameShell title={batch5GameLabel('i_call_on')} subtitle={`Letter ${metadata.letter ?? '?'}`}>
        {isCaller ? (
          <Pressable style={styles.primaryBtn} disabled={acting} onPress={approveRound}>
            <Text style={styles.primaryText}>Approve round</Text>
          </Pressable>
        ) : (
          <Text style={styles.waiting}>Waiting for caller approval…</Text>
        )}
      </GameShell>
    )
  }

  return (
    <GameShell title={batch5GameLabel('i_call_on')} subtitle={`Round ${currentRound.round_number}`}>
      <Text style={styles.waiting}>Reveal — next round starting soon…</Text>
    </GameShell>
  )
}

const styles = StyleSheet.create({
  waiting: { color: '#9ca3af', fontSize: 16, textAlign: 'center', marginTop: 24 },
  section: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  letterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  letterBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#17171d',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2a2a35',
  },
  letterText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  form: { gap: 12, paddingBottom: 24 },
  fieldBlock: { gap: 6 },
  fieldLabel: { color: '#d1d5db', fontSize: 14, fontWeight: '600' },
  input: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a35',
    color: '#fff',
    padding: 12,
    fontSize: 16,
  },
  primaryBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  locked: { color: '#9ca3af', textAlign: 'center', marginTop: 12 },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#17171d',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  markCopy: { flex: 1, paddingRight: 12 },
  markAnswer: { color: '#fff', fontSize: 16, marginTop: 4 },
})
