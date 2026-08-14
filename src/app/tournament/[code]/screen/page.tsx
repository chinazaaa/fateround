'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { GameLinkQrCode } from '@/components/GameLinkQrCode'
import { TournamentBrandingWrapper } from '@/components/tournament/BrandingWrapper'
import { useTournamentRealtime } from '@/hooks/useTournamentRealtime'
import { gameTypeLabel } from '@/lib/game-types'
import { estimateGameSeconds, formatEstimatedDuration, TIMING_PLAYER_FALLBACK } from '@/lib/tournament-timing'
import { formatCountdown, formatScheduledFor } from '@/lib/tournament-schedule'
import { shareOrigin, tournamentInviteUrl } from '@/lib/site'
import type { Tournament, TournamentGame, TournamentPlayer } from '@/types/tournament'

/**
 * Projector / TV view for a tournament. Full-viewport, dark, no host chrome,
 * font sizes cranked so it reads across a room. Adapts to tournament state:
 *
 *   waiting  → giant QR + joined-player grid + lineup preview
 *   active   → live leaderboard + "Now playing: X" with a smaller QR for
 *              latecomers; players stay on their phones for the game itself
 *   between  → same as active but with the last game's placements highlighted
 *   finished → podium 🥇🥈🥉 + full standings
 *
 * Data comes from the same GET the lobby uses (via useTournamentRealtime for
 * push updates + a slow polling fallback so the screen never goes stale even
 * if a realtime message drops).
 */
