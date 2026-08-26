'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  RummyCard as RummyCardBox,
  RummyLoadingScreen,
  RummySecondaryButton,
  RummyShell,
} from '@/components/rummy/RummyChrome'
import { RummyGamePanel } from '@/components/rummy/RummyBoard'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { RulesInPlaySection } from '@/components/game-lobby/RulesInPlaySection'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import { RUMMY_MIN_PLAYERS } from '@/lib/rummy'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, Player, RummyCard, RummyPlayerHand, RummySession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useRummyTurnTimer } from '@/hooks/useRummyTurnTimer'
import { useRummyGameTimer } from '@/hooks/useRummyGameTimer'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { PlayerRoomShell } from '@/components/rooms/PlayerRoomShell'
import { RummyFinalResultsShareBlock } from '@/components/rummy/RummyFinalResultsShareBlock'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

/**
 * Rummy player view — full lifecycle from join → lobby → active table → finished.
 * Structure mirrors TicTacToePlayerView (the closest turn-based game with a comparable
 * shape): shared bootstrap hook resolves the player + game rows, `useGameTableSync` keeps
 * the session + hand rows in sync, and every action goes through the /api/rummy/* routes.
 */

const RUMMY_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,phase,draw_pile,discard_pile,top_discard,turn_step,status_message,winner_player_id,winning_melds,reshuffle_count,turn_deadline_at,created_at,updated_at'
const RUMMY_HAND_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

async function loadHands(gameCode: string): Promise<{ hands: RummyPlayerHand[]; ok: boolean }> {
  const res = await supabase
    .from('rummy_player_hands')
    .select(RUMMY_HAND_SELECT)
    .eq('game_id', gameCode)
    .order('player_order')
  if (!supabasePollOk(res)) return { hands: [], ok: false }
  return { hands: (res.data as RummyPlayerHand[]) ?? [], ok: true }
}

