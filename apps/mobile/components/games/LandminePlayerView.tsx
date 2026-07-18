import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { type Game, type LandmineAnswer, type LandmineMark, type Player, type Round } from '@fateround/shared'
import {
  clampLandmineCategoryTimer,
  clampLandmineMarkingTimer,
  clampLandmineWritingTimer,
  gameLandmineMode,
  gameLandmineMineSource,
  isLandmineRoundParticipant,
  landmineCycleInfo,
  landmineModeLabel,
  landmineOutcomeLabel,
  normalizeAnswer,
  parseLandmineMetadata,
  phaseSecondsLeft,
  playerDisplayName,
  revealCountdownSeconds,
  reviewTargetForMarker,
  roundCallerPlayerId,
  tallyLandmineScores,
  LANDMINE_MAX_ANSWER_LENGTH,
} from '@fateround/shared/landmine'
import { playerIsViewer, preJoinScreen } from '@fateround/shared/viewers'
import { LateJoinChoiceScreen } from '@/components/lifecycle/LateJoinChoiceScreen'
import { GameEndedScreen } from '@/components/lifecycle/GameEndedScreen'
import { GameStartedWaitingScreen } from '@/components/lifecycle/GameStartedWaitingScreen'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { JoinScreen } from '@/components/JoinScreen'
import { LobbyView } from '@/components/LobbyView'
import { CountdownTimerBadge } from '@/components/party/CountdownTimerBadge'
import { useStickyTimer } from '@/components/session/StickyTimerContext'
import { GameLoading, GameNotFound, GameShell } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useAdvancePolling } from '@/hooks/useAdvancePolling'
import {
  fetchLandmineCategories,
  postLandmineCategory,
  postLandmineDraft,
  postLandmineMark,
  postLandmineSetterMark,
  postLandmineSetup,
  postLandmineSubmit,
} from '@/lib/game-api'
import { getSupabase } from '@/lib/supabase'
import { LANDMINE_ANSWER_SELECT, LANDMINE_MARK_SELECT, ROUND_SELECT } from '@/lib/supabase-selects'
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

type CategoryOption = { id: string; name: string; entryCount: number }

