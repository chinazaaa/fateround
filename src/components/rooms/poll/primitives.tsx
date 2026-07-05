'use client'

/**
 * Poll Room — presentational primitives.
 *
 * Ported faithfully from the design system
 * (`ui_kits/rooms/poll/`). Props in, no data fetching, no state beyond
 * trivial local UI. Every class here matches a `.fr-room …` rule already
 * present in `src/app/fate-round-rooms.css`, so no CSS is shipped from
 * this file. The only inline styles are per-slot accent colours that come
 * from the game's vote kit (`c` / `soft`).
 */

import { EyeIcon } from '@/components/rooms/icons'

/* ─── shared shapes ─────────────────────────────────────────────── */

/** A single vote slot as defined in a game's kit (`poll-data.js`). */
export type VoteSlot = {
  /** stable key (e.g. 'smash', 'a', 'num') */
  k: string
  /** emoji or letter badge shown on the chip */
  badge: string
  /** short uppercase-styled label */
  l: string
  /** accent colour (border / text when active) */
  c: string
  /** soft accent colour (background when active) */
  soft: string
}

/* ─── vote inputs ───────────────────────────────────────────────── */

export type VoteSlotsProps = {
  slots: VoteSlot[]
  /** currently-picked slot key */
  value?: string
  /** submitted / read-only */
  locked?: boolean
  onPick?: (k: string) => void
}

/** A row of `.slots > .slot` vote chips (badge + `<small>` label). */
export function VoteSlots({ slots, value, locked, onPick }: VoteSlotsProps) {
  return (
    <div className="slots">
      {slots.map((s) => {
        const on = s.k === value
        return (
          <div
            key={s.k}
            className={'slot' + (on ? ' on' : '') + (locked ? ' locked' : '')}
            style={on ? { background: s.soft, borderColor: s.c } : undefined}
            onClick={locked ? undefined : () => onPick?.(s.k)}
          >
            <span>{s.badge}</span>
            <small style={on ? { color: s.c } : undefined}>{s.l}</small>
          </div>
        )
      })}
    </div>
  )
}

export type VoteButtonsProps = {
  slots: VoteSlot[]
  value?: string
  locked?: boolean
  onPick?: (k: string) => void
}

/** Full-width `.votebtns > .votebtn` pair (`.e` emoji + `.l` label). */
export function VoteButtons({ slots, value, locked, onPick }: VoteButtonsProps) {
  return (
    <div className="votebtns">
      {slots.map((s) => {
        const on = s.k === value
        return (
          <button
            key={s.k}
            type="button"
            className="votebtn"
            disabled={locked}
            style={on ? { borderColor: s.c, background: s.soft } : undefined}
            onClick={locked ? undefined : () => onPick?.(s.k)}
          >
            <span className="e">{s.badge}</span>
            <span className="l">{s.l}</span>
          </button>
        )
      })}
    </div>
  )
}

export type PersonPickerProps = {
  people: string[]
  /** picked person's name */
  value?: string
  locked?: boolean
  onPick?: (name: string) => void
}

/** `.ppick > button > .av / .nm` list (MLT / Who Said This). */
export function PersonPicker({ people, value, locked, onPick }: PersonPickerProps) {
  return (
    <div className="ppick">
      {people.map((name) => (
        <button
          key={name}
          type="button"
          className={name === value ? 'on' : ''}
          disabled={locked}
          onClick={locked ? undefined : () => onPick?.(name)}
        >
          <span className="av">{name.charAt(0)}</span>
          <span className="nm">{name}</span>
        </button>
      ))}
    </div>
  )
}

export type NumberPickerProps = {
  /** highest selectable number (grid is 1..max) */
  max: number
  /** numbers already claimed by others (rendered disabled) */
  taken?: number[]
  /** currently-picked number */
  value?: number
  /** show the big tile as a masked `?` instead of the picked number */
  hiddenTile?: boolean
  locked?: boolean
  onPick?: (n: number) => void
}