export function RummyPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<RummySession | null>(null)
  const sessionRef = useRef<RummySession | null>(null)
  sessionRef.current = session
  const [hands, setHands] = useState<RummyPlayerHand[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  const loadGameState = useCallback(async (): Promise<{ state: RummySession | null; ok: boolean }> => {
    const [sessionRes, handsRes] = await Promise.all([
      supabase.from('rummy_sessions').select(RUMMY_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      loadHands(gameCode),
    ])
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as RummySession | null) : null
    if (sessionData) setSession(sessionData)
    // A failed hands query must NOT clobber the last-known hand — otherwise a transient
    // Supabase blip would blank the player's own hand until the next successful poll.
    if (handsRes.ok) setHands(handsRes.hands)
    return { state: sessionData, ok: supabasePollOk(sessionRes) && handsRes.ok }
  }, [gameCode])

  const computeScreen = useCallback(
    (gameData: Game, playerId: string | null, sessionData: RummySession | null): Screen => {
      if (!playerId) {
        const pre = preJoinScreen(gameData, false)
        if (pre === 'game_started_waiting') return 'game_started_waiting'
        if (pre === 'game_ended') return 'game_ended'
        return 'join'
      }
      if (gameData.status === 'waiting') return 'waiting'
      if (gameData.status === 'active' && sessionData?.phase !== 'finished') return 'active'
      if (sessionData?.phase === 'finished' || gameData.status === 'finished') return 'finished'
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
  } = useGameViewBootstrap<Screen, RummySession | null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  useApplyGameTheme(screen === 'game_ended' ? 'default' : game?.theme)

  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as RummySession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    // A move mutates the session AND at least one hand row; still need a full reload for hands.
    return false
  }, [])

  const connected = useGameTableSync(
    gameCode,
    [
      'players',
      { table: 'games', column: 'id' },
      { table: 'rummy_sessions', apply: applySessionRow },
      { table: 'rummy_player_hands' },
    ],
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

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    void load()
  }

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

  const callAction = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      if (!myResumeToken) {
        toastError('Your player session expired — rejoin to continue')
        return
      }
      setActing(true)
      try {
        const res = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, ...body }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          toastError(data.error ?? 'Action failed')
        } else {
          await load()
        }
      } finally {
        setActing(false)
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  const cfg = gameTypeConfig('rummy')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session?.turn_order[session.current_turn_index] ?? null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  const myName = activePlayer?.name ?? ''
  const myHand = useMemo<RummyCard[] | null>(() => {
    if (!myPlayerId) return null
    const row = hands.find((h) => h.player_id === myPlayerId)
    return (row?.cards as RummyCard[] | null) ?? null
  }, [hands, myPlayerId])

  useTurnNotifications({
    status: game?.status,
    isMyTurn: isViewer ? null : isMyTurn,
    enabled: !isViewer,
  })

  const { secondsLeft, hasTimer, urgent } = useRummyTurnTimer(gameCode, session, game?.status === 'active' && !isViewer)
  const {
    label: gameCountdown,
    active: gameCountdownActive,
    secondsLeft: gameSecondsLeft,
    durationSeconds: gameDurationSeconds,
  } = useRummyGameTimer(gameCode, game)

  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <RulesInPlaySection game={game} />
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={myName}
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
  }, [game, myPlayerId, gameCode, myName, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <RummyLoadingScreen />

  if (screen === 'not_found') {
    return (
      <RummyShell title="Game not found">
        <RummyCardBox className="p-6 text-center space-y-3">
          <p className="text-muted">This game code doesn&apos;t exist.</p>
          <RummySecondaryButton onClick={() => router.push('/')}>Go home</RummySecondaryButton>
        </RummyCardBox>
      </RummyShell>
    )
  }

  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }
    const joiningAsViewer = game?.status === 'active'
    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={
          <GameJoinHeader
            emoji={cfg.headerEmoji}
            title={game?.title ?? cfg.label}
            gameType="rummy"
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
          gameType="rummy"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="rummy" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }
  if (screen === 'game_ended') return <GameEndedScreen game={game} />

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={RUMMY_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
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
          rulesLink={<GameRulesLink gameType="rummy" variant="subtle" />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
          onReadyError={toastError}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    const iWon = myPlayerId != null && session?.winner_player_id === myPlayerId
    return (
      <RummyShell title={game?.title ?? cfg.label} compact>
        {game && session && (
          <RummyFinalResultsShareBlock
            game={game}
            players={players as Player[]}
            hands={hands}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={myPlayerId}
          />
        )}
        {iWon && game && (
          <PostWinToCommunity gameType="rummy" gameCode={gameCode} winnerName={myName} roundKey={session?.id} />
        )}
      </RummyShell>
    )
  }

  // Active play mounts inside PlayerRoomShell — the design-system room frame provides the
  // `.fr-room fr-room-poll` → `.pr-stage` ancestor that the shared card-table CSS (`.fr-room .pc`,
  // `.fr-room .ct-surface`, `.fr-room .hand`) scopes under. Without it every card renders as
  // unstyled default flow (three stacked spans per card).
  return (
    <PlayerRoomShell>
      {isViewer && <ViewerModeBanner />}
      {session && (
        <RummyGamePanel
          session={session}
          players={players as Player[]}
          myPlayerId={myPlayerId}
          myHand={isViewer ? null : myHand}
          isMyTurn={isMyTurn && !isViewer}
          isViewer={isViewer}
          acting={acting}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
          gameCountdown={gameCountdownActive ? gameCountdown : null}
          gameSecondsLeft={gameSecondsLeft}
          gameDurationSeconds={gameDurationSeconds}
          onDraw={(source) => void callAction('/api/rummy/draw', { source })}
          onDiscard={(cardId) => void callAction('/api/rummy/discard', { cardId })}
          onGoOut={(melds, discardCardId) => void callAction('/api/rummy/go-out', { melds, discardCardId })}
        />
      )}
    </PlayerRoomShell>
  )
}
