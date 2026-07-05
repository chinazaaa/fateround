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
  }, [load])

  // Realtime: subscribe to progress changes for live opponent view.
  useEffect(() => {
    if (!roundId) return
    const channel = supabase
      .channel(`mp_host_progress_${roundId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_match_progress', filter: `round_id=eq.${roundId}` }, () => {
        void load()
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [roundId, load])

  useGameRosterPoll({
    gameCode,
    onRosterChange: (newPlayers) => setPlayers(newPlayers as Player[]),
  })

  useHostAutoReady({ gameCode, hostToken, game })
  useHostPlayerReconciliation({ gameCode, hostToken, game, players })
  const { removePlayer } = useHostRemovePlayer({ gameCode, hostToken })

  // Host-as-player join/leave.
  useEffect(() => {
    if (typeof window === 'undefined') return
    setHostModeState(getHostMode(gameCode))
    const session = getPlayerSession(gameCode)
    if (session) {
      setHostPlayerId(session.playerId)
      setHostPlayerName(session.name ?? '')
    }
  }, [gameCode])

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
      if (!res.ok) { toastError(data.error ?? 'Failed to join'); return }
      if (data.player) {
        setPlayerSession(gameCode, { playerId: data.player.id, name: data.player.name, resumeToken: data.player.resume_token })
        setHostPlayerId(data.player.id)
        setHostPlayerName(data.player.name)
        setHostModeState('player')
        setHostMode(gameCode, 'player')
        setTab('play')
      }
    } finally {
      setHostJoining(false)
    }
  }, [gameCode, hostJoinName, hostToken, toastError])

  const handleLeaveAsPlayer = useCallback(() => {
    clearPlayerSession(gameCode)
    setHostPlayerId(null)
    setHostPlayerName('')
    setHostModeState('spectator')
    setHostMode(gameCode, 'spectator')
    setTab('manage')
  }, [gameCode])

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
      }
    } finally {
      setStarting(false)
    }
  }, [gameCode, hostToken, load, toastError])

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

  if (!game) return null

  const isWaiting = game.status === 'waiting'
  const isActive = game.status === 'active'
  const isFinished = game.status === 'finished'

  return (
    <HostGameLayout
      header={
        <HostGameHeader
          gameCode={gameCode}
          hostToken={hostToken}
          game={game}
          players={players}
          onGameUpdate={setGame}
        />
      }
    >
      {isWaiting && (
        <>
          <HostModeSelector
            modes={[
              { value: 'manage', label: 'Manage' },
              ...(hostPlayerId ? [{ value: 'play' as HostTab, label: 'Play' }] : []),
            ]}
            active={tab}
            onChange={(v) => setTab(v as HostTab)}
          />

          {tab === 'manage' && (
            <HostManageSection
              gameCode={gameCode}
              hostToken={hostToken}
              game={game}
              players={players}
              onGameUpdate={setGame}
              onRemovePlayer={removePlayer}
              onStartGame={handleStartGame}
              starting={starting}
              minPlayers={1}
              settingsPanel={
                <HostMatchingPairsLobbyPanel
                  gameCode={gameCode}
                  hostToken={hostToken}
                  game={game}
                  playerCount={players.filter((p) => !p.spectator).length}
                  onGameUpdate={setGame}
                />
              }
              joinAsPlayerSection={
                !hostPlayerId ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                    <input
                      type="text"
                      value={hostJoinName}
                      onChange={(e) => setHostJoinName(e.target.value)}
                      placeholder="Your name to play…"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border-strong)', background: 'var(--surface)', color: 'var(--text)' }}
                    />
                    <button
                      onClick={handleJoinAsPlayer}
                      disabled={hostJoining || !hostJoinName.trim()}
                      className="fr-btn fr-btn--sm"
                    >
                      {hostJoining ? 'Joining…' : 'Join & play'}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                    <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>Playing as <strong>{hostPlayerName}</strong></span>
                    <button onClick={handleLeaveAsPlayer} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-faint)', cursor: 'pointer' }}>Leave</button>
                  </div>
                )
              }
            />
          )}

          {tab === 'play' && hostPlayerId && (
            <MatchingPairsPlayerView gameCode={gameCode} />
          )}

          <HostLobbyWaitingFooter game={game} players={players} />
          <HostLateJoinSettingsCard gameCode={gameCode} hostToken={hostToken} game={game} onGameUpdate={setGame} />
        </>
      )}

      {(isActive || isFinished) && (
        <>
          {isActive && (
            <>
              {/* Live progress table */}
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
                        <div key={prog.player_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', borderRadius: 10, padding: '8px 12px' }}>
                          <span style={{ fontWeight: 600, fontSize: 14, minWidth: 120 }}>{name}</span>
                          <div style={{ flex: 1, height: 6, background: 'var(--border-strong)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${pct}%`, background: prog.finished ? '#22c55e' : '#f59e0b', borderRadius: 99, transition: 'width 0.4s ease' }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-faint)', minWidth: 60, textAlign: 'right' }}>
                            {prog.finished ? '✓ Done' : `${prog.pairs_matched}/${gridSizePairs}`}
                          </span>
                        </div>
                      )
                    })}
                </div>
              </section>

              {hostModeState === 'player' && hostPlayerId && (
                <MatchingPairsPlayerView gameCode={gameCode} />
              )}

              <HostEndGameButton gameCode={gameCode} hostToken={hostToken} onFinished={load} icon={<ExitIcon />} />
            </>
          )}

          {isFinished && (
            <PaginatedLeaderboard
              rows={leaderboard.map((s, i) => ({
                rank: i + 1,
                name: playerMap.get(s.playerId) ?? 'Unknown',
                score: s.finalScore,
                detail: [
                  `${s.pairsMatched} pairs`,
                  `+${s.streakBonusTotal} streak`,
                  s.perfectGame ? '⭐ Perfect' : `${s.wrongAttempts} miss${s.wrongAttempts === 1 ? '' : 'es'}`,
                ].join(' · '),
              }))}
              playAgain={playingAgain}
              onPlayAgain={() => setPlayingAgain(true)}
              gameCode={gameCode}
              hostToken={hostToken}
            />
          )}
        </>
      )}
    </HostGameLayout>
  )
}
