'use client'

import type { CSSProperties, ReactNode } from 'react'

/**
 * Dismissible "Game settings" sheet for the card-table host. Replaces the
 * design's `settings.html` full-page navigation (which had no way back) with a
 * modal you can close via the ✕, the Done button, or tapping the scrim.
 *
 * Holds the "Play as yourself" host-mode toggle (Host + play ↔ Host only) plus
 * any game-specific rules passed as `children`.
 */
export function CardTableSettingsSheet({
  open,
  onClose,
  hostPlays,
  onModeChange,
  modeLocked,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Host currently holds a playing spot. */
  hostPlays: boolean
  /** Toggle between playing ('player') and watch-only ('spectator'). */
  onModeChange: (mode: 'player' | 'spectator') => void
  /** Disable the toggle (e.g. host never took a spot and the game already started). */
  modeLocked?: boolean
  /** Game-specific rules body (e.g. late-join settings). */
  children?: ReactNode
}) {
  if (!open) return null

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-table-settings-title"
        style={styles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.head}>
          <h3 id="card-table-settings-title" style={styles.title}>
            Game settings
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" style={styles.x}>
            ✕
          </button>
        </div>

        {/* Play as yourself */}
        <div style={styles.toggleRow}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.toggleLabel}>Play as yourself</div>
            <div style={styles.toggleHint}>
              {hostPlays
                ? 'You hold a spot and play your own hand.'
                : 'Host only — you run the room and watch, without playing a hand.'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={hostPlays}
            disabled={modeLocked}
            aria-label="Play as yourself"
            onClick={() => onModeChange(hostPlays ? 'spectator' : 'player')}
            style={{
              ...styles.switch,
              ...(hostPlays ? styles.switchOn : null),
              ...(modeLocked ? styles.switchDisabled : null),
            }}
          >
            <span style={{ ...styles.knob, ...(hostPlays ? styles.knobOn : null) }} />
          </button>
        </div>
        {modeLocked && <p style={styles.lockedNote}>You can only take a spot before the game starts.</p>}

        {children != null && <div style={styles.rules}>{children}</div>}

        <button type="button" onClick={onClose} style={styles.done}>
          Done
        </button>
      </div>
    </div>
  )
}

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20,18,26,.5)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 70,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88dvh',
    overflowY: 'auto',
    background: 'var(--surface)',
    borderRadius: '20px 20px 0 0',
    padding: '20px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
    boxShadow: 'var(--shadow-lg)',
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, margin: 0, color: 'var(--text)' },
  x: {
    border: 'none',
    background: 'transparent',
    fontSize: 18,
    color: 'var(--text-faint)',
    cursor: 'pointer',
    lineHeight: 1,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--surface-sunken)',
  },
  toggleLabel: { fontWeight: 700, fontSize: 14.5, color: 'var(--text)' },
  toggleHint: { fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.4 },
  switch: {
    flexShrink: 0,
    width: 48,
    height: 28,
    borderRadius: 9999,
    border: 'none',
    background: 'var(--border-strong)',
    position: 'relative',
    cursor: 'pointer',
    transition: 'background .18s ease',
    padding: 0,
  },
  switchOn: { background: 'var(--primary)' },
  switchDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  knob: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: 'var(--shadow-sm)',
    transition: 'transform .18s ease',
  },
  knobOn: { transform: 'translateX(20px)' },
  lockedNote: { fontSize: 12, color: 'var(--text-faint)', margin: '8px 2px 0', lineHeight: 1.4 },
  rules: { marginTop: 16 },
  done: {
    width: '100%',
    marginTop: 18,
    border: 'none',
    background: 'var(--primary)',
    color: '#fff',
    font: '700 15px var(--font-sans)',
    borderRadius: 'var(--radius-lg)',
    padding: '13px',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>
