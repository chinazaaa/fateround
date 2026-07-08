'use client'

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import QRCode from 'react-qr-code'
import { playerGameUrl, hostGameUrl, hostPlayerUrl, playerResumeUrl, shareOrigin } from '@/lib/site'

/* ══════════════════════════════════════════════════════════════════
   Fate Round · Rooms — shared host sheet UI
   Ported from project/ui_kits/rooms/rooms-ui.js
   ShareSheet, TransferSheet, HostToolbar, EndGameSheet,
   EditNameSheet, LeaveSheet.
   ══════════════════════════════════════════════════════════════════ */

const DEFAULT_CODE = 'F8K2QP'

type LinkKey = 'invite' | 'host' | 'play' | 'self'

interface LinkDef {
  label: string
  desc: string
  /** Full shareable URL (with protocol + tokens) — used for QR + clipboard. */
  url: string
  copy: string
}

/** Strip the protocol for the displayed URL (QR + copy still use the full one). */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '')
}

function buildLinks(
  code: string,
  opts: { hostToken?: string; resumeToken?: string; origin?: string }
): Record<LinkKey, LinkDef> {
  const origin = opts.origin ?? shareOrigin()
  const invite = playerGameUrl(code, origin)
  // Host / host+play links must carry the host token (and the host's resume
  // token for host+play) — without them the target device can't reopen the
  // host panel. Fall back to the plain host/invite link if a token is missing.
  const host = opts.hostToken ? hostGameUrl(code, opts.hostToken, origin) : invite
  const play =
    opts.hostToken && opts.resumeToken
      ? hostPlayerUrl(code, opts.hostToken, opts.resumeToken, origin)
      : opts.hostToken
        ? hostGameUrl(code, opts.hostToken, origin)
        : invite
  // A joined player's own "continue on another device" link (name + seat).
  const self = opts.resumeToken ? playerResumeUrl(code, opts.resumeToken, origin) : invite
  return {
    invite: {
      label: 'Invite players',
      desc: 'Anyone with this joins as a player — no host access.',
      url: invite,
      copy: 'Copy invite link',
    },
    host: {
      label: 'Host panel',
      desc: 'Reopen your host controls on another device.',
      url: host,
      copy: 'Copy host link',
    },
    play: {
      label: 'Host + play',
      desc: 'Run the game and play as yourself on another device.',
      url: play,
      copy: 'Copy host + play link',
    },
    self: {
      label: 'Your player link',
      desc: 'Reopen your seat — same name, same cards — on another device.',
      url: self,
      copy: 'Copy your player link',
    },
  }
}

// ── Share popup: pick which link to share; each shows its own QR ──
export function ShareSheet(props: {
  open: boolean
  onClose: () => void
  host?: boolean
  code?: string
  /** Host token — required for correct host / host+play links. */
  hostToken?: string
  /** The host's player resume token — enables the host+play link. */
  resumeToken?: string
  /** Share origin (defaults to the live browser origin). */
  origin?: string
}) {
  // Host tabs (host panel + host+play) only make sense with a host token; without
  // one, fall back to the invite-only share so we never surface a tokenless link.
  const host = props.host !== false && !!props.hostToken
  const resume = props.resumeToken?.trim()
  // "Host + play" needs a resume token; without one buildLinks falls back to the
  // host-panel URL, so don't surface a misleading tokenless play link.
  const hasHostPlay = host && !!resume
  // A joined player (not a host) with their own resume token gets a "continue on
  // another device" link alongside the invite — the player-side of host+play.
  const hasSelf = !host && !!resume
  const links = buildLinks(props.code ?? DEFAULT_CODE, {
    hostToken: props.hostToken,
    resumeToken: hasHostPlay || hasSelf ? props.resumeToken : undefined,
    origin: props.origin,
  })
  const tabs: LinkKey[] = host
    ? hasHostPlay
      ? ['invite', 'host', 'play']
      : ['invite', 'host']
    : hasSelf
      ? ['invite', 'self']
      : ['invite']
  const [tab, setTab] = useState<LinkKey>('invite')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
  }, [tab])

  if (!props.open) return null

  const active = links[tab]

  function flash() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    // Only flash "Copied" once the clipboard write actually succeeds.
    navigator.clipboard
      .writeText(active.url)
      .then(() => {
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
        }, 1500)
      })
      .catch(() => {
        setCopied(false)
      })
  }

  return (
    <div style={sheetStyles.sheetBackdrop} onClick={props.onClose}>
      <div style={sheetStyles.sheetBox} onClick={(ev) => ev.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 4,
          }}
        >
          <p style={sheetStyles.sheetTitle}>Share game</p>
          <button onClick={props.onClose} aria-label="Close" style={sheetStyles.sheetX}>
            {'✕'}
          </button>
        </div>
        {tabs.length > 1 && (
          <div style={sheetStyles.segWrap}>
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{ ...sheetStyles.segBtn, ...(tab === t ? sheetStyles.segOn : null) }}
              >
                {links[t].label}
              </button>
            ))}
          </div>
        )}
        <p style={sheetStyles.sheetDesc}>{active.desc}</p>
        <div style={sheetStyles.qrHolder}>
          <div style={sheetStyles.qrFrame}>
            <QRCode value={active.url} size={168} />
          </div>
        </div>
        <p style={sheetStyles.qrUrl}>{displayUrl(active.url)}</p>
        <button onClick={flash} style={sheetStyles.copyBtn}>
          {copied ? 'Copied ✓' : active.copy}
        </button>
      </div>
    </div>
  )
}

