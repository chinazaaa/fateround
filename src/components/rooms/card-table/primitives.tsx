'use client'

/**
 * Card Table Room — presentational primitives (Whot + Crazy Eights).
 *
 * Ported faithfully from the design system ("Card Table" kit —
 * `Player · Mobile.html` + the Pick-out deck sheets). Props in, no data
 * fetching, no state beyond trivial local UI. Every class here matches a
 * `.fr-room …` rule already present in `src/app/fate-round-cardtable.css`,
 * so no CSS ships from this file.
 *
 * Whot + Crazy Eights share the table shell (piles / hand / turn rail); only
 * the `.pc` card face differs. The faces reuse the games' own icon
 * components (`WhotShapeIcon`, `CRAZY8_SUIT_SYMBOLS`) so they stay in sync
 * with the game rules — the design's emoji faces are the reference, the
 * app's canonical glyphs are the source of truth.
 */

import type { ReactNode } from 'react'
import { WhotShapeIcon } from '@/components/whot/WhotShapeIcon'
import { CRAZY8_SUIT_SYMBOLS } from '@/lib/crazy-eights'
import type { CrazyEightsCard, WhotCard as WhotCardType } from '@/types'

/* ─── Whot card face ────────────────────────────────────────────── */

export type WhotCardFaceProps = {
  card: WhotCardType
  /** highlight as selected (raised) */
  sel?: boolean
  /** dimmed / not playable */
  dim?: boolean
  /** large size (discard top / pickers) */
  big?: boolean
  /** playable ring highlight */
  playable?: boolean
  onClick?: () => void
}

/**
 * A single Whot `.pc` face. WHOT wilds get the rose `.whot` treatment; every
 * other card shows its shape glyph in `.mid` with number + small glyph in the
 * corners. The shape glyph is the app's canonical SVG (`WhotShapeIcon`).
 */
export function WhotCardFace({ card, sel, dim, big, playable, onClick }: WhotCardFaceProps) {
  const isWhot = card.shape === 'whot' || card.number === 20
  const cls =
    'pc' +
    (big ? ' lg' : '') +
    (sel ? ' sel' : '') +
    (dim ? ' dim' : '') +
    (playable ? ' playable' : '') +
    (isWhot ? ' whot' : '')

  if (isWhot) {
    return (
      <div className={cls} onClick={onClick}>
        <span className="c tl">20</span>
        <div className="mid">WHOT</div>
        <span className="c br">20</span>
      </div>
    )
  }
  const glyphSize = big ? 'lg' : 'md'
  return (
    <div className={cls} onClick={onClick}>
      <span className="c tl">
        {card.number}
        <WhotShapeIcon shape={card.shape} size="sm" />
      </span>
      <div className="mid">
        <WhotShapeIcon shape={card.shape} size={glyphSize} />
      </div>
      <span className="c br">
        {card.number}
        <WhotShapeIcon shape={card.shape} size="sm" />
      </span>
    </div>
  )
}

/* ─── Crazy Eights card face ────────────────────────────────────── */

const CRAZY8_RANK_LABELS: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }

function crazy8RankLabel(card: CrazyEightsCard): string {
  if (card.suit === 'joker') return 'JOKER'
  return CRAZY8_RANK_LABELS[card.rank] ?? String(card.rank)
}

export type CrazyCardFaceProps = {
  card: CrazyEightsCard
  sel?: boolean
  dim?: boolean
  big?: boolean
  playable?: boolean
  onClick?: () => void
}

/**
 * A single Crazy Eights `.pc` face. Hearts/diamonds render `.red`; the wild 8
 * (and Jokers) get the `.wild` ring. Corners carry rank + suit glyph.
 */
export function CrazyCardFace({ card, sel, dim, big, playable, onClick }: CrazyCardFaceProps) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  const wild = card.rank === 8 || card.suit === 'joker'
  const glyph = CRAZY8_SUIT_SYMBOLS[card.suit]
  const label = crazy8RankLabel(card)
  const cls =
    'pc' +
    (red ? ' red' : '') +
    (big ? ' lg' : '') +
    (wild ? ' wild' : '') +
    (sel ? ' sel' : '') +
    (dim ? ' dim' : '') +
    (playable ? ' playable' : '')

  if (card.suit === 'joker') {
    return (
      <div className={cls} onClick={onClick} style={{ color: '#7c3aed' }}>
        <span className="c tl">🃏</span>
        <div className="mid">🃏</div>
        <span className="c br">🃏</span>
      </div>
    )
  }
  return (
    <div className={cls} onClick={onClick}>
      <span className="c tl">
        {label}
        <small>{glyph}</small>
      </span>
      <div className="mid">{glyph}</div>
      <span className="c br">
        {label}
        <small>{glyph}</small>
      </span>
    </div>
  )
}

