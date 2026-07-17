'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { GameLinkQrCode } from '@/components/GameLinkQrCode'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { CopyLinkButton } from '@/components/ui/CopyLinkButton'
import { copyToClipboard } from '@/lib/copy'
import { useToast } from '@/components/ui/Toast'
import { hostGameUrl, hostPlayerUrl, playerGameUrl, shareOrigin } from '@/lib/site'

type ShareTab = {
  key: string
  label: string
  url: string
  description: string
  copyLabel: string
  copySuccess: string
  shareText: string
}

/**
 * Mobile-parity share sheet (mirrors apps/mobile ShareGameInviteContent): a single view
 * with the game code up top to copy, link tabs, a QR, the URL, and Share / Copy actions —
 * instead of the older stacked-sections web menu. Opened by tapping the lobby code card.
 */
export function ShareGameModal({
  open,
  onClose,
  gameCode,
  hostToken,
  resumeToken,
}: {
  open: boolean
  onClose: () => void
  gameCode: string
  hostToken?: string
  resumeToken?: string | null
}) {
  const { success, error } = useToast()
  const code = gameCode.toUpperCase()

  const tabs = useMemo<ShareTab[]>(() => {
    const origin = shareOrigin()
    const list: ShareTab[] = [
      {
        key: 'invite',
        label: 'Invite players',
        url: playerGameUrl(gameCode, origin),
        description: 'Send this to friends so they can join the game.',
        copyLabel: 'Copy invite link',
        copySuccess: 'Invite link copied',
        shareText: 'Join my game on Fate Round:',
      },
    ]
    if (hostToken && resumeToken) {
      list.push({
        key: 'play',
        label: 'Host + play',
        url: hostPlayerUrl(gameCode, hostToken, resumeToken, origin),
        description: 'Manage the game and play as yourself on another device.',
        copyLabel: 'Copy host + play link',
        copySuccess: 'Host + play link copied',
        shareText: 'My Fate Round host + play link:',
      })
    } else if (hostToken) {
      list.push({
        key: 'host',
        label: 'Host panel',
        url: hostGameUrl(gameCode, hostToken, origin),
        description: 'Reopen your host controls on another device.',
        copyLabel: 'Copy host link',
        copySuccess: 'Host link copied',
        shareText: 'My Fate Round host link:',
      })
    }
    return list
  }, [gameCode, hostToken, resumeToken])

  const [tabKey, setTabKey] = useState('invite')
  const active = tabs.find((t) => t.key === tabKey) ?? tabs[0]!
  const [codeCopied, setCodeCopied] = useState(false)

  const copyCode = async () => {
    const ok = await copyToClipboard(code)
    if (ok) {
      success('Game code copied')
      setCodeCopied(true)
      window.setTimeout(() => setCodeCopied(false), 2000)
    } else {
      error('Could not copy — try again')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Share game">
      <div className="space-y-3">
        {/* Game code — tap to copy the short code */}
        <button
          type="button"
          onClick={() => void copyCode()}
          className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)] px-4 py-2.5 text-left"
        >
          <span className="text-xs font-semibold text-faint">Game code</span>
          <span className="font-mono text-lg font-extrabold tracking-[0.2em] text-body">{code}</span>
          <span className="ml-auto text-sm font-bold text-[var(--primary)]">
            {codeCopied ? 'Copied!' : 'Copy code'}
          </span>
        </button>

        {tabs.length > 1 ? (
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const selected = t.key === active.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTabKey(t.key)}
                  aria-pressed={selected}
                  className={[
                    'rounded-full border px-3.5 py-1.5 text-sm font-bold transition-colors',
                    selected
                      ? 'border-[var(--chip-active-border)] bg-[var(--chip-active-bg)] text-[var(--primary)]'
                      : 'border-[var(--border)] text-muted hover:text-[var(--foreground)]',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        ) : null}

        {/* QR (left) + link & actions (right) — side by side to keep the sheet short */}
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-4">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <GameLinkQrCode url={active.url} size={116} />
            <p className="text-[11px] font-semibold text-faint">Scan to join</p>
          </div>
          <div className="min-w-0 flex-1 space-y-2.5">
            <p className="break-all font-mono text-[11px] leading-snug text-muted">{active.url}</p>
            <ShareInviteButton url={active.url} text={active.shareText} className="w-full justify-center" />
            <div className="flex justify-center">
              <CopyLinkButton value={active.url} label={active.copyLabel} successMessage={active.copySuccess} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
