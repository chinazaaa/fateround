'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TriviaActiveRound } from '@/components/trivia/TriviaActiveRound'
import { TriviaHostManagePanel } from '@/components/trivia/TriviaHostManagePanel'
import { TriviaPlayAgainSetup, type TriviaSettingsPayload } from '@/components/trivia/TriviaPlayAgainSetup'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostPageShell, hostPlayLayoutFlags } from '@/components/host/HostPageShell'
import { gameTypeConfig } from '@/lib/game-types'
import { getTriviaHostMode, setTriviaHostMode, type TriviaHostMode } from '@/lib/trivia'
import { useTriviaHostRoundAutomation } from '@/hooks/useTriviaHostRoundAutomation'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, Round, TriviaAnswer } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'

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
  const [hostMode, setHostMode] = useState<TriviaHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
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
    setHostMode(getTriviaHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

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

  useEffect(() => {
    const channel = supabase
      .channel(`trivia-host-${gameCode}`)
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
        (p) => {
          const player = p.new as Player
          setPlayers((prev) => (prev.some((x) => x.id === player.id) ? prev : [...prev, player]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` },
        (p) => {
          const player = p.old as Player
          setPlayers((prev) => prev.filter((x) => x.id !== player.id))
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` },
        () => {
          load()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'trivia_answers', filter: `game_id=eq.${gameCode}` },
        (p) => {
          const row = p.new as TriviaAnswer
          setAnswers((prev) => (prev.some((a) => a.id === row.id) ? prev : [...prev, row]))
          load()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameCode, load])

  usePolling(
    async () => {
      if (settingsModalRef.current) return true
      return load()
    },
    [gameCode, load],
    { intervalMs: POLL_INTERVALS.realtimeFallback }
  )

  const changeHostMode = (mode: TriviaHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setTriviaHostMode(gameCode, mode)
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
      setHostPlayerName(data.playerName)
      setHostMode('player')
      setTriviaHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

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
  const showPlayTab = hostPlays && game?.status !== 'waiting'

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    if (showPlayTab && game?.status === 'active') setTab('play')
  }, [showPlayTab, game?.status])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const layout = hostPlayLayoutFlags(tab, showPlayTab, game.status)

  return (
    <HostPageShell gameCode={gameCode} {...layout}>
      <HostGameHeader game={game} />

      {game.status === 'waiting' && (
        <div className="glass-card-strong p-5 sm:p-6 space-y-3">
          <p className="label-caps">Host mode</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => changeHostMode('spectator')}
              className={[
                'rounded-2xl border-2 px-4 py-4 text-left',
                hostMode === 'spectator'
                  ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                  : 'border-[var(--border-strong)] text-muted',
              ].join(' ')}
            >
              <span className="font-bold block text-base">Host only</span>
              <span className="text-faint text-xs sm:text-sm">Run the game from Manage</span>
            </button>
            <button
              type="button"
              onClick={() => changeHostMode('player')}
              className={[
                'rounded-2xl border-2 px-4 py-4 text-left',
                hostMode === 'player'
                  ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
                  : 'border-[var(--border-strong)] text-muted',
              ].join(' ')}
            >
              <span className="font-bold block text-base">Host + play</span>
              <span className="text-faint text-xs sm:text-sm">Play tab + Manage tab</span>
            </button>
          </div>
          {hostMode === 'player' && !hostPlayerId && (
            <div className="flex items-center gap-2 pt-1">
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
            <p className="text-sm text-muted">
              Playing as <strong className="text-body">{hostPlayerName}</strong> — switch to Play after you start.
            </p>
          )}
        </div>
      )}

      {game.status === 'waiting' && (
        <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
      )}

      {showPlayTab && (
        <div className="flex gap-2 p-1 rounded-xl bg-[var(--surface-inset-bg)] border border-[var(--border-strong)]">
          <button
            type="button"
            onClick={() => setTab('play')}
            className={[
              'flex-1 rounded-lg py-3 text-sm sm:text-base font-bold transition-colors',
              tab === 'play' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
            ].join(' ')}
          >
            Play
          </button>
          <button
            type="button"
            onClick={() => setTab('manage')}
            className={[
              'flex-1 rounded-lg py-3 text-sm sm:text-base font-bold transition-colors',
              tab === 'manage' ? 'bg-[var(--card-strong)] shadow-sm' : 'text-muted',
            ].join(' ')}
          >
            Manage
          </button>
        </div>
      )}

      {tab === 'play' && hostPlays && hostPlayerId && game.status !== 'waiting' && (
        <TriviaActiveRound
          gameCode={gameCode}
          game={game}
          players={players}
          rounds={rounds}
          answers={answers}
          myPlayerId={hostPlayerId}
          playerName={hostPlayerName}
          onReload={load}
          skipGameSync
        />
      )}

      {(tab === 'manage' || !showPlayTab) && (
        <TriviaHostManagePanel
          game={game}
          gameCode={gameCode}
          hostToken={hostToken}
          playerLink={playerLink}
          players={players}
          rounds={rounds}
          answers={answers}
          starting={starting}
          advancing={advancing}
          playingAgain={playingAgain}
          onStartGame={startGame}
          onEndRound={endRound}
          onPlayAgain={() => setSettingsModal('play-again')}
          onEditSettings={() => setSettingsModal('lobby')}
          onReload={load}
          onGameUpdate={setGame}
          onRemovePlayer={removePlayer}
          removingPlayerId={removingPlayerId}
          highlightPlayerId={hostPlayerId}
          activeRound={roundAutomation.activeRound}
          betweenRounds={roundAutomation.betweenRounds}
          lastFinishedRound={roundAutomation.lastFinishedRound}
          roundAnswers={roundAutomation.roundAnswers}
          allAnswered={roundAutomation.allAnswered}
          isLastRound={roundAutomation.isLastRound}
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
    </HostPageShell>
  )
}
