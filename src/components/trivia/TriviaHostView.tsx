'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TriviaActiveRound } from '@/components/trivia/TriviaActiveRound'
import { TriviaHostManagePanel } from '@/components/trivia/TriviaHostManagePanel'
import { TriviaPlayAgainSetup, type TriviaSettingsPayload } from '@/components/trivia/TriviaPlayAgainSetup'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostLobby } from '@/components/host/HostLobby'
import { GameInfoChips } from '@/components/game-lobby/GameInfoChips'
import { HostLobbySkeleton } from '@/components/host/HostLobbySkeleton'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostActiveSettings } from '@/components/host/HostActiveSettings'
import { HostLeaveSeatButton } from '@/components/host/HostLeaveSeatButton'
import { useRegisterGameSettings } from '@/components/GameSettingsContext'
import { HostMaxPlayersLobbyPanel } from '@/components/host-lobby/HostMaxPlayersLobbyPanel'
import { TransferHostControl } from '@/components/TransferHostControl'
import { gameTypeConfig } from '@/lib/game-types'
import { TRIVIA_MIN_PLAYERS } from '@/lib/trivia'
import { useTriviaHostRoundAutomation } from '@/hooks/useTriviaHostRoundAutomation'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useHostSeat } from '@/hooks/useHostSeat'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import type { Game, Player, Round, TriviaAnswer } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'

type HostTab = 'play' | 'manage'

