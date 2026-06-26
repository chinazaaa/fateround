'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BingoCardGrid, BingoCardLegend, CalledNumbersBoard } from '@/components/bingo/BingoCardGrid'
import { BingoFinalResultsShareBlock } from '@/components/bingo/BingoFinalResultsShareBlock'
import { gameTypeConfig } from '@/lib/game-types'
import { formatBingoNumber, hasBingoWin } from '@/lib/bingo'
import { supabase } from '@/lib/supabase'
import {
  BINGO_CALLED_NUMBER_SELECT,
  BINGO_CARD_SELECT,
  BINGO_CLAIM_SELECT,
  GAME_SELECT,
  PLAYER_SELECT,
} from '@/lib/supabase-selects'
import { getPlayerSession, setPlayerSession, clearPlayerSession } from '@/lib/utils'
import { resolvePlayerSession } from '@/lib/player-resume'
import type { BingoCalledNumber, BingoCard, BingoClaim, Game, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useBingoWinNotification, useBingoStartNotification } from '@/hooks/useBingoNotifications'
import { useBingoAutoCall } from '@/hooks/useBingoAutoCall'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { GameStartedWaiting } from '@/components/GameStartedWaiting'
import { GameEndedScreen } from '@/components/GameEndedScreen'
import { LateJoinChoice } from '@/components/LateJoinChoice'
import { GameJoinHeader } from '@/components/game-lobby/GameJoinHeader'
import { GameJoinLobbyShell } from '@/components/game-lobby/GameJoinLobbyShell'
import { GameLobbyWaitingPanel } from '@/components/game-lobby/GameLobbyWaitingPanel'
import { NameJoinForm } from '@/components/game-lobby/NameJoinForm'
import { ViewerModeBanner } from '@/components/ViewerModeBanner'
import { PlayerSessionControls } from '@/components/ui/PlayerSessionControls'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { CreateNewGameButton } from '@/components/ui/CreateNewGameButton'
import { useLobbyOpenNotification } from '@/hooks/useLobbyOpenNotification'
import { useLateJoinContext } from '@/hooks/useLateJoinContext'
import { useRoomMemberAutoJoin, useRoomMemberJoin, useRoomMemberNamePrefill } from '@/hooks/useRoomMemberJoin'
import { playerIsViewer, preJoinScreen, allowLatePlayers } from '@/lib/viewers'

type Screen =
  | 'loading'
  | 'join'
  | 'game_started_waiting'
  | 'late_join_choice'
  | 'game_ended'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'not_found'

