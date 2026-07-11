import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { type Game, type Participant, type Player, type Round, type Vote } from '@fateround/shared'
import { batch9GameLabel } from '@fateround/shared/batch-9-games'
import {
  assignCustomSlot,
  customAssignmentMode,
  getCustomSlots,
  getCustomTitle,
  isCustomAssignmentValid,
} from '@fateround/shared/custom-game'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postVote } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT, ROUND_SELECT, VOTE_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

type CustomState = {
  rounds: Round[]
  participants: Participant[]
  votes: Vote[]
}

export function CustomPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [state, setState] = useState<CustomState>({ rounds: [], participants: [], votes: [] })
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: CustomState; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [roundsRes, participantsRes, votesRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        getSupabase().from('participants').select(PARTICIPANT_SELECT).eq('game_id', code).order('display_order'),
        getSupabase().from('votes').select(VOTE_SELECT).eq('game_id', code),
      ])
      if (roundsRes.error || participantsRes.error || votesRes.error) {
        return { state: { rounds: [], participants: [], votes: [] }, ok: false }
      }
      const next: CustomState = {
        rounds: (roundsRes.data as Round[]) ?? [],
        participants: (participantsRes.data as Participant[]) ?? [],
        votes: (votesRes.data as Vote[]) ?? [],
      }
      setState(next)
      return { state: next, ok: true }
    },
    [gameCode]
  )

  const bootstrap = useGameViewBootstrap<Screen, CustomState>({
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
    [{ table: 'games', column: 'id' }, 'rounds', 'participants', 'votes'],
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

  const slots = bootstrap.game ? getCustomSlots(bootstrap.game) : []
  const roundParticipants = useMemo(() => {
    if (!currentRound?.participant_ids?.length) return []
    const ids = new Set(currentRound.participant_ids)
    return state.participants.filter((p) => ids.has(p.id))
  }, [currentRound, state.participants])

  const slotKeys = slots.map((s) => s.key)
  const mode = bootstrap.game
    ? customAssignmentMode(bootstrap.game, roundParticipants.length, slotKeys)
    : 'one_each'

  const myVote = useMemo(
    () =>
      currentRound
        ? state.votes.find((v) => v.player_id === bootstrap.myPlayerId && v.round_id === currentRound.id)
        : null,
    [bootstrap.myPlayerId, currentRound, state.votes]
  )
  const submitted = !!myVote

  const canSubmit =
    !submitted &&
    isCustomAssignmentValid(assignments, roundParticipants.map((p) => p.id), slotKeys, mode)

  const submit = async () => {
    if (!bootstrap.myResumeToken || !currentRound || !canSubmit || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await postVote(bootstrap.code, bootstrap.myResumeToken, currentRound.id, { customAssignments: assignments })
      setAssignments({})
      await bootstrap.load()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit')
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
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (bootstrap.screen === 'finished' && bootstrap.game) {
    return <GameFinishPanel bootstrap={bootstrap} title="Game over" detail={`Thanks for playing ${getCustomTitle(bootstrap.game)}!`} />
  }
  if (!bootstrap.game || !currentRound) {
    return (
      <GameShell bootstrap={bootstrap} title={batch9GameLabel('custom')} subtitle="Waiting">
        <Text style={styles.wait}>Waiting for the next round…</Text>
      </GameShell>
    )
  }

  return (
    <GameShell
      title={getCustomTitle(bootstrap.game)}
      subtitle={`Round ${currentRound.round_number} / ${bootstrap.game.rounds_count ?? '?'}`}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <TurnBanner
          text={submitted ? 'Vote submitted' : 'Assign everyone to a slot'}
          isMyTurn={!submitted && currentRound.status === 'active'}
        />

        {roundParticipants.map((participant) => (
          <View key={participant.id} style={styles.participantRow}>
            <Text style={styles.participantName}>{participant.name}</Text>
            <View style={styles.slotRow}>
              {slots.map((slot) => {
                const selected = assignments[participant.id] === slot.key
                return (
                  <Pressable
                    key={slot.key}
                    style={[styles.slotBtn, selected && { borderColor: slot.color || '#f43f5e' }]}
                    disabled={submitted || currentRound.status !== 'active'}
                    onPress={() =>
                      setAssignments((prev) =>
                        assignCustomSlot(prev, participant.id, slot.key, roundParticipants.map((p) => p.id), mode)
                      )
                    }
                  >
                    <Text style={styles.slotEmoji}>{slot.emoji}</Text>
                    <Text style={styles.slotLabel}>{slot.label}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        ))}

        {submitError ? <Text style={styles.error}>{submitError}</Text> : null}

        {!submitted && currentRound.status === 'active' ? (
          <Pressable
            style={[styles.primaryBtn, (!canSubmit || submitting) && styles.btnDisabled]}
            disabled={!canSubmit || submitting}
            onPress={() => void submit()}
          >
            <Text style={styles.primaryBtnText}>Submit vote</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  content: { gap: 14, paddingBottom: 32 },
  wait: { color: theme.textMuted, fontSize: 15 },
  participantRow: { backgroundColor: theme.surface, borderRadius: 12, padding: 12, gap: 10 },
  participantName: { color: theme.text, fontSize: 17, fontWeight: '700' },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn: {
    backgroundColor: theme.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 72,
  },
  slotEmoji: { fontSize: 18 },
  slotLabel: { color: theme.textSecondary, fontSize: 11, marginTop: 2, textAlign: 'center' },
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
})
