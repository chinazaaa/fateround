'use client'

import type { PollHostMode } from '@/lib/poll-host-mode'

export function HostModePanel({
  hostMode,
  onModeChange,
  disabled,
  joinBlock,
  joinedHint,
}: {
  hostMode: PollHostMode
  onModeChange: (mode: PollHostMode) => void
  disabled?: boolean
  joinBlock?: React.ReactNode
  joinedHint?: React.ReactNode
}) {
  return (
    <div className="glass-card p-4 space-y-3">
      <p className="label-caps">Host mode</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onModeChange('spectator')}
          className={[
            'rounded-xl border-2 px-3 py-3 text-left text-sm',
            hostMode === 'spectator'
              ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
              : 'border-[var(--border-strong)] text-muted',
          ].join(' ')}
        >
          <span className="font-bold block">Host only</span>
          <span className="text-faint text-xs">Watch without joining</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onModeChange('player')}
          className={[
            'rounded-xl border-2 px-3 py-3 text-left text-sm',
            hostMode === 'player'
              ? 'border-[var(--foreground)]/30 bg-[var(--surface-inset-bg)]'
              : 'border-[var(--border-strong)] text-muted',
          ].join(' ')}
        >
          <span className="font-bold block">Host + play</span>
          <span className="text-faint text-xs">Join in as a player</span>
        </button>
      </div>
      {hostMode === 'player' && joinBlock}
      {hostMode === 'player' && joinedHint}
    </div>
  )
}