export function TriviaHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [answers, setAnswers] = useState<TriviaAnswer[]>([])
  const [starting, setStarting] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingLobbySettings, setSavingLobbySettings] = useState(false)
  const [settingsModal, setSettingsModal] = useState<'lobby' | 'play-again' | null>(null)
  const [tab, setTab] = useState<HostTab>('manage')
  const settingsModalRef = useRef(settingsModal)
  settingsModalRef.current = settingsModal

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, rdsRes, ansRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('trivia_answers').select(TRIVIA_ANSWER_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, rdsRes, ansRes)) return false
    if (gameRes.data) setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setRounds(rdsRes.data ?? [])
    setAnswers(ansRes.data ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [gameCode, load])

  const {
    hostMode,
    hostPlayerId,
    hostResumeToken,
    hostPlayerName,
    hostJoinName,
    setHostJoinName,
    hostJoining,
    changeHostMode,
    hostJoinGame,
    leaveSeatKeepHosting,
    renameHost,
    handlePlayerRemoved: onHostSeatRemoved,
  } = useHostSeat({
    gameCode,
    hostToken,
    gameStatus: game?.status,
    players,
    onReload: load,
    toast: { success, error: toastError },
    onModeChange: (mode) => {
      if (mode === 'spectator') setTab('manage')
    },
  })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      onHostSeatRemoved(playerId)
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [onHostSeatRemoved]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  // Realtime push: reload on any change to this game's row + its tables.
  const connected = useGameTableSync(
    gameCode,
    [{ table: 'games', column: 'id' }, 'players', 'rounds', 'trivia_answers'],
    load
  )

  usePolling(
    async () => {
      if (settingsModalRef.current) return true
      return load()
    },
    [gameCode, load],
    {
      intervalMs: game?.status === 'waiting' ? POLL_INTERVALS.lobby : POLL_INTERVALS.realtimeFallback,
      enabled: game?.status === 'waiting' || !connected,
      runImmediately: false,
    }
  )

  const endRound = useCallback(async () => {
    setAdvancing(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/end-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end round')
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end round'
      if (message !== 'No active round to end') {
        toastError(message)
      }
      await load()
    } finally {
      setAdvancing(false)
    }
  }, [gameCode, hostToken, load, toastError])

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
      await load()
      success('Trivia started!')
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const roundAutomation = useTriviaHostRoundAutomation({
    game: game ?? ({ status: 'waiting' } as Game),
    rounds,
    players,
    answers,
    gameCode,
    onReload: load,
    enabled: game?.status === 'active',
  })

  const playAgain = useCallback(
    async (payload: TriviaSettingsPayload) => {
      setPlayingAgain(true)
      try {
        const res = await fetch(`/api/games/${gameCode}/play-again`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) {
          const msg = data.error ?? 'Failed to reset'
          throw new Error(
            msg === 'Game must be finished before playing again'
              ? 'Game is still wrapping up — try again in a moment'
              : msg
          )
        }
        setAnswers([])
        setRounds([])
        await load()
        success('Lobby reopened!')
        setSettingsModal(null)
        setTab('manage')
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to reset')
      } finally {
        setPlayingAgain(false)
      }
    },
    [gameCode, hostToken, hostPlayerId, load, success, toastError]
  )

  const saveLobbySettings = useCallback(
    async (payload: TriviaSettingsPayload) => {
      setSavingLobbySettings(true)
      try {
        const res = await fetch(`/api/games/${gameCode}/lobby-pool`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hostToken, ...payload }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save')
        if (data.game) setGame(data.game)
        await load()
        success('Settings saved')
        setSettingsModal(null)
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to save')
      } finally {
        setSavingLobbySettings(false)
      }
    },
    [gameCode, hostToken, load, success, toastError]
  )

  const cfg = gameTypeConfig('trivia')
  const playerLink = `${appOrigin()}/game/${gameCode}`
  const hostPlays = hostMode === 'player' && !!hostPlayerId

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  // Host controls for the active game live in the main-header ⚙ gear (no Manage tab —
  // gameplay is the body). Late-join rules + the rare "End round early" driver + How-to-play
  // + End game. Players + live scores are seen in the roster drawer / watch view.
  const hostSettingsNode = useMemo(
    () =>
      game?.status === 'active' ? (
        <HostActiveSettings gameCode={gameCode} hostToken={hostToken} gameType="trivia" onEnded={load}>
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
          {roundAutomation.activeRound && (
            <button
              type="button"
              onClick={() => void endRound()}
              disabled={advancing}
              className="btn-secondary w-full py-3 text-base"
            >
              {advancing ? 'Ending…' : 'End round early'}
            </button>
          )}
          {hostPlays && (
            <HostLeaveSeatButton onLeave={leaveSeatKeepHosting} className="btn-secondary w-full py-3 text-base" />
          )}
        </HostActiveSettings>
      ) : null,
    [
      game,
      gameCode,
      hostToken,
      load,
      setGame,
      endRound,
      advancing,
      roundAutomation.activeRound,
      hostPlays,
      leaveSeatKeepHosting,
    ]
  )
  useRegisterGameSettings(hostSettingsNode)

  if (!game) {
    // Branded lobby skeleton (covers the header + hides the fixed theme toggle) so
    // reloading straight into the lobby feels instant and never flashes old chrome.
    return <HostLobbySkeleton />
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const panelProps = {
    game,
    gameCode,
    hostToken,
    playerLink,
    players,
    rounds,
    answers,
    starting,
    advancing,
    playingAgain,
    onStartGame: startGame,
    onEndRound: endRound,
    onPlayAgain: () => setSettingsModal('play-again'),
    onEditSettings: () => setSettingsModal('lobby'),
    onReload: load,
    onGameUpdate: setGame,
    onRemovePlayer: removePlayer,
    removingPlayerId,
    highlightPlayerId: hostPlayerId,
    activeRound: roundAutomation.activeRound,
    betweenRounds: roundAutomation.betweenRounds,
    lastFinishedRound: roundAutomation.lastFinishedRound,
    roundAnswers: roundAutomation.roundAnswers,
    allAnswered: roundAutomation.allAnswered,
    isLastRound: roundAutomation.isLastRound,
  }

  // Primary tab: interactive round for a host-player, read-only gameplay for a host-only host.
  const interactivePlay = hostPlayerId && (
    <TriviaActiveRound
      gameCode={gameCode}
      game={game}
      players={players}
      rounds={rounds}
      answers={answers}
      myPlayerId={hostPlayerId}
      myResumeToken={hostResumeToken}
      playerName={hostPlayerName}
      onReload={load}
      skipGameSync
    />
  )
  const watchRound = <TriviaHostManagePanel {...panelProps} section="watch" />

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' &&
        (game.tournament_id ? (
          // Tournament games: the host runs the game and doesn't compete.
          <p className="surface-inset rounded-xl px-4 py-3 text-sm text-muted">
            You&apos;re hosting this tournament game — start it below once players have joined. (The host doesn&apos;t
            play in tournament games.)
          </p>
        ) : (
          <HostModeSelector
            mode={hostMode}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void hostJoinGame()}
            joining={hostJoining}
            onEditName={renameHost}
            spectatorHint="Watch the game"
            playingNote={
              <p className="text-sm text-muted">
                Playing as <strong className="text-body">{hostPlayerName}</strong> — answer once you start.
              </p>
            }
          />
        ))}
      {game.status !== 'finished' && <HostRulesRow gameType="trivia" />}
      <TriviaHostManagePanel {...panelProps} section="manage" />
    </div>
  )

  // Fresh lobby (not the play-again ready-up flow, which keeps the tabbed layout for now).
  const waitingLobby = game.status === 'waiting' && !game.replay_pending
  const activePlayers = players.filter((p) => !p.spectator)
  const canStart = activePlayers.length >= TRIVIA_MIN_PLAYERS

  const lobbyModeCard = game.tournament_id ? (
    <p className="surface-inset rounded-xl px-4 py-3 text-sm text-muted">
      You&apos;re hosting this tournament game — start it below once players have joined. (The host doesn&apos;t play in
      tournament games.)
    </p>
  ) : (
    <HostModeSelector
      mode={hostMode}
      onChange={changeHostMode}
      joinedPlayerId={hostPlayerId}
      joinedPlayerName={hostPlayerName}
      joinName={hostJoinName}
      onJoinNameChange={setHostJoinName}
      onJoin={() => void hostJoinGame()}
      joining={hostJoining}
      onEditName={renameHost}
      spectatorHint="Watch the game once it starts"
      playerHint="Answer along with everyone"
      playingNote={
        <p className="text-sm text-muted">
          Playing as <strong className="text-body">{hostPlayerName}</strong> — answer once you start.
        </p>
      }
    />
  )

  const lobbySettings = (
    <>
      <HostMaxPlayersLobbyPanel
        gameCode={gameCode}
        hostToken={hostToken}
        game={game}
        limitType="trivia"
        playerCount={players.length}
        onGameUpdate={setGame}
      />
      <button type="button" onClick={() => setSettingsModal('lobby')} className="btn-secondary w-full">
        Edit questions &amp; rounds
      </button>
      <TransferHostControl triggerClassName="btn-secondary w-full flex items-center justify-center gap-2" />
    </>
  )

  return (
    <>
      {waitingLobby ? (
        <HostLobby
          gameCode={gameCode}
          questionSource={game.question_source}
          hostToken={hostToken}
          game={game}
          gameTypeLabel={cfg.label}
          titleMeta={<GameInfoChips game={game} className="mt-2" />}
          players={players}
          maxPlayers={game.max_players}
          resumeToken={hostResumeToken}
          playCard={lobbyModeCard}
          settingsChildren={lobbySettings}
          onStart={() => void startGame()}
          starting={starting}
          startDisabled={!canStart}
          startDisabledHint={
            !canStart
              ? `Need at least ${TRIVIA_MIN_PLAYERS} players to start (${activePlayers.length}/${TRIVIA_MIN_PLAYERS})`
              : null
          }
          startLabel="Start trivia"
          onRemovePlayer={removePlayer}
          removingPlayerId={removingPlayerId}
          highlightPlayerId={hostPlayerId}
          onEnded={load}
        />
      ) : (
        <HostGameLayout
          onRemovePlayer={removePlayer}
          gameCode={gameCode}
          status={game.status}
          tab={tab}
          onTabChange={setTab}
          primaryKind={primaryKind}
          game={game}
          players={players}
          hostPlayerId={hostPlayerId}
          onHostRejoined={load}
          showTabs={showTabs}
          gameStarted={gameStarted}
          header={<HostGameHeader game={game} />}
          primary={hostPlays ? interactivePlay : watchRound}
          manage={manage}
          noManageTab={game.status === 'active'}
          finished={
            game.tournament_id ? (
              <div className="space-y-4">
                <div className="glass-card-strong p-5 text-center space-y-2">
                  <p className="font-bold text-body">🏆 Game over</p>
                  <p className="text-muted text-sm">
                    Head back to your tournament tab to start the next game — you can close this one.
                  </p>
                  <a href={`/tournament/${game.tournament_id}`} className="btn-secondary btn-fit mx-auto text-sm">
                    ← Back to Tournament
                  </a>
                </div>
                <TriviaHostManagePanel {...panelProps} section="finished" />
              </div>
            ) : (
              <TriviaHostManagePanel {...panelProps} section="finished" />
            )
          }
        />
      )}

      <TriviaPlayAgainSetup
        open={settingsModal !== null}
        onClose={() => setSettingsModal(null)}
        game={game}
        variant={settingsModal === 'lobby' ? 'lobby' : 'play-again'}
        loading={settingsModal === 'lobby' ? savingLobbySettings : playingAgain}
        onConfirm={settingsModal === 'lobby' ? saveLobbySettings : playAgain}
      />
    </>
  )
}