export default function TournamentBigScreenPage() {
  const { code } = useParams<{ code: string }>()
  const tournamentId = (Array.isArray(code) ? code[0] : code).toUpperCase()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [players, setPlayers] = useState<TournamentPlayer[]>([])
  const [games, setGames] = useState<TournamentGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`)
      if (!res.ok) {
        setError('Tournament not found')
        return
      }
      const data = await res.json()
      setTournament(data.tournament)
      setPlayers(data.players ?? [])
      setGames(data.games ?? [])
    } catch {
      setError('Failed to load')
    } finally {
      setLoading(false)
    }
  }, [tournamentId])

  useEffect(() => {
    fetchState()
  }, [fetchState])

  useTournamentRealtime(tournamentId, fetchState)

  // Slow polling backstop: realtime covers most transitions but a game
  // starting/finishing writes to `games` (not `tournament_games` directly),
  // which the tournament channel doesn't watch. Every 5s is plenty for a
  // projector view; still cheap.
  useEffect(() => {
    const t = setInterval(fetchState, 5000)
    return () => clearInterval(t)
  }, [fetchState])

  if (loading) {
    return <div className="fixed inset-0 flex items-center justify-center bg-black text-white text-2xl">Loading…</div>
  }
  if (error || !tournament) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-black text-white gap-6 p-8 text-center">
        <p className="text-3xl">{error ?? 'Tournament not found'}</p>
        <Link href="/" className="text-lg underline opacity-70">
          Back to fateround
        </Link>
      </div>
    )
  }

  const isFinished = tournament.status === 'finished'
  const activeGame = games.find((g) => g.status === 'active' && Boolean(g.game_id)) ?? null
  const queueEntries =
    Array.isArray(tournament.game_queue) && tournament.game_queue.length > 0 ? tournament.game_queue : null
  const finishedGames = games.filter((g) => g.status === 'finished' && Boolean(g.game_id))
  const lastFinished = finishedGames[finishedGames.length - 1] ?? null
  const queueIndex = games.length
  const upNext = queueEntries && queueIndex < queueEntries.length ? queueEntries[queueIndex] : null

  // Standings: highest total_points first (matches the leaderboard component's
  // sort). Show up to 8 rows on the leaderboard, top 3 in the podium block.
  const standings = [...players].sort((a, b) => b.total_points - a.total_points)
  const podium = standings.slice(0, 3)

  const inviteUrl = tournamentInviteUrl(tournamentId, shareOrigin())

  return (
    <TournamentBrandingWrapper
      branding={tournament.branding}
      className="fixed inset-0 flex flex-col overflow-hidden bg-black text-white"
    >
      {/* Header — logo + title. Sticks to the top; body below fills. */}
      <header className="flex items-center gap-6 px-10 pt-8">
        {tournament.branding?.logoUrl && (
          <img src={tournament.branding.logoUrl} alt="" className="h-20 w-20 object-contain rounded-xl bg-white p-2" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white/60 text-lg uppercase tracking-widest">Tournament</p>
          <h1
            className="text-6xl lg:text-7xl font-black leading-tight truncate"
            style={{ color: 'var(--primary, #fff)' }}
          >
            {tournament.title}
          </h1>
        </div>
        <div className="text-right shrink-0">
          <p className="text-white/60 text-sm uppercase tracking-widest">Code</p>
          <p className="text-4xl font-mono font-bold tracking-wider">{tournament.id}</p>
        </div>
      </header>

      {/* Body — state-dependent. */}
      <main className="flex-1 flex flex-col justify-center px-10 py-8 min-h-0">
        {isFinished ? (
          <FinishedPodium podium={podium} standings={standings} />
        ) : !activeGame && !finishedGames.length ? (
          <WaitingRoom tournament={tournament} players={players} inviteUrl={inviteUrl} queueEntries={queueEntries} />
        ) : (
          <LivePanel
            tournament={tournament}
            standings={standings}
            activeGame={activeGame}
            lastFinished={lastFinished}
            upNext={upNext}
            queueEntries={queueEntries}
            queueIndex={queueIndex}
            playerCount={players.length}
            inviteUrl={inviteUrl}
          />
        )}
      </main>

      {/* Corner exit — small, doesn't compete with the content. Host will
          typically leave this alone; useful only when they need the phone view
          back on the same device. */}
      <Link
        href={`/tournament/${tournamentId}`}
        className="fixed top-3 right-3 text-white/40 hover:text-white/80 text-xs underline"
      >
        Exit
      </Link>
    </TournamentBrandingWrapper>
  )
}

/** Waiting-for-players view: giant QR + player grid + lineup preview. */
function WaitingRoom({
  tournament,
  players,
  inviteUrl,
  queueEntries,
}: {
  tournament: Tournament
  players: TournamentPlayer[]
  inviteUrl: string
  queueEntries: Tournament['game_queue']
}) {
  return (
    <div className="flex flex-col gap-6 h-full">
      {tournament.scheduled_at && <ScheduledBanner iso={tournament.scheduled_at} />}
      <div className="grid grid-cols-2 gap-10 flex-1 min-h-0">
        {/* Left: join instructions + huge QR */}
        <div className="flex flex-col items-center justify-center gap-6">
          <p className="text-3xl text-white/70">Join with your phone</p>
          <div className="rounded-3xl bg-white p-8 shadow-2xl">
            <GameLinkQrCode url={inviteUrl} size={420} />
          </div>
          <p className="text-2xl text-white/60">
            Or open <span className="text-white font-semibold">fateround.com</span> and enter code{' '}
            <span className="text-white font-mono font-bold">{tournament.id}</span>
          </p>
        </div>

        {/* Right: joined players + optional playlist preview */}
        <div className="flex flex-col gap-6 min-h-0">
          <div className="flex items-baseline justify-between">
            <p className="text-3xl font-bold" style={{ color: 'var(--primary, #fff)' }}>
              Joined
            </p>
            <p className="text-2xl text-white/70">
              {players.length}
              {tournament.max_players ? ` / ${tournament.max_players}` : ''} player{players.length === 1 ? '' : 's'}
            </p>
          </div>
          {players.length === 0 ? (
            <div className="flex items-center justify-center h-40 rounded-2xl border border-white/20 border-dashed">
              <p className="text-2xl text-white/50">Waiting for players…</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 overflow-y-auto pr-2">
              {players.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-white/20 px-4 py-3 text-xl font-medium truncate"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  {p.player_name}
                </div>
              ))}
            </div>
          )}
          {queueEntries && queueEntries.length > 0 && (
            <div className="mt-auto pt-6 border-t border-white/15 space-y-2">
              <p className="text-sm uppercase tracking-widest text-white/50">
                Tonight&apos;s lineup ({queueEntries.length} games)
              </p>
              <ol className="text-lg text-white/85 space-y-1">
                {queueEntries.map((e, i) => (
                  <li key={`${e.gameType}-${i}`} className="flex items-baseline gap-3">
                    <span className="tabular-nums text-white/50 w-6 text-right">{i + 1}.</span>
                    <span>{gameTypeLabel(e.gameType) ?? e.gameType}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Live countdown strip shown when the tournament has a scheduled start.
 *  Re-ticks every second so the "in Nm" phrase stays honest. Formats as a
 *  single horizontal bar so both columns of the WaitingRoom body still fit. */
function ScheduledBanner({ iso }: { iso: string }) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const startsAt = new Date(iso).getTime()
  const deltaMs = startsAt - nowMs
  const started = deltaMs < 0
  return (
    <div
      className="rounded-2xl px-6 py-4 flex items-center gap-6 flex-wrap"
      style={{ background: 'rgba(255,255,255,0.08)', borderLeft: '6px solid var(--primary, #fff)' }}
    >
      <div>
        <p className="text-sm uppercase tracking-widest text-white/60">{started ? 'Scheduled start' : 'Starts'}</p>
        <p className="text-3xl font-bold">{formatScheduledFor(iso)}</p>
      </div>
      <div className="ml-auto text-right">
        <p className="text-sm uppercase tracking-widest text-white/60">Countdown</p>
        <p className="text-4xl font-black tabular-nums" style={{ color: 'var(--primary, #fff)' }}>
          {formatCountdown(deltaMs)}
        </p>
      </div>
    </div>
  )
}

/** In-play / between-games view: live leaderboard + "now playing" chip + small QR for late joiners. */
function LivePanel({
  tournament,
  standings,
  activeGame,
  lastFinished,
  upNext,
  queueEntries,
  queueIndex,
  playerCount,
  inviteUrl,
}: {
  tournament: Tournament
  standings: TournamentPlayer[]
  activeGame: TournamentGame | null
  lastFinished: TournamentGame | null
  upNext: NonNullable<Tournament['game_queue']>[number] | null
  queueEntries: Tournament['game_queue']
  queueIndex: number
  playerCount: number
  inviteUrl: string
}) {
  const nowPlayingLabel = activeGame ? nowPlayingFor(tournament, activeGame, queueEntries, queueIndex) : null
  const between = !activeGame && lastFinished

  return (
    <div className="grid grid-cols-3 gap-10 h-full">
      {/* Left 2/3: leaderboard */}
      <div className="col-span-2 flex flex-col gap-4 min-h-0">
        <div className="flex items-baseline justify-between">
          <p className="text-3xl font-bold" style={{ color: 'var(--primary, #fff)' }}>
            Leaderboard
          </p>
          {tournament.game_queue && (
            <p className="text-lg text-white/60">
              Game {Math.min(queueIndex + (activeGame ? 0 : 0), tournament.game_queue.length)} of{' '}
              {tournament.game_queue.length}
            </p>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-start gap-2 overflow-y-auto pr-2">
          {standings.slice(0, 10).map((p, i) => (
            <LeaderboardRow key={p.id} rank={i + 1} player={p} />
          ))}
          {standings.length === 0 && (
            <div className="flex items-center justify-center h-40 rounded-2xl border border-white/20 border-dashed">
              <p className="text-2xl text-white/50">No scores yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Right 1/3: now-playing card + late-join QR */}
      <div className="col-span-1 flex flex-col gap-6 min-h-0">
        {nowPlayingLabel && (
          <div
            className="rounded-2xl p-6 space-y-2"
            style={{
              background: 'rgba(255,255,255,0.08)',
              borderLeft: '6px solid var(--primary, #fff)',
            }}
          >
            <p className="text-sm uppercase tracking-widest text-white/60">Now playing</p>
            <p className="text-3xl font-bold leading-tight">{nowPlayingLabel}</p>
            <p className="text-white/70 text-sm">Everyone play on your phones — leaderboard updates here.</p>
          </div>
        )}
        {between && upNext && (
          <div
            className="rounded-2xl p-6 space-y-2"
            style={{
              background: 'rgba(255,255,255,0.08)',
              borderLeft: '6px solid var(--primary, #fff)',
            }}
          >
            <p className="text-sm uppercase tracking-widest text-white/60">Up next</p>
            <p className="text-3xl font-bold leading-tight">{gameTypeLabel(upNext.gameType) ?? upNext.gameType}</p>
            <p className="text-white/70 text-sm">
              ≈ {formatEstimatedDuration(estimateGameSeconds(upNext, playerCount || TIMING_PLAYER_FALLBACK))} · host
              taps Start when everyone&apos;s back
            </p>
          </div>
        )}
        <div className="mt-auto flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-white p-3">
            <GameLinkQrCode url={inviteUrl} size={168} />
          </div>
          <p className="text-white/60 text-sm text-center">
            Latecomers can still join · code <span className="text-white font-mono font-bold">{tournament.id}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

/** Finished view: podium + full standings. */
function FinishedPodium({ podium, standings }: { podium: TournamentPlayer[]; standings: TournamentPlayer[] }) {
  if (podium.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-3xl text-white/70">Tournament complete — no scores recorded</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-10 h-full">
      <div className="text-center">
        <p className="text-3xl uppercase tracking-widest text-white/60">Tournament complete</p>
      </div>

      {/* Podium — 2nd / 1st / 3rd (visual arrangement) */}
      <div className="grid grid-cols-3 gap-6 items-end">
        <PodiumBlock place={2} player={podium[1] ?? null} height="h-48" emoji="🥈" />
        <PodiumBlock place={1} player={podium[0] ?? null} height="h-64" emoji="🥇" gradient />
        <PodiumBlock place={3} player={podium[2] ?? null} height="h-40" emoji="🥉" />
      </div>

      {/* Full standings below */}
      {standings.length > 3 && (
        <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2">
          <p className="text-white/60 text-sm uppercase tracking-widest">Full standings</p>
          {standings.slice(3).map((p, i) => (
            <LeaderboardRow key={p.id} rank={i + 4} player={p} />
          ))}
        </div>
      )}
    </div>
  )
}

function PodiumBlock({
  place,
  player,
  height,
  emoji,
  gradient,
}: {
  place: number
  player: TournamentPlayer | null
  height: string
  emoji: string
  gradient?: boolean
}) {
  if (!player) {
    return <div className={`rounded-2xl border border-white/15 ${height}`} />
  }
  return (
    <div
      className={`rounded-2xl ${height} p-6 flex flex-col items-center justify-end text-center gap-2`}
      style={
        gradient
          ? { background: 'linear-gradient(180deg, transparent 0%, var(--primary, #fff) 100%)' }
          : { background: 'rgba(255,255,255,0.08)' }
      }
    >
      <p className="text-5xl">{emoji}</p>
      <p className="text-3xl font-bold truncate max-w-full">{player.player_name}</p>
      <p className="text-white/80 text-2xl font-black tabular-nums">
        {player.total_points} <span className="text-lg font-medium text-white/60">pts</span>
      </p>
      <p className="text-white/50 text-xs uppercase tracking-widest">
        {place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}
      </p>
    </div>
  )
}

function LeaderboardRow({ rank, player }: { rank: number; player: TournamentPlayer }) {
  return (
    <div
      className="rounded-xl px-5 py-3 flex items-center gap-4 text-2xl"
      style={{ background: rank <= 3 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)' }}
    >
      <span className="tabular-nums font-black text-white/60 w-10 text-right">{rank}</span>
      <span className="flex-1 min-w-0 truncate font-semibold">{player.player_name}</span>
      <span className="tabular-nums font-black" style={{ color: 'var(--primary, #fff)' }}>
        {player.total_points}
        <span className="text-base font-medium text-white/60 ml-1">pts</span>
      </span>
    </div>
  )
}

/** Human "Now playing" label — game name plus the planned game index when available. */
function nowPlayingFor(
  tournament: Tournament,
  activeGame: TournamentGame,
  queueEntries: Tournament['game_queue'],
  queueIndex: number
): string {
  const gameType =
    tournament.format === 'round-robin' && queueEntries && queueEntries[queueIndex - 1]
      ? queueEntries[queueIndex - 1].gameType
      : tournament.game_type
  const label = gameType ? (gameTypeLabel(gameType) ?? gameType) : 'Game in progress'
  if (queueEntries) {
    return `Game ${queueIndex} of ${queueEntries.length} — ${label}`
  }
  const finishedIdx = tournament.format === 'round-robin' ? activeGame.game_order : null
  return finishedIdx ? `Game ${finishedIdx} — ${label}` : label
}