/** `.subj-number` big `.numtile` (+ `.numgrid` of 1..max buttons). */
export function NumberPicker({ max, taken = [], value, hiddenTile, locked, onPick }: NumberPickerProps) {
  const nums = Array.from({ length: max }, (_, i) => i + 1)
  return (
    <div className="subj-number">
      <div className={'numtile' + (hiddenTile || value == null ? ' hidden' : '')}>
        {hiddenTile || value == null ? '?' : value}
      </div>
      <div className="numgrid">
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            className={n === value ? 'on' : ''}
            disabled={locked || taken.includes(n)}
            onClick={locked ? undefined : () => onPick?.(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ─── subject blocks (what's being voted on) ────────────────────── */

export type SubjectPerson = {
  name: string
  /** optional right-aligned content (e.g. a <VoteSlots/>) for `.chips` */
  chips?: React.ReactNode
}

export type SubjectPeopleProps = {
  people: SubjectPerson[]
}

/** `.subj.subj-people` list of `.subj-face` (photo initial + name + chips). */
export function SubjectPeople({ people }: SubjectPeopleProps) {
  return (
    <div className="subj subj-people">
      {people.map((p) => (
        <div className="subj-face" key={p.name}>
          <div className="photo">{p.name.charAt(0)}</div>
          <div className="who">{p.name}</div>
          {p.chips != null && <div className="chips">{p.chips}</div>}
        </div>
      ))}
    </div>
  )
}

export type SubjectABOption = {
  /** tag letter, e.g. 'A' / 'B' */
  tag: string
  /** prompt text */
  text: string
  /** tag badge background colour */
  color: string
  /** optional result percentage label (reveal) */
  pct?: string
}

export type SubjectABProps = {
  a: SubjectABOption
  b: SubjectABOption
  /** which option is selected ('a' | 'b') */
  selected?: 'a' | 'b'
  onPick?: (which: 'a' | 'b') => void
}

/** `.subj.subj-ab` — two `.opt` cards (tag / txt / optional pct). */
export function SubjectAB({ a, b, selected, onPick }: SubjectABProps) {
  const opts: Array<{ which: 'a' | 'b'; opt: SubjectABOption }> = [
    { which: 'a', opt: a },
    { which: 'b', opt: b },
  ]
  return (
    <div className="subj subj-ab">
      {opts.map(({ which, opt }) => (
        <button
          key={which}
          type="button"
          className={'opt' + (selected === which ? ' on' : '')}
          onClick={() => onPick?.(which)}
        >
          <span className="tag" style={{ background: opt.color }}>
            {opt.tag}
          </span>
          <span className="txt">{opt.text}</span>
          {opt.pct != null && <span className="pct">{opt.pct}</span>}
        </button>
      ))}
    </div>
  )
}

export type SubjectNumberProps = {
  /** the picked / drawn number, or undefined when still hidden */
  value?: number
  /** force the masked `?` tile even if a value is present */
  hidden?: boolean
}

/** The "hidden number" subject tile (`.subj-number > .numtile`). */
export function SubjectNumber({ value, hidden }: SubjectNumberProps) {
  const masked = hidden || value == null
  return (
    <div className="subj subj-number">
      <div className={'numtile' + (masked ? ' hidden' : '')}>{masked ? '?' : value}</div>
    </div>
  )
}

export type SubjectQuoteProps = {
  /** the quoted text */
  quote: string
  /** attribution / prompt line under the quote */
  by?: string
}

/** `.subj.subj-quote` — `.q` quote + `.by` attribution. */
export function SubjectQuote({ quote, by }: SubjectQuoteProps) {
  return (
    <div className="subj subj-quote">
      <p className="q">{quote}</p>
      {by != null && <p className="by">{by}</p>}
    </div>
  )
}

/* ─── reveal treatments ─────────────────────────────────────────── */

export type TallyRow = {
  label: string
  count: number
  /** bar fill percentage (0–100) */
  pct: number
  /** bar fill colour */
  color: string
}

export type RevealTallyProps = {
  rows: TallyRow[]
}

/** `.tally` of `.trow` rows — anonymous bar tally. */
export function RevealTally({ rows }: RevealTallyProps) {
  return (
    <div className="tally">
      {rows.map((r, i) => (
        <div className="trow" key={r.label + i}>
          <div className="top">
            <span className="lab">{r.label}</span>
            <span className="n">{r.count}</span>
          </div>
          <div className="track">
            <i style={{ width: `${r.pct}%`, background: r.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export type RevealNamedRow = {
  name: string
  /** pill text (e.g. the option they picked) */
  tag: string
  /** pill text colour */
  tagColor?: string
  /** pill background colour */
  tagBg?: string
}

export type RevealNamedProps = {
  rows: RevealNamedRow[]
}

/** `.reveal-list` of `.rev-row` (`.av` initial + `.who` + `.tag` pill). */
export function RevealNamed({ rows }: RevealNamedProps) {
  return (
    <div className="reveal-list">
      {rows.map((r, i) => (
        <div className="rev-row" key={r.name + i}>
          <span className="av">{r.name.charAt(0)}</span>
          <span className="who">{r.name}</span>
          <span className="tag" style={{ color: r.tagColor, background: r.tagBg }}>
            {r.tag}
          </span>
        </div>
      ))}
    </div>
  )
}

export type RevealWinnerProps = {
  /** trophy / target emoji above the headline */
  emoji?: string
  /** eyebrow label, e.g. "Most likely to" */
  label?: string
  /** the winning name */
  winner: string
  /** subline, e.g. "…text their ex at 2am · 6 of 8 votes" */
  subline?: string
}

/**
 * Most-voted winner treatment. The design's page-local `.winner` card was
 * not ported to the app stylesheet, so this renders on the equivalent
 * ported `.pr-finish` block (cup / headline `.win` / subline `.gl`), which
 * carries the same emphasis and accent colour.
 */
export function RevealWinner({ emoji = '🎯', label, winner, subline }: RevealWinnerProps) {
  return (
    <div className="pr-finish">
      <div className="cup">{emoji}</div>
      <h2 className="hl">
        {label ? `${label} ` : ''}
        <span className="win">{winner}</span>
      </h2>
      {subline != null && <p className="gl">{subline}</p>}
    </div>
  )
}

/* ─── room states / chrome bits ─────────────────────────────────── */

export type RoundProgressProps = {
  /** current round number */
  round: number
  /** total rounds (renders as "Round n / total" when present) */
  totalRounds?: number
  /** timer text, e.g. "0:18" */
  timeLabel?: string
  /** flag the timer as running low (turns it red) */
  low?: boolean
  /** progress-bar fill percentage (0–100) */
  pct: number
}

/** `.pr-prog` — round label + timer, plus the `.pr-bar` fill. */
export function RoundProgress({ round, totalRounds, timeLabel, low, pct }: RoundProgressProps) {
  return (
    <div className="pr-prog">
      <div className="pr-prow">
        <span className="rd">
          Round {round}
          {totalRounds != null ? ` / ${totalRounds}` : ''}
        </span>
        {timeLabel != null && <span className={'tm' + (low ? ' low' : '')}>{timeLabel}</span>}
      </div>
      <div className="pr-bar">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export type RoomNoteProps = {
  title: string
  desc?: string
  /** leading emoji (ignored when `pulse` is set) */
  icon?: string
  /** show the animated pulse dot instead of an icon */
  pulse?: boolean
}

/** `.pr-note` banner (`.ic` emoji or `.pulse`, `.t` title, `.d` desc). */
export function RoomNote({ title, desc, icon, pulse }: RoomNoteProps) {
  return (
    <div className="pr-note">
      {pulse ? (
        <span className="pulse">
          <i />
          <i />
        </span>
      ) : (
        icon != null && <span className="ic">{icon}</span>
      )}
      <div>
        <div className="t">{title}</div>
        {desc != null && <div className="d">{desc}</div>}
      </div>
    </div>
  )
}

export type SpecBadgeProps = {
  /** badge text (defaults to "Spectating") */
  label?: string
}

/** `.spec-badge` — the "👁 Spectating" pill. */
export function SpecBadge({ label = 'Spectating' }: SpecBadgeProps) {
  return (
    <span className="spec-badge">
      <EyeIcon />
      {label}
    </span>
  )
}

export type PrToastProps = {
  /** success line text */
  children: React.ReactNode
}

/** `.pr-toast` success line. */
export function PrToast({ children }: PrToastProps) {
  return <div className="pr-toast">{children}</div>
}

export type FinishedBlockProps = {
  /** trophy emoji (defaults to 🏆) */
  emoji?: string
  /** headline text (plain part) */
  title: string
  /** highlighted winner name rendered in accent (`.win`) after the title */
  winner?: string
  /** uppercase subline (`.gl`) */
  subline?: string
}

/** `.pr-finish` — cup + headline (`.win`) + subline (`.gl`). */
export function FinishedBlock({ emoji = '🏆', title, winner, subline }: FinishedBlockProps) {
  return (
    <div className="pr-finish">
      <div className="cup">{emoji}</div>
      <h2 className="hl">
        {title}
        {winner != null && (
          <>
            {' '}
            <span className="win">{winner}</span>
          </>
        )}
      </h2>
      {subline != null && <p className="gl">{subline}</p>}
    </div>
  )
}

export type HostProgressProps = {
  /** total number of players expected to vote */
  total: number
  /** how many have voted so far (fills that many `.dot.done`) */
  done: number
  /** right-aligned status label, e.g. "6 / 8 voted" */
  label: string
}

/** `.host-progress` — `.dots > .dot(.done)` + `.lab`. */
export function HostProgress({ total, done, label }: HostProgressProps) {
  const dots = Array.from({ length: total }, (_, i) => i)
  return (
    <div className="host-progress">
      <div className="dots">
        {dots.map((i) => (
          <span key={i} className={'dot' + (i < done ? ' done' : '')} />
        ))}
      </div>
      <span className="lab">{label}</span>
    </div>
  )
}

export type HostManagePlayer = {
  name: string
  /** has this player voted this round */
  voted?: boolean
  /** watching only (shows nothing kickable state, still listed) */
  spectator?: boolean
}

export type HostManageListProps = {
  players: HostManagePlayer[]
  onKick?: (name: string) => void
}

/** List of `.mrow` (`.av`, `.nm`, `.st.voted/.wait`, `.kick`). */
export function HostManageList({ players, onKick }: HostManageListProps) {
  return (
    <>
      {players.map((p) => (
        <div className="mrow" key={p.name}>
          <span className="av">{p.name.charAt(0)}</span>
          <span className="nm">{p.name}</span>
          <span className={'st' + (p.voted ? ' voted' : ' wait')}>
            {p.spectator ? 'Watching' : p.voted ? 'Voted' : 'Waiting'}
          </span>
          {onKick != null && (
            <button type="button" className="kick" onClick={() => onKick(p.name)}>
              Remove
            </button>
          )}
        </div>
      ))}
    </>
  )
}
