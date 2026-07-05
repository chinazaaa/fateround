'use client'

import { useState, type CSSProperties } from 'react'
import { ShareSheet, TransferSheet, EndGameSheet } from '@/components/rooms/sheets'

export type HostControlBarProps = {
  /** Players eligible to receive host (for the transfer picker). */
  players?: string[]
  /** If set, ⚙︎ Settings navigates here; otherwise calls onSettings. */
  settingsHref?: string
  onSettings?: () => void
  onEndGame?: () => void
  /** Stick to the bottom of the viewport. */
  pinned?: boolean
  /** Caption above the bar; pass false to hide it. */
  label?: string | false
  /** 'hostplay' shows the "🎮 Host + play" tag in the caption. */
  mode?: 'host' | 'hostplay'
}

/**
 * The reusable host control strip — ⚙︎ Settings · ⇄ Transfer · ↗ Share ·
 * 🏁 End game. Manages its own Share / Transfer / End-game popups. Drop it
 * under a player screen to make it "host + play", or into a host console for
 * "host only". Ported from the design system's `ROOMS.HostControlBar`.
 */
export function HostControlBar(props: HostControlBarProps) {
  const [share, setShare] = useState(false)
  const [transfer, setTransfer] = useState(false)
  const [nominee, setNominee] = useState<string | null>(null)
  const [endOpen, setEnd] = useState(false)

  const settings = () => {
    if (props.settingsHref) window.location.href = props.settingsHref
    else props.onSettings?.()
  }

  return (
    <>
      {props.label !== false && (
        <div className="host-controlcap">
          <span>{props.label || 'Host controls'}</span>
          {props.mode === 'hostplay' && <span style={hostPlayTag}>🎮 Host + play</span>}
        </div>
      )}
      <div className="host-controlbar" style={props.pinned ? { position: 'sticky', bottom: 0 } : undefined}>
        <button style={ctrlBtn} onClick={settings}>
          ⚙︎ Settings
        </button>
        <button style={ctrlBtn} onClick={() => setTransfer(true)}>
          ⇄ Transfer
        </button>
        <button style={ctrlBtn} onClick={() => setShare(true)}>
          ↗ Share
        </button>
        <button style={ctrlDanger} onClick={() => setEnd(true)}>
          🏁 End game
        </button>
      </div>

      <ShareSheet open={share} onClose={() => setShare(false)} host />
      <TransferSheet
        open={transfer}
        onClose={() => setTransfer(false)}
        players={props.players || []}
        nominee={nominee}
        onNominate={setNominee}
        onCancel={() => setNominee(null)}
      />
      <EndGameSheet
        open={endOpen}
        onClose={() => setEnd(false)}
        onConfirm={() => {
          setEnd(false)
          props.onEndGame?.()
        }}
      />
    </>
  )
}

const hostPlayTag: CSSProperties = {
  marginLeft: 'auto',
  font: '700 9.5px var(--font-sans)',
  letterSpacing: '.06em',
  textTransform: 'none',
  color: 'var(--primary-strong)',
  background: 'var(--primary-soft)',
  borderRadius: 9999,
  padding: '3px 8px',
}
const ctrlBtn: CSSProperties = {
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  border: '1.5px solid var(--border-strong)',
  background: 'var(--surface)',
  color: 'var(--text)',
  font: '700 12px var(--font-sans)',
  borderRadius: 12,
  padding: '10px 4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const ctrlDanger: CSSProperties = {
  ...ctrlBtn,
  color: 'var(--danger)',
  borderColor: 'color-mix(in srgb, var(--danger) 42%, var(--border-strong))',
}
