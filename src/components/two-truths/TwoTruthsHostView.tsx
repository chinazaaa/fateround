'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TwoTruthsActiveRound } from '@/components/two-truths/TwoTruthsActiveRound'
import { TwoTruthsHostManagePanel } from '@/components/two-truths/TwoTruthsHostManagePanel'
import { TwoTruthsLobbySubmit } from '@/components/two-truths/TwoTruthsLobbySubmit'
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
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, Round, TtlGuess, TtlStatement } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'

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
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostMode, setHostMode] = useState<TtlHostMode>('spectator')
  const [tab, setTab] = useState<HostTab>('manage')
  const [editingStatements, setEditingStatements] = useState(false)
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null)

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
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    const channel = supabase
      .channel(`ttl-host-${gameCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, (p) => {
        setGame(p.new as Game)
        void load()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ttl_statements', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ttl_guesses', filter: `game_id=eq.${gameCode}` }, () =>
        load()
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

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
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
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender)
      setHostPlayerId(data.playerId)
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
        body: JSON.stringify({ hostToken }),
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

  const removePlayer = async (playerId: string) => {
    setRemovingPlayerId(playerId)
    try {
      const res = await fetch('/api/players', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerId, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove player')
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
      success('Player removed')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove player')
    } finally {
      setRemovingPlayerId(null)
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
  const showPlayTab = hostPlays && game?.status !== 'finished'

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const cfg = gameTypeConfig('two_truths')
  const playerLink = `${appOrigin()}/game/${gameCode}`

  return (
    <div className="min-h-screen pb-16">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black gradient-title">{game.title}</h1>
          <p className="text-muted text-sm">{cfg.label} · Host</p>
        </div>

        {game.status === 'waiting' && (
          <div className="glass-card p-4 space-y-3">
            <p className="label-caps">Host mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => changeHostMode('spectator')}
                className={[
                  'rounded-xl border-2 px-3 py-3 text-left text-sm',
                  hostMode === 'spectator'
                    ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                    : 'border-[var(--border-strong)] text-muted',
                ].join(' ')}
              >
                <span className="font-bold block">Host only</span>
                <span className="text-faint text-xs">Run the game from Manage tab</span>
              </button>
              <button
                type="button"
                onClick={() => changeHostMode('player')}
                className={[
                  'rounded-xl border-2 px-3 py-3 text-left text-sm',
                  hostMode === 'player'
                    ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                    : 'border-[var(--border-strong)] text-muted',
                ].join(' ')}
              >
                <span className="font-bold block">Host + play</span>
                <span className="text-faint text-xs">Play tab + Manage tab</span>
              </button>
            </div>
            {hostMode === 'player' && !hostPlayerId && (
              <div className="flex items-center gap-2">
                <div className="w-36 sm:w-44 shrink-0">
                  <input
                    type="text"
                    value={hostJoinName}
                    onChange={(e) => setHostJoinName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && hostJoinGame()}
                    placeholder="Your name"
                    className="input-field w-full"
                    maxLength={40}
                  />
                </div>
                <button
                  type="button"
                  onClick={hostJoinGame}
                  disabled={!hostJoinName.trim() || hostJoining}
                  className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
                >
                  {hostJoining ? 'Joining…' : 'Join'}
                </button>
              </div>
            )}
            {hostMode === 'player' && hostPlayerId && (
              <p className="text-xs text-muted">
                Playing as <strong>{hostPlayerName}</strong> — submit your statements in the Play tab.
              </p>
            )}
          </div>
        )}

        {showPlayTab && (
          <div className="flex gap-2 p-1 rounded-xl bg-[var(--surface-inset-bg)] border border-[var(--border-strong)]">
            <button
              type="button"
              onClick={() => setTab('play')}
              className={[
                'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
                tab === 'play' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
              ].join(' ')}
            >
              Play
            </button>
            <button
              type="button"
              onClick={() => setTab('manage')}
              className={[
                'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
                tab === 'manage' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
              ].join(' ')}
            >
              Manage
            </button>
          </div>
        )}

        {tab === 'play' && showPlayTab && hostPlayerId && (
          game.status === 'active' ? (
            <TwoTruthsActiveRound
              gameCode={gameCode}
              game={game}
              players={players}
              rounds={rounds}
              guesses={guesses}
              myPlayerId={hostPlayerId}
              playerName={hostPlayerName}
              onReload={load}
              skipGameSync
            />
          ) : game.status === 'waiting' ? (
            myStatement && !editingStatements ? (
              <div className="glass-card p-5 space-y-4">
                <EditNameInline
                  gameCode={gameCode}
                  playerId={hostPlayerId}
                  currentName={hostPlayerName}
                  onRenamed={(name) => { setHostPlayerName(name); void load() }}
                />
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center space-y-1">
                  <p className="text-2xl">✓</p>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">Statements submitted</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">Waiting for you to start the game in Manage…</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingStatements(true)}
                  className="btn-secondary w-full"
                >
                  Edit my statements
                </button>
              </div>
            ) : (
              <div className="glass-card p-5 space-y-4">
                <EditNameInline
                  gameCode={gameCode}
                  playerId={hostPlayerId}
                  currentName={hostPlayerName}
                  onRenamed={(name) => { setHostPlayerName(name); void load() }}
                />
                <p className="label-caps">Your statements</p>
                <TwoTruthsLobbySubmit
                  gameCode={gameCode}
                  playerId={hostPlayerId}
                  existingLieIndex={myStatement?.lie_index}
                  existingStatements={existingStatements}
                  onSaved={() => { setEditingStatements(false); void load() }}
                />
                {myStatement && (
                  <button
                    type="button"
                    onClick={() => setEditingStatements(false)}
                    className="btn-secondary w-full"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )
          ) : null
        )}

        {(tab === 'manage' || !showPlayTab) && (
          <TwoTruthsHostManagePanel
            game={game}
            gameCode={gameCode}
            hostToken={hostToken}
            playerLink={playerLink}
            players={players}
            statements={statements}
            rounds={rounds}
            guesses={guesses}
            starting={starting}
            playingAgain={playingAgain}
            onStartGame={startGame}
            onPlayAgain={playAgain}
            onReload={load}
            timerSeconds={timerSeconds}
            onTimerChange={setTimerSeconds}
            savingTimer={savingTimer}
            onSaveTimer={saveTimer}
            onRemovePlayer={removePlayer}
            removingPlayerId={removingPlayerId}
            onGameUpdate={setGame}
          />
        )}
      </div>
    </div>
  )
}
