'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CodewordsActiveRound } from '@/components/codewords/CodewordsActiveRound'
import { CodewordsHostManagePanel } from '@/components/codewords/CodewordsHostManagePanel'
import { CodewordsWaitingPanel } from '@/components/codewords/CodewordsWaitingPanel'
import { gameTypeConfig } from '@/lib/game-types'
import {
  CODEWORDS_DEFAULT_OPERATIVE_TIMER,
  CODEWORDS_DEFAULT_SPYMASTER_TIMER,
  codewordsPlayerPicks,
  codewordsRandomizeTeams,
  getCodewordsHostMode,
  mergeCodewordsGuesses,
  setCodewordsHostMode,
  teamLabel,
  type CodewordsHostMode,
} from '@/lib/codewords'
import { useCodewordsRealtime } from '@/hooks/useCodewordsRealtime'
import { useCodewordsNotifications } from '@/hooks/useCodewordsNotifications'
import { supabase } from '@/lib/supabase'
import { appOrigin } from '@/lib/site'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import type { CodewordsBoard, CodewordsGuess, CodewordsPlayerRole, CodewordsRole, CodewordsTeam, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { HostAllowViewersField } from '@/components/HostAllowViewersField'

type HostTab = 'play' | 'manage'

export function CodewordsHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roles, setRoles] = useState<CodewordsPlayerRole[]>([])
  const [board, setBoard] = useState<CodewordsBoard | null>(null)
  const [guesses, setGuesses] = useState<CodewordsGuess[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [ending, setEnding] = useState(false)
  const [randomizingTeams, setRandomizingTeams] = useState(false)
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null)
  const [spymasterTimer, setSpymasterTimer] = useState(CODEWORDS_DEFAULT_SPYMASTER_TIMER)
  const [operativeTimer, setOperativeTimer] = useState(CODEWORDS_DEFAULT_OPERATIVE_TIMER)
  const [savingTimers, setSavingTimers] = useState(false)
  const [benchingPlayerId, setBenchingPlayerId] = useState<string | null>(null)
  const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null)
  const [hostMode, setHostMode] = useState<CodewordsHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: plrs }, { data: roleRows }, { data: boardData }, { data: guessRows }] =
      await Promise.all([
        supabase.from('games').select('*').eq('id', gameCode).maybeSingle(),
        supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
        supabase.from('codewords_player_roles').select('*').eq('game_id', gameCode),
        supabase.from('codewords_boards').select('*').eq('game_id', gameCode).maybeSingle(),
        supabase.from('codewords_guesses').select('*').eq('game_id', gameCode).order('created_at', { ascending: true }),
      ])
    if (gameData) {
      setGame(gameData)
      setSpymasterTimer(gameData.timer_seconds ?? CODEWORDS_DEFAULT_SPYMASTER_TIMER)
      setOperativeTimer(gameData.operative_timer_seconds ?? CODEWORDS_DEFAULT_OPERATIVE_TIMER)
    }
    setPlayers(plrs ?? [])
    setRoles(roleRows ?? [])
    setBoard(boardData as CodewordsBoard | null)
    setGuesses(mergeCodewordsGuesses([], (guessRows as CodewordsGuess[]) ?? []))
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getCodewordsHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  useCodewordsRealtime(gameCode, 'host', {
    onGame: setGame,
    onPlayers: (updater) => setPlayers(updater),
    onRoles: (updater) => setRoles(updater),
    onBoard: setBoard,
    onGuesses: (updater) => setGuesses(updater),
    onReload: load,
  })

  const lateJoinNotifyReadyRef = useRef(false)
  const prevPlayerIdsRef = useRef<Set<string>>(new Set())
  const prevRolesByPlayerRef = useRef<Map<string, CodewordsPlayerRole>>(new Map())

  useEffect(() => {
    if (!game || game.status !== 'active') {
      lateJoinNotifyReadyRef.current = false
      prevPlayerIdsRef.current = new Set(players.map((p) => p.id))
      prevRolesByPlayerRef.current = new Map(roles.map((r) => [r.player_id, r]))
      return
    }

    if (!lateJoinNotifyReadyRef.current) {
      lateJoinNotifyReadyRef.current = true
      prevPlayerIdsRef.current = new Set(players.map((p) => p.id))
      prevRolesByPlayerRef.current = new Map(roles.map((r) => [r.player_id, r]))
      return
    }

    for (const player of players) {
      const role = roles.find((r) => r.player_id === player.id)
      const prevRole = prevRolesByPlayerRef.current.get(player.id)
      const isNewPlayer = !prevPlayerIdsRef.current.has(player.id)
      if (role?.role === 'operative' && (isNewPlayer || !prevRole)) {
        success(
          isNewPlayer
            ? `${player.name} joined mid-game — ${teamLabel(role.team)} operative`
            : `${player.name} assigned to ${teamLabel(role.team)} team`
        )
      }
    }

    prevPlayerIdsRef.current = new Set(players.map((p) => p.id))
    prevRolesByPlayerRef.current = new Map(roles.map((r) => [r.player_id, r]))
  }, [game, players, roles, success])

  const assignRole = async (playerId: string, team: CodewordsTeam, role: CodewordsRole) => {
    setSavingRoleFor(playerId)
    try {
      const res = await fetch('/api/codewords/host-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, playerId, team, role }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update role')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setSavingRoleFor(null)
    }
  }

  const moveTeam = (playerId: string, team: CodewordsTeam) => {
    const current = roles.find((r) => r.player_id === playerId)
    const role: CodewordsRole = current?.role === 'spymaster' ? 'spymaster' : 'operative'
    void assignRole(playerId, team, role)
  }

  const setSpymaster = (playerId: string, team: CodewordsTeam, makeSpymaster: boolean) => {
    void assignRole(playerId, team, makeSpymaster ? 'spymaster' : 'operative')
  }

  const changeHostMode = (mode: CodewordsHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setCodewordsHostMode(gameCode, mode)
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
      setCodewordsHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
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
      success('Codewords started!')
      if (hostMode === 'player') setTab('play')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const shuffleTeams = async () => {
    setRandomizingTeams(true)
    try {
      const res = await fetch('/api/codewords/randomize-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to shuffle teams')
      await load()
      success('Teams shuffled!')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to shuffle teams')
    } finally {
      setRandomizingTeams(false)
    }
  }

  const benchPlayer = async (playerId: string) => {
    setBenchingPlayerId(playerId)
    try {
      const res = await fetch('/api/codewords/host-role', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken, playerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to move player to waiting room')
      if (playerId === hostPlayerId) {
        setHostPlayerId(null)
        setHostPlayerName('')
        clearPlayerSession(gameCode)
      }
      await load()
      success('Player moved to waiting room')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to move player to waiting room')
    } finally {
      setBenchingPlayerId(null)
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
        clearPlayerSession(gameCode)
        setHostMode('spectator')
        setCodewordsHostMode(gameCode, 'spectator')
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
      setRoles((prev) => prev.filter((r) => r.player_id !== playerId))
      success('Player removed')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to remove player')
    } finally {
      setRemovingPlayerId(null)
    }
  }

  const saveTimers = async () => {
    setSavingTimers(true)
    try {
      const res = await fetch('/api/codewords/timers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          hostToken,
          spymasterTimerSeconds: spymasterTimer,
          operativeTimerSeconds: operativeTimer,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update timers')
      if (data.game) setGame(data.game)
      await load()
      success('Timer settings updated')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update timers')
    } finally {
      setSavingTimers(false)
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
      setBoard(null)
      setGuesses([])
      await load()
      success('Lobby reopened!')
      setTab('manage')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const endSession = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end session')
      await load()
      setTab('manage')
      success('Session closed')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end session')
    } finally {
      setEnding(false)
    }
  }

  const cfg = gameTypeConfig('codewords')
  const playerLink = `${appOrigin()}/game/${gameCode}`
  const playersPickTeams = game ? codewordsPlayerPicks(game) : true
  const randomizeTeams = game ? codewordsRandomizeTeams(game) : false
  const hostMyRole = hostPlayerId ? roles.find((r) => r.player_id === hostPlayerId) : undefined
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showPlayTab = hostPlays && !!hostMyRole
  const inActivePlay = showPlayTab && game?.status === 'active' && !!board

  useCodewordsNotifications({
    game,
    board,
    myRole: hostMyRole,
    enabled: !!game && game.status === 'active' && hostMode === 'spectator' && tab === 'manage',
  })

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    if (inActivePlay) setTab('play')
  }, [inActivePlay])

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game.title}</h1>
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
                Playing as <strong>{hostPlayerName}</strong> —{' '}
                {randomizeTeams
                  ? 'pick spymasters in Manage → Teams, then shuffle or start.'
                  : playersPickTeams
                    ? 'pick your team in Manage → Teams, or assign yourself there.'
                    : 'assign yourself in Manage → Teams.'}
              </p>
            )}
          </div>
        )}

        {game.status === 'waiting' && (
          <div className="glass-card p-4">
            <HostAllowViewersField gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
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

        {tab === 'play' && showPlayTab && hostMyRole && (
          inActivePlay && board ? (
            <CodewordsActiveRound
              gameCode={gameCode}
              game={game}
              board={board}
              myPlayerId={hostPlayerId!}
              myPlayerName={hostPlayerName}
              myRole={hostMyRole}
              players={players}
              roles={roles}
              guesses={guesses}
              onBoardChange={setBoard}
              onReload={load}
            />
          ) : (
            <CodewordsWaitingPanel
              playerName={hostPlayerName}
              myRole={hostMyRole}
              playerCount={players.length}
              variant={game.status === 'active' ? 'starting' : 'lobby'}
              manageHint="Head to Manage → Teams to assign players, then start the game when ready."
            />
          )
        )}

        {(tab === 'manage' || !showPlayTab) && (
          <CodewordsHostManagePanel
            game={game}
            gameCode={gameCode}
            playerLink={playerLink}
            players={players}
            roles={roles}
            board={board}
            guesses={guesses}
            spymasterTimer={spymasterTimer}
            operativeTimer={operativeTimer}
            savingTimers={savingTimers}
            savingRoleFor={savingRoleFor}
            starting={starting}
            playingAgain={playingAgain}
            ending={ending}
            onSpymasterTimerChange={setSpymasterTimer}
            onOperativeTimerChange={setOperativeTimer}
            onSaveTimers={saveTimers}
            onSetSpymaster={setSpymaster}
            onMoveTeam={moveTeam}
            onStartGame={startGame}
            onRandomizeTeams={shuffleTeams}
            randomizingTeams={randomizingTeams}
            onPlayAgain={playAgain}
            onEndSession={endSession}
            onBenchPlayer={benchPlayer}
            onRemovePlayer={removePlayer}
            benchingPlayerId={benchingPlayerId}
            removingPlayerId={removingPlayerId}
            showSpectatorBoard={hostMode === 'spectator'}
          />
        )}

      </div>
    </div>
  )
}
