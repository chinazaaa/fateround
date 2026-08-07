'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { LeaveGameButton } from '@/components/ui/LeaveGameButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { TriviaActiveRound } from '@/components/trivia/TriviaActiveRound'
import { gameTypeConfig } from '@/lib/game-types'
import { gameIcon } from '@/lib/game-glyphs'
import { Glyph } from '@/components/icons/Glyph'
import { supabase } from '@/lib/supabase'
import { ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { clearPlayerSession } from '@/lib/utils'
import type { Game, Round, TriviaAnswer } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameViewBootstrap } from '@/hooks/useGameViewBootstrap'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { playerIsViewer, preJoinScreen, allowLatePlayers } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { EliminationBanner } from '@/components/EliminationBanner'
import { GameWaitingRoom } from '@/components/game-lobby/GameWaitingRoom'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'late_join_choice' | 'game_ended' | 'playing' | 'not_found'

export function TriviaPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { error: toastError } = useToast()
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<TriviaAnswer[]>([])
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)

  // Game-specific load: fetch this game's rounds + trivia answers (the shared game/players
  // fetch + session resolution lives in useGameViewBootstrap). Both reads are independent
  // of the resolved playerId, so they belong here rather than in a post-resolve seam.
  const loadGameState = useCallback(async (): Promise<{ state: null; ok: boolean }> => {
    const [rdsRes, ansRes] = await Promise.all([
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('trivia_answers').select(TRIVIA_ANSWER_SELECT).eq('game_id', gameCode),
    ])
    if (supabasePollOk(rdsRes)) setRounds(rdsRes.data ?? [])
    if (supabasePollOk(ansRes)) setAnswers(ansRes.data ?? [])
    return { state: null, ok: supabasePollOk(rdsRes, ansRes) }
  }, [gameCode])

  const computeScreen = useCallback((gameData: Game, playerId: string | null): Screen => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') return 'game_started_waiting'
      if (pre === 'late_join_choice') return 'late_join_choice'
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

  // Realtime push: reload on any change to this game's row + its tables.
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'rounds', 'trivia_answers'],
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
    if (screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const myPlayerName = me?.name ?? ''
  const isViewer = !!(game && me && playerIsViewer(me, game))

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
  }, [myPlayerId, game?.status, gameCode, me?.name, isViewer, load, router])
  useRegisterGameSettings(playerSettingsNode)

  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    screen === 'late_join_choice'
  )
  const { context: viewerPromoteContext } = useLateJoinContext(gameCode, game, isViewer && screen === 'playing')

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

  const cfg = gameTypeConfig('trivia')

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

  if (screen === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={game ? allowLatePlayers(game) : false}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void join({ joinAsViewer: true })}
        onJoinAsPlayer={() => void join({ joinAsViewer: false })}
      />
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

    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameJoinHeader
          emoji={cfg.headerEmoji}
          title={game?.title}
          gameType="trivia"
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
          gameType="trivia"
        />
      </GameJoinLobbyShell>
    )
  }

  if (!game || !myPlayerId) return null

  const isFinished = game.status === 'finished'

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* On the results screen the share block carries its own header + actions, so the
            page header and session controls would just duplicate it and crowd the page. */}
        {!isFinished && (
          <div className="text-center space-y-1">
            <div className="flex justify-center text-[var(--primary)] pb-1">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_12%,transparent)]">
                <Glyph icon={gameIcon('trivia')} size={24} />
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight gradient-title">{game.title}</h1>
            <p className="text-muted text-sm sm:text-base">{cfg.label}</p>
          </div>
        )}

        {me && <EliminationBanner player={me} />}
        {isViewer && (
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            playerDetail={viewerPromoteContext?.playerDetail}
            onPromoted={load}
          />
        )}
        {game.status === 'waiting' ? (
          <GameWaitingRoom
            gameCode={gameCode}
            players={players}
            myPlayerId={myPlayerId}
            myPlayerName={myPlayerName}
            gameType="trivia"
            game={game}
            spectating={isViewer}
            onRenamed={() => void load()}
            onLeft={handlePlayerLeft}
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
          <>
            <TriviaActiveRound
              gameCode={gameCode}
              game={game}
              players={players}
              rounds={rounds}
              answers={answers}
              myPlayerId={myPlayerId}
              myResumeToken={myResumeToken}
              playerName={myPlayerName}
              onReload={load}
              readOnly={isViewer}
            />
          </>
        )}
      </div>
    </div>
  )
}
