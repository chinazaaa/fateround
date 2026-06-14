import type { Game } from '@/types'

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

function peopleLabel(count: number): string {
  return `${count} ${count === 1 ? 'person' : 'people'} attended`
}

export function AnonymousRoomSessionSummary({
  game,
  playerCount,
}: {
  game: Pick<Game, 'status' | 'created_at' | 'session_started_at'>
  playerCount: number
}) {
  return (
    <div className="glass-card p-6 space-y-5 text-center">
      <div className="space-y-1">
        <p className="text-4xl" aria-hidden>
          🎭
        </p>
        <p className="text-muted text-sm">Anonymous Room</p>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm text-left">
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Status</p>
          <p className="font-medium mt-0.5">{statusLabel(game.status)}</p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Attended</p>
          <p className="font-medium mt-0.5">{peopleLabel(playerCount)}</p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Created</p>
          <p className="mt-0.5">{formatDate(game.created_at)}</p>
        </div>
        {game.session_started_at && (
          <div>
            <p className="text-faint text-[10px] uppercase tracking-wider">Started</p>
            <p className="mt-0.5">{formatDate(game.session_started_at)}</p>
          </div>
        )}
      </div>

      <p className="text-faint text-xs leading-relaxed">
        Messages from this session are not stored in game history.
      </p>
    </div>
  )
}
