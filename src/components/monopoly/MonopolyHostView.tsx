'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MonopolyClassicBoard, MonopolyDiceRoll, MonopolyPlayerList } from '@/components/monopoly/MonopolyBoard'
import { MonopolyActiveLayout } from '@/components/monopoly/MonopolyActiveLayout'
import { MonopolyHostTimeExtension } from '@/components/monopoly/MonopolyHostTimeExtension'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { MonopolyFinalResultsShareBlock } from '@/components/monopoly/MonopolyFinalResultsShareBlock'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { ExitIcon } from '@/components/host/host-icons'
import { HostBoardGameLobbyPanel } from '@/components/host-lobby/HostBoardGameLobbyPanel'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { gameTypeConfig } from '@/lib/game-types'
import { formatRentMessageForPlayer } from '@/lib/monopoly-rent-messages'
import {
  buildMonopolyStandings,
  currentPlayerId,
  getMonopolyHostMode,
  MONOPOLY_COLOR_CLASSES,
  MONOPOLY_MIN_PLAYERS,
  parsePropertyOwners,
  setMonopolyHostMode,
  type MonopolyColorGroup,
  type MonopolyHostMode,
} from '@/lib/monopoly'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, MONOPOLY_BOARD_SELECT, MONOPOLY_PLAYER_STATE_SELECT, PLAYER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import {
  clearPlayerSession,
  getPlayerSession,
  isFetchNetworkError,
  messageFromFetchActionError,
  setPlayerSession,
} from '@/lib/utils'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { useMonopolyNotifications } from '@/hooks/useMonopolyNotifications'
import { MonopolyJoinForm } from '@/components/monopoly/MonopolyJoinForm'
import { type MonopolyTokenId } from '@/lib/monopoly-tokens'

type HostTab = 'play' | 'manage'

function colorBarClass(color?: MonopolyColorGroup): string {
  if (!color) return 'bg-neutral-500'
  return MONOPOLY_COLOR_CLASSES[color] ?? 'bg-neutral-500'
}

