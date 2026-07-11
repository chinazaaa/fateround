import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  type Game,
  type NpatAnswer,
  type NpatCategory,
  type NpatMark,
  type Player,
  type Round,
} from '@fateround/shared'
import { batch5GameLabel } from '@fateround/shared/batch-5-games'
import {
  NPAT_CATEGORIES,
  NPAT_CATEGORY_LABELS,
  NPAT_CATEGORY_POINTS,
  NPAT_LETTER_PICK_SECONDS,
  NPAT_REVEAL_SECONDS,
  answerTotal,
  availableLettersForPick,
  clampNpatMarkingTimer,
  clampNpatTimer,
  collectUsedLetters,
  parseNpatMetadata,
  phaseDeadlineMs,
  playerDisplayName,
  reviewTargetForMarker,
  roundCallerPlayerId,
  tallyNpatScores,
  trimNpatAnswerFields,
  validateNpatAnswerFields,
} from '@fateround/shared/npat'
import { playerIsViewer } from '@fateround/shared/viewers'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { TimerBadge } from '@/components/ui/TimerBadge'
import { useDeadlineCountdown } from '@/hooks/useDeadlineCountdown'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { postNpatLetter, postNpatMark, postNpatSubmit } from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { NPAT_ANSWER_SELECT, NPAT_MARK_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
import { usePlayerSessionActions } from '@/lib/player-session'
import { scoreListLeaderboard } from '@/lib/finish-leaderboards'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { ViewerModeBanner } from '@/components/lifecycle/ViewerModeBanner'
import { ICallOnScoreboard } from '@/components/games/i_call_on/ICallOnScoreboard'
import { ICallOnGameTimerBar } from '@/components/games/i_call_on/ICallOnGameTimerBar'
import { ICallOnLiveLeaderboard } from '@/components/games/i_call_on/ICallOnLiveLeaderboard'
import { ICallOnRoundHeader } from '@/components/games/i_call_on/ICallOnRoundHeader'
import { isInCatalogue } from '@/components/games/i_call_on/npat-catalogue'
import { postNpatCallerApproveOverrides, postNpatDispute, postNpatDraft } from '@/components/games/i_call_on/npat-api'
import {
  defaultMarkValidityForAnswer,
  duplicateKeysByCategory,
  isForcedInvalidAnswer,
  isSingleLetterAnswer,
  markValidityFromRow,
  normalizeAnswer,
  suggestedHostReviewValidity,
} from '@/components/games/i_call_on/npat-helpers'

type Screen = 'loading' | 'join' | 'waiting' | 'playing' | 'finished' | 'not_found'

const EMPTY_FORM: Record<NpatCategory, string> = { name: '', animal: '', place: '', thing: '', food: '' }
const DEFAULT_FLAGS: Record<NpatCategory, boolean> = {
  name: true,
  animal: true,
  place: true,
  thing: true,
  food: true,
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

type CallerValidity = Record<string, Record<NpatCategory, boolean>>

export function ICallOnPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<NpatAnswer[]>([])
  const [marks, setMarks] = useState<NpatMark[]>([])
  const [form, setForm] = useState<Record<NpatCategory, string>>(EMPTY_FORM)
  const [validFlags, setValidFlags] = useState<Record<NpatCategory, boolean>>(DEFAULT_FLAGS)
  const [callerValidity, setCallerValidity] = useState<CallerValidity>({})
  const [acting, setActing] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const formRef = useRef(form)
  formRef.current = form
  const submittingRef = useRef(false)
  const autoSubmittedRoundRef = useRef<string | null>(null)
  const marksSeededRef = useRef<string | null>(null)
  const callerSeededRef = useRef<string | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydratedRoundRef = useRef<string | null>(null)

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
  const myAnswer = currentRound
    ? answers.find((a) => a.player_id === bootstrap.myPlayerId && a.round_id === currentRound.id)
    : undefined
  const reviewTargetId = metadata && bootstrap.myPlayerId ? reviewTargetForMarker(metadata, bootstrap.myPlayerId) : null
  const reviewTargetAnswer = reviewTargetId
    ? answers.find((a) => a.player_id === reviewTargetId && a.round_id === currentRound?.id)
    : undefined
  const myMark = currentRound
    ? marks.find((m) => m.marker_player_id === bootstrap.myPlayerId && m.round_id === currentRound.id)
    : undefined
  const availableLetters = availableLettersForPick(rounds)
  const usedLetters = collectUsedLetters(rounds)

  const me = useMemo(
    () => bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null,
    [bootstrap.players, bootstrap.myPlayerId]
  )
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))

  const liveScores = useMemo(() => tallyNpatScores(answers, bootstrap.players), [answers, bootstrap.players])
  const callerName = playerDisplayName(callerId, bootstrap.players)
  const callerIndex = useMemo(() => {
    const order = metadata?.caller_order
    if (!order || !callerId) return null
    const idx = order.indexOf(callerId)
    return idx >= 0 ? idx + 1 : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata?.caller_order, callerId])

  const roundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  const roundMarks = useMemo(
    () => (currentRound ? marks.filter((m) => m.round_id === currentRound.id) : []),
    [marks, currentRound]
  )

  // ---- per-phase countdown ---------------------------------------------------
  const writingTimer = clampNpatTimer(bootstrap.game?.timer_seconds)
  const markingTimer = clampNpatMarkingTimer(bootstrap.game?.operative_timer_seconds)
  const timedPhase = metadata?.phase === 'letter_pick' || metadata?.phase === 'writing' || metadata?.phase === 'marking'
  const phaseDelay =
    metadata?.phase === 'writing'
      ? writingTimer
      : metadata?.phase === 'marking'
        ? markingTimer
        : NPAT_LETTER_PICK_SECONDS
  const secondsLeft = useDeadlineCountdown(
    metadata?.phase_started_at ?? null,
    phaseDelay,
    !!(timedPhase && metadata?.phase_started_at)
  )
  const revealSecondsLeft = useDeadlineCountdown(
    currentRound?.ended_at ?? null,
    NPAT_REVEAL_SECONDS,
    metadata?.phase === 'reveal'
  )

  // ---- reset per-round local state ------------------------------------------
  useEffect(() => {
    setForm(EMPTY_FORM)
    setValidFlags(DEFAULT_FLAGS)
    setCallerValidity({})
    setSubmitError(null)
    autoSubmittedRoundRef.current = null
    marksSeededRef.current = null
    callerSeededRef.current = null
    hydratedRoundRef.current = null
    if (draftTimerRef.current != null) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
  }, [currentRound?.id])

  // ---- rehydrate the answer form from a saved (unsubmitted) draft -----------
  // If a player typed answers then refreshed/reconnected mid-write, the draft
  // upsert already persisted them to npat_answers; pull them back into the form.
  useEffect(() => {
    if (!currentRound || metadata?.phase !== 'writing' || isViewer) return
    if (hydratedRoundRef.current === currentRound.id) return
    hydratedRoundRef.current = currentRound.id
    if (!myAnswer || myAnswer.submitted_at) return
    setForm({
      name: myAnswer.name ?? '',
      animal: myAnswer.animal ?? '',
      place: myAnswer.place ?? '',
      thing: myAnswer.thing ?? '',
      food: myAnswer.food ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.id, metadata?.phase, myAnswer?.id, myAnswer?.submitted_at, isViewer])

  // ---- silent auto-submit when the writing timer expires --------------------
  const doSubmit = useCallback(
    async (values: Record<NpatCategory, string>, silent: boolean) => {
      if (isViewer || !currentRound || !bootstrap.myResumeToken || submittingRef.current) return
      submittingRef.current = true
      if (!silent) setActing(true)
      try {
        await postNpatSubmit(bootstrap.code, bootstrap.myResumeToken, currentRound.id, trimNpatAnswerFields(values))
        await bootstrap.load()
      } catch (err) {
        // Surface the reason on a manual submit so the button never looks dead;
        // silent auto-submit stays quiet (the guard will retry next tick).
        if (!silent) setSubmitError(err instanceof Error ? err.message : 'Failed to submit answers')
      } finally {
        submittingRef.current = false
        if (!silent) setActing(false)
      }
    },
    [currentRound, bootstrap, isViewer]
  )

  useEffect(() => {
    if (!currentRound || !metadata || metadata.phase !== 'writing' || myAnswer?.submitted_at) return
    if (!bootstrap.myResumeToken) return
    const deadline = phaseDeadlineMs(metadata, writingTimer, markingTimer)
    if (deadline == null) return
    const msLeft = Math.max(0, deadline - Date.now())
    const handle = setTimeout(() => {
      if (autoSubmittedRoundRef.current === currentRound.id) return
      autoSubmittedRoundRef.current = currentRound.id
      void doSubmit(formRef.current, true)
    }, msLeft)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentRound?.id,
    metadata?.phase,
    metadata?.phase_started_at,
    writingTimer,
    markingTimer,
    myAnswer?.submitted_at,
    bootstrap.myResumeToken,
  ])

  // ---- seed marking validity from suggested/stored marks --------------------
  useEffect(() => {
    if (!currentRound || !metadata || metadata.phase !== 'marking' || !reviewTargetAnswer) return
    const seedKey = `${currentRound.id}:${reviewTargetId ?? ''}`
    if (marksSeededRef.current === seedKey) return
    marksSeededRef.current = seedKey
    const dupes = duplicateKeysByCategory(roundAnswers)
    const letter = metadata.letter ?? null
    if (myMark?.marked_at) {
      setValidFlags(markValidityFromRow(myMark, reviewTargetAnswer, letter, dupes))
    } else {
      setValidFlags(defaultMarkValidityForAnswer(reviewTargetAnswer, letter, dupes))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.id, reviewTargetId, reviewTargetAnswer?.player_id, metadata?.phase, myMark?.marked_at])

  // ---- seed caller review board with suggested validity ---------------------
  useEffect(() => {
    if (!currentRound || !metadata || metadata.phase !== 'host_review' || !isCaller) return
    if (callerSeededRef.current === currentRound.id || roundAnswers.length === 0) return
    callerSeededRef.current = currentRound.id
    const seeded = suggestedHostReviewValidity(roundAnswers, roundMarks, metadata.letter ?? null)
    const map: CallerValidity = {}
    for (const [pid, flags] of Object.entries(seeded)) {
      map[pid] = Object.fromEntries(NPAT_CATEGORIES.map((c) => [c, flags[c] ?? false])) as Record<NpatCategory, boolean>
    }
    setCallerValidity(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRound?.id, metadata?.phase, isCaller, roundAnswers, roundMarks])

  const act = async (fn: () => Promise<unknown>) => {
    if (isViewer || !bootstrap.myResumeToken || acting) return
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

  // Debounced draft save: mirrors web's 1.5s autosave to /api/npat/draft so a
  // refresh/reconnect mid-write doesn't lose typed answers (rehydrated above).
  const queueDraftSave = () => {
    if (draftTimerRef.current != null) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null
      if (isViewer || !currentRound || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return
      if (!bootstrap.myResumeToken) return
      void postNpatDraft(
        bootstrap.code,
        bootstrap.myResumeToken,
        currentRound.id,
        trimNpatAnswerFields(formRef.current)
      ).catch(() => {
        /* draft is best-effort; a manual submit still persists everything */
      })
    }, 1500)
  }

  // Prevent typing a leading character that doesn't match the round letter, so
  // manual submit + auto-submit always send valid-letter answers.
  const updateField = (category: NpatCategory, value: string) => {
    const letter = metadata?.letter ?? null
    let changed = false
    setForm((prev) => {
      if (!value) {
        changed = prev[category] !== ''
        return { ...prev, [category]: '' }
      }
      const trimmed = value.trimStart()
      if (trimmed.length > 0 && letter && trimmed[0].toUpperCase() !== letter.toUpperCase()) return prev
      changed = prev[category] !== value
      return { ...prev, [category]: value }
    })
    if (submitError) setSubmitError(null)
    if (changed) queueDraftSave()
  }

  const submitAnswers = () => {
    if (!currentRound || !metadata?.letter) return
    const trimmed = trimNpatAnswerFields(form)
    const validationError = validateNpatAnswerFields(metadata.letter, trimmed)
    if (validationError) {
      setSubmitError(validationError)
      return
    }
    setSubmitError(null)
    void doSubmit(form, false)
  }

  const submitMarks = () => {
    if (!currentRound || !reviewTargetAnswer) return
    const dupes = duplicateKeysByCategory(roundAnswers)
    const letter = metadata?.letter ?? null
    const clamp = (category: NpatCategory): boolean => {
      const text = reviewTargetAnswer[category]
      const normalized = normalizeAnswer(text)
      const isDuplicate = normalized ? dupes[category].has(normalized) : false
      return isForcedInvalidAnswer(text, letter, isDuplicate) ? false : validFlags[category]
    }
    void act(() =>
      postNpatMark(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, {
        validName: clamp('name'),
        validAnimal: clamp('animal'),
        validPlace: clamp('place'),
        validThing: clamp('thing'),
        validFood: clamp('food'),
      })
    )
  }

  const setCallerValid = (targetId: string, category: NpatCategory, answerText: string, valid: boolean) => {
    const dupes = duplicateKeysByCategory(roundAnswers)
    const normalized = normalizeAnswer(answerText)
    const isDuplicate = normalized ? dupes[category].has(normalized) : false
    if (isForcedInvalidAnswer(answerText, metadata?.letter ?? null, isDuplicate)) return
    setCallerValidity((prev) => ({
      ...prev,
      [targetId]: { ...(prev[targetId] ?? DEFAULT_FLAGS), [category]: valid },
    }))
  }

  const approveRound = () => {
    if (!currentRound) return
    const overrides = Object.entries(callerValidity).map(([playerId, flags]) => ({
      playerId,
      validName: flags.name,
      validAnimal: flags.animal,
      validPlace: flags.place,
      validThing: flags.thing,
      validFood: flags.food,
    }))
    void act(() => postNpatCallerApproveOverrides(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, overrides))
  }

  const dispute = (targetId: string, category: NpatCategory) => {
    if (!currentRound) return
    void act(() => postNpatDispute(bootstrap.code, bootstrap.myResumeToken!, currentRound.id, targetId, category))
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
    const winnerId = top && top.score > 0 ? top.id : null
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winnerId ? `${top.name} wins!` : 'Game over'}
          subtitle="Final standings"
          detail={top ? `${top.name} — ${top.score} pts` : undefined}
          leaderboard={scoreListLeaderboard(scores)}
          winnerPlayerId={winnerId}
          roundKey={bootstrap.game?.session_started_at ?? null}
        />
      </GameShell>
    )
  }

  if (!currentRound || !metadata) {
    const upcoming = rounds.filter((r) => r.status === 'pending').sort((a, b) => a.round_number - b.round_number)[0]
    const upNextName = upcoming ? playerDisplayName(upcoming.submitter_player_id, bootstrap.players) : null
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={bootstrap.code}>
        <View style={styles.waitCard}>
          <Text style={styles.waitEmoji}>⏳</Text>
          <Text style={styles.waitTitle}>Next letter coming up…</Text>
          {upNextName ? <Text style={styles.waiting}>Up next: {upNextName} calls the letter</Text> : null}
        </View>
      </GameShell>
    )
  }

  const scoreboard = (
    showScores: boolean,
    maskAnswers: boolean,
    opts?: {
      hostReview?: boolean
      showDisputeButtons?: boolean
    }
  ) => (
    <ICallOnScoreboard
      letter={metadata.letter}
      players={bootstrap.players}
      answers={roundAnswers}
      marks={roundMarks}
      metadata={metadata}
      showScores={showScores}
      maskAnswers={maskAnswers}
      myPlayerId={bootstrap.myPlayerId}
      hostReview={opts?.hostReview}
      hostOverrides={opts?.hostReview ? callerValidity : undefined}
      onSetValid={opts?.hostReview ? setCallerValid : undefined}
      disputes={metadata.disputes}
      showDisputeButtons={opts?.showDisputeButtons}
      onDispute={opts?.showDisputeButtons ? dispute : undefined}
    />
  )

  const phaseTimer =
    timedPhase && metadata.phase_started_at ? (
      <View style={styles.timerWrap}>
        <TimerBadge seconds={secondsLeft} urgentAt={10} />
        <Text style={styles.timerLabel}>{secondsLeft}s left</Text>
      </View>
    ) : null

  const gameTimerBar = <ICallOnGameTimerBar game={bootstrap.game} />
  const viewerBanner =
    bootstrap.myPlayerId && me ? (
      <ViewerModeBanner
        gameCode={bootstrap.code}
        playerId={bootstrap.myPlayerId}
        game={bootstrap.game}
        player={me}
        players={bootstrap.players}
        onPromoted={() => void bootstrap.load()}
      />
    ) : null
  const roundHeaderCard = (
    <ICallOnRoundHeader
      roundNumber={currentRound.round_number}
      letter={metadata.letter}
      lettersLeft={availableLetters.length}
      callerName={callerName}
      callerIndex={callerIndex}
      callerCount={metadata.caller_order?.length ?? 0}
      secondsLeft={secondsLeft}
      showSeconds={false}
      revealSecondsLeft={revealSecondsLeft}
      showReveal={false}
    />
  )
  const liveLeaderboard = <ICallOnLiveLeaderboard rows={liveScores} myPlayerId={bootstrap.myPlayerId} />

  if (metadata.phase === 'letter_pick') {
    return (
      <GameShell
        bootstrap={bootstrap}
        title={batch5GameLabel('i_call_on')}
        subtitle={`Round ${currentRound.round_number}`}
      >
        <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
          {gameTimerBar}
          {viewerBanner}
          {roundHeaderCard}
          {phaseTimer}
          {isCaller && !isViewer ? (
            <>
              <Text style={styles.section}>Pick a letter</Text>
              <Text style={styles.letterMeta}>
                {availableLetters.length} letter{availableLetters.length === 1 ? '' : 's'} still available
                {usedLetters.length > 0 ? ` · ${usedLetters.join(', ')} already used` : ''}
              </Text>
              <View style={styles.letterGrid}>
                {ALPHABET.map((letter) => {
                  const used = !availableLetters.includes(letter)
                  return (
                    <Pressable
                      key={letter}
                      style={[styles.letterBtn, used && styles.letterBtnUsed]}
                      disabled={acting || used}
                      onPress={() => pickLetter(letter)}
                    >
                      <Text style={[styles.letterText, used && styles.letterTextUsed]}>{letter}</Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          ) : (
            <Text style={styles.waiting}>Waiting for the caller to pick a letter…</Text>
          )}
          {liveLeaderboard}
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }

  if (metadata.phase === 'writing') {
    return (
      <GameShell
        bootstrap={bootstrap}
        title={batch5GameLabel('i_call_on')}
        subtitle={`Letter ${metadata.letter ?? '?'}`}
      >
        <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
          {gameTimerBar}
          {viewerBanner}
          {roundHeaderCard}
          {phaseTimer}
          {isViewer ? (
            <Text style={styles.locked}>Players are filling in their answers…</Text>
          ) : myAnswer?.submitted_at ? (
            <Text style={styles.locked}>Answers submitted — waiting for marking…</Text>
          ) : (
            <>
              {NPAT_CATEGORIES.map((category) => (
                <View key={category} style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>{NPAT_CATEGORY_LABELS[category]}</Text>
                  <TextInput
                    style={styles.input}
                    value={form[category]}
                    onChangeText={(text) => updateField(category, text)}
                    placeholder={`${NPAT_CATEGORY_LABELS[category]} starting with ${metadata.letter}`}
                    placeholderTextColor={theme.textFaint}
                  />
                </View>
              ))}
              <Pressable style={styles.primaryBtn} disabled={acting} onPress={submitAnswers}>
                <Text style={styles.primaryText}>Submit answers</Text>
              </Pressable>
              {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
              {secondsLeft <= 10 ? (
                <Text style={styles.autoSendHint}>Unsubmitted answers are sent automatically when time runs out.</Text>
              ) : null}
            </>
          )}
          {scoreboard(false, true)}
          {liveLeaderboard}
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }

  if (metadata.phase === 'marking') {
    const targetName = playerDisplayName(reviewTargetId, bootstrap.players)
    const dupes = duplicateKeysByCategory(roundAnswers)
    const letter = metadata.letter ?? null
    return (
      <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={`Mark ${targetName}'s answers`}>
        <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
          {gameTimerBar}
          {viewerBanner}
          {roundHeaderCard}
          {phaseTimer}
          {!reviewTargetAnswer ? (
            <Text style={styles.waiting}>Waiting for assignment…</Text>
          ) : myMark?.marked_at ? (
            <Text style={styles.locked}>Marks submitted — everyone can see them below.</Text>
          ) : (
            <>
              <Text style={styles.markHint}>
                Tap Valid or Invalid for each category. Wrong-category answers are invalid. Empty, wrong-letter,
                single-letter, and duplicate answers are locked automatically.
              </Text>
              {NPAT_CATEGORIES.map((category) => {
                const text = reviewTargetAnswer[category] || ''
                const normalized = normalizeAnswer(text)
                const isDuplicate = normalized ? dupes[category].has(normalized) : false
                const forcedInvalid = isForcedInvalidAnswer(text, letter, isDuplicate)
                const displayValid = forcedInvalid ? false : validFlags[category]
                const forcedReason = !text.trim()
                  ? 'Empty — invalid automatically'
                  : isDuplicate
                    ? 'Duplicate — 5 pts each'
                    : isSingleLetterAnswer(text)
                      ? 'Single letter — invalid automatically'
                      : `Must start with ${letter ?? '?'}`
                return (
                  <View key={category} style={styles.markCard}>
                    <Text style={styles.fieldLabel}>{NPAT_CATEGORY_LABELS[category]}</Text>
                    <Text style={styles.markAnswer}>{text || '—'}</Text>
                    {!forcedInvalid && text.trim() ? (
                      isInCatalogue(category, text) ? (
                        <Text style={styles.hintKnown}>📚 Known answer</Text>
                      ) : (
                        <Text style={styles.hintUnknown}>⚠️ Not in catalogue — use your judgement</Text>
                      )
                    ) : null}
                    {forcedInvalid ? <Text style={styles.hintForced}>{forcedReason}</Text> : null}
                    <View style={styles.markBtnRow}>
                      <Pressable
                        style={[styles.markBtn, displayValid && styles.markBtnValid]}
                        disabled={forcedInvalid || acting}
                        onPress={() => setValidFlags((prev) => ({ ...prev, [category]: true }))}
                      >
                        <Text style={[styles.markBtnText, displayValid && styles.markBtnTextValid]}>Valid (+10)</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.markBtn, !displayValid && styles.markBtnInvalid]}
                        disabled={forcedInvalid || acting}
                        onPress={() => setValidFlags((prev) => ({ ...prev, [category]: false }))}
                      >
                        <Text style={[styles.markBtnText, !displayValid && styles.markBtnTextInvalid]}>
                          Invalid (0)
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )
              })}
              <Pressable style={styles.primaryBtn} disabled={acting} onPress={submitMarks}>
                <Text style={styles.primaryText}>Lock in marks</Text>
              </Pressable>
            </>
          )}
          {scoreboard(false, false)}
          {liveLeaderboard}
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }

  if (metadata.phase === 'host_review') {
    return (
      <GameShell
        bootstrap={bootstrap}
        title={batch5GameLabel('i_call_on')}
        subtitle={`Letter ${metadata.letter ?? '?'}`}
      >
        <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
          {gameTimerBar}
          {viewerBanner}
          {roundHeaderCard}
          {isCaller && !isViewer ? (
            <>
              <View style={styles.reviewCard}>
                <Text style={styles.section}>Your approval</Text>
                <Text style={styles.reviewCopy}>
                  You called letter {metadata.letter ?? '?'} — review everyone&apos;s answers before scores reveal.
                  Empty, wrong-letter, single-letter, and duplicate answers are invalid automatically. Answers flagged ⚑
                  by other players are highlighted — toggle anything you disagree with, then approve.
                </Text>
                <Pressable style={styles.primaryBtn} disabled={acting} onPress={approveRound}>
                  <Text style={styles.primaryText}>Approve &amp; reveal scores</Text>
                </Pressable>
              </View>
              {scoreboard(false, false, { hostReview: true })}
            </>
          ) : (
            <>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewEmoji}>👀</Text>
                <Text style={styles.section}>Waiting for {callerName}&apos;s approval</Text>
                <Text style={styles.reviewCopy}>
                  Only the caller for letter {metadata.letter ?? '?'} can approve this round. Tap ⚑ Dispute on any
                  answer below you think is invalid — {callerName} will see your flags.
                </Text>
              </View>
              {scoreboard(false, false, { showDisputeButtons: !isViewer })}
            </>
          )}
          {liveLeaderboard}
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }

  // reveal
  const myRoundTotal = myAnswer && myAnswer.score_name != null ? answerTotal(myAnswer) : null
  return (
    <GameShell bootstrap={bootstrap} title={batch5GameLabel('i_call_on')} subtitle={`Letter ${metadata.letter ?? '?'}`}>
      <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
        {gameTimerBar}
        {viewerBanner}
        <View style={styles.revealHead}>
          <Text style={styles.revealTitle}>Round {currentRound.round_number} scores</Text>
          {currentRound.ended_at ? (
            <Text style={styles.revealCountdown}>Next letter in {revealSecondsLeft}s…</Text>
          ) : (
            <Text style={styles.revealCountdown}>Next letter coming up…</Text>
          )}
        </View>
        {myRoundTotal != null && !isViewer ? (
          <View style={styles.scoredCard}>
            <Text style={styles.scoredText}>You scored {myRoundTotal} pts this round</Text>
          </View>
        ) : null}
        {scoreboard(true, false)}
        {liveLeaderboard}
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    waiting: { color: theme.textMuted, fontSize: 16, textAlign: 'center', marginTop: 8 },
    waitCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: 'center',
      gap: 8,
      marginTop: 16,
    },
    waitEmoji: { fontSize: 30 },
    waitTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
    section: { color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
    letterMeta: { color: theme.textMuted, fontSize: 12, marginBottom: 4 },
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
    letterBtnUsed: { opacity: 0.4, backgroundColor: theme.bg },
    letterText: { color: theme.text, fontSize: 18, fontWeight: '700' },
    letterTextUsed: { color: theme.textFaint, textDecorationLine: 'line-through' },
    submitError: { color: theme.error, fontSize: 13, textAlign: 'center', marginTop: 6 },
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
    timerWrap: { alignItems: 'center', gap: 4, marginBottom: 4 },
    timerLabel: { color: theme.textMuted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
    autoSendHint: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 6 },
    markHint: { color: theme.textFaint, fontSize: 12, lineHeight: 17 },
    markCard: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 6,
    },
    markAnswer: { color: theme.text, fontSize: 16, fontWeight: '600' },
    hintKnown: { color: theme.success, fontSize: 12, fontWeight: '700' },
    hintUnknown: { color: '#f97316', fontSize: 12, fontWeight: '700' },
    hintForced: { color: '#d97706', fontSize: 12, fontWeight: '700' },
    markBtnRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
    markBtn: {
      flex: 1,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      alignItems: 'center',
    },
    markBtnValid: { borderColor: '#059669', backgroundColor: 'rgba(5,150,105,0.15)' },
    markBtnInvalid: { borderColor: '#d97706', backgroundColor: 'rgba(217,119,6,0.15)' },
    markBtnText: { fontSize: 13, fontWeight: '800', color: theme.textMuted },
    markBtnTextValid: { color: '#059669' },
    markBtnTextInvalid: { color: '#d97706' },
    reviewCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 6,
    },
    reviewEmoji: { fontSize: 26, textAlign: 'center' },
    reviewCopy: { color: theme.textMuted, fontSize: 13, lineHeight: 19 },
    revealHead: { alignItems: 'center', gap: 4 },
    revealTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
    revealCountdown: { color: theme.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
    scoredCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      alignItems: 'center',
    },
    scoredText: { color: theme.text, fontSize: 16, fontWeight: '700' },
  })
