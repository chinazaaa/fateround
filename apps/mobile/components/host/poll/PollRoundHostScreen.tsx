import { useCallback, useEffect, useMemo, useState } from 'react'
import { uniqueTopic } from '@/lib/realtime'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, Participant, Player, Round, Vote } from '@fateround/shared'
import {
  isMostLikelyTo,
  isPickANumber,
  panUsedNumbersFromVotes,
  parseGameType,
  parsePickANumberPool,
  pollGameLabel,
} from '@fateround/shared/poll-games'
import {
  HOT_SEAT_SUBMISSION_TYPES,
  hotSeatPlayerDisplayName,
  type HotSeatSubmission,
} from '@fateround/shared/hot-seat'
import {
  getHotSeatSubmissions,
  postEndRound,
  postFinishGame,
  postNextRound,
  postPlayAgain,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { PARTICIPANT_SELECT, ROUND_SELECT, VOTE_SELECT } from '@/lib/supabase-selects'
import { PollRoundResults } from '@/components/games/poll/PollRoundResults'
import { HotSeatHostReveal } from '@/components/host/poll/HotSeatHostReveal'
import { HostChrome } from '@/components/host/HostChrome'
import { GameFinishedActions } from '@/components/lifecycle/GameFinishedActions'
import { LeaderboardPanel } from '@/components/ui/LeaderboardPanel'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useRoundTimer } from '@/hooks/useRoundTimer'
import { mltVoteLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type ActiveHotSeatSub = { id: string; player_id: string; round_id: string }

/** Mirror of the web `hotSeatJoinedPlayers`: which seated players may submit. */
function joinedHotSeatPlayers(
  players: Player[],
  participants: Participant[],
  participantMode: string | null | undefined
): Player[] {
  const seated = players.filter((p) => !p.spectator)
  if ((participantMode ?? 'import') === 'joiners') return seated
  const joinedPartIds = new Set(
    participants.filter((pt) => players.some((pl) => pl.participant_id === pt.id)).map((pt) => pt.id)
  )
  return seated.filter((p) => p.participant_id && joinedPartIds.has(p.participant_id))
}

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  players: Player[]
  onReload: () => void
}

