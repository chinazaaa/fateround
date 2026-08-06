import Link from 'next/link'
import { gameTypeConfig, parseGameType } from '@/lib/game-types'
import type { Game, Player } from '@/types'

function statusLabel(status: Game['status']): string {
  if (status === 'waiting') return 'Waiting to start'
  if (status === 'active') return 'In progress'
  return 'Finished'
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/**
 * History view for games that don't record results in the `votes` table and don't (yet)
 * have a bespoke *SessionSummary — puzzles, board/duel games, and the round-based party
 * games. Those games keep their scores in their own per-game tables, so this shows the
 * session facts we can state truthfully and says plainly that per-round detail isn't kept,
 * rather than rendering the poll view's "Votes recorded 0" / "no votes recorded yet".
 */
export function GenericSessionSummary({ game, players }: { game: Game; players: Player[] }) {
  const cfg = gameTypeConfig(parseGameType(game.game_type))
  const seated = players.filter((p) => p.spectator !== true)
  const watchers = players.filter((p) => p.spectator === true)

  return (
    <div className="space-y-6">
      <div className="glass-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {cfg.headerEmoji}
          </span>
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Game</p>
            <p className="font-bold text-lg leading-tight">{cfg.label}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Status</p>
            <p className="font-medium mt-0.5">{statusLabel(game.status)}</p>
          </div>
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Players</p>
            <p className="font-medium mt-0.5">{seated.length}</p>
          </div>
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Created</p>
            <p className="mt-0.5">{formatDate(game.created_at)}</p>
          </div>
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">
              {game.status === 'finished' ? 'Finished' : 'Started'}
            </p>
            <p className="mt-0.5">
              {formatDate(game.status === 'finished' ? game.finished_at : game.session_started_at)}
            </p>
          </div>
        </div>
      </div>

      {seated.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-muted text-xs uppercase tracking-wider">Who played</h2>
          <div className="glass-card divide-y divide-[var(--border)]">
            {seated.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <span className="font-medium text-body">{p.name}</span>
                {p.is_eliminated && <span className="text-faint text-xs">Eliminated</span>}
              </div>
            ))}
          </div>
          {watchers.length > 0 && (
            <p className="text-faint text-xs">
              {watchers.length} {watchers.length === 1 ? 'watcher' : 'watchers'} also joined.
            </p>
          )}
        </section>
      )}

      <p className="text-faint text-xs leading-relaxed">
        Round-by-round results aren&rsquo;t kept in history for {cfg.label} yet — final scores are shown on the
        game&rsquo;s results screen when it ends.{' '}
        {game.status !== 'finished' && (
          <Link href={`/game/${game.id}`} className="underline hover:text-body transition-colors">
            Open the game
          </Link>
        )}
      </p>
    </div>
  )
}
