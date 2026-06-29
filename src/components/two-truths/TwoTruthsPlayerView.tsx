'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
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
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { playerIsViewer, preJoinScreen } from '@/lib/viewers'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { EliminationBanner } from '@/components/EliminationBanner'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Screen = 'loading' | 'join' | 'game_started_waiting' | 'game_ended' | 'lobby' | 'playing' | 'not_found'

export function TwoTruthsPlayerView({ gameCode }: { gameCode: string }) {
  const { error: toastError, success } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [statements, setStatements] = useState<TtlStatement[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [guesses, setGuesses] = useState<TtlGuess[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myResumeToken, setMyResumeToken] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)

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
      setMyResumeToken(session.resumeToken ?? null)
    } else {
      setMyPlayerId(null)
      setMyPlayerName('')
      setMyResumeToken(null)
    }

    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      setScreen(pre === 'game_started_waiting' ? 'game_started_waiting' : pre === 'game_ended' ? 'game_ended' : 'join')
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

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'rounds', 'ttl_statements', 'ttl_guesses'], load)

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
  // …but a genuine spectator/eliminated player sitting in the lobby must NOT fall into the
  // statement-submit flow. isViewer is intentionally false during 'waiting', so guard the
  // submit path explicitly on the spectator/eliminated flags (normal play clears spectator
  // on reset, so this only bites an actual watch-only viewer).
  const isLobbyWatcher = !!(me && (me.spectator === true || me.is_eliminated === true))

  const joinGame = useCallback(
    async (opts?: { joinAsViewer?: boolean; name?: string }) => {
      const name = (opts?.name ?? joinName).trim()
      if (!name) return
      setJoining(true)
      try {
        const res = await fetch('/api/players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameCode,
            playerName: name,
            ...joinExtras,
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer ?? true } : {}),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to join')
        setPlayerSession(gameCode, data.playerId, data.playerName, data.playerGender, data.resumeToken)
        setMyPlayerId(data.playerId)
        setMyResumeToken(data.resumeToken ?? null)
        setMyPlayerName(data.playerName)
        await load()
        success(`Joined as ${data.playerName}`)
      } catch (err) {
        toastError(err instanceof Error ? err.message : 'Failed to join')
      } finally {
        setJoining(false)
      }
    },
    [game?.status, gameCode, joinExtras, joinName, load, success, toastError]
  )

  useRoomMemberAutoJoin({
    displayName: roomDisplayName,
    resolving: resolvingRoomMember,
    screen,
    gameStatus: game?.status,
    hasPlayerSession: !!myPlayerId,
    joining,
    onJoin: (name) => joinGame({ name }),
  })

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

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'join') {
    if (resolvingRoomMember) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-muted text-lg">Joining from your game room…</p>
        </div>
      )
    }

    return (
      <GameJoinLobbyShell
        gameCode={gameCode}
        header={<GameJoinHeader emoji={cfg.headerEmoji} title={game?.title} gameType="two_truths" />}
      >
        <NameJoinForm value={joinName} onChange={setJoinName} onSubmit={() => void joinGame()} joining={joining} />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'lobby' && myPlayerId) {
    return (
      <GameJoinLobbyShell gameCode={gameCode} onResumed={load}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myPlayerName}
          onRenamed={(name) => {
            setMyPlayerName(name)
            void load()
          }}
          onLeft={handlePlayerLeft}
          title="Lobby"
          rulesLink={<GameRulesLink gameType="two_truths" variant="subtle" />}
          isSpectator={me?.spectator === true || me?.is_eliminated === true}
          onReady={async () => {
            if (!myResumeToken) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
            })
            await load()
          }}
          activity={
            isViewer || isLobbyWatcher ? (
              <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
            ) : myStatement && !editingStatements ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-5 text-center space-y-1">
                  <p className="text-2xl">✓</p>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">Statements submitted</p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Waiting for the host to start the game…
                  </p>
                </div>
                <button type="button" onClick={() => setEditingStatements(true)} className="btn-secondary w-full">
                  Edit my statements
                </button>
              </div>
            ) : myStatement && editingStatements ? (
              <div className="space-y-4">
                <TwoTruthsLobbySubmit
                  gameCode={gameCode}
                  resumeToken={myResumeToken}
                  existingLieIndex={myStatement.lie_index}
                  existingStatements={existingStatements}
                  onSaved={() => {
                    setEditingStatements(false)
                    load()
                  }}
                />
                <button type="button" onClick={() => setEditingStatements(false)} className="btn-secondary w-full">
                  Cancel
                </button>
              </div>
            ) : (
              <TwoTruthsLobbySubmit gameCode={gameCode} resumeToken={myResumeToken} onSaved={load} />
            )
          }
        />
      </GameJoinLobbyShell>
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
          {me && <EliminationBanner player={me} />}
          {isViewer && (
            <ViewerModeBanner gameCode={gameCode} playerId={myPlayerId} game={game} player={me} onPromoted={load} />
          )}
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myPlayerName}
            onRenamed={(name) => {
              setMyPlayerName(name)
              void load()
            }}
            onLeft={handlePlayerLeft}
          />
          <TwoTruthsActiveRound
            gameCode={gameCode}
            game={game}
            players={players}
            rounds={rounds}
            guesses={guesses}
            myPlayerId={myPlayerId}
            myResumeToken={myResumeToken}
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
