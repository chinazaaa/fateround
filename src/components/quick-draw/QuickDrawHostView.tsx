'use client'

import { useCallback, useEffect, useState } from 'react'
import { QuickDrawActiveRound } from '@/components/quick-draw/QuickDrawActiveRound'
import { QuickDrawFinishedResults } from '@/components/quick-draw/QuickDrawFinishedResults'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostLobbyPlayersSection } from '@/components/host-lobby/HostLobbyPlayersSection'
import { HostQuickDrawLobbyPanel } from '@/components/host-lobby/HostQuickDrawLobbyPanel'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { QuickDrawGuessHostView } from '@/components/quick-draw/QuickDrawGuessHostView'
import { DescribeItLoadingScreen } from '@/components/describe-it/DescribeItChrome'
import {
  getQuickDrawHostMode,
  setQuickDrawHostMode,
  type QuickDrawHostMode,
  QUICK_DRAW_MIN_PLAYERS,
  isQuickDrawGuessVariant,
} from '@/lib/quick-draw'
import { playerIsViewer } from '@/lib/viewers'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  QUICK_DRAW_ASSIGNMENT_SELECT,
  QUICK_DRAW_DRAWING_SELECT,
  QUICK_DRAW_SESSION_SELECT,
  QUICK_DRAW_TITLE_SELECT,
  QUICK_DRAW_VOTE_SELECT,
  ROUND_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useQuickDrawAdvance } from '@/hooks/useQuickDrawAdvance'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import type {
  QuickDrawAssignment,
  QuickDrawDrawing,
  QuickDrawSession,
  QuickDrawTitle,
  QuickDrawVote,
  Game,
  Player,
  Round,
} from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'

type HostTab = 'play' | 'manage'

export function QuickDrawHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const [guessMode, setGuessMode] = useState<boolean | null>(null)

  useEffect(() => {
    void supabase
      .from('games')
      .select('quick_draw_variant')
      .eq('id', gameCode)
      .maybeSingle()
      .then(({ data }) => setGuessMode(isQuickDrawGuessVariant(data?.quick_draw_variant)))
  }, [gameCode])

  if (guessMode === null) return <DescribeItLoadingScreen />
  if (guessMode) return <QuickDrawGuessHostView gameCode={gameCode} hostToken={hostToken} />
  return <QuickDrawLieHostView gameCode={gameCode} hostToken={hostToken} />
}

function QuickDrawLieHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const { confirm } = useConfirm()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [session, setSession] = useState<QuickDrawSession | null>(null)
  const [assignments, setAssignments] = useState<QuickDrawAssignment[]>([])
  const [drawings, setDrawings] = useState<QuickDrawDrawing[]>([])
  const [titles, setTitles] = useState<QuickDrawTitle[]>([])
  const [votes, setVotes] = useState<QuickDrawVote[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [hostMode, setHostMode] = useState<QuickDrawHostMode>('player')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, rdsRes, sessRes, asgRes, drwRes, ttlRes, voteRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('quick_draw_sessions').select(QUICK_DRAW_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('quick_draw_assignments').select(QUICK_DRAW_ASSIGNMENT_SELECT).eq('game_id', gameCode),
      supabase.from('quick_draw_drawings').select(QUICK_DRAW_DRAWING_SELECT).eq('game_id', gameCode),
      supabase.from('quick_draw_titles').select(QUICK_DRAW_TITLE_SELECT).eq('game_id', gameCode),
      supabase.from('quick_draw_votes').select(QUICK_DRAW_VOTE_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, rdsRes, sessRes, asgRes, drwRes, ttlRes, voteRes)) return false
    if (gameRes.data) setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setRounds(rdsRes.data ?? [])
    setSession((sessRes.data as QuickDrawSession | null) ?? null)
    setAssignments((asgRes.data ?? []) as QuickDrawAssignment[])
    setDrawings((drwRes.data ?? []) as QuickDrawDrawing[])
    setTitles((ttlRes.data ?? []) as QuickDrawTitle[])
    setVotes((voteRes.data ?? []) as QuickDrawVote[])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getQuickDrawHostMode(gameCode))
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
      'quick_draw_sessions',
      'quick_draw_assignments',
      'quick_draw_drawings',
      'quick_draw_titles',
      'quick_draw_votes',
    ],
    load
  )

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useQuickDrawAdvance({
    gameCode,
    game: game ?? ({ status: 'waiting', id: gameCode } as Game),
    enabled: !!game && game.status === 'active',
    onAdvanced: load,
  })

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  const changeHostMode = (mode: QuickDrawHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setQuickDrawHostMode(gameCode, mode)
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
      setQuickDrawHostMode(gameCode, 'player')
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
    if (count < QUICK_DRAW_MIN_PLAYERS) {
      toastError(`Need at least ${QUICK_DRAW_MIN_PLAYERS} players`)
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
      setAssignments([])
      setDrawings([])
      setTitles([])
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

  const activeRound = (opts: { playerId: string; resumeToken: string | null; readOnly: boolean }) => (
    <QuickDrawActiveRound
      gameCode={gameCode}
      game={game}
      players={players}
      rounds={rounds}
      session={session}
      assignments={assignments}
      drawings={drawings}
      titles={titles}
      votes={votes}
      myPlayerId={opts.playerId}
      myResumeToken={opts.resumeToken}
      onReload={load}
      skipGameSync
      readOnly={opts.readOnly}
    />
  )

  const interactivePlay =
    hostPlayerId &&
    (game.status === 'active' || game.status === 'finished' ? (
      activeRound({ playerId: hostPlayerId, resumeToken: hostResumeToken, readOnly: hostReadOnly })
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
              next game to draw and vote.
            </p>
          </div>
        )}
        {activeRound({ playerId: hostPlayerId ?? '', resumeToken: hostResumeToken, readOnly: true })}
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
  const canStart = readyPlayers.length >= QUICK_DRAW_MIN_PLAYERS && !hostMustJoinFirst

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
          spectatorHint="Watch drawings from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — draw and vote from the Play tab once
              you start.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="quick_draw" />}
      {game.status === 'waiting' && (
        <HostQuickDrawLobbyPanel
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
                : `Need at least ${QUICK_DRAW_MIN_PLAYERS} players to start (${readyPlayers.length}/${QUICK_DRAW_MIN_PLAYERS})`
          }
        />
      )}
    </div>
  )

  const finished = (
    <div className="space-y-4 sm:space-y-5 animate-stagger">
      <QuickDrawFinishedResults
        game={game}
        players={players}
        drawings={drawings}
        titles={titles}
        votes={votes}
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
          minPlayers={QUICK_DRAW_MIN_PLAYERS}
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
      showTabs={showTabs}
      gameStarted={gameStarted}
      header={<HostGameHeader game={game} />}
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      finished={finished}
    />
  )
}
