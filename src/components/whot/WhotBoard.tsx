'use client'

import type { WhotCard as WhotCardType, WhotShape } from '@/types'
import {
  WHOT_SHAPE_LABELS,
  canPlayCard,
  getActivePickPenalty,
  isWhotPlayerOut,
  parseWhotRules,
  specialCardShortLabel,
  type WhotRules,
} from '@/lib/whot'
import type { WhotSession } from '@/types'
import { WhotCard as WhotCardShell, WhotTurnBar } from '@/components/whot/WhotChrome'
import { WhotShapeIcon } from '@/components/whot/WhotShapeIcon'

const SHAPE_COLORS: Record<WhotShape, string> = {
  circle: 'from-blue-500/30 to-blue-600/20 border-blue-400/60',
  cross: 'from-green-500/30 to-green-600/20 border-green-400/60',
  triangle: 'from-amber-500/30 to-amber-600/20 border-amber-400/60',
  square: 'from-red-500/30 to-red-600/20 border-red-400/60',
  star: 'from-violet-500/30 to-violet-600/20 border-violet-400/60',
  whot: 'from-fuchsia-500/40 to-purple-600/30 border-fuchsia-400/70',
}

export function WhotPlayingCard({
  card,
  onClick,
  playable,
  selected,
  size = 'md',
}: {
  card: WhotCardType
  onClick?: () => void
  playable?: boolean
  selected?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const isWhot = card.number === 20
  const label = specialCardShortLabel(card.number)
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
      className={[
        'relative flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 bg-gradient-to-br font-black transition-all overflow-hidden',
        sizeStyles.box,
        SHAPE_COLORS[card.shape],
        onClick && playable !== false ? 'cursor-pointer hover:scale-105 hover:shadow-lg active:scale-95 ring-2 ring-[var(--primary)]/70' : '',
        onClick && playable === false ? 'opacity-40 cursor-not-allowed' : '',
        selected ? 'ring-2 ring-[var(--primary)] scale-105' : '',
        !onClick ? 'cursor-default' : '',
      ].join(' ')}
    >
      <WhotShapeIcon shape={card.shape} size={sizeStyles.icon} variant="on-card" />
      <span className={`font-black leading-none ${sizeStyles.num}`}>{isWhot ? 'WHOT' : card.number}</span>
      {label && size !== 'sm' && (
        <span
          className={[
            'mt-0.5 max-w-full truncate rounded px-1 py-0.5 font-bold uppercase tracking-wide leading-tight',
            'text-white/95 bg-black/30',
            sizeStyles.badge,
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </button>
  )
}

export function WhotTable({
  session,
  players,
  myPlayerId,
  handCounts,
  turnPlayerName,
  isMyTurn,
  secondsLeft,
  hasTimer,
  urgent,
}: {
  session: WhotSession
  players: { id: string; name: string; spectator?: boolean | null }[]
  myPlayerId: string | null
  handCounts: Record<string, number>
  turnPlayerName?: string
  isMyTurn?: boolean
  secondsLeft?: number
  hasTimer?: boolean
  urgent?: boolean
}) {
  const top = session.top_card
  const drawCount = (session.draw_pile as unknown[])?.length ?? 0
  const discardCount = (session.discard_pile as unknown[])?.length ?? 0
  const turnId = session.turn_order[session.current_turn_index]

  const activePlayers = players.filter((p) => !isWhotPlayerOut(handCounts[p.id] ?? 0, p.spectator))
  const watchingPlayers = players.filter((p) => isWhotPlayerOut(handCounts[p.id] ?? 0, p.spectator))
  const pickPenalty = getActivePickPenalty(session)

  function renderPlayerRow(p: { id: string; name: string; spectator?: boolean | null }, watching: boolean) {
    const count = handCounts[p.id] ?? 0
    const isTurn = !watching && p.id === turnId
    const isMe = p.id === myPlayerId

    return (
      <div
        key={p.id}
        className={[
          'rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2',
          watching
            ? 'border border-dashed border-[var(--border-strong)] bg-[var(--surface-inset-bg)]/60 opacity-75'
            : isTurn
              ? 'bg-[var(--primary)]/15 border border-[var(--primary)]/40 font-bold'
              : 'bg-[var(--surface-inset-bg)]',
        ].join(' ')}
      >
        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
          <span className="truncate">
            {p.name}
            {isMe ? ' (you)' : ''}
          </span>
          {isTurn && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--marry)_20%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--marry)]">
              Turn
            </span>
          )}
          {watching && (
            <span className="rounded-full bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
              Watching
            </span>
          )}
        </div>
        <span className="text-muted ml-2 shrink-0 tabular-nums">
          {watching ? '👀' : `${count} 🃏`}
        </span>
      </div>
    )
  }

  return (
    <WhotCardShell className="p-4 space-y-4">
      {(turnPlayerName != null || isMyTurn != null || hasTimer) && (
        <WhotTurnBar
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
        {pickPenalty.type === 'pick2' && (
          <span className="font-bold text-orange-400">Pick 2 — draw {pickPenalty.count}</span>
        )}
        {pickPenalty.type === 'pick3' && (
          <span className="font-bold text-red-400">Pick 3 — draw {pickPenalty.count}</span>
        )}
      </div>

      {session.required_shape && (
        <p className="text-center text-sm font-bold text-[var(--primary)]">
          Must match: {WHOT_SHAPE_LABELS[session.required_shape]} — or play WHOT to call something new
        </p>
      )}
      {session.required_number != null && (
        <p className="text-center text-sm font-bold text-[var(--primary)]">
          Must match: number {session.required_number} — or play WHOT to call something new
        </p>
      )}

      <div className="flex items-center justify-center gap-6 py-2">
        <div className="text-center">
          <div className="w-14 h-20 rounded-xl border-2 border-dashed border-[var(--border-strong)] flex items-center justify-center text-muted text-xs">
            🂠
          </div>
          <p className="text-[10px] text-muted mt-1">{drawCount} left</p>
        </div>
        {top ? (
          <div className="text-center">
            <WhotPlayingCard card={top} size="lg" />
            <p className="text-[10px] text-muted mt-1">Top card</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No top card</p>
        )}
      </div>

      {session.status_message && (
        <p className="text-center text-sm text-muted border-t border-[var(--border)] pt-3">{session.status_message}</p>
      )}

      <div className="space-y-3 border-t border-[var(--border)] pt-3">
        {activePlayers.length > 0 && (
          <div className="space-y-2">
            {watchingPlayers.length > 0 && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Still playing</p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activePlayers.map((p) => renderPlayerRow(p, false))}
            </div>
          </div>
        )}
        {watchingPlayers.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Watching</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {watchingPlayers.map((p) => renderPlayerRow(p, true))}
            </div>
          </div>
        )}
      </div>
    </WhotCardShell>
  )
}

export function WhotHand({
  cards,
  session,
  onPlay,
  acting,
  rules,
}: {
  cards: WhotCardType[]
  session: WhotSession
  onPlay: (cardId: string) => void
  acting: boolean
  rules?: WhotRules
}) {
  const whotRules = rules ?? parseWhotRules(null)
  if (cards.length === 0) {
    return (
      <WhotCardShell className="p-4 text-center text-sm text-muted">
        You&apos;re out — watch the rest of the game from here.
      </WhotCardShell>
    )
  }

  return (
    <WhotCardShell className="p-4">
      <p className="text-xs font-semibold text-muted mb-3 uppercase tracking-wide">Your hand</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {cards.map((card) => {
          const playable = canPlayCard(card, session, whotRules) && session.phase === 'playing'
          return (
            <WhotPlayingCard
              key={card.id}
              card={card}
              playable={playable}
              onClick={playable && !acting ? () => onPlay(card.id) : undefined}
            />
          )
        })}
      </div>
    </WhotCardShell>
  )
}

export function WhotChoosePanel({
  onChooseShape,
  onChooseNumber,
  acting,
  allowNumberCalls = true,
}: {
  onChooseShape: (shape: WhotShape) => void
  onChooseNumber: (number: number) => void
  acting: boolean
  allowNumberCalls?: boolean
}) {
  const shapes: WhotShape[] = ['circle', 'cross', 'triangle', 'square', 'star']
  const numbers = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14]

  return (
    <WhotCardShell className="p-4 space-y-4">
      <p className="text-center font-bold">
        You played WHOT — choose what opponents must match
        {allowNumberCalls ? '' : ' (shape only)'}
      </p>
      <div>
        <p className="text-xs text-muted mb-2 uppercase tracking-wide">Pick a shape</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {shapes.map((shape) => (
            <button
              key={shape}
              type="button"
              disabled={acting}
              onClick={() => onChooseShape(shape)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] hover:bg-[var(--primary)]/10 font-semibold text-sm"
            >
              <WhotShapeIcon shape={shape} size="sm" />
              {WHOT_SHAPE_LABELS[shape]}
            </button>
          ))}
        </div>
      </div>
      {allowNumberCalls && (
        <div>
          <p className="text-xs text-muted mb-2 uppercase tracking-wide">Or pick a number</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {numbers.map((n) => (
              <button
                key={n}
                type="button"
                disabled={acting}
                onClick={() => onChooseNumber(n)}
                className="w-10 h-10 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] hover:bg-[var(--primary)]/10 font-bold text-sm"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </WhotCardShell>
  )
}
