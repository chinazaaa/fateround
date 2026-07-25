'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { MAFIA_ROLE_INFO, MAFIA_TEAM_ROLES, NO_NIGHT_ACTION_ROLES, mafiaRoleEmoji } from './mafia-role-info'
import type { MafiaStateResponse } from './mafia-types'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { ShareResultsCaptureHeader } from '@/components/ShareResultsCaptureHeader'
import { ShareActionButtons } from '@/components/ShareActionButtons'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { captureElementAsImage } from '@/lib/capture-element-image'
import { shareImageBlob, downloadBlobAsFile, shareFilenameStem } from '@/lib/share-image'
import type { Game } from '@/types'

const WINNING_TEAM_LABEL: Record<string, string> = {
  mafia: 'The Mafia wins!',
  village: 'The Village wins!',
  jester: 'The Jester wins!',
  serial_killer: 'The Serial Killer wins!',
  arsonist: 'The Arsonist wins!',
  lovers: 'The Lovers win!',
}
const WINNING_TEAM_EMOJI: Record<string, string> = {
  mafia: '🔪',
  village: '🏘️',
  jester: '🃏',
  serial_killer: '🔪',
  arsonist: '🔥',
  lovers: '💘',
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

export function MafiaPlayerView({ gameCode, embedded = false }: { gameCode: string; embedded?: boolean }) {
  const router = useRouter()
  const { error: toastError, success: toastSuccess } = useToast()
  useConfirm()
  const [mafiaState, setMafiaState] = useState<MafiaStateResponse | null>(null)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)
  const [vigilanteMode, setVigilanteMode] = useState<'shoot' | 'reveal' | null>(null)
  const [vigilanteRevealResult, setVigilanteRevealResult] = useState<{ targetName: string; role: string } | null>(null)
  const [priestMode, setPriestMode] = useState(false)
  const [witchMode, setWitchMode] = useState<'heal' | 'kill' | null>(null)

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
      const effective = stateData ?? mafiaState
      if (gameData.status === 'active' && effective != null && effective.phase !== 'game_over') return 'active'
      if (gameData.status === 'finished' || effective?.phase === 'game_over') return 'finished'
      if (gameData.status === 'active') return 'active'
      return 'waiting'
    },
    [mafiaState]
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

  // The timeout that clears forceRoleReveal is intentionally NOT returned as this effect's
  // cleanup — if the game's real phase changes again while the 5s overlay is showing (e.g.
  // the player was backgrounded and the server ticked several phases forward in the
  // meantime), this effect re-runs, and a cleanup-cancelled timeout with no replacement
  // (blocked by the localStorage guard below) would leave forceRoleReveal stuck true
  // forever — hiding an otherwise perfectly-progressing game behind a frozen role card
  // until a manual refresh. A ref-held timeout only ever gets cleared on unmount.
  const forceRoleRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
    forceRoleRevealTimeoutRef.current = setTimeout(() => setForceRoleReveal(false), 5000)
  }, [screen, myPlayerId, gameCode, mafiaState?.myState?.role, mafiaState?.phase])

  useEffect(() => {
    return () => {
      if (forceRoleRevealTimeoutRef.current) clearTimeout(forceRoleRevealTimeoutRef.current)
    }
  }, [])

  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'mafia_sessions', 'mafia_player_states', 'mafia_chat_messages'],
    load
  )
  // `mafia_chat_messages` is deliberately excluded from the realtime publication (the state
  // API enforces scope/role visibility server-side, so clients never read it directly) — so
  // postgres_changes on games/players/mafia_sessions/mafia_player_states never fires for a
  // new chat message on its own, and previously chat only refreshed on the next unrelated
  // state change (or never, until a manual reload). Poll on a short interval whenever the
  // game is active, even while otherwise realtime-connected, specifically to catch new chat.
  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : connected ? 4000 : POLL_INTERVALS.realtimeFallback,
    enabled: true,
    runImmediately: false,
  })
  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'finished' || screen === 'game_started_waiting') void load()
  })
  // Belt-and-suspenders alongside usePolling's own visibilitychange handler: a long-backgrounded
  // tab can have its Realtime websocket silently die without `connected` ever flipping false, so
  // a returning player could otherwise sit on stale state (still 'waiting'/mid-role-reveal) until
  // a manual refresh, even though the game moved on entirely server-side while they were away.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])
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

  const submitVigilanteAction = async (targetId: string, action: 'shoot' | 'reveal') => {
    if (!myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/vigilante-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken, targetPlayerId: targetId, action }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
      } else if (action === 'reveal' && data.revealedRole) {
        setVigilanteRevealResult({ targetName: data.revealedName, role: data.revealedRole })
        toastSuccess('Role revealed')
      } else {
        toastSuccess('Target shot')
      }
      setVigilanteMode(null)
      await load()
    } catch {
      toastError('Action failed')
    } finally {
      setActing(false)
    }
  }

  const submitWitchAction = async (targetId: string, potionType: 'heal' | 'kill') => {
    if (!myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/night-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken, targetPlayerId: targetId, potionType }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
        await load()
      } else {
        toastSuccess(potionType === 'heal' ? 'Heal potion used' : 'Kill potion used')
        await load()
      }
    } catch {
      toastError('Action failed')
    } finally {
      setActing(false)
      setWitchMode(null)
    }
  }

  const submitPriestAction = async (targetId: string) => {
    if (!myResumeToken) return
    setActing(true)
    try {
      const res = await fetch(`/api/mafia/${gameCode}/priest-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken: myResumeToken, targetPlayerId: targetId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Action failed')
      } else {
        toastSuccess(
          data.targetWasMafia ? 'Holy water hit — target was Mafia!' : 'Holy water missed — the Priest has died'
        )
      }
      setPriestMode(false)
      await load()
    } catch {
      toastError('Action failed')
    } finally {
      setActing(false)
    }
  }

  // Tap-to-act selection state — tapping a tile in MafiaPlayersGrid is the primary way to
  // act/vote (no separate button list); a fresh submission overwrites the previous one
  // server-side, so players can change their pick anytime before the phase ends by tapping
  // a different tile. Cupid's two-step pick and the current highlighted selection reset
  // whenever the phase or day number changes.
  // Mobile tab state — Wolvesville-style bottom tabs instead of one long scroll.
  const [mobileTab, setMobileTab] = useState<'players' | 'chat'>('players')
  const [chatUnread, setChatUnread] = useState(false)
  const lastSeenChatCountRef = useRef(0)

  const [cupidFirstPick, setCupidFirstPick] = useState<string | null>(null)
  const [arsonistFirstPick, setArsonistFirstPick] = useState<string | null>(null)
  const [detectiveFirstPick, setDetectiveFirstPick] = useState<string | null>(null)
  const [arsonistMode, setArsonistMode] = useState<'douse' | 'ignite' | null>(null)
  const [nightSelection, setNightSelection] = useState<string | null>(null)
  const [voteSelection, setVoteSelection] = useState<string | null>(null)
  const phaseKey = `${mafiaState?.phase ?? ''}:${mafiaState?.dayNumber ?? 0}`
  useEffect(() => {
    setCupidFirstPick(null)
    setDetectiveFirstPick(null)
    setNightSelection(null)
    setVoteSelection(null)
  }, [phaseKey])

  // Track unread chat messages when the player is on the Players tab (mobile only).
  const chatMsgCount = mafiaState?.dayChatMessages?.length ?? 0
  useEffect(() => {
    if (mobileTab === 'chat') {
      lastSeenChatCountRef.current = chatMsgCount
      setChatUnread(false)
    } else if (chatMsgCount > lastSeenChatCountRef.current) {
      setChatUnread(true)
    }
  }, [chatMsgCount, mobileTab])

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
  // Embedded inside MafiaHostView (the host is seated/spectating), the host view registers
  // its OWN settings node (rename + leave-seat + End game) — registering this one too would
  // just race it for the single settings-sheet slot, sometimes winning and hiding the host's
  // real "End game" button behind a plain player "Leave".
  useRegisterGameSettings(embedded ? null : playerSettingsNode)

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
          onReady={async () => {
            if (!myResumeToken) throw new Error('Your player session expired — rejoin to continue')
            const res = await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error ?? 'Failed to join')
            await load()
          }}
          onReadyError={(message) => toastError(message)}
        />
      </GameJoinLobbyShell>
    )
  }

  // ── Active game ───────────────────────────────────────────────────────────────

  if (screen === 'active' && mafiaState) {
    const {
      gameTitle,
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
    let cupidPicking = false
    let gridAllowDeadSelect = false
    if (amIAlive && !amISpectator) {
      if (phase === 'night' && myRole && !NO_NIGHT_ACTION_ROLES.includes(myRole)) {
        if (myRole === 'cupid') {
          if (!myState?.cupidLinkedNames && dayNumber === 1) {
            cupidPicking = true
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
        } else if (myRole === 'medium' && (myState?.mediumReviveRemaining ?? 0) > 0) {
          gridAllowDeadSelect = true
          gridOnSelect = (id) => {
            setNightSelection(id)
            void submitNightAction(id)
          }
          gridSelectedIds = nightSelection ? [nightSelection] : []
        } else if (myRole === 'arsonist' && arsonistMode === 'douse') {
          gridOnSelect = (id) => {
            if (!arsonistFirstPick) {
              setArsonistFirstPick(id)
            } else {
              void submitNightAction(arsonistFirstPick, id)
              setArsonistFirstPick(null)
            }
          }
          gridSelectedIds = arsonistFirstPick ? [arsonistFirstPick] : []
        } else if (myRole === 'detective') {
          gridOnSelect = (id) => {
            if (!detectiveFirstPick) {
              setDetectiveFirstPick(id)
            } else {
              void submitNightAction(detectiveFirstPick, id)
              setDetectiveFirstPick(null)
            }
          }
          gridSelectedIds = detectiveFirstPick ? [detectiveFirstPick] : []
        } else if (myRole === 'arsonist' && arsonistMode === 'ignite') {
          // Ignite is a one-click self-target — handled in the panel below, not via grid
        } else if (myRole === 'witch') {
          if (witchMode) {
            gridOnSelect = (id) => {
              void submitWitchAction(id, witchMode)
            }
            gridSelectedIds = []
          }
          // No mode selected yet — handled by the Witch Actions panel below
        } else if (myRole === 'little_girl') {
          // Self-only "open eyes" toggle — handled by the Little Girl panel below, not the grid
        } else if (myRole === 'trapper') {
          // Tapping a tile sets a new trap; "activate all traps" is a self-target button below
          gridOnSelect = (id) => {
            setNightSelection(id)
            void submitNightAction(id)
          }
          gridSelectedIds = nightSelection ? [nightSelection] : []
        } else if (myRole !== 'medium' && myRole !== 'arsonist') {
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
      if ((phase === 'day' || phase === 'voting') && myRole === 'vigilante' && vigilanteMode) {
        gridOnSelect = (id) => {
          void submitVigilanteAction(id, vigilanteMode)
        }
        gridSelectedIds = []
      }
      if ((phase === 'day' || phase === 'voting') && myRole === 'priest' && priestMode) {
        gridOnSelect = (id) => {
          void submitPriestAction(id)
        }
        gridSelectedIds = []
      }
    }
    const cupidFirstPickName = cupidFirstPick
      ? (publicPlayers.find((p) => p.id === cupidFirstPick)?.name ?? null)
      : null
    const detectiveFirstPickName = detectiveFirstPick
      ? (publicPlayers.find((p) => p.id === detectiveFirstPick)?.name ?? null)
      : null

    const isWolfTeam = !!myRole && MAFIA_TEAM_ROLES.includes(myRole)
    const showSecretChat = isWolfTeam && amIAlive && phase === 'night'
    const canSendDay = phase === 'day' || phase === 'voting'

    const playersContent = (
      <>
        <MafiaPlayersGrid
          players={publicPlayers}
          myPlayerId={myPlayerId}
          myRole={myRole}
          mafiaTeammateIds={myState?.mafiaTeammateIds}
          mafiaTeammateRoles={myState?.mafiaTeammateRoles}
          mafiaTeammateNightTargets={myState?.mafiaTeammateNightTargets}
          loverIds={myState?.loverIds}
          phase={phase}
          voteTallies={voteTallies}
          voteChoices={voteChoices}
          votedPlayerIds={votedPlayerIds}
          anonymousVotes={anonymousVotes}
          onSelect={gridOnSelect}
          selectedIds={gridSelectedIds}
          allowSelfSelect={cupidPicking}
          allowDeadSelect={gridAllowDeadSelect}
        />

        {(phase === 'day' || phase === 'voting') && myRole === 'vigilante' && amIAlive && !amISpectator && (
          <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">
              🔫 Vigilante Actions
            </h3>
            {vigilanteMode ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--foreground)]">
                  Tap a player to {vigilanteMode === 'shoot' ? 'shoot' : 'reveal their role'}
                </p>
                <button
                  type="button"
                  onClick={() => setVigilanteMode(null)}
                  className="text-xs text-[var(--muted)] underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {(myState?.vigilanteShotsRemaining ?? 0) > 0 && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => setVigilanteMode('shoot')}
                    className="flex-1 px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    🔫 Shoot
                  </button>
                )}
                {(myState?.vigilanteRevealRemaining ?? 0) > 0 && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => setVigilanteMode('reveal')}
                    className="flex-1 px-3 py-2 rounded-xl bg-purple-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    🔍 Reveal
                  </button>
                )}
                {(myState?.vigilanteShotsRemaining ?? 0) <= 0 && (myState?.vigilanteRevealRemaining ?? 0) <= 0 && (
                  <p className="text-xs text-[var(--muted)]">Both actions used.</p>
                )}
              </div>
            )}
            {(myState?.vigilanteRevealResult || vigilanteRevealResult) && (
              <p className="text-sm font-semibold text-purple-400">
                🔍 {(myState?.vigilanteRevealResult ?? vigilanteRevealResult)?.targetName} is{' '}
                <span className="uppercase">
                  {MAFIA_ROLE_INFO[
                    (myState?.vigilanteRevealResult ?? vigilanteRevealResult)?.role as keyof typeof MAFIA_ROLE_INFO
                  ]?.name ?? (myState?.vigilanteRevealResult ?? vigilanteRevealResult)?.role}
                </span>
              </p>
            )}
          </div>
        )}

        {(phase === 'day' || phase === 'voting') && myRole === 'priest' && amIAlive && !amISpectator && (
          <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">⛪ Priest Actions</h3>
            {priestMode ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--foreground)]">Tap a player to throw holy water on</p>
                <button
                  type="button"
                  onClick={() => setPriestMode(false)}
                  className="text-xs text-[var(--muted)] underline"
                >
                  Cancel
                </button>
              </div>
            ) : (myState?.priestHolyWaterRemaining ?? 0) > 0 ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => setPriestMode(true)}
                  className="flex-1 px-3 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-40"
                >
                  💧 Throw Holy Water
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--muted)]">Holy water already used.</p>
            )}
          </div>
        )}

        {phase === 'night' && myRole === 'witch' && amIAlive && !amISpectator && (
          <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">🧪 Witch Potions</h3>
            {witchMode ? (
              <div className="space-y-2">
                <p className="text-sm text-[var(--foreground)]">
                  Tap a player to {witchMode === 'heal' ? 'heal' : 'kill'}
                </p>
                <button
                  type="button"
                  onClick={() => setWitchMode(null)}
                  className="text-xs text-[var(--muted)] underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {(myState?.witchHealRemaining ?? 0) > 0 && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => setWitchMode('heal')}
                    className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-40"
                  >
                    💚 Heal Potion
                  </button>
                )}
                {(myState?.witchKillRemaining ?? 0) > 0 && dayNumber > 1 && (
                  <button
                    type="button"
                    disabled={acting}
                    onClick={() => setWitchMode('kill')}
                    className="flex-1 px-3 py-2 rounded-xl bg-purple-700 text-white text-sm font-bold disabled:opacity-40"
                  >
                    ☠️ Kill Potion
                  </button>
                )}
                {(myState?.witchKillRemaining ?? 0) > 0 && dayNumber === 1 && (
                  <p className="text-xs text-[var(--muted)] flex-1 self-center">☠️ Kill potion unlocks night 2.</p>
                )}
                {(myState?.witchHealRemaining ?? 0) <= 0 && (myState?.witchKillRemaining ?? 0) <= 0 && (
                  <p className="text-xs text-[var(--muted)]">Both potions used.</p>
                )}
              </div>
            )}
          </div>
        )}

        {phase === 'night' && myRole === 'little_girl' && amIAlive && !amISpectator && (
          <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">🎀 Little Girl</h3>
            {myState?.nightActionSubmitted ? (
              <p className="text-sm text-[var(--foreground)]">
                Your eyes are open tonight — 75% you see nothing, 20% you spot a Mafia member, 5% they catch you.
              </p>
            ) : (
              <button
                type="button"
                disabled={acting}
                onClick={() => myPlayerId && void submitNightAction(myPlayerId)}
                className="w-full px-3 py-2 rounded-xl bg-pink-600 text-white text-sm font-bold disabled:opacity-40"
              >
                👀 Open your eyes
              </button>
            )}
          </div>
        )}

        {phase === 'night' && myRole === 'trapper' && amIAlive && !amISpectator && (
          <div className="glass-card border border-[var(--border)] rounded-2xl p-4 space-y-3">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)]">🪤 Trapper</h3>
            <p className="text-sm text-[var(--foreground)]">
              Traps set: {myState?.trapperTrappedNames?.length ?? 0}/3
              {(myState?.trapperTrappedNames?.length ?? 0) > 0 && ` — ${myState?.trapperTrappedNames?.join(', ')}`}
            </p>
            <p className="text-xs text-[var(--muted)]">Tap a player to set a trap on their house.</p>
            <button
              type="button"
              disabled={acting || (myState?.trapperTrappedNames?.length ?? 0) === 0}
              onClick={() => myPlayerId && void submitNightAction(myPlayerId)}
              className="w-full px-3 py-2 rounded-xl bg-amber-700 text-white text-sm font-bold disabled:opacity-40"
            >
              💥 Activate all traps
            </button>
          </div>
        )}

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
            detectiveFirstPickName={detectiveFirstPickName}
            onIgnite={() => {
              if (myPlayerId) void submitNightAction(myPlayerId)
            }}
            arsonistMode={arsonistMode}
            onArsonistModeChange={(mode) => {
              setArsonistMode(mode)
              if (!mode) setArsonistFirstPick(null)
            }}
            arsonistFirstPickName={
              arsonistFirstPick ? (publicPlayers.find((p) => p.id === arsonistFirstPick)?.name ?? null) : null
            }
          />
        )}

        <MafiaIdentityPanel myState={myState} />
      </>
    )

    const chatContent = (
      <div className="space-y-4">
        {phase === 'night' ? (
          <>
            {showSecretChat && (
              <MafiaSecretChat
                messages={myState?.mafiaChatMessages ?? []}
                onSendMessage={sendMafiaMessage}
                myPlayerId={myPlayerId}
              />
            )}
            {myRole === 'medium' && amIAlive && (myState?.mediumGhostChat?.length ?? 0) > 0 && (
              <div className="glass-card border border-purple-500/30 rounded-2xl p-4">
                <h3 className="text-[10px] font-bold tracking-widest uppercase text-purple-400 mb-2">
                  🔮 Voices from beyond
                </h3>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {myState!.mediumGhostChat!.map((m) => (
                    <p key={m.id} className="text-xs text-purple-300/80">
                      <span className="font-bold text-purple-400">{m.sender_name}:</span> {m.message}
                    </p>
                  ))}
                </div>
              </div>
            )}
            <MafiaDayChat
              messages={dayChatMessages ?? []}
              ghostMessages={!amIAlive ? (ghostChatMessages ?? []) : undefined}
              onSendMessage={amIAlive ? sendDayMessage : sendGhostMessage}
              myPlayerId={myPlayerId}
              players={publicPlayers}
              readOnly={amIAlive}
              readOnlyLabel="night"
            />
          </>
        ) : (
          <MafiaDayChat
            messages={dayChatMessages ?? []}
            ghostMessages={!amIAlive ? (ghostChatMessages ?? []) : undefined}
            onSendMessage={amIAlive ? sendDayMessage : sendGhostMessage}
            myPlayerId={myPlayerId}
            players={publicPlayers}
            readOnly={!canSendDay}
            readOnlyLabel={PHASE_LABEL[phase]?.toLowerCase()}
            disabled={amISpectator}
          />
        )}
      </div>
    )

    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col overflow-x-hidden">
        {amISpectator && <ViewerModeBanner />}

        <header className="px-4 py-3 border-b border-[var(--border)] bg-[var(--card)] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-xl">🐺</span>
            <div>
              <h1 className="font-bold text-base text-[var(--primary)] leading-tight">{gameTitle || 'Mafia'}</h1>
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
          <main className="flex-1 max-w-md w-full mx-auto p-4 md:p-6 overflow-y-auto">
            <MafiaRoleRevealScreen myState={myState} />
          </main>
        ) : (
          <>
            {/* Desktop: side-by-side grid (unchanged) */}
            <main className="hidden md:grid flex-1 max-w-6xl w-full mx-auto p-6 md:grid-cols-3 gap-6 md:items-start">
              <div className="md:col-span-2 space-y-4">{playersContent}</div>
              <div className="md:col-span-1 space-y-4">{chatContent}</div>
            </main>

            {/* Mobile: tabbed content switcher below the timer */}
            <div className="md:hidden">
              <nav className="flex border-b border-[var(--border)] bg-[var(--card)]">
                <button
                  onClick={() => setMobileTab('players')}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider text-center transition ${
                    mobileTab === 'players'
                      ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                      : 'text-[var(--muted)]'
                  }`}
                >
                  Players
                </button>
                <button
                  onClick={() => setMobileTab('chat')}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider text-center transition relative ${
                    mobileTab === 'chat'
                      ? 'text-[var(--primary)] border-b-2 border-[var(--primary)]'
                      : 'text-[var(--muted)]'
                  }`}
                >
                  Chat
                  {chatUnread && mobileTab !== 'chat' && (
                    <span className="absolute top-1.5 right-[calc(50%-16px)] w-2 h-2 rounded-full bg-red-500" />
                  )}
                </button>
              </nav>
              <div className="p-4 space-y-4">{mobileTab === 'players' ? playersContent : chatContent}</div>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Finished / game over ──────────────────────────────────────────────────────

  const winningTeam = mafiaState?.winningTeam ?? null

  return <MafiaFinishedScreen game={game!} mafiaState={mafiaState} winningTeam={winningTeam} myPlayerId={myPlayerId} />
}

function MafiaFinishedScreen({
  game,
  mafiaState,
  winningTeam,
  myPlayerId,
}: {
  game: Game
  mafiaState: MafiaStateResponse | null
  winningTeam: string | null
  myPlayerId: string | null
}) {
  const router = useRouter()
  const { error: toastError, success: toastSuccess } = useToast()
  const captureRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const doCapture = async () => {
    if (!captureRef.current) return null
    return captureElementAsImage(captureRef.current)
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      const blob = await doCapture()
      if (!blob) return
      const filename = `${shareFilenameStem(game.title ?? 'mafia')}.png`
      const result = await shareImageBlob(blob, filename)
      if (result === 'shared') toastSuccess('Shared!')
      else if (result === 'copied') toastSuccess('Image copied to clipboard')
      else toastSuccess('Image downloaded')
    } catch {
      toastError('Failed to share')
    } finally {
      setSharing(false)
    }
  }

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const blob = await doCapture()
      if (!blob) return
      downloadBlobAsFile(blob, `${shareFilenameStem(game.title ?? 'mafia')}.png`)
    } catch {
      toastError('Failed to download')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4 md:p-6">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div ref={captureRef} className="space-y-4">
          <ShareResultsCaptureHeader game={game} />
          <div className="glass-card border border-[var(--border)] rounded-2xl p-6">
            <FinishedWinnerHero
              game={game}
              emoji={winningTeam ? (WINNING_TEAM_EMOJI[winningTeam] ?? '🏆') : '🏁'}
              headline={winningTeam ? (WINNING_TEAM_LABEL[winningTeam] ?? 'Game over!') : 'Game over — no winner'}
              subtitle="Mafia"
            />
          </div>

          <div className="glass-card border border-[var(--border)] rounded-2xl p-5">
            <h3 className="text-[10px] font-bold tracking-widest uppercase text-[var(--primary)] mb-3">Roles reveal</h3>
            <div className="space-y-2">
              {mafiaState?.players.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center text-sm p-2 rounded-lg bg-[var(--surface-inset-bg)] border border-[var(--border)]"
                >
                  <span className="font-semibold text-[var(--foreground)]">
                    #{p.seatNumber} {p.name}
                    {p.id === myPlayerId && <span className="text-[var(--primary)] font-normal"> (you)</span>}
                  </span>
                  <span
                    className={`font-bold text-xs uppercase ${
                      p.role && MAFIA_TEAM_ROLES.includes(p.role)
                        ? 'text-red-400'
                        : p.role === 'jester'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {p.role ? `${mafiaRoleEmoji(p.role)} ${MAFIA_ROLE_INFO[p.role]?.name ?? p.role}` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <ShareActionButtons
            shareLabel="Share results"
            onShare={handleShare}
            onDownload={handleDownload}
            sharing={sharing}
            downloading={downloading}
            primary
          />

          <CreateNewGameButton className="btn-secondary w-full py-3 text-sm sm:text-base" />

          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full py-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Back home
          </button>
        </div>
      </div>
    </div>
  )
}
