'use client'

import { useState, type CSSProperties } from 'react'
import { PeopleIcon, ShareIcon, KebabIcon, EyeIcon, LinkIcon } from '@/components/rooms/icons'
import { ShareSheet, EditNameSheet, LeaveSheet, EndGameSheet } from '@/components/rooms/sheets'

export type VoiceParticipant = {
  n: string
  host?: boolean
  role?: string
  talking?: boolean
  muted?: boolean
}

export type RoomVoiceBarProps = {
  /** Room code shown in the rail. */
  code?: string
  /** Small caption after the code (e.g. game title). */
  label?: string
  /** Spectator count; hidden when undefined. */
  watching?: number
  participants?: VoiceParticipant[]
  /** Initial shown in the self-mic pill (defaults to first letter of name). */
  you?: string
  /** Your display name. */
  name?: string
  /** You are the host (affects Leave copy + share tabs). */
  host?: boolean
  /** Hide "Leave game" (e.g. chess/checkers use Resign instead). */
  resignOnly?: boolean
  /** You're a spectator (watch-only game controls). Voice join works the
   *  same for everyone — this does NOT put you in the call. */
  spectator?: boolean
  /** Start already connected to voice (e.g. restored session). Default: not
   *  joined — everyone taps "Join voice" first, like the app's AudioChat. */
  inVoice?: boolean
  /** People already in the voice call — shown as a join nudge. */
  presenceCount?: number
  /** Controlled mute state (e.g. LiveKit-driven). Falls back to internal state. */
  muted?: boolean
  /** Open the popovers upward — for a bottom-anchored rail. */
  popUp?: boolean
  /** Show the 👑 Host pill next to the code. */
  hostBadge?: boolean
  /** Render just the right-hand controls (for a desktop logo bar). */
  bare?: boolean
  /** false → share popup shows the invite tab only (player share). */
  onShareHost?: boolean
  /** Host token — enables correct host / host+play links in the share popup. */
  hostToken?: string
  /** Host's player resume token — enables the host+play share link. */
  resumeToken?: string
  /** Host: end the game (shown in the ⋯ menu, below Join/Leave voice chat). */
  onEndGame?: () => void
  /** Fired when the user taps to join the voice call. */
  onJoinVoice?: () => void
  /** Fired when the user leaves the voice call (but stays in the game). */
  onLeaveVoice?: () => void
  /** Fired when the user mutes/unmutes (true = now muted). */
  onToggleMute?: (muted: boolean) => void
  onLeave?: () => void
  onEditName?: (name: string) => void
}

const CODE = 'F8K2QP'

/**
 * The built-in voice-chat rail every game room shares — room code, spectator
 * count, Players & voice popover, Share, ⋯ account menu (edit name / leave),
 * and the self-mic pill. Ported from the design system's `ROOMS.VoiceBar`.
 */