export function LandminePlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<LandmineAnswer[]>([])
  const [marks, setMarks] = useState<LandmineMark[]>([])
  const [answerText, setAnswerText] = useState('')
  const [categories, setCategories] = useState<CategoryOption[]>([])
  // Manual mode: the setter types the category + mine word(s) themselves.
  const [setupCategory, setSetupCategory] = useState('')
  const [setupMines, setSetupMines] = useState<string[]>([''])
  const [acting, setActing] = useState(false)
  const [tick, setTick] = useState(0)
  // Optimistic lock-in — flip to the locked view the instant the POST succeeds instead of
  // waiting on a full reload (that reload latency is what felt slow on a poor connection).
  const [lockedAnswerRound, setLockedAnswerRound] = useState<string | null>(null)
  const [lockedAnswerText, setLockedAnswerText] = useState('')
  const [lockedMarkRound, setLockedMarkRound] = useState<string | null>(null)
  // Manual mode: the setter's per-answer Valid/Void toggles + a lock once they approve the round.
  const [setterVerdicts, setSetterVerdicts] = useState<Record<string, boolean>>({})
  const [lockedSetterRound, setLockedSetterRound] = useState<string | null>(null)

  const answerRef = useRef('')
  answerRef.current = answerText
  const submittingRef = useRef(false)
  const autoSubmittedRoundRef = useRef<string | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hydratedRoundRef = useRef<string | null>(null)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: null; ok: boolean }> => {
      const code = gameCode.toUpperCase()
      const [rdsRes, ansRes, marksRes] = await Promise.all([
        getSupabase().from('rounds').select(ROUND_SELECT).eq('game_id', code).order('round_number'),
        getSupabase().from('landmine_answers').select(LANDMINE_ANSWER_SELECT).eq('game_id', code),
        getSupabase().from('landmine_marks').select(LANDMINE_MARK_SELECT).eq('game_id', code),
      ])
      if (rdsRes.error || ansRes.error || marksRes.error) return { state: null, ok: false }
      setRounds((rdsRes.data as Round[]) ?? [])
      setAnswers((ansRes.data as LandmineAnswer[]) ?? [])
      setMarks((marksRes.data as LandmineMark[]) ?? [])
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
  const lateJoin = useLateJoinContext(gameCode, bootstrap.game, bootstrap.screen === 'late_join_choice')

  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'rounds', 'landmine_answers', 'landmine_marks'],
    () => bootstrap.load(),
    !!bootstrap.game
  )

  useAdvancePolling({
    endpoint: '/api/landmine/advance',
    gameCode,
    game: bootstrap.game,
    enabled: !!bootstrap.game,
    onAdvanced: () => bootstrap.load(),
  })

  const currentRound = useMemo(() => {
    if (!bootstrap.game) return null
    const byPointer = rounds.find((r) => r.round_number === bootstrap.game!.current_round_number) ?? null
    const active = rounds.find((r) => r.status === 'active') ?? null
    return active ?? byPointer
  }, [bootstrap.game, rounds])

  const metadata = currentRound ? parseLandmineMetadata(currentRound.landmine_metadata) : null
  const callerId = currentRound ? roundCallerPlayerId(currentRound, metadata) : null
  const isCaller = callerId === bootstrap.myPlayerId
  const myAnswer = currentRound
    ? answers.find(
        (a) => a.player_id === bootstrap.myPlayerId && a.round_id === currentRound.id && a.outcome !== 'setter'
      )
    : undefined
  const reviewTargetId = metadata && bootstrap.myPlayerId ? reviewTargetForMarker(metadata, bootstrap.myPlayerId) : null
  const reviewTargetAnswer = reviewTargetId
    ? answers.find((a) => a.player_id === reviewTargetId && a.round_id === currentRound?.id)
    : undefined
  const myMark = currentRound
    ? marks.find((m) => m.marker_player_id === bootstrap.myPlayerId && m.round_id === currentRound.id)
    : undefined

  const me = useMemo(
    () => bootstrap.players.find((p) => p.id === bootstrap.myPlayerId) ?? null,
    [bootstrap.players, bootstrap.myPlayerId]
  )
  const isViewer = !!(bootstrap.game && me && playerIsViewer(me, bootstrap.game))
  const callerName = playerDisplayName(callerId, bootstrap.players)
  const mode = bootstrap.game ? gameLandmineMode(bootstrap.game) : 'zero_points'
  const manual = bootstrap.game ? gameLandmineMineSource(bootstrap.game) === 'manual' : false
  // In manual mode the caller is the "setter": they plant the mine and sit out the round.
  const isSetter = manual && isCaller && !isViewer
  const mineCount = Math.min(3, Math.max(1, metadata?.mine_count ?? 1))
  // A viewer, or a player who joined after this round began, isn't in the round's answer/mark
  // ring — no answer to write, nobody assigned to mark. Show them a watch card instead of a
  // writing/marking UI they can't act on (the empty "mark this" that looked frozen mid-round).
  const spectatingRound = isViewer || !isLandmineRoundParticipant(metadata, bootstrap.myPlayerId)

  const roundAnswers = useMemo(
    () => (currentRound ? answers.filter((a) => a.round_id === currentRound.id) : []),
    [answers, currentRound]
  )
  // The setter's mirror-payout row (outcome 'setter') isn't a real answer — keep it out of the
  // answer boards (it still counts in the leaderboard, which reads all `answers`).
  const playerAnswers = useMemo(() => roundAnswers.filter((a) => a.outcome !== 'setter'), [roundAnswers])

  const writingTimer = clampLandmineWritingTimer(bootstrap.game?.timer_seconds)
  const markingTimer = clampLandmineMarkingTimer(bootstrap.game?.operative_timer_seconds)
  const categoryTimer = clampLandmineCategoryTimer(bootstrap.game?.game_duration_seconds)
  const secondsLeft = useMemo(() => {
    void tick
    return metadata ? phaseSecondsLeft(metadata, writingTimer, markingTimer, categoryTimer) : null
  }, [metadata, tick, writingTimer, markingTimer, categoryTimer])

  // Pin the phase countdown to the session shell (below the header) like the other games, so it
  // stays visible while the answer/marking board scrolls. Each phase anchors to its own start +
  // per-phase length; reveal has no countdown. Falls back to the subtitle timer when not pinned.
  const phaseDelay =
    metadata?.phase === 'writing' ? writingTimer : metadata?.phase === 'marking' ? markingTimer : categoryTimer
  const timerActive = !!metadata && metadata.phase !== 'reveal' && bootstrap.game?.status === 'active'
  const stickyTimerNode = timerActive ? (
    <CountdownTimerBadge anchorTime={metadata?.phase_started_at} delaySeconds={phaseDelay} active={timerActive} />
  ) : null
  const timerPinned = useStickyTimer(stickyTimerNode, [
    metadata?.phase,
    metadata?.phase_started_at,
    phaseDelay,
    timerActive,
  ])

  // Tick through every phase INCLUDING reveal so the "next round in Xs" countdown updates.
  useEffect(() => {
    if (!metadata) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [metadata?.phase, currentRound?.id])

  // Safety reload while the game is active. Landmine is phase-based, so a single dropped realtime
  // event would leave this client on the old phase until the next event (that's what made the
  // marking screen appear late). A slow always-on reload self-heals a miss within ~10s. (Timers
  // are suspended in the background; the bootstrap's app-foreground handler covers resume.)
  useEffect(() => {
    if (bootstrap.game?.status !== 'active') return
    const id = setInterval(() => void bootstrap.load(), 10_000)
    return () => clearInterval(id)
  }, [bootstrap.game?.status, bootstrap.load])

  useEffect(() => {
    setAnswerText('')
    setSetupCategory('')
    setSetupMines([''])
    setLockedAnswerRound(null)
    setLockedAnswerText('')
    setLockedMarkRound(null)
    setSetterVerdicts({})
    setLockedSetterRound(null)
    autoSubmittedRoundRef.current = null
    hydratedRoundRef.current = null
    if (draftTimerRef.current != null) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
  }, [currentRound?.id])

  useEffect(() => {
    if (!currentRound || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return
    if (hydratedRoundRef.current === currentRound.id) return
    hydratedRoundRef.current = currentRound.id
    if (myAnswer?.answer) setAnswerText(myAnswer.answer)
  }, [currentRound?.id, metadata?.phase, myAnswer?.submitted_at, myAnswer?.answer])

  // Prefetch categories for EVERY player as soon as the game is active, so they're ready before
  // this player becomes the caller — a cold fetch gated on becoming caller could outlast the
  // (5–10s) pick timer and auto-pick before any options showed. A failure surfaces a Retry.
  const [categoryError, setCategoryError] = useState(false)
  const [categoryLoad, setCategoryLoad] = useState(0)
  useEffect(() => {
    // Manual mode doesn't use the admin category list — the setter types their own.
    if (bootstrap.game?.status !== 'active' || isViewer || manual) return
    let cancelled = false
    setCategoryError(false)
    void fetchLandmineCategories()
      .then((data) => {
        if (!cancelled) setCategories(data.categories)
      })
      .catch(() => {
        if (!cancelled) setCategoryError(true)
      })
    return () => {
      cancelled = true
    }
  }, [bootstrap.game?.status, isViewer, categoryLoad, manual])

  const act = useCallback(async (fn: () => Promise<unknown>) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setActing(true)
    try {
      await fn()
      await bootstrap.load()
    } catch {
      // errors surface via reload / no-op
    } finally {
      submittingRef.current = false
      setActing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const token = bootstrap.myResumeToken
  const roundId = currentRound?.id

  const queueDraft = () => {
    if (draftTimerRef.current != null) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => {
      draftTimerRef.current = null
      if (!token || !roundId || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return
      void postLandmineDraft(gameCode, token, roundId, answerRef.current).catch(() => {})
    }, 1500)
  }

  const pickCategory = (categoryId: string) => {
    if (!token || !roundId) return
    void act(() => postLandmineCategory(gameCode, token, roundId, categoryId))
  }

  const cancelDraft = () => {
    if (draftTimerRef.current != null) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
  }

  // Run an action, then flip the optimistic lock the instant the POST resolves and reconcile
  // with a BACKGROUND reload (realtime also pushes) — so the button/screen don't wait on a
  // full state refetch over a slow connection.
  const runOptimistic = (rid: string, post: () => Promise<unknown>, onLocked: () => void) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setActing(true)
    void (async () => {
      try {
        await post()
        onLocked()
        void bootstrap.load()
      } catch {
        // errors reconcile via realtime / next reload
      } finally {
        submittingRef.current = false
        setActing(false)
      }
    })()
  }

  const submitAnswer = (value: string) => {
    if (!token || !roundId || !value.trim()) return
    cancelDraft() // don't let a queued draft fire after submit
    const rid = roundId
    const text = value.trim()
    runOptimistic(
      rid,
      () => postLandmineSubmit(gameCode, token, rid, text),
      () => {
        setLockedAnswerRound(rid)
        setLockedAnswerText(text)
      }
    )
  }

  const submitMark = (valid: boolean) => {
    if (!token || !roundId) return
    const rid = roundId
    runOptimistic(
      rid,
      () => postLandmineMark(gameCode, token, rid, valid),
      () => setLockedMarkRound(rid)
    )
  }

  // Manual mode: the setter approves every answer at once (I Call On's caller-approve).
  const submitSetterMarks = (verdicts: { playerId: string; valid: boolean }[]) => {
    if (!token || !roundId) return
    const rid = roundId
    runOptimistic(
      rid,
      () => postLandmineSetterMark(gameCode, token, rid, verdicts),
      () => setLockedSetterRound(rid)
    )
  }

  // Auto-submit at the writing deadline. The setter sits out, so they never auto-submit.
  useEffect(() => {
    // spectatingRound covers viewers AND mid-round joiners — neither is in this round's ring.
    if (!currentRound || spectatingRound || isSetter || metadata?.phase !== 'writing' || myAnswer?.submitted_at) return
    if (!metadata.phase_started_at) return
    const deadline = new Date(metadata.phase_started_at).getTime() + writingTimer * 1000
    const msLeft = Math.max(0, deadline - Date.now())
    const handle = setTimeout(() => {
      if (autoSubmittedRoundRef.current === currentRound.id) return
      autoSubmittedRoundRef.current = currentRound.id
      cancelDraft()
      if (token && roundId)
        void postLandmineSubmit(gameCode, token, roundId, answerRef.current.trim()).then(() => bootstrap.load())
    }, msLeft)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentRound?.id,
    metadata?.phase,
    metadata?.phase_started_at,
    writingTimer,
    myAnswer?.submitted_at,
    spectatingRound,
    isSetter,
  ])

  const submitSetup = () => {
    if (!token || !roundId) return
    const category = setupCategory.trim()
    const mines = setupMines.map((m) => m.trim()).filter(Boolean)
    if (!category || mines.length === 0) return
    void act(() => postLandmineSetup(gameCode, token, roundId, category, mines))
  }

  // ── Lifecycle screens ─────────────────────────────────────────────────────────
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
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const scores = tallyLandmineScores(answers, bootstrap.players)
    const winner = scores.find((s) => !s.eliminated) ?? scores[0]
    const winnerId = winner && (mode === 'elimination' || winner.score > 0) ? winner.id : null
    return (
      <GameShell bootstrap={bootstrap} title="Landmine" subtitle={bootstrap.code}>
        <GameFinishPanel
          bootstrap={bootstrap}
          title={winner ? `${winner.name} wins!` : 'Game over'}
          subtitle={`Final standings · ${landmineModeLabel(mode)}`}
          detail={winner ? `${winner.name} — ${winner.score} pts` : undefined}
          leaderboard={scoreListLeaderboard(
            scores.map((s) => ({ id: s.id, name: s.eliminated ? `${s.name} 💥` : s.name, score: s.score }))
          )}
          winnerPlayerId={winnerId}
          roundKey={bootstrap.game?.session_started_at ?? null}
        />
      </GameShell>
    )
  }

  if (!currentRound || !metadata) {
    return (
      <GameShell bootstrap={bootstrap} title="Landmine" subtitle={bootstrap.code}>
        <View style={styles.waitCard}>
          <Text style={styles.waitEmoji}>⏳</Text>
          <Text style={styles.waitTitle}>Next round coming up…</Text>
        </View>
      </GameShell>
    )
  }

  // Pinned to the shell when available; the subtitle text is the not-pinned fallback.
  const timer = !timerPinned && secondsLeft != null && metadata.phase !== 'reveal' ? `${secondsLeft}s` : undefined
  const subtitle = metadata.category ? `Category: ${metadata.category}` : landmineModeLabel(mode)
  // Manual mode counts a "round" as one full cycle (every player sets once); show that cycle instead
  // of the raw setter-turn so it reads like Describe It ("Round 1/3") not "Round 15".
  const manualCycle = manual ? landmineCycleInfo(currentRound.round_number, metadata.caller_order.length || 1) : null
  const roundLabel = manualCycle
    ? `Round ${manualCycle.round}/${Math.max(1, bootstrap.game?.rounds_count ?? 1)}`
    : `Round ${currentRound.round_number}`

  // ── Category pick / manual setup ───────────────────────────────────────────────
  if (metadata.phase === 'category_pick') {
    // Manual mode: the setter types the category + mine word(s) themselves.
    if (manual && isSetter) {
      return (
        <GameShell
          bootstrap={bootstrap}
          title="Landmine"
          subtitle={timer ? `Set up · ${timer}` : landmineModeLabel(mode)}
        >
          <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
            <Text style={styles.section}>You’re the setter — plant the mine</Text>
            <Text style={styles.meta}>
              Pick a category, then set the secret mine{mineCount > 1 ? 's' : ''}. You sit this round out and score
              whatever the room scores.
            </Text>
            <TextInput
              style={styles.input}
              value={setupCategory}
              onChangeText={setSetupCategory}
              placeholder="Category (e.g. Countries in North America)"
              placeholderTextColor={theme.textFaint}
              maxLength={80}
            />
            {Array.from({ length: mineCount }).map((_, i) => (
              <TextInput
                key={i}
                style={styles.input}
                value={setupMines[i] ?? ''}
                onChangeText={(t) =>
                  setSetupMines((prev) => {
                    const next = [...prev]
                    while (next.length < mineCount) next.push('')
                    next[i] = t
                    return next
                  })
                }
                placeholder={mineCount > 1 ? `Mine ${i + 1}` : 'The mine word'}
                placeholderTextColor={theme.textFaint}
                maxLength={LANDMINE_MAX_ANSWER_LENGTH}
              />
            ))}
            <Text style={styles.meta}>
              Anyone who types {mineCount > 1 ? 'one of these' : 'this'} scores 0. Keep it tempting but dodgeable.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              disabled={acting || !setupCategory.trim() || setupMines.every((m) => !m.trim())}
              onPress={submitSetup}
            >
              <Text style={styles.primaryText}>Start the round</Text>
            </Pressable>
          </KeyboardAwareGameScroll>
        </GameShell>
      )
    }
    return (
      <GameShell bootstrap={bootstrap} title="Landmine" subtitle={landmineModeLabel(mode)}>
        <View style={styles.form}>
          {!manual && isCaller && !isViewer ? (
            <>
              <Text style={styles.section}>Pick a category</Text>
              <Text style={styles.meta}>A mine will be planted secretly.</Text>
              {categories.map((c) => (
                <Pressable key={c.id} style={styles.choiceBtn} disabled={acting} onPress={() => pickCategory(c.id)}>
                  <Text style={styles.choiceText}>{c.name}</Text>
                </Pressable>
              ))}
              {categories.length === 0 &&
                (categoryError ? (
                  <Pressable style={styles.choiceBtn} onPress={() => setCategoryLoad((n) => n + 1)}>
                    <Text style={styles.choiceText}>Couldn’t load categories — tap to retry</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.meta}>Loading categories…</Text>
                ))}
            </>
          ) : (
            <View style={styles.waitCard}>
              <Text style={styles.waitEmoji}>🎯</Text>
              <Text style={styles.waitTitle}>
                {callerName} is {manual ? 'setting the category & mine' : 'picking a category'}…
              </Text>
            </View>
          )}
        </View>
      </GameShell>
    )
  }

  // ── Writing ─────────────────────────────────────────────────────────────────
  if (metadata.phase === 'writing') {
    const locked = !!myAnswer?.submitted_at || lockedAnswerRound === currentRound.id
    return (
      <GameShell bootstrap={bootstrap} title="Landmine" subtitle={timer ? `${subtitle} · ${timer}` : subtitle}>
        <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
          <Text style={styles.section}>{metadata.category}</Text>
          {isSetter ? (
            <View style={styles.waitCard}>
              <Text style={styles.waitEmoji}>🕵️</Text>
              <Text style={styles.waitTitle}>You set this round — sit back</Text>
              <Text style={styles.meta}>You’ll score the total everyone else earns.</Text>
            </View>
          ) : locked || spectatingRound ? (
            <View style={styles.waitCard}>
              <Text style={styles.waitEmoji}>{locked ? '🔒' : '👀'}</Text>
              <Text style={styles.waitTitle}>
                {locked ? 'Answer locked in' : isViewer ? 'Watching' : 'You joined mid-round'}
              </Text>
              {locked ? (
                <Text style={styles.meta}>“{myAnswer?.answer || lockedAnswerText}”</Text>
              ) : !isViewer ? (
                <Text style={styles.meta}>You’ll play from the next round.</Text>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={styles.meta}>Type one answer — dodge the hidden mine.</Text>
              <TextInput
                style={styles.input}
                value={answerText}
                onChangeText={(t) => {
                  setAnswerText(t)
                  queueDraft()
                }}
                placeholder="Your answer"
                placeholderTextColor={theme.textFaint}
                maxLength={LANDMINE_MAX_ANSWER_LENGTH}
                onSubmitEditing={() => submitAnswer(answerText)}
              />
              <Pressable
                style={styles.primaryBtn}
                disabled={acting || !answerText.trim()}
                onPress={() => submitAnswer(answerText)}
              >
                <Text style={styles.primaryText}>Lock in</Text>
              </Pressable>
            </>
          )}
          <Text style={styles.meta}>{playerAnswers.filter((a) => a.submitted_at).length} locked in</Text>
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }

  // ── Marking ─────────────────────────────────────────────────────────────────
  if (metadata.phase === 'marking') {
    const marked = !!myMark?.marked_at || lockedMarkRound === currentRound.id

    // Manual mode: the setter judges every answer; answering players & spectators wait it out.
    if (manual) {
      if (isSetter) {
        const approved = lockedSetterRound === currentRound.id
        const verdictFor = (id: string) =>
          setterVerdicts[id] ??
          marks.find((mk) => mk.round_id === currentRound.id && mk.target_player_id === id)?.valid ??
          true
        return (
          <GameShell bootstrap={bootstrap} title="Landmine" subtitle={timer ? `Judge · ${timer}` : 'Judge'}>
            <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
              <Text style={styles.section}>Judge the answers</Text>
              <Text style={styles.meta}>Category: {metadata.category}. Mark each Valid or Void, then reveal.</Text>
              {playerAnswers.map((a) => {
                const hasText = !!normalizeAnswer(a.answer)
                const valid = hasText ? verdictFor(a.player_id) : false
                return (
                  <View key={a.player_id} style={styles.reviewRow}>
                    <Text style={styles.resultName}>{playerDisplayName(a.player_id, bootstrap.players)}</Text>
                    <Text style={styles.meta}>{a.answer || '(no answer)'}</Text>
                    {hasText ? (
                      <View style={styles.markRow}>
                        <Pressable
                          style={[styles.markBtn, valid ? styles.markValidOn : styles.markOff]}
                          disabled={approved}
                          onPress={() => setSetterVerdicts((p) => ({ ...p, [a.player_id]: true }))}
                        >
                          <Text style={styles.markText}>✓ Valid</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.markBtn, !valid ? styles.markVoidOn : styles.markOff]}
                          disabled={approved}
                          onPress={() => setSetterVerdicts((p) => ({ ...p, [a.player_id]: false }))}
                        >
                          <Text style={styles.markText}>✕ Void</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.meta}>Empty — scores 0 automatically.</Text>
                    )}
                  </View>
                )
              })}
              <Pressable
                style={styles.primaryBtn}
                disabled={acting || approved}
                onPress={() =>
                  submitSetterMarks(
                    playerAnswers.map((a) => ({
                      playerId: a.player_id,
                      valid: !!normalizeAnswer(a.answer) && verdictFor(a.player_id),
                    }))
                  )
                }
              >
                <Text style={styles.primaryText}>{approved ? 'Revealing…' : 'Approve & reveal scores'}</Text>
              </Pressable>
              <Text style={styles.meta}>The mine is still hidden — judge only whether each answer fits.</Text>
            </KeyboardAwareGameScroll>
          </GameShell>
        )
      }
      return (
        <GameShell bootstrap={bootstrap} title="Landmine" subtitle={timer ? `Marking · ${timer}` : 'Marking'}>
          <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
            <View style={styles.waitCard}>
              <Text style={styles.waitEmoji}>⚖️</Text>
              <Text style={styles.waitTitle}>{callerName} is judging the answers…</Text>
              <Text style={styles.meta}>They’ll mark each Valid or Void, then scores reveal.</Text>
            </View>
            {playerAnswers.map((a) => {
              const hasAns = !!normalizeAnswer(a.answer)
              const m = marks.find((mk) => mk.round_id === currentRound.id && mk.target_player_id === a.player_id)
              const verdict = !hasAns ? '—' : m?.marked_at ? (m.valid ? '✓ Valid' : '✕ Void') : '· judging'
              return (
                <View key={a.player_id} style={styles.resultRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultName}>
                      {playerDisplayName(a.player_id, bootstrap.players)}
                      {a.player_id === bootstrap.myPlayerId ? ' (you)' : ''}
                    </Text>
                    <Text style={styles.meta}>{a.answer || '(no answer)'}</Text>
                  </View>
                  <Text style={styles.resultBadge}>{verdict}</Text>
                </View>
              )
            })}
          </KeyboardAwareGameScroll>
        </GameShell>
      )
    }

    // ── System mode: peer marking ──
    const targetName = playerDisplayName(reviewTargetId, bootstrap.players)
    const targetText = reviewTargetAnswer?.answer ?? ''
    const hasText = !!normalizeAnswer(targetText)
    return (
      <GameShell bootstrap={bootstrap} title="Landmine" subtitle={timer ? `Marking · ${timer}` : 'Marking'}>
        <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
          {marked || spectatingRound ? (
            <View style={styles.waitCard}>
              <Text style={styles.waitEmoji}>{marked ? '✅' : '👀'}</Text>
              <Text style={styles.waitTitle}>
                {marked ? 'Your mark is in' : isViewer ? 'Marking in progress' : 'You joined mid-round'}
              </Text>
              {!marked && !isViewer ? <Text style={styles.meta}>You’ll play from the next round.</Text> : null}
            </View>
          ) : (
            <>
              <Text style={styles.meta}>Category: {metadata.category}</Text>
              <Text style={styles.section}>Does {targetName}’s answer fit?</Text>
              <Text style={styles.answerBig}>{hasText ? `“${targetText}”` : '(no answer)'}</Text>
              <View style={styles.markRow}>
                <Pressable
                  style={[styles.markBtn, styles.markValid]}
                  disabled={acting || !hasText}
                  onPress={() => submitMark(true)}
                >
                  <Text style={styles.markText}>✓ Valid</Text>
                </Pressable>
                <Pressable
                  style={[styles.markBtn, styles.markVoid]}
                  disabled={acting}
                  onPress={() => submitMark(false)}
                >
                  <Text style={styles.markText}>✕ Void</Text>
                </Pressable>
              </View>
              <Text style={styles.meta}>The mine is still hidden — judge only whether it fits.</Text>
            </>
          )}
          {/* Everyone sees every answer + its live verdict (mine stays hidden until reveal). */}
          <Text style={[styles.meta, { textAlign: 'left', marginTop: 8, fontWeight: '700' }]}>Everyone’s answers</Text>
          {playerAnswers.map((a) => {
            const hasAns = !!normalizeAnswer(a.answer)
            const m = marks.find((mk) => mk.round_id === currentRound.id && mk.target_player_id === a.player_id)
            const verdict = !hasAns ? '—' : m?.marked_at ? (m.valid ? '✓ Valid' : '✕ Void') : '· marking'
            return (
              <View key={a.player_id} style={styles.resultRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultName}>
                    {playerDisplayName(a.player_id, bootstrap.players)}
                    {a.player_id === bootstrap.myPlayerId ? ' (you)' : ''}
                  </Text>
                  <Text style={styles.meta}>{a.answer || '(no answer)'}</Text>
                </View>
                <Text style={styles.resultBadge}>{verdict}</Text>
              </View>
            )
          })}
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }

  // ── Reveal ──────────────────────────────────────────────────────────────────
  const mines = metadata.revealed_mines ?? []
  void tick // re-read each second so the countdown updates
  const revealLeft = revealCountdownSeconds(currentRound.ended_at)
  return (
    <GameShell
      bootstrap={bootstrap}
      title="Landmine"
      subtitle={
        bootstrap.game?.status === 'active' && revealLeft > 0
          ? `Next round in ${revealLeft}s`
          : `${roundLabel} · ${metadata.category ?? ''}`
      }
    >
      <KeyboardAwareGameScroll contentContainerStyle={styles.form}>
        <View style={styles.waitCard}>
          <Text style={styles.waitEmoji}>💥</Text>
          <Text style={styles.waitTitle}>The mine{mines.length > 1 ? 's were' : ' was'}:</Text>
          <Text style={styles.mineText}>{mines.join(', ') || '—'}</Text>
        </View>
        {(() => {
          const setterRow = manual ? roundAnswers.find((a) => a.outcome === 'setter') : undefined
          return setterRow ? (
            <View style={[styles.resultRow, styles.setterRow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{playerDisplayName(setterRow.player_id, bootstrap.players)}</Text>
                <Text style={styles.meta}>🧨 Set this round’s mine</Text>
              </View>
              <Text style={[styles.resultBadge, styles.setterBadge]}>+{setterRow.points ?? 0}</Text>
            </View>
          ) : null
        })()}
        {playerAnswers.map((a) => (
          <View key={a.player_id} style={styles.resultRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultName}>{playerDisplayName(a.player_id, bootstrap.players)}</Text>
              <Text style={styles.meta}>{a.answer || '(no answer)'}</Text>
            </View>
            <Text style={styles.resultBadge}>{landmineOutcomeLabel(a.outcome, a.points, a.is_original)}</Text>
          </View>
        ))}
      </KeyboardAwareGameScroll>
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    form: { gap: 12, paddingBottom: 24 },
    section: { color: theme.text, fontSize: 18, fontWeight: '700' },
    meta: { color: theme.textMuted, fontSize: 13, textAlign: 'center' },
    input: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      color: theme.text,
      padding: 12,
      fontSize: 16,
    },
    primaryBtn: { backgroundColor: theme.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    choiceBtn: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
    choiceText: { color: theme.text, fontSize: 16, fontWeight: '600' },
    waitCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 24,
      alignItems: 'center',
      gap: 8,
    },
    waitEmoji: { fontSize: 30 },
    waitTitle: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
    answerBig: { color: theme.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginVertical: 8 },
    markRow: { flexDirection: 'row', gap: 12 },
    markBtn: { flex: 1, borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 1 },
    markValid: { borderColor: '#22c55e' },
    markVoid: { borderColor: '#ef4444' },
    markValidOn: { borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.15)' },
    markVoidOn: { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.15)' },
    markOff: { borderColor: theme.border },
    markText: { color: theme.text, fontSize: 16, fontWeight: '700' },
    reviewRow: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 8,
    },
    mineText: { color: '#ef4444', fontSize: 22, fontWeight: '800' },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
    },
    resultName: { color: theme.text, fontSize: 15, fontWeight: '600' },
    resultBadge: { color: theme.text, fontSize: 14, fontWeight: '700' },
    setterRow: { borderColor: '#f59e0b' },
    setterBadge: { color: '#f59e0b' },
  })
