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
import { MafiaDayChat } from './MafiaChat'
import { MafiaGhostChat } from './MafiaChat'
import { MafiaIdentityPanel } from './MafiaIdentityPanel'
import { MafiaPhaseCard } from './MafiaPhaseCard'
import { MafiaPlayersGrid } from './MafiaPlayersGrid'
import { MafiaRolesDrawer } from './MafiaRolesDrawer'
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
      lastNightMafiaHadTarget,
      lastVoteResultPlayerId,
      dayChatMessages,
      ghostChatMessages,
      voteTallies,
      voteChoices,
      votedPlayerIds,
      anonymousVotes,
      votesRequired,
      enabledRoles,
      roleCounts,
    } = mafiaState

    const me = publicPlayers.find((p) => p.id === myPlayerId)
    const amISpectator = !!myPlayerId && me == null
    const amIAlive = me != null && me.isAlive !== false
    const votedPlayer = publicPlayers.find((p) => p.id === lastVoteResultPlayerId)
    const myRole = myState?.role
    const newlyDeadTonight = publicPlayers.filter(
      (p) => !p.isAlive && p.deathDay === dayNumber && p.deathCause !== 'village_vote'
    )

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

    // Public phase narrative — folded into the shared activity feed (below) as system lines,
    // since it's visible to the whole town, not just the acting player. Killer attribution
    // matches Wolvesville's "The Mafia killed #8 Michelle (Villager)" style — the role is
    // already publicly revealed on death (the roster tile shows it too), so naming it here
    // doesn't leak anything new.
    const KILLER_LABEL: Record<string, string> = {
      mafia_kill: 'The Mafia',
      serial_kill: 'The Serial Killer',
      arson: 'The Arsonist',
      vigilante_kill: 'The Vigilante',
    }
    const systemLines: { id: string; text: string; tone?: 'default' | 'danger' | 'success' }[] = []
    if (phase === 'day_report') {
      if (newlyDeadTonight.length > 0) {
        newlyDeadTonight.forEach((p) => {
          const killer = p.deathCause ? (KILLER_LABEL[p.deathCause] ?? 'Someone') : 'Someone'
          const roleText = p.role ? ` (${p.role.replace(/_/g, ' ')})` : ''
          systemLines.push({
            id: `death-${p.id}`,
            text: `☠️ ${killer} killed #${p.seatNumber} ${p.name}${roleText}`,
            tone: 'danger',
          })
        })
      } else {
        systemLines.push({
          id: 'no-death',
          text: lastNightMafiaHadTarget
            ? '🏥 The Doctor saved the village last night!'
            : '😴 No one was attacked last night.',
          tone: 'success',
        })
      }
    } else if (phase === 'day') {
      systemLines.push({ id: `day-${dayNumber}`, text: `☀️ Day ${dayNumber} has started. Get ready to discuss!` })
    } else if (phase === 'voting') {
      systemLines.push({
        id: `voting-${dayNumber}`,
        text: votesRequired
          ? `🗳️ Get ready to vote! (${votesRequired} vote${votesRequired === 1 ? '' : 's'} required)`
          : '🗳️ Voting has begun.',
      })
    } else if (phase === 'elimination') {
      systemLines.push(
        votedPlayer
          ? {
              id: `elim-${dayNumber}`,
              text: `⚖️ The Village killed #${votedPlayer.seatNumber} ${votedPlayer.name}${
                votedPlayer.role ? ` (${votedPlayer.role.replace(/_/g, ' ')})` : ''
              }`,
              tone: 'danger',
            }
          : { id: `elim-${dayNumber}`, text: '🤝 No majority reached — nobody was eliminated.' }
      )
    }

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
                {phase === 'role_reveal' ? 'Role Reveal' : `Day ${dayNumber} · ${PHASE_LABEL[phase] ?? phase}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MafiaRolesDrawer enabledRoles={enabledRoles ?? []} myRole={myRole} roleCounts={roleCounts} />
            <GameRulesLink gameType="mafia" />
          </div>
        </header>

        <MafiaPhaseTimer
          deadline={phaseDeadline}
          onExpired={triggerAutoAdvance}
          label={PHASE_LABEL[phase] ?? undefined}
        />

        <main className="flex-1 max-w-3xl w-full mx-auto p-4 md:p-6 space-y-4">
          <MafiaPlayersGrid
            players={publicPlayers}
            myPlayerId={myPlayerId}
            myRole={myRole}
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

          {(phase === 'role_reveal' || phase === 'night' || (phase === 'voting' && amIAlive && !amISpectator)) && (
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

          <MafiaIdentityPanel
            myState={myState}
            myPlayerId={myPlayerId}
            mySeatNumber={me?.seatNumber ?? null}
            amIAlive={amIAlive}
            mafiaChatMessages={myState?.mafiaChatMessages ?? []}
            onSendMafiaMessage={sendMafiaMessage}
          />

          {phase !== 'night' && phase !== 'role_reveal' && (
            <MafiaDayChat
              messages={dayChatMessages ?? []}
              onSendMessage={sendDayMessage}
              myPlayerId={myPlayerId}
              players={publicPlayers}
              systemLines={systemLines}
              disabled={!amIAlive || amISpectator}
            />
          )}

          {!amIAlive && myPlayerId && (
            <MafiaGhostChat
              messages={ghostChatMessages ?? []}
              onSendMessage={sendGhostMessage}
              myPlayerId={myPlayerId}
              players={publicPlayers}
            />
          )}
        </main>
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
