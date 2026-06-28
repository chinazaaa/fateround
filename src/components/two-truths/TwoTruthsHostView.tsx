'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TwoTruthsActiveRound } from '@/components/two-truths/TwoTruthsActiveRound'
import { TwoTruthsHostManagePanel } from '@/components/two-truths/TwoTruthsHostManagePanel'
import { TwoTruthsLobbySubmit } from '@/components/two-truths/TwoTruthsLobbySubmit'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { EditNameInline } from '@/components/ui/EditNameInline'
import { gameTypeConfig } from '@/lib/game-types'
import { useTwoTruthsAdvance } from '@/hooks/useTwoTruthsAdvance'
import { getTtlHostMode, setTtlHostMode, type TtlHostMode } from '@/lib/two-truths'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
  TTL_GUESS_SELECT,
  TTL_STATEMENT_SELECT,
} from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import type { Game, Player, Round, TtlGuess, TtlStatement } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'

type HostTab = 'play' | 'manage'

export function TwoTruthsHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [statements, setStatements] = useState<TtlStatement[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<TtlGuess[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [savingTimer, setSavingTimer] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(45)
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostMode, setHostMode] = useState<TtlHostMode>('spectator')
  const [tab, setTab] = useState<HostTab>('manage')
  const [editingStatements, setEditingStatements] = useState(false)

  useScrollHostViewToTop({ gameStatus: game?.status, tab })

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )

  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, stmtsRes, rdsRes, gssRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('ttl_statements').select(TTL_STATEMENT_SELECT).eq('game_id', gameCode),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('ttl_guesses').select(TTL_GUESS_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, stmtsRes, rdsRes, gssRes)) return false
    if (gameRes.data) {
      setGame(gameRes.data)
      setTimerSeconds(gameRes.data.timer_seconds ?? 45)
    }
    setPlayers(plrsRes.data ?? [])
    setStatements(stmtsRes.data ?? [])
    setRounds(rdsRes.data ?? [])
    setGuesses(gssRes.data ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getTtlHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostResumeToken(session.resumeToken ?? null)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    const channel = supabase
      .channel(`ttl-host-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        (p) => {
          setGame(p.new as Game)
          void load()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ttl_statements', filter: `game_id=eq.${gameCode}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        () => load()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ttl_guesses', filter: `game_id=eq.${gameCode}` },
        () => load()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  useTwoTruthsAdvance({
    gameCode,
    game: game ?? ({ status: 'waiting', id: gameCode } as Game),
    enabled: !!game && game.status === 'active',
    onAdvanced: load,
  })

  const prevMyStatement = useRef<TtlStatement | null | undefined>(undefined)

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  const changeHostMode = (mode: TtlHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setTtlHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
  }

  const hostJoinGame = async () => {
    const name = hostJoinName.trim()
    if (!name) return
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
      setTtlHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
      setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
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
      await load()
      success('Game started!')
      if (hostMode === 'player' && hostPlayerId) setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const saveTimer = async () => {
    setSavingTimer(true)
    try {
      const res = await fetch(`/api/games/${gameCode}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, timer_seconds: timerSeconds }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save timer')
      if (data.game) setGame(data.game)
      success('Timer updated')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to save timer')
    } finally {
      setSavingTimer(false)
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
      setRounds([])
      setGuesses([])
      setStatements([])
      await load()
      success('Lobby reopened!')
      setTab('manage')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const myStatement = hostPlayerId ? statements.find((s) => s.player_id === hostPlayerId) : null
  const existingStatements = myStatement
    ? ([myStatement.statement_a, myStatement.statement_b, myStatement.statement_c] as [string, string, string])
    : null

  // Reset edit mode when statement is freshly saved
  useEffect(() => {
    if (!prevMyStatement.current && myStatement) setEditingStatements(false)
    prevMyStatement.current = myStatement
  }, [myStatement])

  const hostPlays = hostMode === 'player' && !!hostPlayerId

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const cfg = gameTypeConfig('two_truths')
  const playerLink = `${appOrigin()}/game/${gameCode}`

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const panelProps = {
    game,
    gameCode,
    hostToken,
    playerLink,
    players,
    statements,
    rounds,
    guesses,
    starting,
    playingAgain,
    onStartGame: startGame,
    onPlayAgain: playAgain,
    onReload: load,
    timerSeconds,
    onTimerChange: setTimerSeconds,
    savingTimer,
    onSaveTimer: saveTimer,
    onRemovePlayer: removePlayer,
    removingPlayerId,
    onGameUpdate: setGame,
  }

  // Host-player's own statement setup (lobby only) — their input, so it lives with Manage.
  const hostStatementSetup =
    hostPlays &&
    hostPlayerId &&
    game.status === 'waiting' &&
    (myStatement && !editingStatements ? (
      <div className="glass-card p-5 space-y-4">
        <EditNameInline
          gameCode={gameCode}
          playerId={hostPlayerId}
          currentName={hostPlayerName}
          onRenamed={(name) => {
            setHostPlayerName(name)
            void load()
          }}
        />
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center space-y-1">
          <p className="text-2xl">✓</p>
          <p className="font-semibold text-emerald-800 dark:text-emerald-200">Statements submitted</p>
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            Start the game below when everyone&apos;s ready.
          </p>
        </div>
        <button type="button" onClick={() => setEditingStatements(true)} className="btn-secondary w-full">
          Edit my statements
        </button>
      </div>
    ) : (
      <div className="glass-card p-5 space-y-4">
        <EditNameInline
          gameCode={gameCode}
          playerId={hostPlayerId}
          currentName={hostPlayerName}
          onRenamed={(name) => {
            setHostPlayerName(name)
            void load()
          }}
        />
        <p className="label-caps">Your statements</p>
        <TwoTruthsLobbySubmit
          gameCode={gameCode}
          resumeToken={hostResumeToken}
          existingLieIndex={myStatement?.lie_index}
          existingStatements={existingStatements}
          onSaved={() => {
            setEditingStatements(false)
            void load()
          }}
        />
        {myStatement && (
          <button type="button" onClick={() => setEditingStatements(false)} className="btn-secondary w-full">
            Cancel
          </button>
        )}
      </div>
    ))

  // Primary tab: interactive round for a host-player, read-only gameplay for a host-only host.
  const interactivePlay = hostPlayerId && (
    <TwoTruthsActiveRound
      gameCode={gameCode}
      game={game}
      players={players}
      rounds={rounds}
      guesses={guesses}
      myPlayerId={hostPlayerId}
      myResumeToken={hostResumeToken}
      playerName={hostPlayerName}
      onReload={load}
      skipGameSync
    />
  )
  const watchRound = <TwoTruthsHostManagePanel {...panelProps} section="watch" />

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
          spectatorHint="Watch the game from the Watch tab"
          playingNote={
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — submit your statements below before
              you start.
            </p>
          }
        />
      )}
      {hostStatementSetup}
      {game.status !== 'finished' && <HostRulesRow gameType="two_truths" />}
      <TwoTruthsHostManagePanel {...panelProps} section="manage" />
    </div>
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
      primary={hostPlays ? interactivePlay : watchRound}
      manage={manage}
      finished={<TwoTruthsHostManagePanel {...panelProps} section="finished" />}
    />
  )
}
