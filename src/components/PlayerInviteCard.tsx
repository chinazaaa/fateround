'use client'

import { GameLinkQrCode } from '@/components/GameLinkQrCode'
import { InviteLinkActions } from '@/components/InviteLinkActions'

export function PlayerInviteCard({
  url,
  title = 'Invite friends',
  gameCode,
  className = '',
  showInlineQr = true,
  variant = 'default',
}: {
  url: string
  title?: string
  gameCode?: string
  className?: string
  showInlineQr?: boolean
  variant?: 'default' | 'aside'
}) {
  const isAside = variant === 'aside'

  return (
    <div
      className={[
        isAside
          ? 'rounded-2xl border border-[color-mix(in_srgb,var(--primary)_16%,var(--border))] bg-[var(--card-strong)]/90 backdrop-blur-md p-5 space-y-4 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.4)]'
          : 'glass-card p-4 space-y-3',
        className,
      ].join(' ')}
    >
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">{title}</p>
        {gameCode ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-faint text-xs">Game code</span>
            <span className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-inset-bg)] px-2.5 py-1 font-mono font-bold text-sm tracking-[0.16em]">
              {gameCode}
            </span>
          </div>
        ) : null}
      </div>

      {showInlineQr ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-4 py-4">
          <GameLinkQrCode url={url} size={isAside ? 168 : 152} />
          <p className="text-faint text-xs">Scan to join</p>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <p className="text-body font-mono text-[11px] sm:text-xs break-all leading-relaxed">{url}</p>
      </div>

      <InviteLinkActions url={url} copyLabel="Copy invite link" successMessage="Invite link copied" />
    </div>
  )
}