export function RoomVoiceBar(props: RoomVoiceBarProps) {
  const [open, setOpen] = useState(false)
  const [internalMuted, setInternalMuted] = useState(false)
  const [share, setShare] = useState(false)
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [ending, setEnding] = useState(false)
  const [internalJoined, setInternalJoined] = useState(!!props.inVoice)
  const [yourName, setYourName] = useState(props.name || 'You')

  const people = props.participants || []
  const you = props.you || (yourName ? yourName[0] : 'Y')
  // Voice is never auto-joined — everyone (player or spectator) taps "Join
  // voice" first, matching the app's AudioChat flow. `inVoice`/`muted` can be
  // controlled from outside (LiveKit) or fall back to internal state.
  const inVoice = props.inVoice !== undefined ? props.inVoice : internalJoined
  const muted = props.muted ?? internalMuted
  const presence = props.presenceCount || 0
  const popStyle = props.popUp ? { ...peoplePop, top: 'auto' as const, bottom: 40 } : peoplePop

  const right = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        position: 'relative',
        marginLeft: props.bare ? 12 : 'auto',
      }}
    >
      {typeof props.watching === 'number' && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-faint)',
          }}
        >
          <EyeIcon size={15} />
          {props.watching}
        </span>
      )}
      <button
        style={vIconBtn}
        title="Players & voice"
        aria-label="Players and voice"
        onClick={() => {
          setOpen((o) => !o)
          setMenu(false)
        }}
      >
        <PeopleIcon />
      </button>
      <button style={vIconBtn} title="Share / QR" aria-label="Share" onClick={() => setShare(true)}>
        <ShareIcon />
      </button>
      <button
        style={vIconBtn}
        title="More"
        aria-label="More options"
        onClick={() => {
          setMenu((m) => !m)
          setOpen(false)
        }}
      >
        <KebabIcon />
      </button>
      <button
        style={{ ...mePill, ...(!inVoice ? mePillSpec : muted ? mePillMuted : mePillLive) }}
        title={
          !inVoice
            ? presence > 0
              ? `Join voice chat — ${presence} already in the call`
              : 'Join voice chat'
            : muted
              ? 'Tap to unmute'
              : 'Tap to mute'
        }
        onClick={() => {
          if (!inVoice) {
            setInternalJoined(true)
            setInternalMuted(false)
            props.onJoinVoice?.()
          } else {
            const next = !muted
            setInternalMuted(next)
            props.onToggleMute?.(next)
          }
        }}
      >
        <span style={mePillAv}>{you}</span>
        {!inVoice ? (
          <span style={{ font: '700 11px var(--font-sans)', color: 'var(--text)', whiteSpace: 'nowrap' }}>
            🎙️ Join voice
            {presence > 0 && <span style={{ color: 'var(--success)' }}> · {presence}</span>}
          </span>
        ) : (
          <span
            style={{
              font: '700 11px var(--font-sans)',
              color: muted ? 'var(--danger)' : 'var(--success)',
              whiteSpace: 'nowrap',
            }}
          >
            {muted ? '🔇 Muted' : `🎙️ ${yourName}`}
          </span>
        )}
      </button>

      {open && (
        <div style={popStyle} onMouseLeave={() => setOpen(false)}>
          <p style={popTitle}>In the room · voice</p>
          {people.map((p) => {
            const st = p.muted ? '🔇' : p.talking ? '🗣️' : '🎙️'
            return (
              <div key={p.n} style={popRow}>
                <span style={popAv}>{p.n[0]}</span>
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', flex: 1 }}>
                  {p.n}
                  {p.host ? ' 👑' : ''}
                  {p.role ? ' · ' + p.role : ''}
                </span>
                <span
                  style={{ fontSize: 13, filter: p.talking ? 'none' : 'grayscale(1)', opacity: p.talking ? 1 : 0.8 }}
                >
                  {st}
                </span>
              </div>
            )
          })}
          <div style={popFoot}>🎙️ live · 🗣️ talking · 🔇 muted</div>
        </div>
      )}
      {menu && (
        <div style={{ ...popStyle, width: 190, padding: 6 }} onMouseLeave={() => setMenu(false)}>
          <button
            style={menuItem}
            onClick={() => {
              setMenu(false)
              setEditing(true)
            }}
          >
            ✏️&nbsp;&nbsp;Edit your name
          </button>
          {/* Voice is join-first; the call can be joined or left from here too
              (the mic pill only toggles mute once you're in). */}
          {inVoice ? (
            <button
              style={menuItem}
              onClick={() => {
                setMenu(false)
                setInternalJoined(false)
                props.onLeaveVoice?.()
              }}
            >
              🔇&nbsp;&nbsp;Leave voice chat
            </button>
          ) : (
            <button
              style={menuItem}
              onClick={() => {
                setMenu(false)
                setInternalJoined(true)
                setInternalMuted(false)
                props.onJoinVoice?.()
              }}
            >
              🎙️&nbsp;&nbsp;Join voice chat
            </button>
          )}
          {/* The host runs the game — they End it (never "leave"); players leave. */}
          {props.host && props.onEndGame ? (
            <button
              style={{ ...menuItem, color: 'var(--danger)' }}
              onClick={() => {
                setMenu(false)
                setEnding(true)
              }}
            >
              🛑&nbsp;&nbsp;End game
            </button>
          ) : !props.resignOnly && !props.host ? (
            <button
              style={{ ...menuItem, color: 'var(--danger)' }}
              onClick={() => {
                setMenu(false)
                setLeaving(true)
              }}
            >
              🚪&nbsp;&nbsp;Leave game
            </button>
          ) : null}
        </div>
      )}
    </div>
  )

  const sheets = (
    <>
      {/* Host share panel (Host + play tabs) only for actual hosts. `onShareHost`
          overrides when set (e.g. the design desktop bar passes false); otherwise
          fall back to whether this bar is mounted in host mode — so plain players
          never see the host panel. */}
      <ShareSheet
        open={share}
        onClose={() => setShare(false)}
        host={props.onShareHost ?? !!props.host}
        code={props.code}
        hostToken={props.hostToken}
        resumeToken={props.resumeToken}
      />
      <EndGameSheet
        open={ending}
        onClose={() => setEnding(false)}
        onConfirm={() => {
          setEnding(false)
          props.onEndGame?.()
        }}
      />
      <EditNameSheet
        open={editing}
        name={yourName}
        onClose={() => setEditing(false)}
        onSave={(n) => {
          setYourName(n)
          props.onEditName?.(n)
        }}
      />
      <LeaveSheet
        open={leaving}
        host={props.host}
        onClose={() => setLeaving(false)}
        onConfirm={props.onLeave || (() => {})}
      />
    </>
  )

  if (props.bare) {
    return (
      <>
        {right}
        {sheets}
      </>
    )
  }

  return (
    <div style={vbar}>
      <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>
        <LinkIcon size={15} />
      </span>
      <span style={vcode}>{props.code || CODE}</span>
      {props.label && (
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>· {props.label}</span>
      )}
      {props.hostBadge && <span style={vHostTag}>👑 Host</span>}
      {right}
      {sheets}
    </div>
  )
}

const vbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  padding: '11px 14px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface)',
}
const vcode: CSSProperties = { font: '700 13px var(--font-mono)', letterSpacing: '.1em', color: 'var(--text)' }
const vHostTag: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  font: '700 9px var(--font-sans)',
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--primary-strong)',
  background: 'var(--primary-soft)',
  borderRadius: 9999,
  padding: '4px 8px',
}
const vIconBtn: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: '1.5px solid var(--border-strong)',
  background: 'var(--surface)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--text)',
  padding: 0,
}
const mePill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px 3px 3px',
  borderRadius: 9999,
  border: '1.5px solid var(--border-strong)',
  background: 'var(--surface)',
  cursor: 'pointer',
}
const mePillLive: CSSProperties = { borderColor: 'var(--success)' }
const mePillMuted: CSSProperties = { borderColor: 'var(--danger)', background: 'var(--danger-soft)' }
const mePillSpec: CSSProperties = { borderColor: 'var(--border-strong)', background: 'var(--surface-sunken)' }
const mePillAv: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: 'var(--primary-soft)',
  color: 'var(--primary-strong)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  font: '800 11px var(--font-display)',
}
const menuItem: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  font: '600 13px var(--font-sans)',
  color: 'var(--text)',
  padding: '9px 10px',
  borderRadius: 9,
  cursor: 'pointer',
}
const peoplePop: CSSProperties = {
  position: 'absolute',
  top: 40,
  right: 0,
  width: 250,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  boxShadow: 'var(--shadow-lg)',
  padding: 10,
  zIndex: 40,
}
const popTitle: CSSProperties = {
  font: '700 10px var(--font-sans)',
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: 'var(--text-faint)',
  margin: '2px 2px 8px',
}
const popRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 9, padding: '6px 6px' }
const popAv: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: 'var(--primary-soft)',
  color: 'var(--primary-strong)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  font: '800 11px var(--font-display)',
  flexShrink: 0,
}
const popFoot: CSSProperties = {
  borderTop: '1px solid var(--border)',
  margin: '6px 2px 0',
  paddingTop: 8,
  font: '600 10.5px var(--font-sans)',
  color: 'var(--text-faint)',
  textAlign: 'center',
}
