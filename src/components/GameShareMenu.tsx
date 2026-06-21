'use client'

import { useState } from 'react'
import { GameLinkQrModal } from '@/components/GameLinkQrModal'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { Modal } from '@/components/ui/Modal'
import { hostGameUrl, hostPlayerUrl, playerGameUrl, playerResumeUrl, shareOrigin } from '@/lib/site'

type QrConfig = {
  url: string
  title: string
  subtitle?: string
  copyLabel: string
  copySuccessMessage: string
}

type Props = {
  gameCode: string
  hostToken?: string
  resumeToken?: string | null
  className?: string
}

function ShareLinkSection({
  title,
  description,
  url,
  copyLabel,
  copySuccessMessage,
  qr,
  onShowQr,
}: {
  title: string
  description: string
  url: string
  copyLabel: string
  copySuccessMessage: string
  qr: QrConfig
  onShowQr: (config: QrConfig) => void
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-muted text-xs sm:text-sm leading-relaxed">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <CopyLinkButton value={url} label={copyLabel} successMessage={copySuccessMessage} />
        <button
          type="button"
          onClick={() => onShowQr(qr)}
          className="text-sm font-semibold text-[var(--primary)] hover:opacity-80 transition-opacity"
        >
          Show QR code
        </button>
      </div>
    </section>
  )
}

export function GameShareMenu({ gameCode, hostToken, resumeToken, className = '' }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [qrConfig, setQrConfig] = useState<QrConfig | null>(null)

  const origin = shareOrigin()
  const inviteUrl = playerGameUrl(gameCode, origin)
  const hostUrl = hostToken ? hostGameUrl(gameCode, hostToken, origin) : null
  const hostPlayerLink =
    hostToken && resumeToken ? hostPlayerUrl(gameCode, hostToken, resumeToken, origin) : null
  const playerContinueLink =
    resumeToken && !hostToken ? playerResumeUrl(gameCode, resumeToken, origin) : null

  const openQr = (config: QrConfig) => {
    setMenuOpen(false)
    setQrConfig(config)
  }

  const subtitle = hostToken
    ? 'Copy a link or show a QR code for players — or to reopen your host panel.'
    : playerContinueLink
      ? 'Invite friends or save your link to continue on another device.'
      : 'Copy a link or show a QR code so friends can join.'

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        className={`btn-secondary text-xs sm:text-sm py-1.5 px-2.5 sm:px-3 flex items-center gap-1.5 shrink-0 ${className}`}
        aria-label="Share game links"
      >
        <ShareIcon />
        <span>Share</span>
      </button>

      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Share game" subtitle={subtitle} size="md">
        <div className="space-y-6">
          <ShareLinkSection
            title="Invite players"
            description="Send this to friends so they can join the game."
            url={inviteUrl}
            copyLabel="Copy invite link"
            copySuccessMessage="Invite link copied"
            qr={{
              url: inviteUrl,
              title: 'Scan invite link',
              subtitle: 'Players use this link to join — no host access.',
              copyLabel: 'Copy invite link',
              copySuccessMessage: 'Invite link copied',
            }}
            onShowQr={openQr}
          />

          {hostPlayerLink ? (
            <ShareLinkSection
              title="Host + play"
              description="Manage the game and play as yourself on another device."
              url={hostPlayerLink}
              copyLabel="Copy host + play link"
              copySuccessMessage="Host + play link copied"
              qr={{
                url: hostPlayerLink,
                title: 'Host + play',
                subtitle: 'Manage the game and play as yourself — save this for another device.',
                copyLabel: 'Copy host + play link',
                copySuccessMessage: 'Host + play link copied',
              }}
              onShowQr={openQr}
            />
          ) : hostUrl ? (
            <ShareLinkSection
              title="Host panel"
              description="Reopen your host controls on another device."
              url={hostUrl}
              copyLabel="Copy host link"
              copySuccessMessage="Host link copied"
              qr={{
                url: hostUrl,
                title: 'Scan host link',
                subtitle: 'Save this to reopen your host panel on another device.',
                copyLabel: 'Copy host link',
                copySuccessMessage: 'Host link copied',
              }}
              onShowQr={openQr}
            />
          ) : playerContinueLink ? (
            <ShareLinkSection
              title="Continue playing"
              description="Pick up where you left off on your phone or another device."
              url={playerContinueLink}
              copyLabel="Copy continue link"
              copySuccessMessage="Continue link copied"
              qr={{
                url: playerContinueLink,
                title: 'Continue playing',
                subtitle: 'Save this link to rejoin with your player seat on another device.',
                copyLabel: 'Copy continue link',
                copySuccessMessage: 'Continue link copied',
              }}
              onShowQr={openQr}
            />
          ) : null}
        </div>
      </Modal>

      {qrConfig ? (
        <GameLinkQrModal
          open
          onClose={() => setQrConfig(null)}
          url={qrConfig.url}
          title={qrConfig.title}
          subtitle={qrConfig.subtitle}
          copyLabel={qrConfig.copyLabel}
          copySuccessMessage={qrConfig.copySuccessMessage}
        />
      ) : null}
    </>
  )
}

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="w-4 h-4 shrink-0"
      aria-hidden
    >
      <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.5 2.5 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.367A2.5 2.5 0 0 1 13 4.5Z" />
    </svg>
  )
}
