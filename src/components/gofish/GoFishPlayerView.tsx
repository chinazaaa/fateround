'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { RulesInPlaySection } from '@/components/game-lobby/RulesInPlaySection'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { GoFishActiveRound } from '@/components/gofish/GoFishActiveRound'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { GOFISH_MIN_PLAYERS } from '@/lib/gofish'
import { gameTypeConfig } from '@/lib/game-types'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { supabase } from '@/lib/supabase'
import { GOFISH_PLAYER_HANDS_SELECT, GOFISH_SESSION_SELECT } from '@/lib/supabase-selects'
import { fetchGoFishHands } from '@/lib/hands-client'
import { getPlayerSession, clearPlayerSession } from '@/lib/utils'
import type { Game, GoFishPlayerHand, GoFishSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameWaitingRoom } from '@/components/game-lobby/GameWaitingRoom'
import { useGoFishNotifications } from '@/hooks/useGoFishNotifications'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'game_ended' | 'playing' | 'not_found'

/**
 * Go Fish player view. Follows the trivia/quiplash shape:
 * load → screen dispatch (loading / join / game_started_waiting / playing / not_found).
 * Session + hands are fetched together so realtime + polling paths share one call.
 */
export function GoFishPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [session, setSession] = useState<GoFishSession | null>(null)
  const [hands, setHands] = useState<GoFishPlayerHand[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    // Opponent hands are pre-redacted by /api/gofish/hands — reading gofish_player_hands
    // directly would return their cards too, defeating hidden information.
    const resumeToken = getPlayerSession(gameCode)?.resumeToken ?? undefined
    const [sessionRes, handsData] = await Promise.all([
      supabase.from('gofish_sessions').select(GOFISH_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      fetchGoFishHands(gameCode, { resumeToken }),
    ])
    if (supabasePollOk(sessionRes)) {
      setSession((sessionRes.data as GoFishSession | null) ?? null)
    }
    if (handsData) setHands(handsData)
    return { state: null, ok: supabasePollOk(sessionRes) && handsData !== null }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'game_ended') return 'game_ended'
      return 'join'
    }
    return 'playing'
  }, [])

  const {
    screen,
    setScreen,
    game,
    players,
    myPlayerId,
    setMyPlayerId,
    myResumeToken,
    setMyResumeToken,
    joinName,
    setJoinName,
    joining,
    load,
    lobbyFull,
    join,
  } = useGameViewBootstrap<Screen, null>({
    gameCode,
    loadingScreen: 'loading',
    notFoundScreen: 'not_found',
    loadGameState,
    computeScreen,
    joinExtras,
    onJoinError: toastError,
  })

  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

  // Realtime: any change on the game, players list, or gofish tables triggers reload.
  // We reload rather than diff because the ask flow can mutate up to two hand rows + the
  // session row in one write, and rendering a partial state (turn advanced but hand not
  // yet refreshed) is visually confusing.
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'gofish_sessions', 'gofish_player_hands'],
    load
  )

  usePolling(() => load(), [gameCode, load], {
    intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
    enabled: game?.status === 'waiting' || !connected,
    runImmediately: false,
  })

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [setScreen, load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'game_started_waiting') void load()
  })

  // "Play again · same settings" reopens the lobby with a ready-up ring — same shape Whot uses.
  // Reuses /api/players/ready (readiness = holding a seat; ready:false sits the player back out).
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
        if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to update ready')
        await load()
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to update ready')
      } finally {
        setReplayReadyPending(false)
      }
    },
    [gameCode, myResumeToken, load, toastError]
  )

  const me = players.find((p) => p.id === myPlayerId)
  const myPlayerName = me?.name ?? ''
  const isViewer = !!(game && me && playerIsViewer(me, game))

  // Audio cues driven off the shared event log — turn bell / hit / miss / book / end.
  // Spectators still hear the room activity; global mute toggle is honoured by lib/sounds.
  useGoFishNotifications({ game, session, myPlayerId, enabled: game?.status === 'active' })

  const playerSettingsNode = useMemo(() => {
    if (!myPlayerId) return null
    return (
      <div className="space-y-3">
        <RulesInPlaySection game={game} />
        <EditNameInline
          gameCode={gameCode}
          playerId={myPlayerId}
          currentName={me?.name ?? ''}
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
  }, [game, myPlayerId, gameCode, me?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

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
    setMyResumeToken(null)
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('gofish')

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted text-lg">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-muted text-lg">Game not found</p>
        <button type="button" onClick={() => router.push('/')} className="btn-secondary py-3 px-6 text-base">
          Home
        </button>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
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

    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameJoinHeader
          emoji={cfg.headerEmoji}
          title={game?.title}
          gameType="gofish"
          contentLabel={game?.content_label}
          meta={game ? <GameInfoChips game={game} /> : null}
        />
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void join()}
          lobbyFull={lobbyFull}
          onJoinAsViewer={() => void join({ joinAsViewer: true })}
          joining={joining}
          gameType="gofish"
        />
      </GameJoinLobbyShell>
    )
  }

  if (!game || !myPlayerId) return null

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Room title + game label above the surface. Hidden on the finished screen — the
            shared FinishedWinnerHero already renders the game label + winner headline, and
            the extra title above just competed with it visually. */}
        {game.status !== 'finished' && (
          <div className="text-center space-y-1">
            <div className="flex justify-center text-[var(--primary)] pb-1">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
                <Glyph icon={gameIcon('gofish')} size={24} />
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">{game.title}</h1>
            <p className="text-muted text-sm sm:text-base">{cfg.label}</p>
          </div>
        )}

        {isViewer && (
          <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
        )}

        {game.status === 'waiting' && game.replay_pending ? (
          <ReplayReadyRing
            players={players}
            meId={myPlayerId}
            isHost={false}
            minPlayers={GOFISH_MIN_PLAYERS}
            capacityGame={game}
            onToggleReady={(ready) => void toggleReplayReady(ready)}
            onStart={() => {}}
            pending={replayReadyPending}
            gameCode={gameCode}
            onLeft={handlePlayerLeft}
          />
        ) : game.status === 'waiting' ? (
          <GameWaitingRoom
            gameCode={gameCode}
            players={players}
            myPlayerId={myPlayerId}
            myPlayerName={myPlayerName}
            gameType="gofish"
            game={game}
            spectating={isViewer}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
            seatAvailable={players.filter((p) => !p.spectator).length < (game.max_players ?? 6)}
            onReady={
              me?.spectator === true && !game.tournament_id
                ? async () => {
                    if (!myResumeToken) return
                    await fetch('/api/players/ready', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
                    })
                    await load()
                  }
                : undefined
            }
          />
        ) : (
          <GoFishActiveRound
            gameCode={gameCode}
            game={game}
            players={players}
            session={session}
            hands={hands}
            myPlayerId={myPlayerId}
            myResumeToken={myResumeToken}
            onReload={load}
            readOnly={isViewer}
          />
        )}
      </div>
    </div>
  )
}
