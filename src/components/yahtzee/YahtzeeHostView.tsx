'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { YahtzeeDiceTray } from '@/components/yahtzee/YahtzeeChrome'
import { YahtzeeScorecard } from '@/components/yahtzee/YahtzeeScorecard'
import { YahtzeeFinalResultsShareBlock } from '@/components/yahtzee/YahtzeeFinalResultsShareBlock'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { gameTypeConfig } from '@/lib/game-types'
import {
  currentPlayerId,
  getYahtzeeHostMode,
  setYahtzeeHostMode,
  YAHTZEE_MIN_PLAYERS,
  type YahtzeeHostMode,
} from '@/lib/yahtzee'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, YAHTZEE_PLAYER_SCORES_SELECT, YAHTZEE_SESSION_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, YahtzeeCategory, YahtzeePlayerScore, YahtzeeSession } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useApplyGameTheme } from '@/hooks/useApplyGameTheme'
import { useYahtzeeTurnTimer } from '@/hooks/useYahtzeeTurnTimer'
import { useYahtzeeNotifications, playYahtzeeScoreSound } from '@/hooks/useYahtzeeNotifications'

type HostTab = 'play' | 'manage'

export function YahtzeeHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const router = useRouter()
  const { error: toastError, success } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [session, setSession] = useState<YahtzeeSession | null>(null)
  const [scores, setScores] = useState<YahtzeePlayerScore[]>([])
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)
  const [ending, setEnding] = useState(false)

  // Host+play mode
  const [hostMode, setHostMode] = useState<YahtzeeHostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [hostActing, setHostActing] = useState(false)
  const [localHostHeld, setLocalHostHeld] = useState<boolean[]>([false, false, false, false, false])
  const [tab, setTab] = useState<HostTab>('manage')
  const turnIndexRef = useRef<number | null>(null)

  useApplyGameTheme(game?.theme)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, sessionRes, scoresRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
      supabase.from('yahtzee_player_scores').select(YAHTZEE_PLAYER_SCORES_SELECT).eq('game_id', gameCode).order('player_order'),
    ])
    if (!supabasePollOk(gameRes, plrsRes, sessionRes, scoresRes)) return false
    setGame(gameRes.data)
    setPlayers(plrsRes.data ?? [])
    setSession(sessionRes.data as YahtzeeSession | null)
    setScores((scoresRes.data as YahtzeePlayerScore[]) ?? [])
    return true
  }, [gameCode])

  useEffect(() => {
    load()
    setHostMode(getYahtzeeHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostPlayerName(session.playerName)
    }
  }, [gameCode, load])

  // Reset held when turn changes away from host
  useEffect(() => {
    if (!session || !hostPlayerId) return
    const turnId = currentPlayerId(session)
    const turnIndex = session.current_turn_index ?? null
    if (turnIndex !== turnIndexRef.current) {
      turnIndexRef.current = turnIndex
      if (turnId !== hostPlayerId) {
        setLocalHostHeld([false, false, false, false, false])
      }
    }
  }, [session, hostPlayerId])

  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  useEffect(() => {
    const channel = supabase
      .channel(`yahtzee-host-${gameCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_sessions', filter: `game_id=eq.${gameCode}` }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'yahtzee_player_scores', filter: `game_id=eq.${gameCode}` }, () => void load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameCode, load])

  usePolling(() => load(), [gameCode, load], { intervalMs: POLL_INTERVALS.realtimeFallback })

  const changeHostMode = (mode: YahtzeeHostMode) => {
    if (game?.status !== 'waiting') return
    setHostMode(mode)
    setYahtzeeHostMode(gameCode, mode)
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
      setYahtzeeHostMode(gameCode, 'player')
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }

  const postHostAction = async (url: string, body: Record<string, unknown> = {}) => {
    if (!hostPlayerId || hostActing) return
    setHostActing(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setHostActing(false)
    }
  }

  const toggleHostHold = (index: number) => {
    if (!session || !hostPlayerId || currentPlayerId(session) !== hostPlayerId) return
    if ((session.rolls_this_turn ?? 0) < 1) return
    const next = [...localHostHeld]
    next[index] = !next[index]
    setLocalHostHeld(next)
    void fetch('/api/yahtzee/hold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: gameCode, playerId: hostPlayerId, held: next }),
    }).then(async (res) => {
      const data = await res.json()
      if (!res.ok) {
        setLocalHostHeld(session.held ?? [false, false, false, false, false])
        toastError(data.error ?? 'Could not keep dice')
      }
    })
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
      // Stay on Manage so the board is visible immediately; host can switch to Play.
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to start')
    } finally {
      setStarting(false)
    }
  }

  const finishGame = async () => {
    setEnding(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/finish-game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to end game')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to end game')
    } finally {
      setEnding(false)
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
      success('Ready for a new game!')
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reset')
    } finally {
      setPlayingAgain(false)
    }
  }

  const cfg = gameTypeConfig('yahtzee')
  const joinUrl = `${appOrigin()}/game/${gameCode}`
  const canStart = players.length >= YAHTZEE_MIN_PLAYERS
  const turnPlayerId = session ? currentPlayerId(session) : null
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const winner = players.find((p) => p.id === session?.winner_player_id)
  const hostPlays = hostMode === 'player' && !!hostPlayerId
  const showPlayTab = hostPlays && game?.status !== 'waiting' && game?.status !== 'finished'

  const isHostTurn = turnPlayerId === hostPlayerId
  const canHostScore = isHostTurn && (session?.rolls_this_turn ?? 0) > 0

  const { secondsLeft, hasTimer, urgent } = useYahtzeeTurnTimer(gameCode, session, game?.status === 'active')
  useYahtzeeNotifications({ game, session, myPlayerId: hostPlayerId, enabled: hostPlays && game?.status === 'active' })

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="text-4xl">{cfg.headerEmoji}</div>
          <h1 className="text-2xl font-black tracking-tight gradient-title">{game.title}</h1>
          <p className="text-muted text-sm">{cfg.label} · Host panel</p>
        </div>

        {/* Host mode selector — lobby only */}
        {game.status === 'waiting' && (
          <div className="glass-card-strong p-5 space-y-3">
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
                <span className="text-faint text-xs">Spectate from Manage</span>
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
                <span className="text-faint text-xs">Play tab + Manage tab</span>
              </button>
            </div>
            {hostMode === 'player' && !hostPlayerId && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={hostJoinName}
                  onChange={(e) => setHostJoinName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && hostJoinGame()}
                  placeholder="Your name"
                  className="input-field flex-1"
                  maxLength={40}
                />
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

      {/* Play / Manage tab switcher */}
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

      {/* Play tab — host as Yahtzee player */}
      {tab === 'play' && hostPlays && hostPlayerId && game.status === 'active' && (
        session ? (
          <div className="space-y-2">
            <YahtzeeScorecard
              players={players}
              scores={scores}
              myPlayerId={hostPlayerId}
              activePlayerId={turnPlayerId}
              dice={session.dice}
              scoringEnabled={canHostScore}
              onScore={(category: YahtzeeCategory) => {
                playYahtzeeScoreSound()
                void postHostAction('/api/yahtzee/score', { category })
              }}
            />
            <YahtzeeDiceTray
              dice={session.dice}
              held={localHostHeld}
              rollsThisTurn={session.rolls_this_turn}
              rollsRemaining={session.rolls_remaining}
              interactive={isHostTurn && (session.rolls_this_turn ?? 0) > 0}
              onToggleHold={toggleHostHold}
              onRoll={() => postHostAction('/api/yahtzee/roll')}
              rolling={hostActing}
              isMyTurn={isHostTurn}
              turnName={turnPlayer?.name}
              secondsLeft={secondsLeft}
              hasTimer={hasTimer}
              urgent={urgent}
            />
          </div>
        ) : (
          <div className="glass-card p-8 text-center text-sm text-muted">Loading game…</div>
        )
      )}

        {/* Manage tab (or default when no Play tab) */}
        {(tab === 'manage' || !showPlayTab) && (
          <>
            <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-faint text-xs uppercase tracking-wider">Share with players</p>
                <p className="font-mono font-bold text-lg">{gameCode}</p>
              </div>
              <CopyLinkButton value={joinUrl} label="Copy player link" />
            </div>

            {game.status === 'waiting' && (
              <div className="glass-card p-5 space-y-4">
                <div>
                  <p className="label-caps mb-2">Lobby ({players.length} joined)</p>
                  {players.length === 0 ? (
                    <p className="text-muted text-sm">Waiting for players to join…</p>
                  ) : (
                    <ul className="space-y-1">
                      {players.map((p) => (
                        <li key={p.id} className="text-sm font-medium flex items-center gap-2">
                          {p.name}
                          {p.id === hostPlayerId && (
                            <span className="text-[10px] font-bold uppercase text-[var(--primary)]">You</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {!canStart && (
                  <p className="text-sm text-[var(--marry)]">Need at least {YAHTZEE_MIN_PLAYERS} players to start.</p>
                )}
                <button
                  type="button"
                  onClick={startGame}
                  disabled={!canStart || starting}
                  className="btn-primary w-full"
                >
                  {starting ? 'Starting…' : `Start Yahtzee (${YAHTZEE_MIN_PLAYERS}+ players)`}
                </button>
              </div>
            )}

            {game.status === 'active' && (
              session ? (
                <>
                  <div className="space-y-2">
                    <YahtzeeScorecard
                      players={players}
                      scores={scores}
                      activePlayerId={turnPlayerId}
                      dice={session.dice}
                      scoringEnabled={false}
                    />
                    <YahtzeeDiceTray
                      dice={session.dice}
                      held={session.held}
                      rollsThisTurn={session.rolls_this_turn}
                      rollsRemaining={session.rolls_remaining}
                      turnName={turnPlayer?.name}
                      secondsLeft={secondsLeft}
                      hasTimer={hasTimer}
                      urgent={urgent}
                      spectator
                    />
                  </div>
                  <button
                    type="button"
                    onClick={finishGame}
                    disabled={ending}
                    className="btn-secondary w-full py-3"
                  >
                    {ending ? 'Ending…' : 'End game early'}
                  </button>
                </>
              ) : (
                <div className="glass-card p-8 text-center text-sm text-muted">Loading game…</div>
              )
            )}

            {game.status === 'finished' && (
              <>
                <YahtzeeFinalResultsShareBlock
                  game={game}
                  players={players}
                  scores={scores}
                  winnerName={winner?.name}
                />
                <button
                  type="button"
                  onClick={playAgain}
                  disabled={playingAgain}
                  className="btn-secondary w-full py-3"
                >
                  {playingAgain ? 'Resetting…' : 'Play again'}
                </button>
              </>
            )}
          </>
        )}

        <button type="button" onClick={() => router.push('/')} className="btn-ghost w-full text-muted">
          Back home
        </button>
      </div>
    </div>
  )
}
