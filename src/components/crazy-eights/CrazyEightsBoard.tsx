'use client'

import { useState } from 'react'
import type { CrazyEightsCard as CrazyEightsCardType, CrazyEightsCalledSuit, CrazyEightsSuit } from '@/types'
import {
  CRAZY8_SUITS,
  CRAZY8_SUIT_LABELS,
  CRAZY8_SUIT_SYMBOLS,
  canPlayCard,
  getNormalizedPenalties,
  isCrazyEightsPlayerOut,
  isWildCard,
  parseCrazyEightsRules,
  specialCardShortLabel,
  type CrazyEightsRules,
} from '@/lib/crazy-eights'
import type { CrazyEightsSession } from '@/types'
import {
  CrazyEightsCard as CrazyEightsCardShell,
  CrazyEightsTurnBar,
} from '@/components/crazy-eights/CrazyEightsChrome'
import { CrazyEightsSuitIcon } from '@/components/crazy-eights/CrazyEightsSuitIcon'

/** Cards shown in the hand before it collapses behind a "+N more" toggle. */
const HAND_DISPLAY_LIMIT = 10

/**
 * Card-face gradients per suit. Classic playing-card look: clean light faces so the
 * black (spades/clubs) and red (hearts/diamonds) pips read with strong contrast.
 * Jokers get a solid violet face (white pips).
 */
const SUIT_COLORS: Record<CrazyEightsSuit, string> = {
  spades: 'from-slate-50 to-slate-200 border-slate-300',
  clubs: 'from-slate-50 to-slate-200 border-slate-300',
  hearts: 'from-rose-50 to-rose-100 border-rose-300',
  diamonds: 'from-rose-50 to-rose-100 border-rose-300',
  joker: 'from-fuchsia-500 to-purple-600 border-fuchsia-300',
}

/** Wild cards (the 8 and Jokers) get a distinct solid-violet face with white pips. */
const WILD_COLORS = 'from-violet-500 to-purple-600 border-violet-300'

const RANK_NAMES: Record<number, string> = {
  1: 'Ace',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
}

/** Spoken accessible name for a card (the suit icon is aria-hidden). */
function cardAriaLabel(card: CrazyEightsCardType): string {
  if (card.suit === 'joker') return 'Joker'
  return `${RANK_NAMES[card.rank] ?? card.rank} of ${CRAZY8_SUIT_LABELS[card.suit]}`
}

function directionGlyph(direction: number): string {
  return direction < 0 ? '↺' : '↻'
}

