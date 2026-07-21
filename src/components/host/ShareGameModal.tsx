'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { GameLinkQrCode } from '@/components/GameLinkQrCode'
import { ShareInviteButton } from '@/components/ShareInviteButton'
import { copyToClipboard } from '@/lib/copy'
import { useToast } from '@/components/ui/Toast'
import { hostGameUrl, hostPlayerUrl, playerGameUrl, playerResumeUrl, shareOrigin } from '@/lib/site'

type ShareTab = {
  key: string
  label: string
  url: string
  description: string
  /** Short code that matches this link — shown in the code row for the active tab. */
  code: string
  codeLabel: string
  copyLabel: string
  copySuccess: string
  shareText: string
  /** Label for the native-share button (defaults elsewhere to "Share invite"). */
  shareLabel: string
  /** Caption under the QR — "Scan to join" fits the invite link, not the others. */
  scanLabel: string
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
  const code = gameCode.toUpperCase()

  const tabs = useMemo<ShareTab[]>(() => {
    const origin = shareOrigin()
    const list: ShareTab[] = [
      {
        key: 'invite',
        label: 'Invite players',
        url: playerGameUrl(gameCode, origin),
        description: 'Send this to friends so they can join the game.',
        code,
        codeLabel: 'Game code',
        copyLabel: 'Copy invite link',
        copySuccess: 'Invite link copied',
        shareText: 'Join my game on Fate Round:',
        shareLabel: 'Share invite',
        scanLabel: 'Scan to join',
      },
    ]
    if (hostToken && resumeToken) {
      list.push({
        key: 'play',
        label: 'Your host+play link',
        url: hostPlayerUrl(gameCode, hostToken, resumeToken, origin),
        description: 'Manage the game and play as yourself on another device.',
        code: resumeToken.toUpperCase(),
        codeLabel: 'Player code',
        copyLabel: 'Copy host+play link',
        copySuccess: 'Host+play link copied',
        shareText: 'My Fate Round host + play link:',
        shareLabel: 'Share link',
        scanLabel: 'Scan to open your seat',
      })
    } else if (hostToken) {
      list.push({
        key: 'host',
        label: 'Host panel',
        url: hostGameUrl(gameCode, hostToken, origin),
        description: 'Reopen your host controls on another device.',
        code,
        codeLabel: 'Game code',
        copyLabel: 'Copy host link',
        copySuccess: 'Host link copied',
        shareText: 'My Fate Round host link:',
        shareLabel: 'Share link',
        scanLabel: 'Scan to open host panel',
      })
    } else if (resumeToken) {
      // A player (no host token) — their personal seat link, so they can pick the
      // same seat up on another device (keeps their name + progress). Kept separate
      // from the invite link, which anyone joins with as a new player.
      list.push({
        key: 'continue',
        label: 'Your player link',
        url: playerResumeUrl(gameCode, resumeToken, origin),
        description: 'Continue in this same seat on another device — keeps your name and progress.',
        code: resumeToken.toUpperCase(),
        codeLabel: 'Player code',
        copyLabel: 'Copy player link',
        copySuccess: 'Player link copied',
        shareText: 'My Fate Round player link:',
        shareLabel: 'Share link',
        scanLabel: 'Scan to open your seat',
      })
    }
    return list
  }, [gameCode, hostToken, resumeToken])

  const [tabKey, setTabKey] = useState('invite')
  const active = tabs.find((t) => t.key === tabKey) ?? tabs[0]!

  return (
    <Modal open={open} onClose={onClose} title="Share game">
      <div className="space-y-3">
        {/* Tabs first — everything below (code, link, QR) reflects the active tab. */}
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

        {/* The code for the active tab — Game code on the invite/host tabs, the
            player's seat code on "Your player link". One row, so the sheet stays light. */}
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-inset-bg)]">
          <CodeRow
            label={active.codeLabel}
            value={active.code}
            copyLabel="Copy"
            successMessage={`${active.codeLabel} copied`}
          />
        </div>

        {/* Describe the active link — also labels it clearly for the single-tab case. */}
        <div className="px-0.5">
          <p className="text-sm font-bold text-body">{active.label}</p>
          <p className="text-xs text-muted">{active.description}</p>
        </div>

        {/* QR (left) + the share/copy action (right). The raw URL is intentionally
            not shown — the QR carries it and the button copies it. */}
        <div className="flex items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-inset-bg)] p-4">
          <div className="flex shrink-0 flex-col items-center gap-1">
            <GameLinkQrCode url={active.url} size={116} />
            <p className="text-[11px] font-semibold text-faint">{active.scanLabel}</p>
          </div>
          <div className="min-w-0 flex-1">
            {/* One action: native share sheet on mobile, copy on desktop (label adapts). */}
            <ShareInviteButton
              url={active.url}
              text={active.shareText}
              label={active.shareLabel}
              copyLabel={active.copyLabel}
              className="w-full justify-center"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

/** A single tap-to-copy code row (label · mono code · Copy) used in the codes card. */
function CodeRow({
  label,
  value,
  copyLabel,
  successMessage,
}: {
  label: string
  value: string
  copyLabel: string
  successMessage: string
}) {
  const { success, error } = useToast()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    const ok = await copyToClipboard(value)
    if (ok) {
      success(successMessage)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } else {
      error('Could not copy — try again')
    }
  }

  return (
    <button type="button" onClick={() => void copy()} className="flex w-full items-center gap-3 px-4 py-2.5 text-left">
      <span className="w-20 shrink-0 text-xs font-semibold text-faint">{label}</span>
      <span className="font-mono text-lg font-extrabold tracking-[0.2em] text-body">{value}</span>
      <span className="ml-auto shrink-0 text-sm font-bold text-[var(--primary)]">{copied ? 'Copied!' : copyLabel}</span>
    </button>
  )
}
