'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { MatchingPairsPlayerView } from '@/components/matching-pairs/MatchingPairsPlayerView'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { HostGameHeader } from '@/components/host/HostGameHeader'
import { HostGameLayout } from '@/components/host/HostGameLayout'
import { HostManageSection } from '@/components/host/HostManageSection'
import { HostModeSelector } from '@/components/host/HostModeSelector'
import { HostLobbyWaitingFooter } from '@/components/host-lobby/HostLobbyWaitingFooter'
import { HostMatchingPairsLobbyPanel } from '@/components/host-lobby/HostMatchingPairsLobbyPanel'
import { HostLateJoinSettingsCard } from '@/components/HostLateJoinSettingsCard'
import { HostEndGameButton } from '@/components/ui/HostEndGameButton'
import { ExitIcon } from '@/components/host/host-icons'
import {
  parseMatchingPairsMetadata,
  tallyMatchingPairsScore,
  formatMatchingPairsGridSize,
  type MatchingPairsSubmission,
  type MatchingPairsProgress,
  type MatchingPairsPlayerScore,
} from '@/lib/memory-match'
import {
  GAME_SELECT,
  PLAYER_SELECT,
  ROUND_SELECT,
  MEMORY_MATCH_SUBMISSION_SELECT,
  MEMORY_MATCH_PROGRESS_SELECT,
} from '@/lib/supabase-selects'
import { clearPlayerSession, getPlayerSession, setPlayerSession } from '@/lib/utils'
import type { Game, Player } from '@/types'
import { useGameRosterPoll } from '@/hooks/useGameRosterPoll'
import { useHostAutoReady } from '@/hooks/useHostAutoReady'
import { useHostPlayerReconciliation } from '@/hooks/useHostPlayerReconciliation'
import { useHostRemovePlayer } from '@/hooks/useHostRemovePlayer'
import { useTurnNotifications } from '@/hooks/useTurnNotifications'
import { useToast } from '@/components/ui/Toast'

type HostMode = 'spectator' | 'player'
type HostTab = 'manage' | 'play'

const HOST_MODE_KEY = (code: string) => `matching_pairs_host_mode_${code.toUpperCase()}`

function getHostMode(gameCode: string): HostMode {
  if (typeof window === 'undefined') return 'spectator'
  return (localStorage.getItem(HOST_MODE_KEY(gameCode)) as HostMode) ?? 'spectator'
}
function setHostMode(gameCode: string, mode: HostMode) {
  localStorage.setItem(HOST_MODE_KEY(gameCode), mode)
}

