'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import { TwoTruthsActiveRound } from '@/components/two-truths/TwoTruthsActiveRound'
import { TwoTruthsLobbySubmit } from '@/components/two-truths/TwoTruthsLobbySubmit'
import { gameTypeConfig } from '@/lib/game-types'
import { supabase } from '@/lib/supabase'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
  TTL_GUESS_SELECT,
  TTL_STATEMENT_SELECT,
} from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { Game, Player, Round, TtlGuess, TtlStatement } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { ShareGameLinkCard } from '@/components/ShareGameLinkCard'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { GameLobbyPlayerList } from '@/components/ui/GameLobbyPlayerList'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'lobby' | 'playing' | 'not_found'

export function TwoTruthsPlayerView({ gameCode }: { gameCode: string }) {
  const { error: toastError, success } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [statements, setStatements] = useState<TtlStatement[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<TtlGuess[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, stmtsRes, rdsRes, gssRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase.from('ttl_statements').select(TTL_STATEMENT_SELECT).eq('game_id', gameCode),
      supabase.from('rounds').select(ROUND_SELECT).eq('game_id', gameCode).order('round_number'),
      supabase.from('ttl_guesses').select(TTL_GUESS_SELECT).eq('game_id', gameCode),
    ])
    if (!supabasePollOk(gameRes, plrsRes, stmtsRes, rdsRes, gssRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data
    const stmts = stmtsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setStatements(stmts ?? [])
    setRounds(rdsRes.data ?? [])
    setGuesses(gssRes.data ?? [])

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
      setMyPlayerName(session.playerName)
    } else {
      setMyPlayerId(null)
      setMyPlayerName('')
    }

    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      setScreen(pre === 'game_started_waiting' ? 'game_started_waiting' : 'join')
      return true
    }

    if (gameData.status === 'waiting') {
      setScreen('lobby')
    } else {
      setScreen('playing')
    }
    return true
  }, [gameCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const channel = supabase
      .channel(`ttl-player-${gameCode}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameCode}` }, () =>
        load()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ttl_statements', filter: `game_id=eq.${gameCode}` }, () =>
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

  const openLobbyJoin = useCallback(() => {
    setScreen('join')
    void load()
  }, [load])

  useLobbyOpenNotification(game?.status, () => {
    if (screen === 'game_started_waiting' || screen === 'playing') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  // In the lobby, everyone can participate regardless of spectator flag (gets cleared on reset)
  const isViewer = !!(game && me && game.status !== 'waiting' && playerIsViewer(me, game))

  const joinGame = async () => {
    const name = joinName.trim()
    if (!name) return
    setJoining(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameCode,
          playerName: name,
          ...(game?.status === 'active' ? { joinAsViewer: true } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to join')
      setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      setMyPlayerId(data.playerId)
      setMyPlayerName(data.playerName)
      await load()
      success(`Joined as ${data.playerName}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setJoining(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName('')
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('two_truths')
  const myStatement = myPlayerId ? statements.find((s) => s.player_id === myPlayerId) : null
  const existingStatements = myStatement
    ? ([myStatement.statement_a, myStatement.statement_b, myStatement.statement_c] as [string, string, string])
    : null
  const [editingStatements, setEditingStatements] = useState(false)
  const prevMyStatement = useRef(myStatement)
  useEffect(() => {
    if (!prevMyStatement.current && myStatement) setEditingStatements(false)
    prevMyStatement.current = myStatement
  }, [myStatement])

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-xl font-bold">Game not found</p>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'join') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-card p-6 w-full max-w-md space-y-5">
          <div className="text-center space-y-1">
            <div className="text-4xl">{cfg.headerEmoji}</div>
            <h1 className="text-2xl font-black gradient-title">{game?.title}</h1>
            <GameTypeBadge gameType="two_truths" />
          </div>
          <input
            type="text"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && joinGame()}
            placeholder="Your name"
            className="input-field w-full"
            maxLength={40}
          />
          <button type="button" onClick={joinGame} disabled={!joinName.trim() || joining} className="btn-primary w-full">
            {joining ? 'Joining…' : 'Join game'}
          </button>
          <ShareGameLinkCard gameCode={gameCode} />
        </div>
      </div>
    )
  }

  if (screen === 'lobby' && myPlayerId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="glass-card p-6 w-full max-w-lg space-y-5">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-black">Lobby</h2>
            <PlayerSessionControls
              gameCode={gameCode}
              playerId={myPlayerId}
              currentName={myPlayerName}
              onRenamed={(name) => { setMyPlayerName(name); void load() }}
              onLeft={handlePlayerLeft}
              inLobby
            />
          </div>
          <p className="text-center">
            <GameRulesLink gameType="two_truths" variant="subtle" />
          </p>
          <GameLobbyPlayerList players={players} myPlayerId={myPlayerId} label="In lobby" />
          {isViewer ? (
            <ViewerModeBanner
              gameCode={gameCode}
              playerId={myPlayerId}
              game={game}
              player={me}
              onPromoted={load}
            />
          ) : myStatement && !editingStatements ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center space-y-1">
                <p className="text-2xl">✓</p>
                <p className="font-semibold text-emerald-800 dark:text-emerald-200">Statements submitted</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">Waiting for the host to start the game…</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStatements(true)}
                className="btn-secondary w-full"
              >
                Edit my statements
              </button>
            </div>
          ) : myStatement && editingStatements ? (
            <div className="space-y-4">
              <TwoTruthsLobbySubmit
                gameCode={gameCode}
                playerId={myPlayerId}
                existingLieIndex={myStatement.lie_index}
                existingStatements={existingStatements}
                onSaved={() => { setEditingStatements(false); load() }}
              />
              <button
                type="button"
                onClick={() => setEditingStatements(false)}
                className="btn-secondary w-full"
              >
                Cancel
              </button>
            </div>
          ) : (
            <TwoTruthsLobbySubmit gameCode={gameCode} playerId={myPlayerId} onSaved={load} />
          )}
          <ShareGameLinkCard gameCode={gameCode} />
        </div>
      </div>
    )
  }

  if (screen === 'playing' && game && myPlayerId) {
    return (
      <div className="min-h-screen pb-16">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="text-3xl">{cfg.headerEmoji}</div>
            <h1 className="text-xl font-black gradient-title">{game.title}</h1>
          </div>
          {isViewer && (
            <ViewerModeBanner
              gameCode={gameCode}
              playerId={myPlayerId}
              game={game}
              player={me}
              onPromoted={load}
            />
          )}
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myPlayerName}
            onRenamed={(name) => { setMyPlayerName(name); void load() }}
            onLeft={handlePlayerLeft}
          />
          <TwoTruthsActiveRound
            gameCode={gameCode}
            game={game}
            players={players}
            rounds={rounds}
            guesses={guesses}
            myPlayerId={myPlayerId}
            playerName={myPlayerName}
            onReload={load}
            readOnly={isViewer}
          />
        </div>
      </div>
    )
  }

  return null
}