/* ─── card back / draw pile ─────────────────────────────────────── */

export type CardBackProps = {
  /** accent colour of the back (game deck accent) */
  accent?: string
  big?: boolean
  thin?: boolean
}

/** A single face-down `.pc.back` card. */
export function CardBack({ accent, big, thin }: CardBackProps) {
  return (
    <div
      className={'pc back' + (big ? ' lg' : '') + (thin ? ' thin' : '')}
      style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
    />
  )
}

export type DrawPileProps = {
  /** cards remaining in the draw pile (badge). null hides the count */
  count?: number | null
  accent?: string
  big?: boolean
}

/** `.drawpile` — a stacked pair of card backs with an optional count badge. */
export function DrawPile({ count, accent, big }: DrawPileProps) {
  return (
    <div className="drawpile">
      <CardBack accent={accent} big={big} />
      <div
        className={'pc back b2' + (big ? ' lg' : '')}
        style={accent ? ({ '--accent': accent } as React.CSSProperties) : undefined}
      />
      {count != null && <span className="cnt">{count}</span>}
    </div>
  )
}

/* ─── piles (draw + discard) ────────────────────────────────────── */

export type PilesProps = {
  /** label + draw pile (usually a <DrawPile/>) */
  draw: ReactNode
  /** the discard-top card (a <WhotCardFace big/> or <CrazyCardFace big/>) */
  discard: ReactNode
}

/** `.piles` — Draw pile on the left, Discard top on the right. */
export function Piles({ draw, discard }: PilesProps) {
  return (
    <div className="piles">
      <div className="pile">
        <span className="lab">Draw</span>
        {draw}
      </div>
      <div className="pile">
        <span className="lab">Discard</span>
        {discard}
      </div>
    </div>
  )
}

/* ─── turn rail (seats across the top) ──────────────────────────── */

export type TurnSeat = {
  /** display name */
  name: string
  /** number of cards in hand (badge) */
  cards?: number
  /** is it this seat's turn */
  turn?: boolean
  /** this is the viewer's own seat → shows a "(you)" tag */
  you?: boolean
  /** show the host crown */
  host?: boolean
  /** per-turn countdown chip (e.g. "0:18") — only rendered on the active seat */
  timeLabel?: string
  /** flag the countdown as running low (turns it red) */
  timeLow?: boolean
}

export type TurnRailProps = {
  seats: TurnSeat[]
}

/**
 * `.turnrail` — a horizontal strip of seats; the active seat is ringed and
 * carries the per-turn countdown chip (`.seat-timer`, mono digits, red when
 * low) so the current player's remaining time is always visible.
 */
