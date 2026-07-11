import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { type Game, type Participant, type Player, type Round } from '@fateround/shared'
import { batch9GameLabel } from '@fateround/shared/batch-9-games'
import {
  HOT_SEAT_SUBMISSION_TYPES,
  hotSeatPlayerDisplayName,
  type HotSeatSubmission,
  type HotSeatSubmissionType,
} from '@fateround/shared/hot-seat'
import { isImportClaimMode } from '@fateround/shared/participant-mode'
import { JoinScreen } from '@/components/JoinScreen'
import { ParticipantClaimJoinScreen } from '@/components/join/ParticipantClaimJoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { getHotSeatSubmissions, postHotSeat } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

type HotSeatState = {
  rounds: Round[]
  participants: Participant[]
}

export function HotSeatPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [state, setState] = useState<HotSeatState>({ rounds: [], participants: [] })
  const [submissionType, setSubmissionType] = useState<HotSeatSubmissionType>('compliment')
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<HotSeatSubmission[]>([])
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadGameState = useCallback(async (): Promise<{ state: HotSeatState; ok: boolean }> => {
    const code = gameCode.toUpperCase()
    const [roundsRes, participantsRes] = await Promise.all([
      getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
      getSupabase().from('participants').select(PARTICIPANT_SELECT).eq('game_id', code).order('display_order'),
    ])
    if (roundsRes.error || participantsRes.error) {
      return { state: { rounds: [], participants: [] }, ok: false }
    }
    const next: HotSeatState = {
      rounds: (roundsRes.data as Round[]) ?? [],
      participants: (participantsRes.data as Participant[]) ?? [],
    }
    setState(next)
    return { state: next, ok: true }
  }, [gameCode])

  const bootstrap = useGameViewBootstrap<Screen, HotSeatState>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    joinScreen: 'join',
    waitingScreen: 'waiting',
    loadGameState,
    computeScreen: (game, playerId) => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'finished') return 'finished'
      return 'playing'
    },
  })
  const { onLeft, lobbyProps } = usePlayerSessionActions(bootstrap)

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'participants'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer =
      state.rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = state.rounds.find((r) => r.status === 'active') ?? null
    if (active && byPointer && active.id !== byPointer.id && byPointer.status === 'finished') return active
    return byPointer ?? active
  }, [bootstrap.game, state.rounds])

  useEffect(() => {
    setSubmitted(false)
    setText('')
    setResults([])
    setError(null)
  }, [currentRound?.id])

  useEffect(() => {
    if (!currentRound || currentRound.status !== 'finished' || !bootstrap.game) return
    void getHotSeatSubmissions(bootstrap.code, currentRound.id)
      .then((data) => setResults((data.submissions as HotSeatSubmission[]) ?? []))
      .catch(() => setResults([]))
  }, [bootstrap.code, bootstrap.game, currentRound])

  const hotSeatPlayerId = currentRound?.submitter_player_id ?? null
  const isInHotSeat = hotSeatPlayerId === bootstrap.myPlayerId
  const hotSeatName = hotSeatPlayerDisplayName(hotSeatPlayerId, bootstrap.players, state.participants)

  const submit = async () => {
    const trimmed = text.trim()
    if (!trimmed || !bootstrap.myResumeToken || !currentRound || acting || isInHotSeat) return
    setActing(true)
    setError(null)
    try {
      await postHotSeat(bootstrap.code, currentRound.id, bootstrap.myResumeToken, trimmed, submissionType)
      setSubmitted(true)
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setActing(false)
    }
  }

  if (bootstrap.screen === 'loading') return <GameLoading />
  if (bootstrap.screen === 'not_found') return <GameNotFound gameCode={bootstrap.code} />
  if (bootstrap.screen === 'join' && bootstrap.game) {
    if (isImportClaimMode(bootstrap.game)) {
      return (
        <ParticipantClaimJoinScreen
          gameCode={bootstrap.code}
          game={bootstrap.game}
          participants={state.participants}
          players={bootstrap.players}
          joining={bootstrap.joining}
          error={bootstrap.error}
          hint="Claim your name from the list — everyone takes a turn in the hot seat"
          onJoin={(participantId, name) => void bootstrap.join(name, { participantId })}
        />
      )
    }
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
  if (bootstrap.screen === 'finished' && bootstrap.game) {
    return (
      <GameShell bootstrap={bootstrap} title={batch9GameLabel('hot_seat')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title="Game over"
          detail="Thanks for playing Hot Seat!"
        />
      </GameShell>
    )
  }
  if (!bootstrap.game || !currentRound) {
    return (
      <GameShell bootstrap={bootstrap} title={batch9GameLabel('hot_seat')} subtitle="Waiting">
        <Text style={styles.wait}>Waiting for the next round…</Text>
      </GameShell>
    )
  }

  return (
    <GameShell
      title={bootstrap.game.title || batch9GameLabel('hot_seat')}
      subtitle={`Round ${currentRound.round_number} / ${bootstrap.game.rounds_count ?? '?'}`}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.spotlight}>
          <Text style={styles.spotlightEmoji}>🪑🔥</Text>
          <Text style={styles.spotlightLabel}>In the hot seat</Text>
          <Text style={styles.spotlightName}>{isInHotSeat ? 'YOU' : hotSeatName}</Text>
        </View>

        {currentRound.status === 'finished' ? (
          <View style={styles.results}>
            <Text style={styles.section}>Results</Text>
            {results.length === 0 ? (
              <Text style={styles.muted}>No submissions to show.</Text>
            ) : (
              results.map((row) => {
                const author = bootstrap.players.find((p) => p.id === row.player_id)?.name ?? 'Player'
                const typeMeta = HOT_SEAT_SUBMISSION_TYPES.find((t) => t.type === row.submission_type)
                return (
                  <View key={row.id} style={styles.resultRow}>
                    <Text style={styles.resultMeta}>
                      {typeMeta?.emoji} {author}
                    </Text>
                    <Text style={styles.resultText}>{row.text}</Text>
                  </View>
                )
              })
            )}
          </View>
        ) : isInHotSeat ? (
          <TurnBanner text="Everyone is writing about you…" isMyTurn={false} />
        ) : submitted ? (
          <View style={styles.doneBox}>
            <Text style={styles.doneText}>✓ Submitted — waiting for everyone else</Text>
          </View>
        ) : (
          <>
            <Text style={styles.section}>Pick a vibe</Text>
            <View style={styles.typeRow}>
              {HOT_SEAT_SUBMISSION_TYPES.map(({ type, emoji, label }) => (
                <Pressable
                  key={type}
                  style={[styles.typeBtn, submissionType === type && styles.typeBtnActive]}
                  onPress={() => setSubmissionType(type)}
                >
                  <Text style={styles.typeText}>
                    {emoji} {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder={`Write a ${submissionType} about ${hotSeatName}…`}
              placeholderTextColor={theme.textFaint}
              multiline
              maxLength={300}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.primaryBtn, (acting || !text.trim()) && styles.btnDisabled]}
              disabled={acting || !text.trim()}
              onPress={() => void submit()}
            >
              <Text style={styles.primaryBtnText}>Submit</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  content: { gap: 14, paddingBottom: 32 },
  wait: { color: theme.textMuted, fontSize: 15 },
  spotlight: {
    backgroundColor: theme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f59e0b66',
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  spotlightEmoji: { fontSize: 40 },
  spotlightLabel: { color: '#fbbf24', fontSize: 12, textTransform: 'uppercase' },
  spotlightName: { color: theme.text, fontSize: 28, fontWeight: '800' },
  section: { color: theme.text, fontSize: 16, fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeBtn: {
    backgroundColor: theme.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  typeBtnActive: { borderColor: theme.primary },
  typeText: { color: theme.text, fontSize: 13 },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    color: theme.text,
    fontSize: 16,
    minHeight: 96,
    padding: 12,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // white on the solid rose submit button — intentional
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  error: { color: theme.error, fontSize: 14 },
  doneBox: {
    backgroundColor: '#14532d33',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#22c55e66',
    padding: 16,
  },
  doneText: { color: '#86efac', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  results: { gap: 10 },
  resultRow: { backgroundColor: theme.surface, borderRadius: 10, padding: 12, gap: 4 },
  resultMeta: { color: theme.textMuted, fontSize: 12 },
  resultText: { color: theme.text, fontSize: 15 },
  muted: { color: theme.textFaint, fontSize: 14 },
})
