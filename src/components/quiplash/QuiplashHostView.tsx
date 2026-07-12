'use client'

import { useCallback, useEffect, useState } from 'react'
import { QuiplashActiveRound } from '@/components/quiplash/QuiplashActiveRound'
import { QuiplashFinishedResults } from '@/components/quiplash/QuiplashFinishedResults'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostQuiplashLobbyPanel } from '@/components/host-lobby/HostQuiplashLobbyPanel'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { gameTypeConfig } from '@/lib/game-types'
import { getQuiplashHostMode, setQuiplashHostMode, type QuiplashHostMode, QUIPLASH_MIN_PLAYERS } from '@/lib/quiplash'
import { playerIsViewer } from '@/lib/viewers'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  QUIPLASH_ANSWER_SELECT,
  QUIPLASH_BATTLE_SELECT,
  QUIPLASH_SESSION_SELECT,
  QUIPLASH_VOTE_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useQuiplashAdvance } from '@/hooks/useQuiplashAdvance'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import type { Game, Player, QuiplashAnswer, QuiplashBattle, QuiplashSession, QuiplashVote, Round } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type HostTab = 'play' | 'manage'

export function QuiplashHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [session, setSession] = useState<QuiplashSession | null>(null)
  const [answers, setAnswers] = useState<QuiplashAnswer[]>([])
  const [battles, setBattles] = useState<QuiplashBattle[]>([])
  const [votes, setVotes] = useState<QuiplashVote[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostMode, setHostMode] = useState<QuiplashHostMode>('player')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, rdsRes, sessRes, ansRes, batRes, voteRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('quiplash_sessions').select(QUIPLASH_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('quiplash_answers').select(QUIPLASH_ANSWER_SELECT).eq('game_id', gameCode),
      supabase.from('quiplash_battles').select(QUIPLASH_BATTLE_SELECT).eq('game_id', gameCode),
      supabase.from('quiplash_votes').select(QUIPLASH_VOTE_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, rdsRes, sessRes, ansRes, batRes, voteRes)) return false
    if (gameRes.data) setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setRounds(rdsRes.data ?? [])
    setSession((sessRes.data as QuiplashSession | null) ?? null)
    setAnswers((ansRes.data ?? []) as QuiplashAnswer[])
    setBattles((batRes.data ?? []) as QuiplashBattle[])
    setVotes((voteRes.data ?? []) as QuiplashVote[])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getQuiplashHostMode(gameCode))
    const sessionRow = getPlayerSession(gameCode)
    if (sessionRow) {
      setHostPlayerId(sessionRow.playerId)
      setHostResumeToken(sessionRow.resumeToken ?? null)
      setHostPlayerName(sessionRow.playerName)
    }
  }, [gameCode, load])

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostResumeToken(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)
  useHostPlayerReconciliation(players, hostPlayerId, () => handlePlayerRemoved(hostPlayerId!))
  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  useGameTableSync(
    gameCode,
    [
      { table: 'games', column: 'id' },
      'players',
      'rounds',
      'quiplash_sessions',
      'quiplash_answers',
      'quiplash_battles',
      'quiplash_votes',
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useQuiplashAdvance({
    gameCode,
    game: game ?? ({ status: 'waiting', id: gameCode } as Game),
    enabled: !!game && game.status === 'active',
    onAdvanced: load,
  })

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  const changeHostMode = (mode: QuiplashHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setQuiplashHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
  }

  const hostJoinGame = async () => {
    const name = hostJoinName.trim()
    if (!name || hostJoining) return
    setHostJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostResumeToken(data.resumeToken ?? null)
      setHostPlayerName(data.playerName)
      setHostMode('player')
      setQuiplashHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const startGame = async () => {
    if (starting) return
    if (hostMode === 'player' && !hostPlayerId) {
      toastError('Join with your name before starting (Host + play mode)')
      return
    }
    const count = players.filter((p) => p.spectator !== true).length
    if (count < QUIPLASH_MIN_PLAYERS) {
      toastError(`Need at least ${QUIPLASH_MIN_PLAYERS} players`)
      return
    }
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

  const resetGame = async (sameSettings: boolean) => {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset')
      if (data.game) setGame(data.game)
      setAnswers([])
      setBattles([])
      setVotes([])
      setRounds([])
      setSession(null)
      success(sameSettings ? 'Ready up for the next game!' : 'Back to the lobby')
      await load()
      setTab('manage')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again — same settings?',
      message:
        'Reopens the game with the same settings. Previous watchers and new people can join; everyone taps “ready” and you start the next game once enough players are in.',
      confirmLabel: 'Play again',
    })
    if (ok) void resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message:
        'Sends everyone back to the game lobby where you can tweak settings or let new people join before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void resetGame(false)
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const hostPlayer = hostPlayerId ? (players.find((p) => p.id === hostPlayerId) ?? null) : null
  const hostReadOnly = hostPlayer ? playerIsViewer(hostPlayer, game) : true
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'
  const playerLink = `${appOrigin()}/game/${gameCode}`

  const quiplashRound = (opts: { playerId: string; resumeToken: string | null; readOnly: boolean }) => (
    <QuiplashActiveRound
      gameCode={gameCode}
      game={game}
      players={players}
      rounds={rounds}
      session={session}
      answers={answers}
      battles={battles}
      votes={votes}
      myPlayerId={opts.playerId}
      myResumeToken={opts.resumeToken}
      playerName={opts.playerId === hostPlayerId ? hostPlayerName : ''}
      onReload={load}
      skipGameSync
      readOnly={opts.readOnly}
    />
  )

  const interactivePlay =
    hostPlayerId &&
    (game.status === 'active' || game.status === 'finished' ? (
      quiplashRound({ playerId: hostPlayerId, resumeToken: hostResumeToken, readOnly: hostReadOnly })
    ) : (
      <div className="glass-card p-6 text-center text-muted text-sm">Start the game to play from this tab.</div>
    ))

  const watchRound =
    game.status === 'active' || game.status === 'finished' ? (
      <div className="space-y-4">
        {!hostPlayerId && (
          <div className="glass-card p-5 text-center space-y-2">
            <p className="font-bold">You&apos;re watching as host</p>
            <p className="text-muted text-sm">
              Switch to <strong className="text-body">Host + play</strong> in Manage and join with your name before the
              next game to write answers and vote.
            </p>
          </div>
        )}
        {quiplashRound({
          playerId: hostPlayerId ?? '',
          resumeToken: hostResumeToken,
          readOnly: true,
        })}
      </div>
    ) : (
      <div className="glass-card p-6 text-center space-y-2">
        <p className="font-bold">Watch mode</p>
        <p className="text-muted text-sm">
          Open {playerLink} on your phone to follow along, or switch to Host + play in Manage and join before you start.
        </p>
      </div>
    )

  const readyPlayers = players.filter((p) => p.spectator !== true)
  const hostMustJoinFirst = hostMode === 'player' && !hostPlayerId
  const canStart = readyPlayers.length >= QUIPLASH_MIN_PLAYERS && !hostMustJoinFirst

  const manage = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      {game.status === 'waiting' && (
        <HostModeSelector
          mode={hostMode}
          onChange={changeHostMode}
          joinedPlayerId={hostPlayerId}
          joinedPlayerName={hostPlayerName}
          joinName={hostJoinName}
          onJoinNameChange={setHostJoinName}
          onJoin={() => void hostJoinGame()}
          joining={hostJoining}
          spectatorHint="Watch battles from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — write answers and vote from the Play
              tab once you start.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="quiplash" />}
      {game.status === 'waiting' && (
        <HostQuiplashLobbyPanel
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          playerCount={players.length}
          onGameUpdate={setGame}
        />
      )}
      {game.status === 'active' && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}
      {(game.status === 'waiting' || game.status === 'active') && (
        <HostLobbyPlayersSection
          players={players}
          removingPlayerId={removingPlayerId}
          onRemovePlayer={removePlayer}
          highlightPlayerId={hostPlayerId}
          alwaysShowReady={game.status === 'waiting'}
        />
      )}
      {game.status === 'active' && (
        <div className="glass-card p-5 space-y-3">
          <p className="label-caps">Game controls</p>
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={16} />}
            className="btn-danger-soft"
          />
        </div>
      )}
      {game.status === 'waiting' && !game.replay_pending && (
        <HostLobbyWaitingFooter
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          onGameUpdate={setGame}
          onStart={() => void startGame()}
          onEnded={load}
          canStart={canStart}
          starting={starting}
          startDisabledHint={
            hostMustJoinFirst
              ? 'Join with your name first (Host + play mode)'
              : canStart
                ? null
                : `Need at least ${QUIPLASH_MIN_PLAYERS} players to start (${readyPlayers.length}/${QUIPLASH_MIN_PLAYERS})`
          }
        />
      )}
    </div>
  )

  const finished = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      <QuiplashFinishedResults
        game={game}
        players={players}
        battles={battles}
        answers={answers}
        highlightPlayerId={hostPlayerId}
        playAgainButton={
          <button
            type="button"
            disabled={playingAgain}
            onClick={() => void confirmPlayAgain()}
            className="btn-secondary w-full py-3 text-base font-bold disabled:opacity-60"
          >
            {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
          </button>
        }
        returnToLobbyButton={
          <button
            type="button"
            disabled={playingAgain}
            onClick={() => void confirmReturnToLobby()}
            className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
          >
            Return to lobby
          </button>
        }
        lobbyNote="Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak settings first."
      />
    </div>
  )

  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          gameCode={gameCode}
          hostToken={hostToken}
          minPlayers={QUIPLASH_MIN_PLAYERS}
          onToggleReady={() => {}}
          onStart={() => void startGame()}
          starting={starting}
        />
        <button
          type="button"
          onClick={() => void confirmReturnToLobby()}
          disabled={playingAgain}
          className="mt-1 py-2 text-sm font-medium text-muted transition-colors hover:text-body disabled:opacity-60"
        >
          Return to lobby instead
        </button>
      </div>
    )
  }

  return (
    <HostGameLayout
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
      finished={finished}
    />
  )
}