export function TurnRail({ seats }: TurnRailProps) {
  return (
    <div className="turnrail">
      {seats.map((s, i) => (
        <div className={'seat' + (s.turn ? ' turn' : '')} key={s.name + i}>
          <div className="sav">
            {s.name.charAt(0).toUpperCase()}
            {s.cards != null && <span className="cc">{s.cards}</span>}
          </div>
          <span className="nm">
            {s.name}
            {s.you ? ' (you)' : ''}
            {s.host ? ' 👑' : ''}
          </span>
          {s.turn && s.timeLabel != null && (
            <span className={'seat-timer' + (s.timeLow ? ' low' : '')}>{s.timeLabel}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export type GameTimerBarProps = {
  /** countdown label, e.g. "4:12" */
  label: string
  /** progress-bar fill percentage (0–100) — proportion of game time remaining */
  pct: number
  /** flag the timer as running low (turns the number red) */
  low?: boolean
}

/**
 * `.pr-prog` game-duration bar (reused from the poll room chrome): an eyebrow
 * label + mono countdown (`.tm`, red when low) over the `.pr-bar` fill.
 * Rendered at the top of the play surface when the game has a time limit.
 */
export function GameTimerBar({ label, pct, low }: GameTimerBarProps) {
  return (
    <div className="pr-prog">
      <div className="pr-prow">
        <span className="rd">Game time</span>
        <span className={'tm' + (low ? ' low' : '')}>{label}</span>
      </div>
      <div className="pr-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ─── spectator seat list (watch-only) ──────────────────────────── */

export type SpecSeat = {
  name: string
  /** number of cards in hand */
  cards?: number
  /** is it this seat's turn (ringed + "Playing…" tag) */
  turn?: boolean
  host?: boolean
}

export type SpecSeatsProps = {
  seats: SpecSeat[]
}

/** `.spec-seats` — the watch-only roster (one `.spec-row` per player). */
export function SpecSeats({ seats }: SpecSeatsProps) {
  return (
    <div className="spec-seats">
      {seats.map((s, i) => (
        <div className={'spec-row' + (s.turn ? ' turn' : '')} key={s.name + i}>
          <div className="sav">{s.name.charAt(0).toUpperCase()}</div>
          <span className="nm">
            {s.name}
            {s.host ? ' 👑' : ''}
          </span>
          {s.turn && <span className="tag">Playing…</span>}
          {s.cards != null && <span className="cc">{s.cards} cards</span>}
        </div>
      ))}
    </div>
  )
}

/* ─── surface wrapper ───────────────────────────────────────────── */

export type CardTableSurfaceProps = {
  children: ReactNode
}

/**
 * `.ct-surface` — the play-surface column. Fills its parent (the room shell's
 * `.pr-stage`, which is a bounded flex column with no scroll on mobile) so the
 * pinned turn rail + hand stay on-screen and the felt scrolls between them.
 */
export function CardTableSurface({ children }: CardTableSurfaceProps) {
  return <div className="ct-surface">{children}</div>
}

/* ─── table shell + status / toasts ─────────────────────────────── */

export type TableProps = {
  children: ReactNode
  /** override the centred layout (e.g. the finish screen aligns to top) */
  top?: boolean
}

/** `.table` — the felt: centred piles + status, or top-aligned content. */
export function Table({ children, top }: TableProps) {
  return (
    <div className="table" style={top ? { justifyContent: 'flex-start', paddingTop: 24 } : undefined}>
      {children}
    </div>
  )
}

export type TurnStatusProps = {
  children: ReactNode
  /** render the whole line in the muted "spectating" grey */
  muted?: boolean
}

/** `.turn-status` line under the piles. */
export function TurnStatus({ children, muted }: TurnStatusProps) {
  return <p className={'turn-status' + (muted ? ' g' : '')}>{children}</p>
}

export type ActionToastProps = {
  children: ReactNode
  /** tone: ok (green) · warn (amber) · hot (red) */
  tone?: 'ok' | 'warn' | 'hot'
}

/** `.act-toast` pill (pick-2 stack, last card, wild call, played card…). */
export function ActionToast({ children, tone = 'ok' }: ActionToastProps) {
  return <div className={'act-toast ' + tone}>{children}</div>
}

/* ─── hand ──────────────────────────────────────────────────────── */

export type HandProps = {
  /** the card faces (already mapped from data) */
  children: ReactNode
  /** number of cards, for the header count */
  count: number
  /** a big hand → scrolls horizontally + tightens overlap */
  many?: boolean
  /** hint line under the hand (e.g. "Tap a highlighted card…") */
  hint?: ReactNode
  /** the draw / pass action row */
  actions?: ReactNode
}

/** `.hand-wrap` — header + fanned `.hand` + hint + `.hand-actions`. */
export function Hand({ children, count, many, hint, actions }: HandProps) {
  return (
    <div className="hand-wrap">
      <div className="hand-head">
        <span className="hl">Your hand</span>
        <span className="cnt">
          {count} card{count === 1 ? '' : 's'}
        </span>
      </div>
      <div className={'hand' + (many ? ' scroll tight' : '')}>{children}</div>
      {hint != null && <p className="hand-hint">{hint}</p>}
      {actions != null && <div className="hand-actions">{actions}</div>}
    </div>
  )
}

/* ─── picker overlay (WHOT shape/number · Crazy 8 suit) ──────────── */

export type PickerOverlayProps = {
  title: string
  desc?: string
  /** dismiss when tapping the scrim */
  onClose?: () => void
  children: ReactNode
}

/** `.picker-back` scrim + bottom-sheet `.picker`. */
export function PickerOverlay({ title, desc, onClose, children }: PickerOverlayProps) {
  return (
    <div className="picker-back" onClick={onClose}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {desc != null && <p>{desc}</p>}
        {children}
      </div>
    </div>
  )
}

export type PickerTabsProps = {
  tabs: { k: string; label: string }[]
  value: string
  onPick: (k: string) => void
}

/** `.picker-tabs` — the Shape / Number segmented control. */
export function PickerTabs({ tabs, value, onPick }: PickerTabsProps) {
  return (
    <div className="picker-tabs">
      {tabs.map((t) => (
        <button key={t.k} type="button" className={value === t.k ? 'on' : ''} onClick={() => onPick(t.k)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export type PickerGridProps = {
  children: ReactNode
  /** numeric grid variant (smaller square tiles) */
  nums?: boolean
}

/** `.picker-grid` — the row of shape / suit / number tiles. */
export function PickerGrid({ children, nums }: PickerGridProps) {
  return <div className={'picker-grid' + (nums ? ' nums' : '')}>{children}</div>
}