export function CrazyEightsPlayingCard({
  card,
  onClick,
  playable,
  selected,
  size = 'md',
}: {
  card: CrazyEightsCardType
  onClick?: () => void
  playable?: boolean
  selected?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const wild = isWildCard(card)
  const label = specialCardShortLabel(card, parseCrazyEightsRules(null))
  const sizeStyles =
    size === 'lg'
      ? { box: 'w-20 min-h-[7.25rem] py-2 px-1', icon: 'lg' as const, num: 'text-lg', badge: 'text-[8px]' }
      : size === 'sm'
        ? { box: 'w-12 min-h-[4rem] py-1 px-0.5', icon: 'sm' as const, num: 'text-xs', badge: 'text-[6px]' }
        : { box: 'w-[4.25rem] min-h-[6rem] py-1.5 px-1', icon: 'md' as const, num: 'text-sm', badge: 'text-[7px]' }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${cardAriaLabel(card)}${playable === false ? ', not playable' : ''}`}
      className={[
        'relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-linear-to-br font-black transition-all overflow-hidden',
        sizeStyles.box,
        wild ? WILD_COLORS : SUIT_COLORS[card.suit],
        onClick && playable !== false
          ? 'cursor-pointer hover:scale-105 hover:shadow-lg active:scale-95 ring-2 ring-(--primary)/70'
          : '',
        onClick && playable === false ? 'opacity-40 cursor-not-allowed' : '',
        selected ? 'ring-2 ring-(--primary) scale-105' : '',
        !onClick ? 'cursor-default' : '',
      ].join(' ')}
    >
      <CrazyEightsSuitIcon card={card} size={sizeStyles.icon} variant="on-card" />
      {label && size !== 'sm' && (
        <span
          className={[
            'mt-0.5 max-w-full truncate rounded px-1 py-0.5 font-bold uppercase tracking-wide leading-tight',
            'text-white bg-slate-900/75',
            sizeStyles.badge,
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </button>
  )
}

export function CrazyEightsTable({
  session,
  players,
  myPlayerId,
  handCounts,
  turnPlayerName,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgent,
  showStandings = true,
}: {
  session: CrazyEightsSession
  players: { id: string; name: string; spectator?: boolean | null }[]
  myPlayerId: string | null
  handCounts: Record<string, number>
  turnPlayerName?: string
  isMyTurn?: boolean
  secondsLeft?: number
  hasTimer?: boolean
  urgent?: boolean
  showStandings?: boolean
}) {
  const top = session.top_card
  const drawCount = (session.draw_pile as unknown[])?.length ?? 0
  const discardCount = (session.discard_pile as unknown[])?.length ?? 0
  const { pickTwo, jokerPenalty } = getNormalizedPenalties(session)

  return (
    <CrazyEightsCardShell className="p-4 space-y-4">
      {(turnPlayerName != null || isMyTurn != null || hasTimer) && (
        <CrazyEightsTurnBar
          isMyTurn={isMyTurn}
          turnName={turnPlayerName}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer}
          urgent={urgent}
        />
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          Draw pile: {drawCount}
          {drawCount === 0 && discardCount > 0 ? ' (reshuffles from played cards)' : ''}
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 font-bold text-(--primary)"
            title={session.direction < 0 ? 'Play reversed' : 'Play forward'}
          >
            <span className="text-base leading-none">{directionGlyph(session.direction)}</span>
            {session.direction < 0 ? 'Reversed' : 'Forward'}
          </span>
          {pickTwo > 0 && <span className="font-bold text-orange-400">Pick 2 active ({pickTwo} to draw)</span>}
          {jokerPenalty > 0 && <span className="font-bold text-red-400">Joker — draw {jokerPenalty}</span>}
        </span>
      </div>

      {session.required_suit && (
        <p className="text-center text-sm font-bold text-(--primary)">
          Must match: {CRAZY8_SUIT_LABELS[session.required_suit]} {CRAZY8_SUIT_SYMBOLS[session.required_suit]} — or play
          an 8 / Joker to name a new suit
        </p>
      )}

      <div className="flex items-center justify-center gap-6 py-2">
        <div className="text-center">
          <svg viewBox="0 0 56 80" width="56" height="80" className="rounded-xl overflow-hidden" aria-hidden>
            <defs>
              <pattern
                id="card-back-hatch"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="6" stroke="#2a3a5a" strokeWidth="1.5" />
              </pattern>
            </defs>
            <rect width="56" height="80" rx="10" fill="url(#card-back-hatch)" stroke="#2a3a5a" strokeWidth="1" />
            <rect x="3" y="3" width="50" height="74" rx="8" fill="none" stroke="#2a4a7a" strokeWidth="1.5" />
            <polygon points="28,24 36,40 28,56 20,40" fill="none" stroke="#3a5a9a" strokeWidth="1.5" />
            <circle cx="28" cy="40" r="3" fill="#3a5a9a" opacity="0.7" />
          </svg>
          <p className="text-[10px] text-muted mt-1">{drawCount} left</p>
        </div>
        {top ? (
          <div className="text-center">
            <CrazyEightsPlayingCard card={top} size="lg" />
            <p className="text-[10px] text-muted mt-1">Top card</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No top card</p>
        )}
      </div>

      {session.status_message && (
        <p className="text-center text-sm text-muted border-t border-(--border) pt-3">{session.status_message}</p>
      )}

      {showStandings && (
        <div className="border-t border-(--border) pt-3">
          <CrazyEightsStandings session={session} players={players} myPlayerId={myPlayerId} handCounts={handCounts} />
        </div>
      )}
    </CrazyEightsCardShell>
  )
}

/**
 * The "Still playing" / "Watching" roster. Split out of CrazyEightsTable so the
 * active-player view can place it BELOW the player's own hand and draw button — the hand
 * is what you act on, so it should sit above the standings rather than below the board.
 */
export function CrazyEightsStandings({
  session,
  players,
  myPlayerId,
  handCounts,
  gridClassName = 'grid-cols-2 sm:grid-cols-3',
}: {
  session: CrazyEightsSession
  players: { id: string; name: string; spectator?: boolean | null }[]
  myPlayerId: string | null
  handCounts: Record<string, number>
  // Column layout for the player rows. Defaults to the wide grid; the desktop
  // sidebar passes a single-column list so it reads like the trivia leaderboard.
  gridClassName?: string
}) {
  const turnId = session.turn_order[session.current_turn_index]
  const activePlayers = players.filter((p) => !isCrazyEightsPlayerOut(handCounts[p.id] ?? 0, p.spectator))
  const watchingPlayers = players.filter((p) => isCrazyEightsPlayerOut(handCounts[p.id] ?? 0, p.spectator))

  const finishOrder = session.finish_order ?? []

  function renderPlayerRow(p: { id: string; name: string; spectator?: boolean | null }, watching: boolean) {
    const count = handCounts[p.id] ?? 0
    const isTurn = !watching && p.id === turnId
    const isMe = p.id === myPlayerId
    // Players who emptied their hand are in finish_order (the rest of the "watching"
    // group are pure viewers who never played). Show their finishing place — the first
    // out is the winner.
    const finishIdx = finishOrder.indexOf(p.id)
    const finished = finishIdx >= 0
    const place = finishIdx + 1
    const placeLabel = finishIdx === 0 ? '🏆 Winner' : `${place}${place === 2 ? 'nd' : place === 3 ? 'rd' : 'th'}`

    return (
      <div
        key={p.id}
        className={[
          'rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2',
          watching
            ? 'border border-dashed border-(--border-strong) bg-(--surface-inset-bg)/60 opacity-75'
            : isTurn
              ? 'bg-(--primary)/15 border border-(--primary)/40 font-bold'
              : 'bg-(--surface-inset-bg)',
        ].join(' ')}
      >
        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
          <span className="truncate">
            {p.name}
            {isMe ? ' (you)' : ''}
          </span>
          {isTurn && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--marry)_20%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-(--marry)">
              Turn
            </span>
          )}
          {finished ? (
            <span
              className={[
                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                finishIdx === 0
                  ? 'bg-[color-mix(in_srgb,var(--marry)_22%,transparent)] text-(--marry)'
                  : 'bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-muted',
              ].join(' ')}
            >
              {placeLabel}
            </span>
          ) : (
            watching && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                Watching
              </span>
            )
          )}
        </div>
        <span className="text-muted ml-2 shrink-0 tabular-nums">
          {finished ? (finishIdx === 0 ? '🏆' : '👀') : watching ? '👀' : `${count} 🃏`}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {activePlayers.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Still playing</p>
          <div className={`grid ${gridClassName} gap-2`}>{activePlayers.map((p) => renderPlayerRow(p, false))}</div>
        </div>
      )}
      {watchingPlayers.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Watching</p>
          <div className={`grid ${gridClassName} gap-2`}>{watchingPlayers.map((p) => renderPlayerRow(p, true))}</div>
        </div>
      )}
    </div>
  )
}

export function CrazyEightsHand({
  cards,
  session,
  onPlay,
  acting,
  rules,
}: {
  cards: CrazyEightsCardType[]
  session: CrazyEightsSession
  onPlay: (cardId: string) => void
  acting: boolean
  rules?: CrazyEightsRules
}) {
  const crazyEightsRules = rules ?? parseCrazyEightsRules(null)
  const [expanded, setExpanded] = useState(false)
  if (cards.length === 0) {
    return (
      <CrazyEightsCardShell className="p-4 text-center text-sm text-muted">
        You&apos;re out — watch the rest of the game from here.
      </CrazyEightsCardShell>
    )
  }

  const decorated = cards.map((card) => ({
    card,
    playable: canPlayCard(card, session, crazyEightsRules) && session.phase === 'playing',
  }))
  // A big hand makes the page very tall, so collapse it past a limit. The visible set
  // keeps the first N cards AND every playable card — so you never have to expand to make
  // a move; only extra non-playable cards get tucked behind the "+N more" toggle.
  const canCollapse = decorated.length > HAND_DISPLAY_LIMIT
  let visible = decorated
  if (canCollapse && !expanded) {
    const shown = new Set(decorated.slice(0, HAND_DISPLAY_LIMIT).map((d) => d.card.id))
    for (const d of decorated) if (d.playable) shown.add(d.card.id)
    visible = decorated.filter((d) => shown.has(d.card.id))
  }
  const hiddenCount = decorated.length - visible.length

  return (
    <CrazyEightsCardShell className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Your hand · {cards.length}</p>
        {canCollapse && (expanded || hiddenCount > 0) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full border border-(--border-strong) bg-(--surface-inset-bg) px-3 py-1 text-xs font-semibold text-muted hover:bg-(--primary)/10"
          >
            {expanded ? 'Show less' : `+${hiddenCount} more`}
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {visible.map(({ card, playable }) => (
          <CrazyEightsPlayingCard
            key={card.id}
            card={card}
            playable={playable}
            onClick={playable && !acting ? () => onPlay(card.id) : undefined}
          />
        ))}
      </div>
    </CrazyEightsCardShell>
  )
}

export function CrazyEightsChoosePanel({
  onChooseSuit,
  acting,
}: {
  onChooseSuit: (suit: CrazyEightsCalledSuit) => void
  acting: boolean
}) {
  return (
    <CrazyEightsCardShell className="p-4 space-y-4">
      <p className="text-center font-bold">You played a wild card — choose the suit opponents must match</p>
      <div>
        <p className="text-xs text-muted mb-2 uppercase tracking-wide">Pick a suit</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {CRAZY8_SUITS.map((suit) => (
            <button
              key={suit}
              type="button"
              disabled={acting}
              onClick={() => onChooseSuit(suit)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-(--border-strong) bg-(--surface-inset-bg) hover:bg-(--primary)/10 font-semibold text-sm"
            >
              <span
                className={[
                  'text-lg leading-none',
                  suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : '',
                ].join(' ')}
              >
                {CRAZY8_SUIT_SYMBOLS[suit]}
              </span>
              {CRAZY8_SUIT_LABELS[suit]}
            </button>
          ))}
        </div>
      </div>
    </CrazyEightsCardShell>
  )
}
