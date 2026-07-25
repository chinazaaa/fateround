'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberJoin, useRoomMemberNamePrefill, useRoomMemberAutoJoin } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { gameTypeConfig } from '@/lib/game-types'
import { MAFIA_MIN_PLAYERS } from '@/lib/mafia'
import { clearPlayerSession, getPlayerSession } from '@/lib/utils'
import { MafiaPhaseTimer } from './MafiaChat'
import { MafiaDayChat, MafiaSecretChat } from './MafiaChat'
import { MafiaIdentityPanel } from './MafiaIdentityPanel'
import { MafiaPhaseCard } from './MafiaPhaseCard'
import { MafiaRoleRevealScreen } from './MafiaRoleRevealScreen'
import { MafiaPlayersGrid } from './MafiaPlayersGrid'
import { MafiaRolesDrawer } from './MafiaRolesDrawer'
import { MafiaSkipPhaseBar } from './MafiaSkipPhaseBar'
import { MAFIA_TEAM_ROLES, NO_NIGHT_ACTION_ROLES } from './mafia-role-info'
import type { MafiaStateResponse } from './mafia-types'
import type { Game } from '@/types'

const WINNING_TEAM_LABEL: Record<string, string> = {
  mafia: 'MAFIA 🔪',
  village: 'VILLAGE 🏘️',
  jester: 'JESTER 🃏',
  serial_killer: 'SERIAL KILLER 🔪',
  arsonist: 'ARSONIST 🔥',
  lovers: 'LOVERS 💘',
}
const WINNING_TEAM_COLOR: Record<string, string> = {
  mafia: 'text-red-500',
  village: 'text-emerald-400',
  jester: 'text-amber-400',
  serial_killer: 'text-amber-400',
  arsonist: 'text-orange-400',
  lovers: 'text-pink-400',
}
const PHASE_LABEL: Record<string, string> = {
  role_reveal: 'Role Reveal',
  night: 'Night',
  day_report: 'Sunrise',
  day: 'Discussion',
  voting: 'Voting',
  elimination: 'Elimination',
  game_over: 'Game Over',
}

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function MafiaPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError, success: toastSuccess } = useToast()
  useConfirm()
  const [mafiaState, setMafiaState] = useState<MafiaStateResponse | null>(null)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  // A late joiner's client can load state well after the game's shared role_reveal phase has
  // already ended (it's a one-time, whole-game window) — without this they'd be dropped
  // straight into an in-progress night/day with no "you are..." moment at all. Give them a
  // one-time few-second local reveal instead, gated on a per-player localStorage flag so it
  // only ever fires once and never re-interrupts a returning player.
  const [forceRoleReveal, setForceRoleReveal] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: MafiaStateResponse | null; ok: boolean }> => {
    const session = getPlayerSession(gameCode)
    const resumeToken = session?.resumeToken ?? null
    try {
      const res = await fetch(`/api/mafia/${gameCode}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken }),
      })
      if (!res.ok) return { state: null, ok: false }
      const data = await res.json()
      setMafiaState(data)
      return { state: data, ok: true }
    } catch {
      return { state: null, ok: false }
    }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, stateData: MafiaStateResponse | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && stateData != null && stateData.phase !== 'game_over') return 'active'
      if (gameData.status === 'finished' || stateData?.phase === 'game_over') return 'finished'
      return 'waiting'
    },
    []
  )

  const {
    screen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, MafiaStateResponse | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(game?.theme)

  useEffect(() => {
    if (screen !== 'active' || !myPlayerId || !mafiaState?.myState?.role) return
    const key = `mafia:${gameCode}:roleSeen:${myPlayerId}`
    if (mafiaState.phase === 'role_reveal') {
      // Seen naturally via the shared role_reveal phase — mark it so a late refresh doesn't
      // also trigger the late-join overlay once that phase has passed.
      localStorage.setItem(key, '1')
      return
    }
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    setForceRoleReveal(true)
    const t = setTimeout(() => setForceRoleReveal(false), 5000)
    return () => clearTimeout(t)
  }, [screen, myPlayerId, gameCode, mafiaState?.myState?.role, mafiaState?.phase])

  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'mafia_sessions', 'mafia_player_states', 'mafia_chat_messages'],
    load
  )
  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })
  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })
  useRoomMemberAutoJoin({
    gameCode,
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => join({ name }),
  })

  // ── Actions ──────────────────────────────────────────────────────────────────

  const submitNightAction = async (targetId: string, secondTargetId?: string) => {
    if (!myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/night-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeToken: myResumeToken,
          targetPlayerId: targetId,
          ...(secondTargetId ? { secondTargetPlayerId: secondTargetId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // A rejected action usually means our local phase/timer is stale (e.g. the phase
        // already advanced server-side just before this tap) — resync immediately instead of
        // leaving the player stuck looking at a screen that no longer matches reality.
        toastError(data.error ?? 'Action failed')
        await load()
      } else {
        toastSuccess('Night action submitted')
        await load()
      }
    } catch {
      toastError('Action failed')
    } finally {
      setActing(false)
    }
  }

  const submitDayVote = async (targetId: string | null) => {
    if (!myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken, targetPlayerId: targetId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Vote failed')
        await load()
      } else {
        toastSuccess(targetId ? 'Vote submitted' : 'Vote cleared/skipped')
        await load()
      }
    } catch {
      toastError('Vote failed')
    } finally {
      setActing(false)
    }
  }

  const submitSkipPhase = async () => {
    if (!myResumeToken) return
    try {
      const res = await fetch(`/api/mafia/${gameCode}/skip-phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to skip')
      }
      await load()
    } catch {
      toastError('Failed to skip')
    }
  }

  // Tap-to-act selection state — tapping a tile in MafiaPlayersGrid is the primary way to
  // act/vote (no separate button list); a fresh submission overwrites the previous one
  // server-side, so players can change their pick anytime before the phase ends by tapping
  // a different tile. Cupid's two-step pick and the current highlighted selection reset
  // whenever the phase or day number changes.
  const [cupidFirstPick, setCupidFirstPick] = useState<string | null>(null)
  const [nightSelection, setNightSelection] = useState<string | null>(null)
  const [voteSelection, setVoteSelection] = useState<string | null>(null)
  const phaseKey = `${mafiaState?.phase ?? ''}:${mafiaState?.dayNumber ?? 0}`
  useEffect(() => {
    setCupidFirstPick(null)
    setNightSelection(null)
    setVoteSelection(null)
  }, [phaseKey])

  const triggerAutoAdvance = useCallback(async () => {
    try {
      await fetch(`/api/mafia/${gameCode}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAuto: true }),
      })
      await load()
    } catch {
      /* ignore */
    }
  }, [gameCode, load])

  const sendChat = useCallback(
    async (msg: string, scope: 'night' | 'day' | 'ghost') => {
      if (!myResumeToken) return
      try {
        const res = await fetch(`/api/mafia/${gameCode}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resumeToken: myResumeToken, message: msg, scope }),
        })
        if (!res.ok) {
          const data = await res.json()
          toastError(data.error ?? 'Failed to send message')
        } else {
          await load()
        }
      } catch {
        toastError('Failed to send message')
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  const sendMafiaMessage = useCallback((msg: string) => sendChat(msg, 'night'), [sendChat])
  const sendDayMessage = useCallback((msg: string) => sendChat(msg, 'day'), [sendChat])
  const sendGhostMessage = useCallback((msg: string) => sendChat(msg, 'ghost'), [sendChat])

  const [replayReadyPending, setReplayReadyPending] = useState(false)
  const toggleReplayReady = useCallback(
    async (ready: boolean) => {
      if (!myResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
      setReplayReadyPending(true)
      try {
        const res = await fetch('/api/players/ready', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ready }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error ?? 'Failed to update ready')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setReplayReadyPending(false)
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={activePlayer?.name ?? ''}
          onRenamed={() => void load()}
          spectating={isViewer}
        />
        <LeaveGameButton
          gameCode={gameCode}
          playerId={myPlayerId}
          onLeft={() => {
            clearPlayerSession(gameCode)
            router.push('/')
          }}
          confirmMessage="You can rejoin with your player code if the host opens the lobby again."
        />
      </div>
    )
  }, [myPlayerId, game?.status, gameCode, activePlayer?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  // ── Screens ──────────────────────────────────────────────────────────────────

  if (screen === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <div className="flex flex-col items-center space-y-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-[var(--primary)] border-t-transparent" />
          <p className="text-lg font-medium">Entering the village...</p>
        </div>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-extrabold text-red-500">Room Not Found</h1>
          <p className="text-[var(--muted)]">This game room does not exist or has expired.</p>
          <button
            onClick={() => router.push('/')}
            className="btn-primary px-6 py-2 rounded-md font-semibold transition"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  const cfg = gameTypeConfig('mafia')
  const myName = players.find((p) => p.id === myPlayerId)?.name ?? ''
  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

  if (screen === 'join') {
    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="mafia"
            subtitle={joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : cfg.tagline}
            meta={game ? <GameInfoChips game={game} /> : null}
          />
        }
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="mafia"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="mafia" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <div className="glass-card p-6 rounded-2xl border border-[var(--border)]">
            <ReplayReadyRing
              players={players}
              meId={myPlayerId}
              isHost={false}
              minPlayers={MAFIA_MIN_PLAYERS}
              capacityGame={game}
              onToggleReady={(ready) => void toggleReplayReady(ready)}
              onStart={() => {}}
              pending={replayReadyPending}
              gameCode={gameCode}
              onLeft={handlePlayerLeft}
            />
          </div>
        </GameJoinLobbyShell>
      )
    }
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          capacityGame={game}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myName}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for host to start"
          rulesLink={<GameRulesLink gameType="mafia" variant="subtle" />}
          isSpectator={me?.spectator === true}
        />
      </GameJoinLobbyShell>
    )
  }

  // ── Active game ───────────────────────────────────────────────────────────────

  if (screen === 'active' && mafiaState) {
    const {
      phase,
      dayNumber,
      phaseDeadline,
      players: publicPlayers,
      myState,
      dayChatMessages,
      ghostChatMessages,
      voteTallies,
      voteChoices,
      votedPlayerIds,
      anonymousVotes,
      enabledRoles,
      rolesInGame,
      roleCounts,
      skipRequiredCount,
      skipRequestCount,
      hasRequestedSkip,
    } = mafiaState

    const me = publicPlayers.find((p) => p.id === myPlayerId)
    const amISpectator = !!myPlayerId && me == null
    const amIAlive = me != null && me.isAlive !== false
    const myRole = myState?.role
    // A late joiner never gets a real 'role_reveal' phase (it's a one-time whole-game window),
    // so forceRoleReveal substitutes a local few-second version of the same screen for them.
    const showRoleReveal = phase === 'role_reveal' || forceRoleReveal

    // Tap-a-tile action routing: which roster taps do what, depending on phase/role. Cupid's
    // two-step pick and the current highlighted selection are tracked in local state above.
    let gridOnSelect: ((id: string) => void) | undefined
    let gridSelectedIds: string[] = []
    if (amIAlive && !amISpectator) {
      if (phase === 'night' && myRole && !NO_NIGHT_ACTION_ROLES.includes(myRole)) {
        if (myRole === 'cupid') {
          if (!myState?.cupidLinkedNames && dayNumber === 1) {
            gridOnSelect = (id) => {
              if (!cupidFirstPick) {
                setCupidFirstPick(id)
              } else {
                void submitNightAction(cupidFirstPick, id)
                setCupidFirstPick(null)
              }
            }
            gridSelectedIds = cupidFirstPick ? [cupidFirstPick] : []
          }
        } else if (myRole === 'vigilante' && (myState?.vigilanteShotsRemaining ?? 0) < 1) {
          // No shots remaining — no tap action available.
        } else {
          gridOnSelect = (id) => {
            setNightSelection(id)
            void submitNightAction(id)
          }
          gridSelectedIds = nightSelection ? [nightSelection] : []
        }
      } else if (phase === 'voting') {
        gridOnSelect = (id) => {
          setVoteSelection(id)
          void submitDayVote(id)
        }
        gridSelectedIds = voteSelection ? [voteSelection] : []
      }
    }
    const cupidFirstPickName = cupidFirstPick
      ? (publicPlayers.find((p) => p.id === cupidFirstPick)?.name ?? null)
      : null

    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col">
        {/* Only show the generic viewer banner to true spectators (joined as viewer) — an
            eliminated player was actually playing and just gets the ghost chat below, not a
            "you're spectating, join when the lobby opens" message that doesn't apply to them. */}
        {amISpectator && <ViewerModeBanner />}

        <header className="px-4 py-3 border-b border-[var(--border)] bg-[var(--card)] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xl">🐺</span>
            <div>
              <h1 className="font-bold text-base text-[var(--primary)] leading-tight">Mafia</h1>
              <p className="text-[10px] text-[var(--muted)] uppercase tracking-widest font-semibold">
                {showRoleReveal ? 'Role Reveal' : `Day ${dayNumber} · ${PHASE_LABEL[phase] ?? phase}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MafiaRolesDrawer rolesInGame={rolesInGame ?? enabledRoles ?? []} myRole={myRole} roleCounts={roleCounts} />
            <GameRulesLink gameType="mafia" />
          </div>
        </header>

        <MafiaPhaseTimer
          deadline={phaseDeadline}
          onExpired={triggerAutoAdvance}
          label={PHASE_LABEL[phase] ?? undefined}
        />

        {showRoleReveal ? (
          // Role reveal is its own moment — just the role card and its description, no
          // player roster or chat competing for attention while everyone reads who they are.
          <main className="flex-1 max-w-md w-full mx-auto p-4 md:p-6">
            <MafiaRoleRevealScreen myState={myState} />
          </main>
        ) : (
          <main className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-6 flex flex-col md:grid md:grid-cols-3 gap-4 md:gap-6 md:items-start">
            <div className="md:col-span-2 space-y-4">
              <MafiaPlayersGrid
                players={publicPlayers}
                myPlayerId={myPlayerId}
                myRole={myRole}
                mafiaTeammateIds={myState?.mafiaTeammateIds}
                mafiaTeammateRoles={myState?.mafiaTeammateRoles}
                phase={phase}
                voteTallies={voteTallies}
                voteChoices={voteChoices}
                votedPlayerIds={votedPlayerIds}
                anonymousVotes={anonymousVotes}
                onSelect={gridOnSelect}
                selectedIds={gridSelectedIds}
                onSkipVote={amIAlive && !amISpectator ? () => void submitDayVote(null) : undefined}
                skipDisabled={acting}
              />

              {(phase === 'day' || phase === 'voting') && amIAlive && !amISpectator && (
                <MafiaSkipPhaseBar
                  phase={phase}
                  skipRequestCount={skipRequestCount ?? 0}
                  skipRequiredCount={skipRequiredCount ?? 1}
                  hasRequestedSkip={!!hasRequestedSkip}
                  disabled={acting}
                  onSkip={() => void submitSkipPhase()}
                />
              )}

              {(phase === 'night' || (phase === 'voting' && amIAlive && !amISpectator)) && (
                <MafiaPhaseCard
                  phase={phase}
                  dayNumber={dayNumber}
                  myState={myState}
                  amIAlive={amIAlive}
                  amISpectator={amISpectator}
                  acting={acting}
                  cupidFirstPickName={cupidFirstPickName}
                  onIgnite={() => {
                    if (myPlayerId) void submitNightAction(myPlayerId)
                  }}
                />
              )}

              <MafiaIdentityPanel myState={myState} />
            </div>

            {/* Right column mirrors Town Discussion's slot: the Mafia secret chat lives here on
              desktop during the night (rather than stacked in the left column), and Town
              Discussion takes the same slot once night ends — same position, matching
              Wolvesville's chat placement regardless of which chat is currently active. */}
            {(() => {
              const isWolfTeam = !!myRole && MAFIA_TEAM_ROLES.includes(myRole)
              const showSecretChat = isWolfTeam && amIAlive && phase === 'night'
              if (showSecretChat) {
                return (
                  <div className="md:col-span-1">
                    <MafiaSecretChat
                      messages={myState?.mafiaChatMessages ?? []}
                      onSendMessage={sendMafiaMessage}
                      myPlayerId={myPlayerId}
                    />
                  </div>
                )
              }
              if (phase !== 'night') {
                return (
                  <div className="md:col-span-1">
                    <MafiaDayChat
                      messages={dayChatMessages ?? []}
                      ghostMessages={!amIAlive ? (ghostChatMessages ?? []) : undefined}
                      onSendMessage={amIAlive ? sendDayMessage : sendGhostMessage}
                      myPlayerId={myPlayerId}
                      players={publicPlayers}
                      disabled={amISpectator}
                    />
                  </div>
                )
              }
              return null
            })()}
          </main>
        )}
      </div>
    )
  }

  // ── Finished / game over ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col justify-center items-center p-6 text-center">
      <div className="max-w-md w-full glass-card border border-[var(--border)] rounded-2xl p-8 shadow-2xl space-y-6">
        <h1 className="text-4xl font-extrabold text-[var(--primary)] animate-pulse">GAME OVER</h1>

        {mafiaState?.winningTeam ? (
          <div className="space-y-2">
            <p className="text-[var(--muted)] text-sm uppercase tracking-widest font-bold">Winning Team</p>
            <div className={`text-3xl font-black ${WINNING_TEAM_COLOR[mafiaState.winningTeam] ?? 'text-emerald-400'}`}>
              {WINNING_TEAM_LABEL[mafiaState.winningTeam] ?? mafiaState.winningTeam.toUpperCase()}
            </div>
          </div>
        ) : (
          <p className="text-[var(--muted)]">The game has finished!</p>
        )}

        <div className="border-t border-[var(--border)] pt-6">
          <h3 className="text-sm font-semibold tracking-widest uppercase text-[var(--primary)] mb-4 font-mono">
            Roles Reveal
          </h3>
          <div className="space-y-2">
            {mafiaState?.players.map((p) => (
              <div
                key={p.id}
                className="flex justify-between items-center text-sm p-2 rounded bg-[var(--surface-inset-bg)] border border-[var(--border)]"
              >
                <span className="font-semibold text-[var(--muted)]">
                  #{p.seatNumber} {p.name}
                  {p.id === myPlayerId && <span className="text-[var(--primary)] font-normal"> (you)</span>}
                </span>
                <span
                  className={`font-mono text-xs uppercase ${
                    p.role && MAFIA_TEAM_ROLES.includes(p.role)
                      ? 'text-red-400'
                      : p.role === 'jester'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                  }`}
                >
                  {p.role?.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => router.push('/')}
          className="w-full py-3 btn-secondary font-semibold rounded-xl transition"
        >
          Exit to Home
        </button>
      </div>
    </div>
  )
}