// ── Transfer host popup ──
export function TransferSheet(props: {
  open: boolean
  onClose: () => void
  players: string[]
  nominee: string | null
  onNominate: (p: string) => void
  onCancel: () => void
}) {
  if (!props.open) return null

  return (
    <div style={sheetStyles.sheetBackdrop} onClick={props.onClose}>
      <div style={sheetStyles.sheetBox} onClick={(ev) => ev.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <p style={sheetStyles.sheetTitle}>Transfer host</p>
          <button onClick={props.onClose} aria-label="Close" style={sheetStyles.sheetX}>
            {'✕'}
          </button>
        </div>
        {props.nominee ? (
          <div>
            <div style={sheetStyles.waitBox}>
              <div style={sheetStyles.waitAv}>{props.nominee[0]}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                  {'Waiting for ' + props.nominee + ' to accept…'}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                    lineHeight: 1.4,
                  }}
                >
                  They&apos;ll see an invite on their screen. You stay host until they accept.
                </div>
              </div>
            </div>
            <button onClick={props.onCancel} style={{ ...sheetStyles.copyBtn, marginTop: 12 }}>
              Cancel invite
            </button>
          </div>
        ) : (
          <div>
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 13.5,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              Pick a player to become the new host. They must accept before control moves {'—'} you&apos;ll lose host
              access the moment they do.
            </p>
            <div
              style={{
                maxHeight: 280,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {(props.players || []).map((p) => (
                <button key={p} onClick={() => props.onNominate(p)} style={sheetStyles.trow}>
                  <span style={sheetStyles.waitAv}>{p[0]}</span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{p}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Host toolbar: Settings · Transfer host · Share ──
export function HostToolbar(props: { onEditSettings?: () => void; onTransfer?: () => void; onShare?: () => void }) {
  return (
    <div className="host-toolbar">
      <button onClick={props.onEditSettings}>{'⚙︎ Settings'}</button>
      <button onClick={props.onTransfer}>{'⇄ Transfer host'}</button>
      <button onClick={props.onShare}>{'↗ Share game'}</button>
    </div>
  )
}

// ── End-game confirm ──
export function EndGameSheet(props: { open: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!props.open) return null

  return (
    <div style={sheetStyles.sheetBackdrop} onClick={props.onClose}>
      <div style={sheetStyles.sheetBox} onClick={(ev) => ev.stopPropagation()}>
        <p style={sheetStyles.sheetTitle}>End the game?</p>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            margin: '10px 0 16px',
          }}
        >
          Everyone sees the final results. You can start a new game from the room afterward.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={props.onClose} style={{ ...sheetStyles.copyBtn, flex: 1, background: 'transparent' }}>
            Cancel
          </button>
          <button onClick={props.onConfirm} style={sheetStyles.dangerBtn}>
            Show final results
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Edit-your-name popup ──
export function EditNameSheet(props: {
  open: boolean
  name: string
  onClose: () => void
  onSave: (n: string) => void
}) {
  const [name, setName] = useState(props.name || '')

  if (!props.open) return null

  return (
    <div style={sheetStyles.sheetBackdrop} onClick={props.onClose}>
      <div style={{ ...sheetStyles.sheetBox, maxWidth: 340 }} onClick={(ev) => ev.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
          }}
        >
          <p style={sheetStyles.sheetTitle}>Your name</p>
          <button onClick={props.onClose} aria-label="Close" style={sheetStyles.sheetX}>
            {'✕'}
          </button>
        </div>
        <input
          value={name}
          autoFocus
          maxLength={20}
          onChange={(ev) => setName(ev.target.value)}
          placeholder="Enter a display name"
          style={sheetStyles.nameInput}
        />
        <p style={{ fontSize: 11.5, color: 'var(--text-faint)', margin: '7px 2px 14px' }}>
          This is how everyone in the room sees you.
        </p>
        <button
          onClick={() => {
            if (props.onSave) props.onSave(name.trim() || props.name)
            props.onClose()
          }}
          style={sheetStyles.saveBtn}
        >
          Save name
        </button>
      </div>
    </div>
  )
}

// ── Leave-game confirm ──
export function LeaveSheet(props: { open: boolean; host?: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!props.open) return null

  return (
    <div style={sheetStyles.sheetBackdrop} onClick={props.onClose}>
      <div style={{ ...sheetStyles.sheetBox, maxWidth: 340 }} onClick={(ev) => ev.stopPropagation()}>
        <p style={sheetStyles.sheetTitle}>Leave the game?</p>
        <p
          style={{
            fontSize: 13.5,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            margin: '10px 0 16px',
          }}
        >
          {props.host
            ? 'You’re the host — leaving ends the game for everyone unless you transfer host first.'
            : 'You can rejoin from the same link while the room is open.'}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={props.onClose} style={{ ...sheetStyles.copyBtn, flex: 1, background: 'transparent' }}>
            Stay
          </button>
          <button
            onClick={() => {
              props.onClose()
              if (props.onConfirm) props.onConfirm()
            }}
            style={sheetStyles.dangerBtn}
          >
            Leave game
          </button>
        </div>
      </div>
    </div>
  )
}

// styles
const sheetStyles = {
  sheetBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20,18,26,.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 60,
  },
  sheetBox: {
    width: '100%',
    maxWidth: 380,
    background: 'var(--surface)',
    borderRadius: 20,
    padding: '18px 18px 22px',
    boxShadow: 'var(--shadow-lg)',
  },
  sheetTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: 19,
    margin: 0,
    color: 'var(--text)',
  },
  sheetX: {
    border: 'none',
    background: 'transparent',
    fontSize: 17,
    color: 'var(--text-faint)',
    cursor: 'pointer',
    lineHeight: 1,
  },
  sheetDesc: {
    fontSize: 12.5,
    color: 'var(--text-muted)',
    margin: '2px 0 12px',
    textAlign: 'center',
    lineHeight: 1.4,
  },
  segWrap: {
    display: 'flex',
    gap: 4,
    padding: 4,
    background: 'var(--surface-sunken)',
    borderRadius: 12,
    margin: '10px 0 12px',
  },
  segBtn: {
    flex: 1,
    border: 'none',
    background: 'transparent',
    padding: '7px 4px',
    borderRadius: 8,
    font: '600 11.5px var(--font-sans)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  segOn: {
    background: 'var(--surface)',
    color: 'var(--text)',
    boxShadow: 'var(--shadow-sm)',
  },
  qrHolder: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: 10,
  },
  qrFrame: {
    background: '#fff',
    padding: 12,
    borderRadius: 12,
    border: '1px solid var(--border)',
    lineHeight: 0,
  },
  qrUrl: {
    textAlign: 'center',
    font: '600 12.5px var(--font-mono)',
    color: 'var(--text-muted)',
    margin: '0 0 14px',
    wordBreak: 'break-all',
  },
  copyBtn: {
    width: '100%',
    border: '1.5px solid var(--border-strong)',
    background: 'var(--surface)',
    color: 'var(--text)',
    font: '700 14px var(--font-sans)',
    borderRadius: 12,
    padding: '11px',
    cursor: 'pointer',
  },
  trow: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    textAlign: 'left',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    borderRadius: 12,
    padding: '10px 12px',
    cursor: 'pointer',
  },
  waitAv: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'var(--primary-soft)',
    color: 'var(--primary-strong)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: '800 13px var(--font-display)',
    flexShrink: 0,
  },
  waitBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '13px 14px',
    borderRadius: 12,
    background: 'var(--surface-sunken)',
  },
  dangerBtn: {
    flex: 1,
    border: 'none',
    background: 'var(--danger)',
    color: '#fff',
    font: '700 14px var(--font-sans)',
    borderRadius: 12,
    padding: '11px',
    cursor: 'pointer',
  },
  nameInput: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1.5px solid var(--border-strong)',
    borderRadius: 12,
    padding: '11px 13px',
    font: '600 15px var(--font-sans)',
    color: 'var(--text)',
    background: 'var(--surface)',
  },
  saveBtn: {
    width: '100%',
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    font: '700 14px var(--font-sans)',
    borderRadius: 12,
    padding: '11px',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>