export function MonopolyHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [board, setBoard] = useState<MonopolyBoard | null>(null)
  const [states, setStates] = useState<MonopolyPlayerState[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)

  const [hostMode, setHostMode] = useState<MonopolyHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoinToken, setHostJoinToken] = useState<MonopolyTokenId | null>(null)
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const hostActingRef = useRef(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useApplyGameTheme(game?.theme)
  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, boardRes, stateRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('monopoly_boards').select(MONOPOLY_BOARD_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase
        .from('monopoly_player_state')
        .select(MONOPOLY_PLAYER_STATE_SELECT)
        .eq('game_id', gameCode)
        .order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, boardRes, stateRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setBoard(boardRes.data as MonopolyBoard | null)
    setStates((stateRes.data as MonopolyPlayerState[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getMonopolyHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostPlayerName(session.playerName)
      setHostResumeToken(session.resumeToken ?? null)
    }
  }, [gameCode, load])

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'monopoly_boards', 'monopoly_player_state'],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        setHostResumeToken(null)
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
      setStates((prev) => prev.filter((s) => s.player_id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const changeHostMode = (mode: MonopolyHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setMonopolyHostMode(gameCode, mode)
  }

  const hostJoinGame = async () => {
    const name = hostJoinName.trim()
    if (!name || !hostJoinToken) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: name, monopolyToken: hostJoinToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostPlayerName(data.playerName)
      setHostResumeToken(data.resumeToken ?? null)
      setHostMode('player')
      setMonopolyHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
      await load()
    } finally {
      setHostJoining(false)
    }
  }

  const postHostAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId || hostActingRef.current) return
    if (!hostResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    hostActingRef.current = true
    setHostActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: hostResumeToken, ...body }),
      })
      let data: { error?: string }
      try {
        data = await res.json()
      } catch {
        throw new Error(res.ok ? 'Invalid server response' : `Request failed (${res.status})`)
      }
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(messageFromFetchActionError(err))
      if (isFetchNetworkError(err)) await load()
    } finally {
      hostActingRef.current = false
      setHostActing(false)
    }
  }

  const startGame = async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to start')
      success('Game started!')
      await load()
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const playAgain = async () => {
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('monopoly')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.filter((p) => p.spectator !== true).length >= MONOPOLY_MIN_PLAYERS
  const turnPlayerId = board ? currentPlayerId(board) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === board?.winner_player_id)
  const finishedWinnerName =
    winner?.name ??
    (board && states.length
      ? buildMonopolyStandings(
          states,
          players,
          board.property_owners,
          board.property_buildings,
          board.mortgaged_properties
        )[0]?.name
      : null)
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  const hostState = hostPlayerId ? states.find((s) => s.player_id === hostPlayerId) : null

  useMonopolyNotifications({
    game,
    board,
    myPlayerId: hostPlayerId,
    myState: hostState ?? undefined,
    players,
    enabled: game?.status === 'active',
  })

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  // Primary tab: interactive layout when the host is playing, read-only board otherwise.
  const interactivePlay =
    hostPlayerId && game.status === 'active' ? (
      board ? (
        <MonopolyActiveLayout
          gameCode={gameCode}
          game={game}
          board={board}
          states={states}
          players={players}
          myPlayerId={hostPlayerId}
          myState={hostState ?? undefined}
          myName={hostPlayerName}
          acting={hostActing}
          postAction={postHostAction}
          colorBarClass={colorBarClass}
        />
      ) : (
        <div className="glass-card p-8 text-center text-sm text-muted">Loading board…</div>
      )
    ) : null

  const watchBoard = board ? (
    <div className="glass-card p-4 space-y-3">
      <p className="label-caps">Live board (host view)</p>
      <p className="text-sm text-muted text-center">
        {turnPlayer ? (
          <>
            <strong className="text-body">{turnPlayer.name}</strong>
            {' · '}
            <span className="capitalize">{board.phase.replace('_', ' ')}</span>
          </>
        ) : (
          'Waiting for turn…'
        )}
      </p>
      {(() => {
        const manageStatus = board.last_rent_event
          ? formatRentMessageForPlayer(board.last_rent_event, hostPlayerId, players)
          : board.status_message
        return manageStatus ? <p className="text-sm text-muted text-center leading-relaxed">{manageStatus}</p> : null
      })()}
      {(() => {
        const hostOwners = parsePropertyOwners(board.property_owners)
        const ownershipKey = Object.entries(hostOwners)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([index, playerId]) => `${index}:${playerId}`)
          .join('|')
        return (
          <MonopolyClassicBoard
            key={ownershipKey}
            states={states}
            players={players}
            propertyOwners={board.property_owners}
            propertyBuildings={board.property_buildings}
            mortgagedProperties={board.mortgaged_properties}
            lastDiceTotal={board.last_dice?.total ?? 2}
            center={
              <div className="flex flex-col items-center justify-center h-full gap-1">
                <MonopolyDiceRoll dice={board.last_dice} />
                <p className="text-[10px] uppercase tracking-widest text-faint mt-1">Host view</p>
              </div>
            }
          />
        )
      })()}
    </div>
  ) : (
    <p className="text-muted text-sm text-center">Waiting for the round to begin…</p>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="monopoly"
      top={
        game.status === 'waiting' ? (
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void hostJoinGame()}
            joining={hostJoining}
            spectatorHint="Spectate from the Watch tab"
            playingNote={
              <p className="text-sm text-muted">
                Playing as <strong className="text-body">{hostPlayerName}</strong> — switch to Play after you start.
              </p>
            }
            renderJoinForm={
              <MonopolyJoinForm
                name={hostJoinName}
                onNameChange={setHostJoinName}
                tokenId={hostJoinToken}
                onTokenChange={setHostJoinToken}
                players={players}
                joining={hostJoining}
                submitLabel="Join as player"
                onSubmit={() => void hostJoinGame()}
              />
            }
          />
        ) : undefined
      }
      settings={
        <>
          {game.status === 'waiting' && (
            <HostBoardGameLobbyPanel
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              boardGameType="monopoly"
              playerCount={players.length}
              onGameUpdate={setGame}
            />
          )}
          {game.status === 'active' && (
            <>
              <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
              <MonopolyHostTimeExtension
                gameCode={gameCode}
                game={game}
                hostToken={hostToken}
                onExtended={() => void load()}
              />
              {board && (
                <MonopolyPlayerList
                  states={states}
                  players={players}
                  currentPlayerId={turnPlayerId}
                  propertyOwners={board.property_owners}
                />
              )}
            </>
          )}
        </>
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={startGame}
            onEnded={load}
            canStart={canStart}
            starting={starting}
            startDisabledHint={
              canStart
                ? null
                : `Need at least ${MONOPOLY_MIN_PLAYERS} players to start (${players.length}/${MONOPOLY_MIN_PLAYERS})`
            }
            className="space-y-3"
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game early"
            icon={<ExitIcon size={16} />}
            confirmTitle="End this game early?"
            confirmMessage="The current game will end and players will see the results screen."
            className="btn-danger-soft"
          />
        ) : null
      }
    />
  )

  return (
    <HostGameLayout
      gameCode={gameCode}
      status={game.status}
      tab={tab}
      onTabChange={setTab}
      primaryKind={primaryKind}
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <MonopolyFinalResultsShareBlock
          game={game}
          players={players}
          states={states}
          board={board}
          winnerName={finishedWinnerName}
          highlightPlayerId={hostPlayerId}
          playAgainButton={
            <button type="button" onClick={playAgain} disabled={playingAgain} className="btn-primary w-full py-3">
              {playingAgain ? 'Resetting…' : 'Play again'}
            </button>
          }
        />
      }
    />
  )
}
