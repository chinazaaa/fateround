import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { normalizeGameCode, type Game, type Player } from '@fateround/shared'
import {
  MAFIA_ROLE_INFO,
  type MafiaRole,
  type MafiaStateResponse,
  mafiaPhaseLabel,
  mafiaRoleEmoji,
  secondsUntilMafiaDeadline,
} from '@fateround/shared/mafia'
import { batch7GameLabel } from '@fateround/shared/batch-7-games'
import { JoinScreen } from '@/components/JoinScreen'
import { GameInfoChips } from '@/components/GameInfoChips'
import { LobbyView } from '@/components/LobbyView'
import { GameLoading, GameNotFound, GameShell, TurnBanner } from '@/components/game/GameChrome'
import { GameFinishPanel } from '@/components/lifecycle/GameFinishPanel'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { KeyboardAwareGameScroll } from '@/components/ui/KeyboardAwareGameScroll'
import { useGameTableSync, useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { getPlayerSession } from '@/lib/secure-session'
import {
  postMafiaAdvance,
  postMafiaChat,
  postMafiaNightAction,
  postMafiaPriestAction,
  postMafiaRevengeTarget,
  postMafiaSkipPhase,
  postMafiaState,
  postMafiaVigilanteAction,
  postMafiaVote,
} from '@/lib/game-api'
import { usePlayerSessionActions } from '@/lib/player-session'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { MafiaPlayersGrid } from '@/components/games/mafia/MafiaPlayersGrid'
import { MafiaRolesDrawer } from '@/components/games/mafia/MafiaRolesDrawer'
import { MafiaRoleRevealScreen } from '@/components/games/mafia/MafiaRoleRevealScreen'
import { MafiaIdentityPanel } from '@/components/games/mafia/MafiaIdentityPanel'
import { MafiaChatBar, MafiaChatModal, MafiaChatPreview } from '@/components/games/mafia/MafiaChatDock'

type Screen = 'loading' | 'join' | 'waiting' | 'active' | 'finished' | 'not_found'

// Roles with no night action at all (day-only or passive) — matches NO_NIGHT_ACTION_ROLES
// in src/app/api/mafia/[code]/night-action/route.ts.
const NO_NIGHT_ACTION_ROLES: MafiaRole[] = ['villager', 'mayor', 'jester', 'cursed_villager', 'vigilante', 'priest']
// Every wolf-team role — not just literal 'mafia' — gets the shared secret chat.
const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer', 'mafia_seer']
// Two taps required: first tap picks target A, second tap (a different player) submits both.
const TWO_TARGET_NIGHT_ROLES: MafiaRole[] = ['cupid', 'detective']

export function MafiaPlayerView({ gameCode }: { gameCode: string }) {
  const styles = useThemedStyles(makeStyles)
  const [mafiaState, setMafiaState] = useState<MafiaStateResponse | null>(null)
  const [acting, setActing] = useState(false)
  const [timerTick, setTimerTick] = useState(0)
  // First-tap target for two-target night roles (Cupid, Detective) — cleared on submit.
  const [pendingFirstTargetId, setPendingFirstTargetId] = useState<string | null>(null)
  const [pendingSecondTargetId, setPendingSecondTargetId] = useState<string | null>(null)
  // Which Witch potion the next grid tap will use — cleared once submitted.
  const [witchPotion, setWitchPotion] = useState<'heal' | 'kill' | null>(null)
  // Priest/Vigilante act during the day but separately from voting — this puts the grid into
  // "pick a target for this special action" mode instead of "pick a lynch vote" mode.
  const [dayActionMode, setDayActionMode] = useState<'priest' | 'vigilante_shoot' | 'vigilante_reveal' | null>(null)
  // Local vote selection — tracks who we voted for so re-tap can unvote
  const [voteSelection, setVoteSelection] = useState<string | null>(null)
  // Local night selection — tracks our own night target for grid display
  const [nightSelection, setNightSelection] = useState<string | null>(null)
  // Wolf cub revenge target mode
  const [wolfCubRevengeMode, setWolfCubRevengeMode] = useState(false)
  // Arsonist's choice for tonight — douse (two-target, submitted via the grid tap flow
  // already wired in handleNightSelect) or ignite (single self-target, submitted here).
  const [arsonistMode, setArsonistMode] = useState<'douse' | 'ignite' | null>(null)
  // Chat popups — the bottom bar/preview open the primary one (mafia secret chat at night /
  // town chat by day / ghost chat for the dead); the icon beside the bar opens the OTHER
  // one, read-only, in a separate popup that never touches the primary bar's own state.
  const [primaryChatOpen, setPrimaryChatOpen] = useState(false)
  const [peekChatOpen, setPeekChatOpen] = useState(false)
  // A late joiner's client can load state well after the game's shared role_reveal phase has
  // already ended (it's a one-time, whole-game window) — without this they'd be dropped
  // straight into an in-progress night/day with no "you are..." moment at all. Give them a
  // one-time few-second local reveal instead, gated on a per-player SecureStore flag so it
  // only ever fires once and never re-interrupts a returning player.
  const [forceRoleReveal, setForceRoleReveal] = useState(false)
  const forceRoleRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadGameState = useCallback(
    async (_game: Game, _players: Player[]): Promise<{ state: MafiaStateResponse | null; ok: boolean }> => {
      try {
        const session = await getPlayerSession(normalizeGameCode(gameCode))
        const data = await postMafiaState(gameCode.toUpperCase(), session?.resumeToken)
        setMafiaState(data)
        return { state: data, ok: true }
      } catch {
        return { state: null, ok: false }
      }
    },
    [gameCode]
  )

  const computeScreen = useCallback(
    (game: Game, playerId: string | null, stateData: MafiaStateResponse | null): Screen => {
      if (!playerId) return 'join'
      if (game.status === 'waiting') return 'waiting'
      if (game.status === 'active' && stateData != null && stateData.phase !== 'game_over') return 'active'
      if (game.status === 'finished' || stateData?.phase === 'game_over') return 'finished'
      return 'waiting'
    },
    []
  )

  const bootstrap = useGameViewBootstrap<Screen, MafiaStateResponse | null>({
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
    [{ table: 'games', column: 'id' }, 'mafia_sessions', 'mafia_player_states'],
    () => bootstrap.load(),
    !!bootstrap.game,
    bootstrap.game?.status
  )

  const state = mafiaState ?? bootstrap.gameState
  const myState = state?.myState ?? null
  const amIAlive = state?.players.find((p) => p.id === bootstrap.myPlayerId)?.isAlive ?? false
  const amISpectator = !!bootstrap.myPlayerId && !!state && !state.players.some((p) => p.id === bootstrap.myPlayerId)
  const killedPlayer = state?.lastNightKillPlayerId
    ? state.players.find((p) => p.id === state.lastNightKillPlayerId)
    : undefined
  const votedPlayer = state?.lastVoteResultPlayerId
    ? state.players.find((p) => p.id === state.lastVoteResultPlayerId)
    : undefined

  // The timeout that clears forceRoleReveal is intentionally NOT returned as this effect's
  // cleanup — if the game's real phase changes again while the few-second overlay is showing
  // (e.g. the player was backgrounded and the server ticked several phases forward), this
  // effect re-runs, and a cleanup-cancelled timeout with no replacement (blocked by the
  // SecureStore guard below) would leave forceRoleReveal stuck true forever. A ref-held
  // timeout only ever gets cleared on unmount.
  useEffect(() => {
    if (bootstrap.screen !== 'active' || !bootstrap.myPlayerId || !myState?.role) return
    const key = `mafia_role_seen_${gameCode.toUpperCase()}_${bootstrap.myPlayerId}`
    let cancelled = false
    void (async () => {
      if (state?.phase === 'role_reveal') {
        // Seen naturally via the shared role_reveal phase — mark it so a late refresh doesn't
        // also trigger the late-join overlay once that phase has passed.
        await SecureStore.setItemAsync(key, '1')
        return
      }
      const seen = await SecureStore.getItemAsync(key)
      if (cancelled || seen) return
      await SecureStore.setItemAsync(key, '1')
      setForceRoleReveal(true)
      forceRoleRevealTimeoutRef.current = setTimeout(() => setForceRoleReveal(false), 5000)
    })()
    return () => {
      cancelled = true
    }
  }, [bootstrap.screen, bootstrap.myPlayerId, gameCode, myState?.role, state?.phase])

  useEffect(() => {
    return () => {
      if (forceRoleRevealTimeoutRef.current) clearTimeout(forceRoleRevealTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!state?.phaseDeadline || state.phase === 'game_over') return
    const id = setInterval(() => setTimerTick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [state?.phaseDeadline, state?.phase])

  useEffect(() => {
    if (!state?.phaseDeadline || state.phase === 'game_over') return
    if (secondsUntilMafiaDeadline(state.phaseDeadline) > 0) return
    void postMafiaAdvance(gameCode.toUpperCase())
      .then(() => bootstrap.load())
      .catch(() => {})
  }, [state?.phaseDeadline, state?.phase, timerTick, gameCode, bootstrap.load])

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

  useEffect(() => {
    setPendingFirstTargetId(null)
    setWitchPotion(null)
    setDayActionMode(null)
    setVoteSelection(null)
    setNightSelection(null)
    setArsonistMode(null)
    setPrimaryChatOpen(false)
    setPeekChatOpen(false)
  }, [state?.phase, state?.dayNumber])

  // Hydrate voteSelection from authoritative state after reload/late-join
  useEffect(() => {
    if (voteSelection || !bootstrap.myPlayerId || !state?.voteChoices) return
    const serverVote = state.voteChoices[bootstrap.myPlayerId]
    if (serverVote) setVoteSelection(serverVote)
  }, [voteSelection, bootstrap.myPlayerId, state?.voteChoices])

  const showDayVotes = state?.phase === 'voting' && !(state.anonymousVotes && !myState?.dayVoteSubmitted)

  const role = myState?.role ?? null
  const canAct = amIAlive && !amISpectator && !!bootstrap.myResumeToken

  const handleNightSelect = useCallback(
    (id: string) => {
      const token = bootstrap.myResumeToken
      const myId = bootstrap.myPlayerId
      if (!token || !role) return

      if (role === 'witch') {
        if (!witchPotion) return
        const potionType = witchPotion
        void act(() => postMafiaNightAction(bootstrap.code, token, id, { potionType })).then(() => setWitchPotion(null))
        return
      }

      if (role === 'trapper' || role === 'arsonist' || role === 'mafia_seer') {
        // Self-target has a distinct meaning for each of these (activate traps / ignite /
        // resign the reveal ability) and is always a single submission.
        if (id === myId) {
          void act(() => postMafiaNightAction(bootstrap.code, token, id))
          return
        }
        if (role === 'trapper') {
          void act(() => postMafiaNightAction(bootstrap.code, token, id))
          return
        }
        // Arsonist douse is a two-target pick, same flow as Cupid/Detective below.
      }

      if (TWO_TARGET_NIGHT_ROLES.includes(role) || role === 'arsonist') {
        if (!pendingFirstTargetId) {
          setPendingFirstTargetId(id)
          return
        }
        if (pendingFirstTargetId === id) {
          setPendingFirstTargetId(null)
          return
        }
        const first = pendingFirstTargetId
        setPendingSecondTargetId(id)
        void act(() => postMafiaNightAction(bootstrap.code, token, first, { secondTargetPlayerId: id })).finally(() => {
          setPendingFirstTargetId(null)
          setPendingSecondTargetId(null)
        })
        return
      }

      // Medium (dead-target revive) and every other single-target role.
      setNightSelection(id)
      void act(() => postMafiaNightAction(bootstrap.code, token, id))
    },
    [bootstrap.myResumeToken, bootstrap.myPlayerId, bootstrap.code, role, witchPotion, pendingFirstTargetId]
  )

  const handleDayActionSelect = useCallback(
    (id: string) => {
      const token = bootstrap.myResumeToken
      if (!token || !dayActionMode) return
      if (dayActionMode === 'priest') {
        void act(() => postMafiaPriestAction(bootstrap.code, token, id)).then(() => setDayActionMode(null))
        return
      }
      void act(() =>
        postMafiaVigilanteAction(bootstrap.code, token, id, dayActionMode === 'vigilante_shoot' ? 'shoot' : 'reveal')
      ).then(() => setDayActionMode(null))
    },
    [bootstrap.myResumeToken, bootstrap.code, dayActionMode]
  )

  const submitRevengeTarget = useCallback(
    async (targetId: string) => {
      const token = bootstrap.myResumeToken
      if (!token) return
      try {
        await postMafiaRevengeTarget(bootstrap.code, token, targetId)
        setWolfCubRevengeMode(false)
        await bootstrap.load()
      } catch {}
    },
    [bootstrap.myResumeToken, bootstrap.code, bootstrap.load]
  )

  const sendChat = useCallback(
    async (msg: string, scope: 'night' | 'day' | 'ghost') => {
      const token = bootstrap.myResumeToken
      if (!token) return
      await postMafiaChat(bootstrap.code, token, msg, scope)
      await bootstrap.load()
    },
    [bootstrap.myResumeToken, bootstrap.code, bootstrap.load]
  )

  void timerTick

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
        lobbyFull={bootstrap.lobbyFull}
        onJoinAsViewer={() => void bootstrap.join(undefined, { joinAsViewer: true })}
        footer={<GameRulesLink gameType="mafia" variant="subtle" />}
        infoChips={<GameInfoChips game={bootstrap.game} />}
      />
    )
  }
  if (bootstrap.screen === 'waiting' && bootstrap.game && lobbyProps) {
    return <LobbyView {...lobbyProps!} onLeft={onLeft} />
  }
  if (!bootstrap.game || !state) return <GameLoading />

  if (bootstrap.screen === 'finished') {
    const winner =
      state.winningTeam === 'mafia' ? 'Mafia wins!' : state.winningTeam === 'village' ? 'Village wins!' : 'Game over'
    const teamOf = (role?: string) => (role === 'mafia' ? 'mafia' : 'village')
    const leaderboard = [...state.players]
      .sort((a, b) => {
        const aWon = teamOf(a.role) === state.winningTeam ? 0 : 1
        const bWon = teamOf(b.role) === state.winningTeam ? 0 : 1
        if (aWon !== bWon) return aWon - bWon
        if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((p) => ({
        name: p.name,
        score: p.role ? `${mafiaRoleEmoji(p.role)} ${p.role.charAt(0).toUpperCase()}${p.role.slice(1)}` : '—',
        detail: p.isAlive ? 'Survived' : 'Eliminated',
        you: !!bootstrap.myPlayerId && p.id === bootstrap.myPlayerId,
        highlight: !!state.winningTeam && teamOf(p.role) === state.winningTeam,
      }))
    return (
      <GameShell bootstrap={bootstrap} title={batch7GameLabel('mafia')} subtitle={bootstrap.code}>
        <GameFinishPanel bootstrap={bootstrap} title={winner} subtitle="Roles revealed" leaderboard={leaderboard} />
      </GameShell>
    )
  }

  const secondsLeft = secondsUntilMafiaDeadline(state.phaseDeadline)
  const phase = state.phase
  const showRoleReveal = phase === 'role_reveal' || forceRoleReveal
  const isMafiaTeamAlive = !!myState?.role && MAFIA_TEAM_ROLES.includes(myState.role) && amIAlive
  // The Medium can talk with the dead, but only at night, and only once someone actually
  // is dead — same ghost channel the dead themselves use, not a separate one.
  const isMediumAtNight =
    myState?.role === 'medium' && amIAlive && phase === 'night' && state.players.some((p) => !p.isAlive)
  const canSendDayNow = phase === 'day' || phase === 'voting'
  // The persistent bottom bar always shows mafia's own secret chat at night and town chat
  // by day; the icon beside it doesn't change this, it just pops up a read-only view of
  // the OTHER one on top (mafia can peek at, but not post to, their secret chat during the
  // day; a villager gets an icon-only peek at town chat during the night since there's
  // nothing for them to send then).
  const bottomBarTarget: 'mafia' | 'ghost' | 'day' | null = !amIAlive
    ? 'ghost'
    : isMafiaTeamAlive
      ? phase === 'night'
        ? 'mafia'
        : 'day'
      : isMediumAtNight
        ? 'ghost'
        : phase === 'night'
          ? null
          : 'day'
  const bottomBarDisabled =
    amISpectator || (bottomBarTarget === 'day' ? !canSendDayNow : bottomBarTarget === 'mafia' && phase !== 'night')
  const showNightTownPeek = phase === 'night' && amIAlive && !isMafiaTeamAlive && !isMediumAtNight && !amISpectator
  const iconPopupKind: 'mafia' | 'day' | null = isMafiaTeamAlive
    ? bottomBarTarget === 'mafia'
      ? 'day'
      : 'mafia'
    : showNightTownPeek
      ? 'day'
      : null
  // Dead players' day-chat + ghost-chat merged into one timeline (same merge MafiaDayChat
  // does on web) — used for the ghost preview/popup so it isn't a fixed h-24rem box always
  // expanded in the middle of the roster.
  const mergedGhostMessages =
    (state.ghostChatMessages?.length ?? 0)
      ? [...(state.dayChatMessages ?? []), ...(state.ghostChatMessages ?? [])].sort(
          (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
        )
      : (state.dayChatMessages ?? [])
  const bottomBarMessages =
    bottomBarTarget === 'mafia'
      ? (myState?.mafiaChatMessages ?? [])
      : bottomBarTarget === 'ghost'
        ? mergedGhostMessages
        : (state.dayChatMessages ?? [])
  const bottomBarTitle =
    bottomBarTarget === 'mafia'
      ? '🔪 Mafia Secret Chat'
      : bottomBarTarget === 'ghost'
        ? '👻 Ghost Chat'
        : '💬 Town Discussion'
  const peekMessages = iconPopupKind === 'mafia' ? (myState?.mafiaChatMessages ?? []) : (state.dayChatMessages ?? [])
  const peekTitle = iconPopupKind === 'mafia' ? '🔪 Mafia Secret Chat' : '💬 Town Discussion'
  const peekCanSend = iconPopupKind === 'mafia' ? phase === 'night' : canSendDayNow
  const handlePeekSend = async (msg: string) => {
    if (iconPopupKind === 'mafia') await sendChat(msg, 'night')
    else await sendChat(msg, 'day')
  }
  const handleBottomBarSend = async (msg: string) => {
    if (bottomBarTarget === 'mafia') await sendChat(msg, 'night')
    else if (bottomBarTarget === 'ghost') await sendChat(msg, 'ghost')
    else await sendChat(msg, 'day')
  }

  if (showRoleReveal) {
    return (
      <GameShell bootstrap={bootstrap} title="Mafia" subtitle="Role reveal">
        <KeyboardAwareGameScroll contentContainerStyle={styles.content}>
          <TurnBanner text={`Role reveal${secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}`} isMyTurn={false} />
          <MafiaRoleRevealScreen myState={myState} />
        </KeyboardAwareGameScroll>
      </GameShell>
    )
  }

  return (
    <GameShell
      bootstrap={bootstrap}
      title="Mafia"
      subtitle={`${phase === 'night' ? 'Night' : 'Day'} ${state.dayNumber}`}
    >
      <KeyboardAwareGameScroll contentContainerStyle={styles.content}>
        <TurnBanner
          text={`${mafiaPhaseLabel(phase)}${secondsLeft > 0 ? ` · ${secondsLeft}s` : ''}`}
          isMyTurn={
            phase === 'night' && amIAlive && !!myState && myState.role !== 'villager' && !myState.nightActionSubmitted
          }
        />

        {myState ? (
          <View style={styles.identityStrip}>
            <Text style={styles.identityText}>
              {mafiaRoleEmoji(myState.role)} {MAFIA_ROLE_INFO[myState.role].name} ·{' '}
              {myState.team === 'mafia' ? 'Team Mafia' : 'Team Village'}
            </Text>
            {myState.mafiaTeammates.length > 0 ? (
              <Text style={styles.allies}>Allies: {myState.mafiaTeammates.join(', ')}</Text>
            ) : null}
          </View>
        ) : amISpectator ? (
          <View style={styles.identityStrip}>
            <Text style={styles.identityText}>👁️ Spectating — you are watching this game.</Text>
          </View>
        ) : null}

        <MafiaIdentityPanel myState={myState} />

        {role === 'wolf_cub' && amIAlive && phase !== 'game_over' ? (
          <View style={styles.revengePanel}>
            <Text style={styles.revengeTitle}>💀 Revenge Target</Text>
            {myState?.wolfCubRevengeTargetName ? (
              <>
                <Text style={styles.revengeText}>
                  If you die, <Text style={styles.revengeTarget}>{myState.wolfCubRevengeTargetName}</Text> goes down
                  with you.
                </Text>
                <Pressable style={styles.revengeBtn} onPress={() => setWolfCubRevengeMode(true)}>
                  <Text style={styles.revengeBtnText}>Change</Text>
                </Pressable>
              </>
            ) : wolfCubRevengeMode ? (
              <>
                <Text style={styles.revengeText}>Tap a player to mark as your revenge target</Text>
                <Pressable style={styles.revengeBtn} onPress={() => setWolfCubRevengeMode(false)}>
                  <Text style={styles.revengeBtnText}>Cancel</Text>
                </Pressable>
              </>
            ) : (
              <Pressable style={styles.revengeBtn} onPress={() => setWolfCubRevengeMode(true)}>
                <Text style={styles.revengeBtnText}>💀 Select revenge target</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <View style={styles.phaseCard}>
          {phase === 'night' ? (
            <>
              {amISpectator ? (
                <Text style={styles.phaseText}>Watching — night actions in progress…</Text>
              ) : !amIAlive ? (
                <Text style={styles.phaseText}>You are eliminated. Watch the night unfold…</Text>
              ) : role && NO_NIGHT_ACTION_ROLES.includes(role) ? (
                <Text style={styles.phaseText}>The village sleeps…</Text>
              ) : role === 'little_girl' ? (
                <Pressable
                  style={styles.actionBtn}
                  disabled={acting}
                  onPress={() =>
                    act(() => postMafiaNightAction(bootstrap.code, bootstrap.myResumeToken!, bootstrap.myPlayerId!))
                  }
                >
                  <Text style={styles.actionBtnText}>👁️ Open your eyes</Text>
                </Pressable>
              ) : role === 'witch' ? (
                <View style={styles.potionRow}>
                  <Pressable
                    style={[styles.actionBtn, witchPotion === 'heal' && styles.actionBtnActive]}
                    disabled={acting || myState?.witchHealRemaining === 0}
                    onPress={() => setWitchPotion((p) => (p === 'heal' ? null : 'heal'))}
                  >
                    <Text style={styles.actionBtnText}>🧪 Protect potion</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, witchPotion === 'kill' && styles.actionBtnActive]}
                    disabled={acting || state.dayNumber === 1 || myState?.witchKillRemaining === 0}
                    onPress={() => setWitchPotion((p) => (p === 'kill' ? null : 'kill'))}
                  >
                    <Text style={styles.actionBtnText}>☠️ Kill potion</Text>
                  </Pressable>
                  {witchPotion ? (
                    <Text style={styles.phaseText}>Tap a player below to use the {witchPotion} potion.</Text>
                  ) : null}
                </View>
              ) : role === 'arsonist' ? (
                <View style={styles.potionRow}>
                  {!arsonistMode ? (
                    <>
                      <Text style={styles.phaseText}>🔥 Choose your action for tonight:</Text>
                      <Pressable style={styles.actionBtn} disabled={acting} onPress={() => setArsonistMode('douse')}>
                        <Text style={styles.actionBtnText}>🛢️ Douse (2 players)</Text>
                      </Pressable>
                      <Pressable
                        style={styles.actionBtn}
                        disabled={acting}
                        onPress={() => {
                          setArsonistMode('ignite')
                          void act(() =>
                            postMafiaNightAction(bootstrap.code, bootstrap.myResumeToken!, bootstrap.myPlayerId!)
                          )
                        }}
                      >
                        <Text style={styles.actionBtnText}>🔥 Ignite all</Text>
                      </Pressable>
                    </>
                  ) : arsonistMode === 'douse' ? (
                    <>
                      <Text style={styles.phaseText}>🛢️ Tap two players below to douse in gasoline.</Text>
                      <Pressable onPress={() => setArsonistMode(null)}>
                        <Text style={styles.changeVoteLink}>Cancel</Text>
                      </Pressable>
                      {myState?.nightActionSubmitted ? (
                        <Text style={styles.phaseOk}>✓ Douse targets submitted.</Text>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Text style={styles.phaseOk}>🔥 Ignite submitted — all doused players will burn!</Text>
                      <Pressable onPress={() => setArsonistMode(null)}>
                        <Text style={styles.changeVoteLink}>Cancel</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ) : role === 'trapper' ? (
                <View style={styles.potionRow}>
                  <Text style={styles.phaseText}>
                    Traps set: {myState?.trapperTrappedNames?.length ?? 0}/3
                    {(myState?.trapperTrappedNames?.length ?? 0) > 0
                      ? ` — ${myState?.trapperTrappedNames?.join(', ')}`
                      : ''}
                  </Text>
                  <Text style={styles.phaseText}>Tap a player to set a trap on their house.</Text>
                  <Pressable
                    style={styles.actionBtn}
                    disabled={acting || (myState?.trapperTrappedNames?.length ?? 0) === 0}
                    onPress={() =>
                      act(() => postMafiaNightAction(bootstrap.code, bootstrap.myResumeToken!, bootstrap.myPlayerId!))
                    }
                  >
                    <Text style={styles.actionBtnText}>💥 Activate all traps</Text>
                  </Pressable>
                </View>
              ) : myState?.nightActionSubmitted ? (
                <Text style={styles.phaseOk}>Night action submitted.</Text>
              ) : role ? (
                <Text style={styles.phaseText}>{MAFIA_ROLE_INFO[role].description}</Text>
              ) : null}
            </>
          ) : null}

          {phase === 'day_report' ? (
            <View style={styles.centerBlock}>
              <Text style={styles.phaseTitle}>Sunrise</Text>
              {killedPlayer ? (
                <Text style={styles.phaseText}>
                  {killedPlayer.name} was eliminated
                  {killedPlayer.role ? ` (${killedPlayer.role})` : ''}.
                </Text>
              ) : (
                <Text style={styles.phaseText}>
                  {state.lastNightMafiaHadTarget ? 'The Doctor saved someone!' : 'Nobody died last night.'}
                </Text>
              )}
            </View>
          ) : null}

          {phase === 'day' || phase === 'voting' ? (
            <>
              {amISpectator ? (
                <Text style={styles.phaseText}>
                  {phase === 'day' ? 'Watching — town discussion…' : 'Watching — voting in progress…'}
                </Text>
              ) : !amIAlive ? (
                <Text style={styles.phaseText}>
                  {phase === 'day'
                    ? 'You are eliminated — watch the discussion.'
                    : 'You are eliminated — watch the vote.'}
                </Text>
              ) : (
                <>
                  {phase === 'voting' && myState?.dayVoteSubmitted ? (
                    <View style={styles.voteCastRow}>
                      <Text style={styles.phaseOk}>✓ Vote cast{role === 'mayor' ? ' (counts double)' : ''}</Text>
                      <Pressable
                        disabled={acting}
                        onPress={() => act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, null))}
                      >
                        <Text style={styles.changeVoteLink}>Change vote</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  {role === 'priest' && (myState?.priestHolyWaterRemaining ?? 0) > 0 ? (
                    <Pressable
                      style={[styles.actionBtn, dayActionMode === 'priest' && styles.actionBtnActive]}
                      disabled={acting}
                      onPress={() => setDayActionMode((m) => (m === 'priest' ? null : 'priest'))}
                    >
                      <Text style={styles.actionBtnText}>⛪ Throw holy water</Text>
                    </Pressable>
                  ) : null}
                  {role === 'vigilante' && (myState?.vigilanteShotsRemaining ?? 0) > 0 ? (
                    <Pressable
                      style={[styles.actionBtn, dayActionMode === 'vigilante_shoot' && styles.actionBtnActive]}
                      disabled={acting}
                      onPress={() => setDayActionMode((m) => (m === 'vigilante_shoot' ? null : 'vigilante_shoot'))}
                    >
                      <Text style={styles.actionBtnText}>🔫 Shoot a player</Text>
                    </Pressable>
                  ) : null}
                  {role === 'vigilante' && (myState?.vigilanteRevealRemaining ?? 0) > 0 ? (
                    <Pressable
                      style={[styles.actionBtn, dayActionMode === 'vigilante_reveal' && styles.actionBtnActive]}
                      disabled={acting}
                      onPress={() => setDayActionMode((m) => (m === 'vigilante_reveal' ? null : 'vigilante_reveal'))}
                    >
                      <Text style={styles.actionBtnText}>🔍 Reveal a player</Text>
                    </Pressable>
                  ) : null}
                  {dayActionMode ? <Text style={styles.phaseText}>Tap a player below to confirm.</Text> : null}
                  {phase === 'voting' ? (
                    <Pressable
                      style={styles.skipFullBtn}
                      disabled={acting}
                      onPress={() => act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, null))}
                    >
                      <Text style={styles.skipFullText}>⏭ Skip / No Lynch</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </>
          ) : null}

          {phase === 'elimination' ? (
            <View style={styles.centerBlock}>
              <Text style={styles.phaseTitle}>Vote result</Text>
              {votedPlayer ? (
                <Text style={styles.phaseText}>
                  {votedPlayer.name} was voted out
                  {votedPlayer.role ? ` (${votedPlayer.role})` : ''}.
                </Text>
              ) : (
                <Text style={styles.phaseText}>No one was eliminated.</Text>
              )}
            </View>
          ) : null}
        </View>

        {(() => {
          const nightActionable =
            phase === 'night' &&
            canAct &&
            !!role &&
            role !== 'little_girl' &&
            !NO_NIGHT_ACTION_ROLES.includes(role) &&
            (role === 'witch'
              ? !!witchPotion
              : role === 'trapper' || role === 'mafia_seer'
                ? true
                : role === 'medium'
                  ? (myState?.mediumReviveRemaining ?? 0) > 0
                  : !myState?.nightActionSubmitted)
          const dayVotable = phase === 'voting' && canAct && !dayActionMode
          const dayActionable = (phase === 'day' || phase === 'voting') && canAct && !!dayActionMode

          return (
            <MafiaPlayersGrid
              players={state.players}
              myPlayerId={bootstrap.myPlayerId}
              myRole={myState?.role}
              mafiaTeammateIds={myState?.mafiaTeammateIds}
              mafiaTeammateRoles={myState?.mafiaTeammateRoles}
              mafiaTeammateNightTargets={myState?.mafiaTeammateNightTargets}
              myNightTarget={nightSelection}
              mafiaSeerRevealedRoles={myState?.mafiaSeerRevealedRoles}
              loverIds={myState?.loverIds}
              phase={phase}
              voteTallies={state.voteTallies}
              voteChoices={state.voteChoices}
              votedPlayerIds={state.votedPlayerIds}
              anonymousVotes={state.anonymousVotes && !showDayVotes}
              disabled={acting}
              selectedIds={
                pendingFirstTargetId
                  ? ([pendingFirstTargetId, pendingSecondTargetId].filter(Boolean) as string[])
                  : voteSelection
                    ? [voteSelection]
                    : []
              }
              allowSelfSelect={
                nightActionable &&
                (role === 'trapper' || role === 'arsonist' || role === 'mafia_seer' || role === 'cupid')
              }
              allowDeadSelect={nightActionable && role === 'medium'}
              skipRequestCount={
                (phase === 'day' || phase === 'voting') && canAct ? (state.skipRequestCount ?? 0) : undefined
              }
              skipRequiredCount={
                (phase === 'day' || phase === 'voting') && canAct ? (state.skipRequiredCount ?? 1) : undefined
              }
              hasRequestedSkip={!!state.hasRequestedSkip}
              skipDisabled={acting}
              onSkip={
                (phase === 'day' || phase === 'voting') && canAct
                  ? () => act(() => postMafiaSkipPhase(bootstrap.code, bootstrap.myResumeToken!))
                  : undefined
              }
              onSelect={
                wolfCubRevengeMode
                  ? (id) => {
                      void submitRevengeTarget(id)
                    }
                  : dayActionable
                    ? handleDayActionSelect
                    : dayVotable
                      ? (id) => {
                          if (voteSelection === id) {
                            setVoteSelection(null)
                            void act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, null))
                          } else {
                            setVoteSelection(id)
                            void act(() => postMafiaVote(bootstrap.code, bootstrap.myResumeToken!, id))
                          }
                        }
                      : nightActionable
                        ? handleNightSelect
                        : undefined
              }
            />
          )
        })()}

        {/* Chat preview — hidden during night for alive players (matching web).
            Day/dead: show inline snippet; tapping opens the full popup. */}
        {bootstrap.myPlayerId && bottomBarTarget && !(phase === 'night' && amIAlive) ? (
          <MafiaChatPreview
            title={bottomBarTitle}
            messages={bottomBarMessages}
            players={state.players}
            accent={bottomBarTarget === 'mafia' ? 'mafia' : undefined}
            onPress={() => setPrimaryChatOpen(true)}
          />
        ) : null}

        <View style={styles.rulesRow}>
          <MafiaRolesDrawer
            rolesInGame={state.rolesInGame ?? state.enabledRoles ?? []}
            myRole={myState?.role}
            roleCounts={state.roleCounts}
          />
          <GameRulesLink gameType="mafia" />
        </View>
      </KeyboardAwareGameScroll>

      {/* Persistent bottom bar — a sibling of the scroll view (not inside it), so it docks
          to the actual bottom of the screen via normal flex layout, no fixed positioning. */}
      {bottomBarTarget ? (
        <MafiaChatBar
          icon={bottomBarTarget === 'mafia' ? '🔪' : bottomBarTarget === 'ghost' ? '👻' : '💬'}
          placeholder={bottomBarTarget === 'mafia' ? 'Whisper to allies…' : 'Tap to send a message'}
          canType={!bottomBarDisabled}
          phase={phase}
          accent={bottomBarTarget === 'mafia' ? 'mafia' : undefined}
          onOpen={() => setPrimaryChatOpen(true)}
          onSend={handleBottomBarSend}
          peekIcon={iconPopupKind === 'mafia' ? '🔪' : iconPopupKind === 'day' ? '💬' : undefined}
          onPeek={iconPopupKind ? () => setPeekChatOpen(true) : undefined}
        />
      ) : null}

      <MafiaChatModal
        visible={primaryChatOpen}
        onClose={() => setPrimaryChatOpen(false)}
        title={bottomBarTitle}
        messages={bottomBarMessages}
        players={state.players}
        accent={bottomBarTarget === 'mafia' ? 'mafia' : undefined}
        canType={!bottomBarDisabled}
        phase={phase}
        onSend={handleBottomBarSend}
      />

      <MafiaChatModal
        visible={peekChatOpen}
        onClose={() => setPeekChatOpen(false)}
        title={peekTitle}
        messages={peekMessages}
        players={state.players}
        accent={iconPopupKind === 'mafia' ? 'mafia' : undefined}
        canType={peekCanSend}
        phase={phase}
        onSend={handlePeekSend}
      />
    </GameShell>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    content: { paddingBottom: 32, gap: 12 },
    identityStrip: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
      gap: 4,
    },
    identityText: { color: theme.text, fontWeight: '700', textAlign: 'center' },
    allies: { color: '#fca5a5', fontSize: 13, textAlign: 'center' },
    rulesRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    phaseCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    phaseTitle: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
    phaseText: { color: theme.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 8 },
    phaseOk: { color: '#86efac', fontWeight: '700', textAlign: 'center', marginBottom: 8 },
    centerBlock: { alignItems: 'center', gap: 8 },
    potionRow: { gap: 8 },
    actionBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.border,
      alignItems: 'center',
      marginBottom: 8,
    },
    actionBtnActive: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    actionBtnText: { color: theme.text, fontWeight: '700' },
    voteCastRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    changeVoteLink: { color: theme.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
    skipFullBtn: {
      marginTop: 10,
      paddingVertical: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.border,
      alignItems: 'center',
    },
    skipFullText: { color: theme.textSecondary, fontWeight: '700' },
    revengePanel: {
      backgroundColor: '#7f1d1d',
      borderRadius: 12,
      padding: 12,
      gap: 6,
      alignItems: 'center',
    },
    revengeTitle: { color: '#fca5a5', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    revengeText: { color: '#fecaca', fontSize: 13, textAlign: 'center' },
    revengeTarget: { color: '#f87171', fontWeight: '800' },
    revengeBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: '#991b1b',
      alignItems: 'center',
    },
    revengeBtnText: { color: '#fecaca', fontWeight: '700', fontSize: 13 },
  })
