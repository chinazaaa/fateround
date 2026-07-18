'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CrazyEightsCard,
  CrazyEightsLoadingScreen,
  CrazyEightsSecondaryButton,
  CrazyEightsShell,
} from '@/components/crazy-eights/CrazyEightsChrome'
import { CrazyEightsPlaySurface } from '@/components/crazy-eights/CrazyEightsPlaySurface'
import { PlayerRoomShell } from '@/components/rooms/PlayerRoomShell'
import { CrazyEightsFinalResultsShareBlock } from '@/components/crazy-eights/CrazyEightsFinalResultsShareBlock'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getNormalizedPenalties,
  hasPlayableCard,
  isDrawPileDepleted,
  parseCrazyEightsRules,
  CRAZY8_MIN_PLAYERS,
} from '@/lib/crazy-eights'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { supabase } from '@/lib/supabase'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, CrazyEightsPlayerHand, CrazyEightsSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { preJoinScreen, playerIsViewer } from '@/lib/viewers'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { useCrazyEightsTurnTimer } from '@/hooks/useCrazyEightsTurnTimer'
import { useCrazyEightsGameTimer } from '@/hooks/useCrazyEightsGameTimer'
import { useCrazyEightsNotifications, playCrazyEightsActionSound } from '@/hooks/useCrazyEightsNotifications'

const CRAZY8_SESSION_SELECT =
  'id,game_id,turn_order,current_turn_index,direction,phase,draw_pile,discard_pile,top_card,required_suit,pick_two_stack,joker_penalty,status_message,winner_player_id,finish_order,turn_deadline_at,created_at,updated_at'