export function MatchingPairsHostView({ gameCode, hostToken }: { gameCode: string; hostToken: string }) {
  const { error: toastError } = useToast()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [roundId, setRoundId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<MatchingPairsSubmission[]>([])
  const [progressRows, setProgressRows] = useState<MatchingPairsProgress[]>([])
  const [gridSizePairs, setGridSizePairs] = useState<8 | 16>(8)
  const [starting, setStarting] = useState(false)
  const [playingAgain, setPlayingAgain] = useState(false)

  const [hostModeState, setHostModeState] = useState<HostMode>('spectator')
  const [hostPlayerId, setHostPlayerId] = useState<string | null>(null)
  const [hostPlayerName, setHostPlayerName] = useState('')
  const [hostJoinName, setHostJoinName] = useState('')
  const [hostJoining, setHostJoining] = useState(false)
  const [tab, setTab] = useState<HostTab>('manage')

  useTurnNotifications({ status: game?.status })

  const load = useCallback(async () => {
    const [{ data: gameData }, { data: playersData }] = await Promise.all([
      supabase.from('games').select(GAME_SELECT).eq('id', gameCode).maybeSingle(),
      supabase.from('players').select(PLAYER_SELECT).eq('game_id', gameCode).order('joined_at'),
    ])
    if (!gameData) return
    setGame(gameData as Game)
    setPlayers((playersData ?? []) as Player[])

    if (gameData.status === 'active' || gameData.status === 'finished') {
      const { data: roundData } = await supabase
        .from('rounds')
        .select(ROUND_SELECT)
        .eq('game_id', gameCode)
        .eq('round_number', 1)
        .maybeSingle()
      if (roundData) {
        setRoundId(roundData.id)
        const meta = parseMatchingPairsMetadata(roundData.memory_match_metadata)
        if (meta) setGridSizePairs(meta.gridSizePairs)

        const [{ data: subData }, { data: progData }] = await Promise.all([
          supabase.from('memory_match_submissions').select(MEMORY_MATCH_SUBMISSION_SELECT).eq('round_id', roundData.id),
          supabase.from('memory_match_progress').select(MEMORY_MATCH_PROGRESS_SELECT).eq('round_id', roundData.id),
        ])
        setSubmissions((subData ?? []) as MatchingPairsSubmission[])
        setProgressRows((progData ?? []) as MatchingPairsProgress[])
      }
    }
  }, [gameCode])

  useEffect(() => {
    void load()
    setHostModeState(getHostMode(gameCode))
    const stored = getPlayerSession(gameCode)
    if (stored) {
      setHostPlayerId(stored.playerId)
      setHostPlayerName(stored.playerName)
    }
  }, [gameCode, load])

  useEffect(() => {
    if (game?.status === 'active') setTab('play')
    else if (game?.status === 'finished') setTab('manage')
  }, [game?.status])

  // Realtime: subscribe to progress changes for live opponent view.
  useEffect(() => {
    if (!roundId) return
    const channel = supabase
      .channel(`mp_host_progress_${roundId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_match_progress', filter: `round_id=eq.${roundId}` },
        () => {
          void load()
        }
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roundId, load])

  useGameRosterPoll(gameCode, game?.status, { setGame, setPlayers, reload: load })
  useHostAutoReady(gameCode, game?.status, hostPlayerId, players, load)

  const handleSelfRemoved = useCallback(() => {
    clearPlayerSession(gameCode)
    setHostPlayerId(null)
    setHostPlayerName('')
  }, [gameCode])

  const handlePlayerRemoved = useCallback(
    (playerId: string) => {
      if (playerId === hostPlayerId) {
        clearPlayerSession(gameCode)
        setHostPlayerId(null)
        setHostPlayerName('')
      }
      setPlayers((prev) => prev.filter((p) => p.id !== playerId))
    },
    [gameCode, hostPlayerId]
  )
  const { removePlayer, removingPlayerId } = useHostRemovePlayer(gameCode, hostToken, handlePlayerRemoved)
  useHostPlayerReconciliation(players, hostPlayerId, () => handlePlayerRemoved(hostPlayerId!))

  const changeHostMode = (mode: HostMode) => {
    if (game?.status !== 'waiting') return
    setHostModeState(mode)
    setHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
  }

  const handleJoinAsPlayer = useCallback(async () => {
    if (!hostJoinName.trim()) return
    setHostJoining(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', name: hostJoinName.trim(), hostToken }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to join')
        return
      }
      if (data.player) {
        setPlayerSession(gameCode, data.player.id, data.player.name, 'both', data.player.resume_token)
        setHostPlayerId(data.player.id)
        setHostPlayerName(data.player.name)
        await load()
      }
    } finally {
      setHostJoining(false)
    }
  }, [gameCode, hostJoinName, hostToken, toastError, load])

  const handleStartGame = useCallback(async () => {
    setStarting(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, hostToken }),
      })
      if (!res.ok) {
        const d = await res.json()
        toastError(d.error ?? 'Failed to start game')
      } else {
        await load()
        if (hostModeState === 'player' && hostPlayerId) setTab('play')
      }
    } finally {
      setStarting(false)
    }
  }, [gameCode, hostToken, load, toastError, hostModeState, hostPlayerId])

  async function handlePlayAgain() {
    if (playingAgain) return
    setPlayingAgain(true)
    await fetch(`/api/games/${gameCode}/play-again`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined }),
    })
    clearPlayerSession(gameCode)
    setHostPlayerId(null)
    setHostPlayerName('')
    setHostJoinName('')
    setTab('manage')
    setPlayingAgain(false)
  }

  // Compute per-player leaderboard from submissions + progress.
  const leaderboard = useMemo<MatchingPairsPlayerScore[]>(() => {
    if (!progressRows.length) return []
    return progressRows
      .map((prog) => {
        const playerSubs = submissions.filter((s) => s.player_id === prog.player_id)
        return tallyMatchingPairsScore(playerSubs, prog, gridSizePairs)
      })
      .sort((a, b) => {
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore
        if (a.wrongAttempts !== b.wrongAttempts) return a.wrongAttempts - b.wrongAttempts
        return (a.timeTakenMs ?? Infinity) - (b.timeTakenMs ?? Infinity)
      })
  }, [submissions, progressRows, gridSizePairs])

  const playerMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of players) m.set(p.id, p.name)
    return m
  }, [players])

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted">Loading…</p>
      </div>
    )
  }

  const activePlayers = players.filter((p) => !p.spectator)
  const hostPlays = hostModeState === 'player' && !!hostPlayerId
  const showTabs = game.status !== 'finished'
  const gameStarted = game.status === 'active'
  const primaryKind: 'play' | 'watch' = hostPlays ? 'play' : 'watch'

  const interactivePlay = <MatchingPairsPlayerView gameCode={gameCode} />

  const watchBoard = (
    <section style={{ padding: '0 0 16px' }}>
      <p style={{ color: 'var(--text-faint)', fontSize: 13, marginBottom: 8 }}>
        Live progress — {formatMatchingPairsGridSize(gridSizePairs)}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {progressRows
          .sort((a, b) => b.pairs_matched - a.pairs_matched)
          .map((prog) => {
            const name = playerMap.get(prog.player_id) ?? 'Unknown'
            const pct = Math.round((prog.pairs_matched / gridSizePairs) * 100)
            return (
              <div
                key={prog.player_id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'var(--surface)',
                  borderRadius: 10,
                  padding: '8px 12px',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14, minWidth: 120 }}>{name}</span>
                <div
                  style={{
                    flex: 1,
                    height: 6,
                    background: 'var(--border-strong)',
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: prog.finished ? '#22c55e' : '#f59e0b',
                      borderRadius: 99,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', minWidth: 60, textAlign: 'right' }}>
                  {prog.finished ? '✓ Done' : `${prog.pairs_matched}/${gridSizePairs}`}
                </span>
              </div>
            )
          })}
      </div>
    </section>
  )

  const manage = (
    <HostManageSection
      game={game}
      players={players}
      highlightPlayerId={hostPlayerId}
      removingPlayerId={removingPlayerId}
      onRemovePlayer={removePlayer}
      gameType="matching_pairs"
      top={
        game.status === 'waiting' ? (
          <HostModeSelector
            mode={hostModeState}
            onChange={changeHostMode}
            joinedPlayerId={hostPlayerId}
            joinedPlayerName={hostPlayerName}
            joinName={hostJoinName}
            onJoinNameChange={setHostJoinName}
            onJoin={() => void handleJoinAsPlayer()}
            joining={hostJoining}
          />
        ) : undefined
      }
      settings={
        game.status === 'waiting' ? (
          <HostMatchingPairsLobbyPanel
            gameCode={gameCode}
            hostToken={hostToken}
            game={game}
            playerCount={activePlayers.length}
            onGameUpdate={setGame}
          />
        ) : (
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        )
      }
      footer={
        game.status === 'waiting' ? (
          <HostLobbyWaitingFooter
            gameCode={gameCode}
            hostToken={hostToken}
            onStart={() => void handleStartGame()}
            onEnded={load}
            canStart={activePlayers.length >= 1}
            starting={starting}
            startLabel="Start game"
            startDisabledHint={activePlayers.length >= 1 ? null : 'Need at least 1 player to start'}
          />
        ) : game.status === 'active' ? (
          <HostEndGameButton
            gameCode={gameCode}
            hostToken={hostToken}
            onEnded={load}
            label="End game"
            icon={<ExitIcon size={16} />}
          />
        ) : null
      }
    />
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
      primary={hostPlays ? interactivePlay : watchBoard}
      manage={manage}
      finished={
        <PaginatedLeaderboard
          title="Final leaderboard"
          rows={leaderboard.map((s, i) => ({
            id: s.playerId,
            rank: i + 1,
            name: playerMap.get(s.playerId) ?? 'Unknown',
            score: s.finalScore,
          }))}
          scoreLabel={(n) => `${n} pts`}
        />
      }
    />
  )
}
