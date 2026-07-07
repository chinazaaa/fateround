'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { MatchingPairsPlayerView } from '@/components/matching-pairs/MatchingPairsPlayerView'
import { MatchingPairsStatDetails } from '@/components/matching-pairs/MatchingPairsStatDetails'
import { PaginatedLeaderboard } from '@/components/PaginatedLeaderboard'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
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
  MATCHING_PAIRS_MIN_PLAYERS,
  type MatchingPairsSubmission,
  type MatchingPairsProgress,
  type MatchingPairsPlayerScore,
} from '@/lib/memory-match'
import { FinishedWinnerHero } from '@/components/FinishedWinner'
import { ReplayReadyRing } from '@/components/ReplayReadyRing'
import { useConfirm } from '@/components/ui/ConfirmDialog'
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
  const { confirm } = useConfirm()
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
  // Bug #4 fix: apply optimistic local update before calling load() so the host
  // sees the correct count even when load() races ahead of the DB write.
  useEffect(() => {
    if (!roundId) return
    const channel = supabase
      .channel(`mp_host_progress_${roundId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_match_progress', filter: `round_id=eq.${roundId}` },
        (payload) => {
          // Optimistic local update so the host's progress bar reacts instantly.
          const updated = payload.new as import('@/lib/memory-match').MatchingPairsProgress
          setProgressRows((prev) => {
            const idx = prev.findIndex((p) => p.player_id === updated.player_id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = updated
              return next
            }
            return [...prev, updated]
          })
          // Then reconcile from the DB to pick up finish_rank / finished_at / etc.
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
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameCode, playerName: hostJoinName.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toastError(data.error ?? 'Failed to join')
        return
      }
      setPlayerSession(gameCode, data.playerId, data.playerName, 'both', data.resumeToken)
      setHostPlayerId(data.playerId)
      setHostPlayerName(data.playerName)
      await load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to join')
    } finally {
      setHostJoining(false)
    }
  }, [gameCode, hostJoinName, toastError, load])

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

  // "Play again · same settings" reopens the game into the ready-up ring; a plain
  // "Return to lobby" reset also drops the host's seat so they can re-pick play/host-only.
  async function resetGame(sameSettings: boolean) {
    if (playingAgain) return
    setPlayingAgain(true)
    try {
      const res = await fetch(`/api/games/${gameCode}/play-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostToken, hostPlayerId: hostPlayerId ?? undefined, same_settings: sameSettings }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toastError(d.error || 'Failed to reset')
        return
      }
      if (!sameSettings) {
        clearPlayerSession(gameCode)
        setHostPlayerId(null)
        setHostPlayerName('')
        setHostJoinName('')
      }
      setTab('manage')
      await load()
    } finally {
      setPlayingAgain(false)
    }
  }

  const confirmPlayAgain = async () => {
    const ok = await confirm({
      title: 'Play again — same settings?',
      message:
        'Reopens the game with the same settings. Previous watchers and new people can join; everyone taps “ready” and you start the next game once enough players are in.',
      confirmLabel: 'Play again',
    })
    if (ok) void resetGame(true)
  }

  const confirmReturnToLobby = async () => {
    const ok = await confirm({
      title: 'Return to lobby?',
      message:
        'Sends everyone back to the game lobby where you can tweak settings or let new people join before starting again.',
      confirmLabel: 'Return to lobby',
    })
    if (ok) void resetGame(false)
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
        // Bug #5 fix: sort by finish_rank FIRST (the authoritative server-assigned
        // order) so the first finisher always ranks #1 regardless of score ties.
        // finish_rank 999 = didn't finish (used in tallyMatchingPairsScore).
        const rankA = a.placement ?? 999
        const rankB = b.placement ?? 999
        if (rankA !== rankB) return rankA - rankB
        // Among players with the same rank (e.g. non-finishers), fall back to score.
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

  const hostWonMp =
    leaderboard.length > 1 && leaderboard[0]?.playerId === hostPlayerId && leaderboard[0]?.finalScore > 0

  const winnerId = leaderboard[0]?.playerId
  const isHostWinner = !!winnerId && winnerId === hostPlayerId
  const winnerName = isHostWinner ? hostPlayerName : winnerId ? (playerMap.get(winnerId) ?? winnerId) : 'Someone'

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

  // "Play again · same settings" reopened the game as an open lobby flagged for the
  // ready-up ring — the host sees the ring + a "Start game" button instead of the lobby.
  if (game.status === 'waiting' && game.replay_pending) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-3 py-8 text-[var(--foreground)]">
        <ReplayReadyRing
          players={players}
          meId={hostPlayerId}
          isHost
          minPlayers={MATCHING_PAIRS_MIN_PLAYERS}
          onToggleReady={() => {}}
          onStart={() => void handleStartGame()}
          starting={starting}
        />
        <button
          type="button"
          onClick={() => void confirmReturnToLobby()}
          disabled={playingAgain}
          className="mt-1 py-2 text-sm font-medium text-muted transition-colors hover:text-body disabled:opacity-60"
        >
          Return to lobby instead
        </button>
      </div>
    )
  }

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
        <>
          <FinishedWinnerHero
            winnerName={winnerName}
            game={game}
            headline={
              hostWonMp ? (
                <>
                  <span className="gradient-title">You</span> won!
                </>
              ) : undefined
            }
            stats={[
              {
                value: (leaderboard[0]?.finalScore ?? 0).toLocaleString(),
                label: 'Points total',
              },
            ]}
          />
          <PaginatedLeaderboard
            title="Final leaderboard"
            rows={leaderboard.map((s, i) => ({
              id: s.playerId,
              rank: i + 1,
              name: playerMap.get(s.playerId) ?? 'Unknown',
              score: s.finalScore,
              correctCount: s.pairsMatched,
              expandDetails: <MatchingPairsStatDetails score={s} gridSizePairs={gridSizePairs} />,
            }))}
            totalQuestions={gridSizePairs}
            scoreLabel={(n) => `${n} pts`}
            emphasizeLeader
          />
          <button
            type="button"
            onClick={() => void confirmPlayAgain()}
            disabled={playingAgain}
            className="btn-secondary w-full py-3 text-base font-bold disabled:opacity-60"
          >
            {playingAgain ? 'Starting…' : '↻ Play again · same settings'}
          </button>
          <button
            type="button"
            onClick={() => void confirmReturnToLobby()}
            disabled={playingAgain}
            className="w-full py-2.5 text-sm font-semibold text-muted transition-colors hover:text-body disabled:opacity-60"
          >
            Return to lobby
          </button>
          <p className="text-center text-xs text-faint leading-relaxed px-2">
            Same settings reopens the game for ready-up — watchers and new people can join · lobby lets you tweak
            settings first.
          </p>
          {hostWonMp && (
            <PostWinToCommunity
              gameType="matching_pairs"
              gameCode={gameCode}
              winnerName={hostPlayerName}
              roundKey={game?.session_started_at ?? undefined}
            />
          )}
        </>
      }
    />
  )
}