export function PollRoundHostScreen({ gameCode, hostToken, game, players, onReload }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [rounds, setRounds] = useState<Round[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [activeHotSeatSubs, setActiveHotSeatSubs] = useState<ActiveHotSeatSub[]>([])
  const [hotSeatReveal, setHotSeatReveal] = useState<HotSeatSubmission[]>([])
  const [acting, setActing] = useState<'end' | 'next' | 'finish' | 'replay' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const gameType = parseGameType(game.game_type)
  const isHotSeatGame = game.game_type === 'hot_seat'
  const isPan = isPickANumber(gameType)

  const loadPollData = useCallback(async () => {
    const [roundsRes, participantsRes, votesRes] = await Promise.all([
      getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      getSupabase().from('participants').select(PARTICIPANT_SELECT).eq('game_id', gameCode).order('display_order'),
      getSupabase().from('votes').select(VOTE_SELECT).eq('game_id', gameCode),
    ])
    if (!roundsRes.error) setRounds((roundsRes.data as Round[]) ?? [])
    if (!participantsRes.error) setParticipants((participantsRes.data as Participant[]) ?? [])
    if (!votesRes.error) setVotes((votesRes.data as Vote[]) ?? [])
  }, [gameCode])

  useEffect(() => {
    void loadPollData()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`host-poll-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        () => void loadPollData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `game_id=eq.${gameCode}` },
        () => void loadPollData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'participants', filter: `game_id=eq.${gameCode}` },
        () => void loadPollData()
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameCode, loadPollData])

  const activeRound = useMemo(
    () => rounds.find((r) => r.status === 'active') ?? null,
    [rounds]
  )
  const lastFinished = useMemo(() => {
    const finished = rounds.filter((r) => r.status === 'finished')
    return finished.length ? finished[finished.length - 1] : null
  }, [rounds])
  const betweenRounds = game.status === 'active' && !activeRound && !!lastFinished
  const isLastRound = (game.current_round_number ?? 0) >= (game.rounds_count ?? 0)
  const activePlayers = players.filter((p) => !p.spectator)
  const activeRoundVotes = activeRound ? votes.filter((v) => v.round_id === activeRound.id) : []
  const cumulativeMlt = isMostLikelyTo(gameType)
    ? mltVoteLeaderboard(votes, participants)
    : []

  // Live-round timer — only used here to decide when a Pick a Number round has
  // "timed out" so the host can Skip. We do not auto-end from the host screen.
  const timeLeft = useRoundTimer({
    game,
    currentRound: activeRound,
    active: game.status === 'active' && !!activeRound,
    onExpire: () => void loadPollData(),
  })

  // Hot seat writes to hot_seat_submissions, not votes. Track who has submitted
  // in the active round so the live card can show "Submissions X/Y" + a checklist.
  useEffect(() => {
    if (!isHotSeatGame || !activeRound) {
      setActiveHotSeatSubs([])
      return
    }
    let cancelled = false
    const roundId = activeRound.id
    const load = async () => {
      const { data } = await getSupabase()
        .from('hot_seat_submissions')
        .select('id, player_id, round_id')
        .eq('round_id', roundId)
      if (!cancelled && data) setActiveHotSeatSubs(data as ActiveHotSeatSub[])
    }
    void load()
    const supabase = getSupabase()
    const channel = supabase
      .channel(uniqueTopic(`host-hotseat-${gameCode}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hot_seat_submissions', filter: `round_id=eq.${roundId}` },
        () => void load()
      )
      .subscribe()
    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [isHotSeatGame, activeRound?.id, gameCode])

  // Between-rounds reveal for hot seat — the anonymous answers are only readable
  // once the round is finished, via the host-authorized /api/hot-seat route.
  useEffect(() => {
    if (!isHotSeatGame || !betweenRounds || !lastFinished) {
      setHotSeatReveal([])
      return
    }
    let cancelled = false
    getHotSeatSubmissions(gameCode, lastFinished.id)
      .then((data) => {
        if (!cancelled) setHotSeatReveal((data.submissions as HotSeatSubmission[]) ?? [])
      })
      .catch(() => {
        if (!cancelled) setHotSeatReveal([])
      })
    return () => {
      cancelled = true
    }
  }, [isHotSeatGame, betweenRounds, lastFinished?.id, gameCode])

  // ── Hot seat live-round derived state ──────────────────────────────────────
  const hotSeatPlayerName = activeRound
    ? hotSeatPlayerDisplayName(activeRound.submitter_player_id, players, participants)
    : ''
  const hotSeatSubmitters =
    isHotSeatGame && activeRound
      ? joinedHotSeatPlayers(players, participants, game.participant_mode).filter(
          (p) => p.id !== activeRound.submitter_player_id
        )
      : []
  const hotSeatSubmittedIds = new Set(
    activeHotSeatSubs
      .filter((s) => activeRound && s.round_id === activeRound.id)
      .map((s) => s.player_id)
  )
  const hotSeatCount = hotSeatSubmitters.filter((p) => hotSeatSubmittedIds.has(p.id)).length
  const hotSeatAllIn = hotSeatSubmitters.length > 0 && hotSeatCount >= hotSeatSubmitters.length

  // ── Pick a Number live-round derived state ─────────────────────────────────
  const panPickerName = activeRound
    ? hotSeatPlayerDisplayName(activeRound.submitter_player_id, players, participants)
    : ''
  const panPoolSize = isPan ? parsePickANumberPool(game.custom_questions).length : 0
  const panRevealed = !!activeRound?.mlt_question?.trim()
  const panTimedOut = isPan && !!activeRound?.started_at && timeLeft === 0 && !panRevealed
  const panUsed = activeRound ? panUsedNumbersFromVotes(votes, activeRound.id) : new Set<number>()
  const panAvailableCount = panPoolSize - panUsed.size
  const panPickerVote = activeRound
    ? activeRoundVotes.find((v) => v.player_id === activeRound.submitter_player_id)
    : undefined

  // Context-aware end-round button (label + gating) per game type.
  let endLabel = 'End round'
  let endDisabled = !!acting
  if (isPan) {
    endLabel = panRevealed ? 'Next picker' : panTimedOut ? 'Skip round' : 'End round early'
    endDisabled = !!acting || (!panRevealed && !panTimedOut && activeRoundVotes.length === 0)
  }

  const run = async (action: 'end' | 'next' | 'finish' | 'replay', fn: () => Promise<unknown>) => {
    setActing(action)
    setError(null)
    try {
      await fn()
      await loadPollData()
      onReload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setActing(null)
    }
  }

  const roundLabel = pollGameLabel(game.game_type)

  return (
    <HostChrome gameCode={gameCode} hostToken={hostToken} game={game} players={players} onReload={onReload}>
      <View style={styles.statsRow}>
        <Text style={styles.stat}>Players: {activePlayers.length}</Text>
        <Text style={styles.stat}>
          Round {game.current_round_number ?? 0}/{game.rounds_count ?? '?'}
        </Text>
      </View>

      {game.status === 'active' && activeRound && isHotSeatGame ? (
        <View style={styles.card}>
          <Text style={[styles.cardLabel, styles.hotLabel]}>In the hot seat</Text>
          <Text style={styles.cardTitle}>{hotSeatPlayerName}</Text>
          <Text style={[styles.cardHint, hotSeatAllIn && styles.hintDone]}>
            Submissions {hotSeatCount}/{hotSeatSubmitters.length}
            {hotSeatAllIn ? ' · everyone in' : ''}
          </Text>
          {hotSeatSubmitters.length > 0 ? (
            <View style={styles.checklist}>
              {hotSeatSubmitters.map((p) => {
                const done = hotSeatSubmittedIds.has(p.id)
                return (
                  <View key={p.id} style={styles.checkRow}>
                    <Text style={[styles.checkMark, done && styles.checkMarkDone]}>{done ? '✓' : '○'}</Text>
                    <Text style={[styles.checkName, done && styles.checkNameDone]} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </View>
                )
              })}
            </View>
          ) : null}
          <Text style={styles.cardFaint}>Answers stay anonymous — only who has submitted is shown.</Text>
        </View>
      ) : game.status === 'active' && activeRound && isPan ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardLabel, styles.panLabel]}>Picker this round</Text>
            {timeLeft > 0 && !panRevealed ? <TimerBadge seconds={timeLeft} /> : null}
          </View>
          <Text style={styles.cardTitle}>{panPickerName}</Text>
          {panRevealed ? (
            <View style={styles.panRevealBox}>
              <Text style={styles.cardFaint}>
                {panPickerName} picked
                {panPickerVote?.picked_number ? ` #${panPickerVote.picked_number}` : ' a number'}
              </Text>
              <Text style={styles.panQuestion}>{activeRound.mlt_question}</Text>
            </View>
          ) : (
            <Text style={styles.cardHint}>
              {panTimedOut
                ? 'Time ran out — Skip to the next picker or wait for a late lock-in.'
                : panUsed.size > 0
                  ? `Waiting for a pick — ${panAvailableCount} of ${panPoolSize} numbers still available.`
                  : `Waiting for a pick — list has ${panPoolSize} hidden question${panPoolSize === 1 ? '' : 's'} (1–${panPoolSize}).`}
            </Text>
          )}
        </View>
      ) : game.status === 'active' && activeRound ? (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>Live round</Text>
            {timeLeft > 0 ? <TimerBadge seconds={timeLeft} /> : null}
          </View>
          <Text style={styles.cardTitle}>
            {activeRound.mlt_question ||
              activeRound.quote_text ||
              activeRound.wyr_option_a ||
              `${pollGameLabel(game.game_type)} · Round ${activeRound.round_number}`}
          </Text>
          <Text style={styles.cardHint}>
            {activeRoundVotes.length}/{activePlayers.length} votes in
          </Text>
        </View>
      ) : null}

      {game.status === 'active' && betweenRounds && lastFinished ? (
        isHotSeatGame ? (
          <HotSeatHostReveal
            hotSeatPlayerName={hotSeatPlayerDisplayName(
              lastFinished.submitter_player_id,
              players,
              participants
            )}
            submissions={hotSeatReveal}
          />
        ) : (
          <PollRoundResults
            game={game}
            gameType={gameType}
            round={lastFinished}
            participants={participants}
            votes={votes}
            players={players}
          />
        )
      ) : null}

      {cumulativeMlt.length > 0 ? (
        <LeaderboardPanel title="Overall votes" rows={cumulativeMlt.map((row) => ({ id: row.name, name: row.name, score: row.score }))} />
      ) : null}

      {game.status === 'active' && betweenRounds ? (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Between rounds</Text>
          <Text style={styles.cardHint}>
            {isLastRound
              ? 'Last round finished — finish the game when ready.'
              : 'Results are in — start the next round when ready.'}
          </Text>
        </View>
      ) : null}

      {game.status === 'finished' ? (
        <Text style={styles.finished}>Game finished — open play again to run another session.</Text>
      ) : null}

      {game.status === 'active' && activeRound ? (
        <Pressable
          style={[styles.primaryBtn, (endDisabled || acting === 'end') && styles.btnDisabled]}
          disabled={endDisabled}
          onPress={() => void run('end', () => postEndRound(gameCode, hostToken))}
        >
          {acting === 'end' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{endLabel}</Text>
          )}
        </Pressable>
      ) : null}

      {game.status === 'active' && betweenRounds && !isLastRound ? (
        <Pressable
          style={[styles.primaryBtn, acting === 'next' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('next', () => postNextRound(gameCode, hostToken))}
        >
          {acting === 'next' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Next round</Text>
          )}
        </Pressable>
      ) : null}

      {game.status === 'active' && betweenRounds && isLastRound ? (
        <Pressable
          style={[styles.primaryBtn, acting === 'finish' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('finish', () => postFinishGame(gameCode, hostToken))}
        >
          {acting === 'finish' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Finish game</Text>
          )}
        </Pressable>
      ) : null}

      {game.status === 'active' ? (
        <Pressable
          style={[styles.secondaryBtn, acting === 'finish' && styles.btnDisabled]}
          disabled={!!acting}
          onPress={() => void run('finish', () => postFinishGame(gameCode, hostToken))}
        >
          <Text style={styles.secondaryBtnText}>End game early</Text>
        </Pressable>
      ) : null}


      {game.status === 'finished' ? (
        <>
          <Pressable
            style={[styles.primaryBtn, acting === 'replay' && styles.btnDisabled]}
            disabled={!!acting}
            onPress={() => void run('replay', () => postPlayAgain(gameCode, hostToken, true))}
          >
            {acting === 'replay' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Play again</Text>
            )}
          </Pressable>
          <GameFinishedActions gameCode={gameCode} gameType={game.game_type} gameTitle={game.title} />
        </>
      ) : null}

      <Text style={styles.footerHint}>{roundLabel} host controls</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </HostChrome>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 16,
    gap: 6,
  },
  cardLabel: { color: theme.primaryMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  hotLabel: { color: '#f59e0b' },
  panLabel: { color: theme.primaryMuted },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: theme.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  cardHint: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
  hintDone: { color: '#86efac', fontWeight: '700' },
  cardFaint: { color: theme.textFaint, fontSize: 12, lineHeight: 18 },
  checklist: { gap: 6, marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkMark: { color: theme.textFaint, fontSize: 14, width: 16, textAlign: 'center' },
  checkMarkDone: { color: '#86efac' },
  checkName: { color: theme.textMuted, fontSize: 14, flex: 1 },
  checkNameDone: { color: theme.text, fontWeight: '600' },
  panRevealBox: {
    backgroundColor: theme.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 12,
    gap: 6,
  },
  panQuestion: { color: theme.text, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  finished: { color: '#86efac', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  primaryBtn: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  // White on the solid rose button — intentional, correct in both schemes.
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: { color: theme.text, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  footerHint: { color: theme.textFaint, fontSize: 13, textAlign: 'center' },
  error: { color: theme.error, fontSize: 14 },
})
