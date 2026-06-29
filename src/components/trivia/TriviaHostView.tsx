'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TriviaActiveRound } from '@/components/trivia/TriviaActiveRound'
import { TriviaHostManagePanel } from '@/components/trivia/TriviaHostManagePanel'
import { TriviaPlayAgainSetup, type TriviaSettingsPayload } from '@/components/trivia/TriviaPlayAgainSetup'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostRulesRow } from '@/components/host/HostRulesRow'
import { gameTypeConfig } from '@/lib/game-types'
import { getTriviaHostMode, setTriviaHostMode, type TriviaHostMode } from '@/lib/trivia'
import { useTriviaHostRoundAutomation } from '@/hooks/useTriviaHostRoundAutomation'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { supabase } from '@/lib/supabase'
import { GAME_SELECT, PLAYER_SELECT, ROUND_SELECT, TRIVIA_ANSWER_SELECT } from '@/lib/supabase-selects'
import { appOrigin } from '@/lib/site'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player, Round, TriviaAnswer } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { POLL_INTERVALS, supabasePollOk, usePolling } from '@/hooks/usePolling'
import { useGameTableSync } from '@/hooks/useGameTableSync'
import { useScrollHostViewToTop } from '@/hooks/useScrollHostViewToTop'

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
  const [hostResumeToken, setHostResumeToken] = useState<string | null>(null)
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
      setHostResumeToken(session.resumeToken ?? null)
      setHostPlayerName(session.playerName)
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

  // Realtime push: reload on any change to this game's row + its tables.
  useGameTableSync(gameCode, [{ table: 'games', column: 'id' }, 'players', 'rounds', 'trivia_answers'], load)

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
      setHostResumeToken(data.resumeToken ?? null)
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

  // Land on the primary (Play/Watch) tab when the game starts, and on Manage when it ends.
  useEffect(() => {
    if (game?.status === 'finished') setTab('manage')
    else if (game?.status === 'active') setTab('play')
  }, [game?.status])

  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const panelProps = {
    game,
    gameCode,
    hostToken,
    playerLink,
    players,
    rounds,
    answers,
    starting,
    advancing,
    playingAgain,
    onStartGame: startGame,
    onEndRound: endRound,
    onPlayAgain: () => setSettingsModal('play-again'),
    onEditSettings: () => setSettingsModal('lobby'),
    onReload: load,
    onGameUpdate: setGame,
    onRemovePlayer: removePlayer,
    removingPlayerId,
    highlightPlayerId: hostPlayerId,
    activeRound: roundAutomation.activeRound,
    betweenRounds: roundAutomation.betweenRounds,
    lastFinishedRound: roundAutomation.lastFinishedRound,
    roundAnswers: roundAutomation.roundAnswers,
    allAnswered: roundAutomation.allAnswered,
    isLastRound: roundAutomation.isLastRound,
  }

  // Primary tab: interactive round for a host-player, read-only gameplay for a host-only host.
  const interactivePlay = hostPlayerId && (
    <TriviaActiveRound
      gameCode={gameCode}
      game={game}
      players={players}
      rounds={rounds}
      answers={answers}
      myPlayerId={hostPlayerId}
      myResumeToken={hostResumeToken}
      playerName={hostPlayerName}
      onReload={load}
      skipGameSync
    />
  )
  const watchRound = <TriviaHostManagePanel {...panelProps} section="watch" />

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
              Playing as <strong className="text-body">{hostPlayerName}</strong> — answer from the Play tab once you
              start.
            </p>
          }
        />
      )}
      {game.status !== 'finished' && <HostRulesRow gameType="trivia" />}
      <TriviaHostManagePanel {...panelProps} section="manage" />
    </div>
  )

  return (
    <>
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
        finished={<TriviaHostManagePanel {...panelProps} section="finished" />}
      />

      <TriviaPlayAgainSetup
        open={settingsModal !== null}
        onClose={() => setSettingsModal(null)}
        game={game}
        variant={settingsModal === 'lobby' ? 'lobby' : 'play-again'}
        loading={settingsModal === 'lobby' ? savingLobbySettings : playingAgain}
        onConfirm={settingsModal === 'lobby' ? saveLobbySettings : playAgain}
      />
    </>
  )
}