const CRAZY8_PLAYER_HANDS_SELECT = 'id,game_id,player_id,cards,player_order,created_at'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function CrazyEightsPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<CrazyEightsSession | null>(null)
  const sessionRef = useRef<CrazyEightsSession | null>(null)
  sessionRef.current = session
  const [hands, setHands] = useState<CrazyEightsPlayerHand[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  const [acting, setActing] = useState(false)

  // Game-specific load: fetch the crazy eights session + player hands (the shared
  // game/players fetch + session resolution lives in useGameViewBootstrap).
  const loadGameState = useCallback(async (): Promise<{ state: CrazyEightsSession | null; ok: boolean }> => {
    const [sessionRes, handsRes] = await Promise.all([
      supabase.from('crazy_eights_sessions').select(CRAZY8_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('crazy_eights_player_hands')
        .select(CRAZY8_PLAYER_HANDS_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    const sessionData = supabasePollOk(sessionRes) ? (sessionRes.data as CrazyEightsSession | null) : null
    if (sessionData) setSession(sessionData)
    if (supabasePollOk(handsRes)) setHands((handsRes.data as CrazyEightsPlayerHand[]) ?? [])
    return { state: sessionData, ok: supabasePollOk(sessionRes, handsRes) }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    if (gameData.status === 'waiting') return 'waiting'
    if (gameData.status === 'active') return 'active'
    return 'finished'
  }, [])

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
  } = useGameViewBootstrap<Screen, CrazyEightsSession | null>({
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

  // Realtime push: reload on any change to this game's row + its tables.
  // Delta fast-path (dual-table). Screen derives from game.status, so session/hand writes
  // only update the board UI — patch locally and skip the reload; the active→finished
  // transition rides the games-row event, and the fallback poll reconciles.
  const applySessionRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as CrazyEightsSession
    const prev = sessionRef.current
    if (prev && next.updated_at < prev.updated_at) return true
    setSession(next)
    sessionRef.current = next
    return prev != null
  }, [])
  const applyHandRow = useCallback((row: Record<string, unknown>): boolean => {
    const next = row as unknown as CrazyEightsPlayerHand
    setHands((prev) => {
      const i = prev.findIndex((h) => h.id === next.id)
      if (i === -1) return [...prev, next].sort((a, b) => a.player_order - b.player_order)
      const copy = [...prev]
      copy[i] = next
      return copy
    })
    return true
  }, [])

  const connected = useGameTableSync(
    gameCode,
    [
      'players',
      { table: 'games', column: 'id' },
      { table: 'crazy_eights_sessions', apply: applySessionRow },
      { table: 'crazy_eights_player_hands', apply: applyHandRow },
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: POLL_INTERVALS.realtimeFallback,
    enabled: !connected,
    runImmediately: false,
  })

  // Ready-up ring: readiness = holding a seat, so this reuses /players/ready (which
  // toggles the spectator flag). `ready:false` sits the player back out.
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

  const postAction = async (path: string, body: Record<string, unknown>) => {
    if (!myPlayerId) return
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
      const data = await res.json()
      if (!res.ok) toastError(data.error ?? 'Action failed')
      else {
        playCrazyEightsActionSound()
        await load()
      }
    } finally {
      setActing(false)
    }
  }

  const myHandRow = useMemo(() => hands.find((h) => h.player_id === myPlayerId), [hands, myPlayerId])
  const myHand = useMemo(() => myHandRow?.cards ?? [], [myHandRow])

  const handCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const h of hands) {
      counts[h.player_id] = h.cards?.length ?? 0
    }
    return counts
  }, [hands])

  const cfg = gameTypeConfig('crazy_eights')
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const turnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = myPlayerId != null && turnPlayerId === myPlayerId
  const activePlayer = myPlayerId ? players.find((p) => p.id === myPlayerId) : undefined
  const isViewer = !!(game && activePlayer && playerIsViewer(activePlayer, game))
  // "Out" = we can see this player's dealt hand and it's now empty (they played their last
  // card and went out). Require the hand row to actually be loaded — after a network drop
  // `hands` can be briefly empty/unfetched, and treating a not-yet-loaded hand as empty would
  // flip a still-playing player into the watch-only UI until the next refetch.
  const isOut = !!myHandRow && myHand.length === 0 && game?.status === 'active'
  const isWatching = isViewer || isOut

  // Turn timer (per-player countdown) + game timer (overall duration). Both hooks
  // also drive side effects (deadline sync, auto-expire); their values render as
  // the seat countdown chip + the top game-time bar in the play surface.
  const turnTimer = useCrazyEightsTurnTimer(gameCode, session, game?.status === 'active' && screen === 'active')
  const gameTimer = useCrazyEightsGameTimer(gameCode, game)

  useCrazyEightsNotifications({
    game,
    session,
    myPlayerId,
    myHandCount: myHand.length,
    enabled: game?.status === 'active' && screen === 'active',
  })

  const drawDepleted = session ? isDrawPileDepleted(session) : false
  const crazyEightsRules = useMemo(() => parseCrazyEightsRules(game), [game])
  const myCanPlay = session ? hasPlayableCard(myHand, session, crazyEightsRules) : false
  const penalties = session ? getNormalizedPenalties(session) : { pickTwo: 0, jokerPenalty: 0 }

  // Change name · Leave game for players/spectators live behind the main chrome's ⚙
  // gear (top header). Registered while the game is active; the shared settings sheet
  // renders it. Purely additive — the in-page PlayerSessionControls stays as-is.
  // Card game: "spectating" folds in the played-out watcher state (isWatching), like Whot.
  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId || game?.status !== 'active') return null
    return (
      <div className="space-y-3">
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={activePlayer?.name ?? ''}
          onRenamed={() => void load()}
          spectating={isWatching}
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
  }, [myPlayerId, game?.status, gameCode, activePlayer?.name, isWatching, load, router])
  useRegisterGameSettings(playerSettingsNode)

  if (screen === 'loading') return <CrazyEightsLoadingScreen />

  if (screen === 'not_found') {
    return (
      <CrazyEightsShell title="Game not found">
        <CrazyEightsCard className="p-6 text-center">
          <p className="text-muted mb-4">This game code does not exist.</p>
          <CrazyEightsSecondaryButton onClick={() => router.push('/')}>Go home</CrazyEightsSecondaryButton>
        </CrazyEightsCard>
      </CrazyEightsShell>
    )
  }

  if (screen === 'game_started_waiting' && game) {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={() => void load()} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
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
            emoji="🃏"
            title={game?.title ?? cfg.label}
            gameType="crazy_eights"
            subtitle={
              joiningAsViewer ? 'Game in progress — join as a viewer (read-only).' : '2–6 players · match suit or rank'
            }
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
          gameType="crazy_eights"
          submitLabel={joiningAsViewer ? 'Join as viewer' : 'Join game'}
          label=""
          footer={
            <p className="text-center pt-1">
              <GameRulesLink gameType="crazy_eights" variant="subtle" />
            </p>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    // "Play again · same settings" reopened the lobby with the ready-up ring.
    if (game?.replay_pending) {
      return (
        <GameJoinLobbyShell gameCode={gameCode}>
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={CRAZY8_MIN_PLAYERS}
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
          myPlayerName={me?.name ?? ''}
          onRenamed={() => void load()}
          onLeft={handlePlayerLeft}
          title="Waiting for the host to start"
          rulesLink={<GameRulesLink gameType="crazy_eights" variant="subtle" />}
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
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    return (
      <CrazyEightsShell title="Game over!" subtitle={winner ? `${winner.name} wins` : undefined}>
        {game ? (
          <CrazyEightsFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={winner?.name}
            highlightPlayerId={myPlayerId}
          />
        ) : (
          <CrazyEightsCard className="py-10 text-center space-y-2">
            <div className="text-6xl mb-3">🏆</div>
            {winner && <p className="text-2xl font-black text-[var(--marry)]">{winner.name}</p>}
          </CrazyEightsCard>
        )}
        {myPlayerId && session?.winner_player_id === myPlayerId && (
          <PostWinToCommunity
            gameType="crazy_eights"
            gameCode={gameCode}
            winnerName={players.find((p) => p.id === myPlayerId)?.name ?? ''}
            roundKey={session?.id}
          />
        )}
      </CrazyEightsShell>
    )
  }

  if (!session) return <CrazyEightsLoadingScreen />

  // The active play surface mounts inside the design-system room frame, which
  // supplies the `.fr-room-poll` → `.pr-main` → `.pr-stage` layout the `.ct-surface`
  // needs. The room chrome is the app's fixed top header + the floating Join-voice
  // pill; the roster side-drawer is fed centrally by the dispatcher (see comment
  // above). Watching (spectator / played-out) reuses the same surface read-only.
  const surface = (
    <CrazyEightsPlaySurface
      session={session}
      players={players}
      myPlayerId={myPlayerId}
      myHand={myHand}
      handCounts={handCounts}
      rules={crazyEightsRules}
      turnPlayerId={turnPlayerId}
      isMyTurn={isMyTurn && !isWatching}
      watching={isWatching}
      acting={acting}
      drawCount={session.draw_pile?.length ?? 0}
      drawDepleted={drawDepleted}
      myCanPlay={myCanPlay}
      suitCallActive={session.required_suit != null}
      penalties={penalties}
      turnTimer={turnTimer}
      gameTimer={gameTimer}
      onPlay={(cardId) => void postAction('/api/crazy-eights/play', { cardId })}
      onDraw={() => void postAction('/api/crazy-eights/draw', {})}
      onChooseSuit={(suit) => void postAction('/api/crazy-eights/choose', { suit })}
    />
  )

  return <PlayerRoomShell>{surface}</PlayerRoomShell>
}