export function BingoPlayerView({ gameCode }: { gameCode: string }) {
  const router = useRouter()
  const { success, error: toastError } = useToast()
  const [screen, setScreen] = useState<Screen>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null)
  const [myPlayerName, setMyPlayerName] = useState('')
  const [joinName, setJoinName] = useState('')
  const [joining, setJoining] = useState(false)
  const { displayName: roomDisplayName, joinExtras, resolving: resolvingRoomMember } = useRoomMemberJoin(gameCode)
  useRoomMemberNamePrefill(roomDisplayName, joinName, setJoinName)
  const [card, setCard] = useState<BingoCard | null>(null)
  const [calledNumbers, setCalledNumbers] = useState<BingoCalledNumber[]>([])
  const [winner, setWinner] = useState<BingoClaim | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [marking, setMarking] = useState(false)

  const syncScreen = useCallback((gameData: Game, playerId: string | null) => {
    if (!playerId) {
      const pre = preJoinScreen(gameData, false)
      if (pre === 'game_started_waiting') {
        setScreen('game_started_waiting')
        return
      }
      if (pre === 'late_join_choice') {
        setScreen('late_join_choice')
        return
      }
      if (pre === 'game_ended') {
        setScreen('game_ended')
        return
      }
      setScreen('join')
      return
    }
    if (gameData.status === 'waiting') {
      setScreen(playerId ? 'waiting' : 'join')
      return
    }
    if (gameData.status === 'active') {
      setScreen(playerId ? 'active' : 'join')
      return
    }
    setScreen(playerId ? 'finished' : 'game_ended')
  }, [])

  const loadCard = useCallback(
    async (playerId: string): Promise<boolean> => {
      const res = await supabase
        .from('bingo_cards')
        .select(BINGO_CARD_SELECT)
        .eq('game_id', gameCode)
        .eq('player_id', playerId)
        .maybeSingle()
      if (!supabasePollOk(res)) return false
      setCard(res.data ? (res.data as BingoCard) : null)
      return true
    },
    [gameCode]
  )

  const load = useCallback(async (): Promise<boolean> => {
    const [gameRes, plrsRes, calledRes, claimRes] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
      supabase
        .from('bingo_called_numbers')
        .select(BINGO_CALLED_NUMBER_SELECT)
        .eq('game_id', gameCode)
        .order('called_at'),
      supabase
        .from('bingo_claims')
        .select(BINGO_CLAIM_SELECT)
        .eq('game_id', gameCode)
        .eq('status', 'approved')
        .maybeSingle(),
    ])
    if (!supabasePollOk(gameRes, plrsRes, calledRes, claimRes)) return false

    const gameData = gameRes.data
    const plrs = plrsRes.data

    if (!gameData) {
      setScreen('not_found')
      return true
    }

    setGame(gameData)
    setPlayers(plrs ?? [])
    setCalledNumbers(calledRes.data ?? [])
    setWinner(claimRes.data ?? null)

    const session = await resolvePlayerSession(gameCode, plrs)
    const playerId = session?.playerId ?? null
    if (session) {
      setMyPlayerId(session.playerId)
      setMyPlayerName(session.playerName)
      if (gameData.status === 'waiting') {
        setCard(null)
      } else {
        await loadCard(session.playerId)
      }
    } else {
      setMyPlayerId(null)
      setMyPlayerName('')
      setCard(null)
    }
    syncScreen(gameData, playerId)
    return true
  }, [gameCode, loadCard, syncScreen])

  useEffect(() => {
    load()
  }, [load])

  usePolling(() => (myPlayerId ? loadCard(myPlayerId) : Promise.resolve(true)), [myPlayerId, loadCard], {
    intervalMs: POLL_INTERVALS.lobby,
    enabled: screen === 'active' && !!myPlayerId && !card,
  })

  useEffect(() => {
    const channel = supabase
      .channel(`bingo-player-${gameCode}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_called_numbers', filter: `game_id=eq.${gameCode}` },
        (payload) => {
          const row = payload.new as BingoCalledNumber
          setCalledNumbers((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_cards', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_claims', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_cards', filter: `game_id=eq.${gameCode}` },
        () => {
          void load()
        }
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
    if (screen === 'finished' || screen === 'game_started_waiting' || screen === 'late_join_choice') void load()
  })

  const me = players.find((p) => p.id === myPlayerId)
  const isViewer = !!(game && me && playerIsViewer(me, game))
  const { context: lateJoinContext, loading: lateJoinContextLoading } = useLateJoinContext(
    gameCode,
    game,
    screen === 'late_join_choice',
    calledNumbers.length
  )
  const { context: viewerPromoteContext } = useLateJoinContext(
    gameCode,
    game,
    isViewer && screen === 'active',
    calledNumbers.length
  )

  useBingoAutoCall({
    gameCode,
    game,
    enabled: screen === 'active',
    onSynced: load,
  })

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
            ...(game?.status === 'active' ? { joinAsViewer: opts?.joinAsViewer } : {}),
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

  const markCell = async (index: number) => {
    if (!myPlayerId || marking) return
    setMarking(true)
    try {
      const res = await fetch('/api/bingo/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId, cellIndex: index }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to mark')
      if (card) {
        setCard({ ...card, marked_indices: data.marked_indices })
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to mark')
    } finally {
      setMarking(false)
    }
  }

  const claimBingo = async () => {
    if (!myPlayerId || claiming) return
    setClaiming(true)
    try {
      const res = await fetch('/api/bingo/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Not a valid bingo')
      if (data.claim) setWinner(data.claim)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Invalid bingo')
    } finally {
      setClaiming(false)
    }
  }

  const handlePlayerLeft = () => {
    clearPlayerSession(gameCode)
    setMyPlayerId(null)
    setMyPlayerName('')
    setJoinName('')
    setScreen('join')
  }

  const cfg = gameTypeConfig('bingo')
  const called = calledNumbers.map((row) => row.number)
  const lastCalled = called.length > 0 ? called[called.length - 1] : null
  const canClaim =
    !isViewer && card != null && hasBingoWin(card.cells, card.marked_indices, 'line') && game?.status === 'active'
  const winnerPlayer = winner ? players.find((p) => p.id === winner.player_id) : null
  const iWon = winner != null && myPlayerId != null && winner.player_id === myPlayerId

  useBingoStartNotification({
    game,
    enabled: screen === 'waiting' || screen === 'active',
  })

  useBingoWinNotification({
    winner,
    winnerName: winnerPlayer?.name ?? null,
    myPlayerId,
    enabled: screen === 'active' || screen === 'finished',
  })

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  if (screen === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-xl font-bold">Game not found</p>
        <button type="button" onClick={() => router.push('/')} className="btn-secondary">
          Go home
        </button>
      </div>
    )
  }

  if (screen === 'game_started_waiting') {
    return <GameStartedWaiting gameCode={gameCode} game={game} onLobbyOpen={openLobbyJoin} />
  }

  if (screen === 'game_ended') {
    return <GameEndedScreen game={game} />
  }

  if (screen === 'late_join_choice' && game) {
    return (
      <LateJoinChoice
        gameCode={gameCode}
        game={game}
        context={lateJoinContext}
        contextLoading={lateJoinContextLoading}
        playersAllowed={game ? allowLatePlayers(game) : false}
        showNameField
        nameInput={joinName}
        onNameChange={setJoinName}
        joining={joining}
        onJoinAsViewer={() => void joinGame({ joinAsViewer: true })}
        onJoinAsPlayer={() => void joinGame({ joinAsViewer: false })}
      />
    )
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
        header={<GameJoinHeader emoji={cfg.headerEmoji} title={game?.title} gameType="bingo" />}
      >
        <NameJoinForm
          value={joinName}
          onChange={setJoinName}
          onSubmit={() => void joinGame()}
          joining={joining}
          submitLabel="Join Bingo"
          hint={
            <>
              You&apos;ll get a random card when the host starts. Called numbers turn{' '}
              <strong className="text-blue-400">blue</strong> on your card — tap them to mark{' '}
              <strong className="text-emerald-400">green</strong>.
            </>
          }
          footer={
            <>
              <BingoCardLegend />
              <p className="text-center pt-1">
                <GameRulesLink gameType="bingo" variant="subtle" />
              </p>
            </>
          }
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'waiting') {
    const me = players.find((p) => p.id === myPlayerId)
    return (
      <GameJoinLobbyShell gameCode={gameCode}>
        <GameLobbyWaitingPanel
          gameCode={gameCode}
          gameType={game?.game_type}
          players={players}
          myPlayerId={myPlayerId}
          myPlayerName={myPlayerName}
          onRenamed={(name) => setMyPlayerName(name)}
          onLeft={handlePlayerLeft}
          title={`You're in, ${myPlayerName}!`}
          description={
            <>
              Waiting for the host to start. You&apos;ll get a random bingo card automatically — you don&apos;t pick the
              numbers on your card.
            </>
          }
          rulesLink={<GameRulesLink gameType="bingo" variant="subtle" />}
          activity={<BingoCardLegend />}
          isSpectator={me?.spectator === true}
          onReady={async () => {
            if (!myPlayerId) return
            await fetch('/api/players/ready', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: gameCode, playerId: myPlayerId }),
            })
            await load()
          }}
        />
      </GameJoinLobbyShell>
    )
  }

  if (screen === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-4">
          {winnerPlayer && game ? (
            <BingoFinalResultsShareBlock
              game={game}
              players={players}
              winnerName={iWon ? myPlayerName : winnerPlayer.name}
            />
          ) : (
            <>
              <div className="glass-card p-6 text-center space-y-3">
                <p className="text-4xl">🏁</p>
                <h2 className="text-xl font-black">Round over</h2>
                <p className="text-muted text-sm">Thanks for playing! The host can start a new round.</p>
              </div>
              <CreateNewGameButton />
            </>
          )}
          {card && (
            <div className="glass-card p-4">
              <BingoCardGrid
                cells={card.cells}
                markedIndices={card.marked_indices}
                calledNumbers={called}
                disabled
                showLegend={false}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {isViewer && (
          <ViewerModeBanner
            gameCode={gameCode}
            playerId={myPlayerId}
            game={game}
            player={me}
            playerDetail={viewerPromoteContext?.playerDetail}
            onPromoted={load}
          />
        )}
        <div className="text-center space-y-1">
          <div className="text-3xl">{cfg.headerEmoji}</div>
          <h1 className="text-xl font-black gradient-title">{game?.title}</h1>
        </div>
        {myPlayerId && (
          <PlayerSessionControls
            gameCode={gameCode}
            playerId={myPlayerId}
            currentName={myPlayerName}
            onRenamed={(name) => setMyPlayerName(name)}
            onLeft={handlePlayerLeft}
          />
        )}

        {lastCalled != null && (
          <div className="glass-card p-4 text-center">
            <p className="text-faint text-xs uppercase tracking-wider">Latest call</p>
            <p className="text-2xl font-black text-blue-300">{formatBingoNumber(lastCalled)}</p>
          </div>
        )}

        {card ? (
          <div className="glass-card p-4 space-y-3">
            <p className="text-faint text-xs text-center leading-relaxed">
              {called.length === 0
                ? 'Your card is ready. Wait for the host to call — matching squares turn blue; tap blue to mark green.'
                : 'Tap blue squares to mark green. Complete a row, column, or diagonal, then tap BINGO!'}
            </p>
            <BingoCardGrid
              cells={card.cells}
              markedIndices={card.marked_indices}
              calledNumbers={called}
              onMark={markCell}
              disabled={marking}
            />
          </div>
        ) : isViewer ? (
          <div className="glass-card p-4">
            <CalledNumbersBoard calledNumbers={called} />
          </div>
        ) : (
          <div className="glass-card p-6 text-center space-y-2">
            <p className="text-muted text-sm">Dealing your card…</p>
            <p className="text-faint text-xs">If this stays empty, ask the host to start the game.</p>
          </div>
        )}

        {canClaim && (
          <button
            type="button"
            onClick={claimBingo}
            disabled={claiming}
            className="btn-primary w-full text-lg font-black"
          >
            {claiming ? 'Claiming…' : 'BINGO! 🎉'}
          </button>
        )}

        <details className="glass-card p-4">
          <summary className="cursor-pointer text-sm font-medium text-muted">Called numbers board</summary>
          <div className="mt-4">
            <CalledNumbersBoard calledNumbers={called} />
          </div>
        </details>
      </div>
    </div>
  )
}
