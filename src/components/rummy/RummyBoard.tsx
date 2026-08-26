'use client'

import { useMemo, useState } from 'react'
import { RummyCard as RummyCardBox, RummyPrimaryButton, RummySecondaryButton, suitColorClass } from './RummyChrome'
import { RUMMY_SUIT_SYMBOLS, classifyMeld, canGoOut, rummyCardLabel, rummyHandSum } from '@/lib/rummy'
import type { Player, RummyCard, RummyPlayerHand, RummySession } from '@/types'

/**
 * The active-game panel for Rummy — used by both the player view (with real hand +
 * action buttons) and the host view (spectator, no actions). Shows the turn indicator,
 * the discard-top / draw-pile piles, a rearrangeable hand, and a lay-down / go-out
 * builder for the current player.
 *
 * `myHand` is null for spectators / non-current players; the hand fan then only shows
 * the count. All card actions are gated behind `isMyTurn && !isViewer` in the caller.
 */
export function RummyGamePanel({
  session,
  players,
  myPlayerId,
  myHand,
  isMyTurn,
  isViewer,
  acting,
  onDraw,
  onDiscard,
  onGoOut,
}: {
  session: RummySession
  players: Player[]
  myPlayerId: string | null
  myHand: RummyCard[] | null
  isMyTurn: boolean
  isViewer: boolean
  acting: boolean
  onDraw?: (source: 'pile' | 'discard') => void
  onDiscard?: (cardId: string) => void
  onGoOut?: (melds: string[][], discardCardId: string | null) => void
}) {
  const turnPlayerId = session.turn_order[session.current_turn_index] ?? null
  const turnName = players.find((p) => p.id === turnPlayerId)?.name ?? 'Player'
  const topDiscard = session.top_discard
  const drawCount = (session.draw_pile as RummyCard[] | null | undefined)?.length ?? 0

  return (
    <div className="space-y-4">
      <TurnStrip
        turnName={turnName}
        isMyTurn={isMyTurn}
        step={session.turn_step}
        statusMessage={session.status_message}
      />

      <div className="grid grid-cols-2 gap-3">
        <PileTile
          label={session.turn_step === 'draw' ? 'Draw pile' : 'Draw pile'}
          count={drawCount}
          faceDown
          disabled={!isMyTurn || isViewer || session.turn_step !== 'draw' || acting}
          onClick={() => onDraw?.('pile')}
        />
        <PileTile
          label="Top of discard"
          card={topDiscard}
          count={(session.discard_pile as RummyCard[] | null | undefined)?.length ?? 0}
          disabled={!isMyTurn || isViewer || session.turn_step !== 'draw' || !topDiscard || acting}
          onClick={() => onDraw?.('discard')}
        />
      </div>

      <HandCountRow players={players} session={session} myPlayerId={myPlayerId} />

      {myHand ? (
        <HandAndActions
          hand={myHand}
          isMyTurn={isMyTurn && !isViewer}
          canAct={session.turn_step === 'discard' && !acting}
          onDiscard={onDiscard}
          onGoOut={onGoOut}
        />
      ) : (
        <RummyCardBox className="p-4 text-center text-sm text-muted">
          {isViewer ? 'You are watching this round.' : 'Waiting for your seat…'}
        </RummyCardBox>
      )}
    </div>
  )
}

function TurnStrip({
  turnName,
  isMyTurn,
  step,
  statusMessage,
}: {
  turnName: string
  isMyTurn: boolean
  step: 'draw' | 'discard'
  statusMessage: string | null
}) {
  return (
    <div
      className={[
        'rounded-xl px-3 py-2 border text-sm',
        isMyTurn
          ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40 text-[var(--foreground)]'
          : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted',
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {isMyTurn ? `Your turn — ${step === 'draw' ? 'draw a card' : 'discard a card'}` : `${turnName}'s turn`}
        </span>
        <span className="text-xs uppercase tracking-wide opacity-70">{step === 'draw' ? 'Step 1' : 'Step 2'}</span>
      </div>
      {statusMessage && <p className="text-xs mt-1 opacity-80">{statusMessage}</p>}
    </div>
  )
}

function PileTile({
  label,
  card,
  count,
  faceDown,
  disabled,
  onClick,
}: {
  label: string
  card?: RummyCard | null
  count: number
  faceDown?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'glass-card p-3 flex flex-col items-center justify-center gap-2 min-h-[100px]',
        disabled ? 'opacity-60 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-[0.98] transition-transform',
      ].join(' ')}
    >
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <PlayingCard card={card ?? null} faceDown={faceDown} />
      <span className="text-xs text-muted">
        {count} card{count === 1 ? '' : 's'}
      </span>
    </button>
  )
}

function HandCountRow({
  players,
  session,
  myPlayerId,
}: {
  players: Player[]
  session: RummySession
  myPlayerId: string | null
}) {
  const rows = session.turn_order
    .map((id, idx) => {
      const p = players.find((x) => x.id === id)
      if (!p) return null
      return { id, name: p.name, isCurrent: idx === session.current_turn_index, isMe: id === myPlayerId }
    })
    .filter(Boolean) as { id: string; name: string; isCurrent: boolean; isMe: boolean }[]

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {rows.map((r) => (
        <span
          key={r.id}
          className={[
            'text-xs px-2 py-1 rounded-full border',
            r.isCurrent
              ? 'bg-[var(--primary)]/20 border-[var(--primary)]/50 text-[var(--foreground)]'
              : 'bg-[var(--surface-inset-bg)] border-[var(--border)] text-muted',
            r.isMe ? 'font-bold' : '',
          ].join(' ')}
        >
          {r.name}
          {r.isMe ? ' (you)' : ''}
        </span>
      ))}
    </div>
  )
}

/** Playing-card face. Face-down shows a neutral back. */
function PlayingCard({ card, faceDown, small }: { card: RummyCard | null; faceDown?: boolean; small?: boolean }) {
  const size = small ? 'w-10 h-14 text-xs' : 'w-14 h-20 text-lg'
  if (faceDown || !card) {
    return (
      <div
        className={`${size} rounded-md border border-[var(--border)] bg-[var(--surface-inset-bg)] flex items-center justify-center`}
      >
        <span className="text-muted">🂠</span>
      </div>
    )
  }
  return (
    <div
      className={`${size} rounded-md border-2 border-neutral-300 bg-white text-neutral-900 flex flex-col items-center justify-center shadow-md`}
    >
      <span className={`font-black leading-none ${suitColorClass(card.suit)}`}>{rankLabel(card.rank)}</span>
      <span className={`text-2xl leading-none ${suitColorClass(card.suit)}`}>{RUMMY_SUIT_SYMBOLS[card.suit]}</span>
    </div>
  )
}

function rankLabel(rank: number): string {
  const map: Record<number, string> = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' }
  return map[rank] ?? String(rank)
}

/**
 * Hand fan with an inline meld builder. The player either:
 * - discards a single selected card to end their turn, or
 * - assigns cards into meld piles (add / remove / new meld) and hits "Go out".
 *
 * The go-out validator runs on the client for UX (button disabled until valid) AND on
 * the server (source of truth) — a client bug can't fabricate a bad lay-down.
 */
function HandAndActions({
  hand,
  isMyTurn,
  canAct,
  onDiscard,
  onGoOut,
}: {
  hand: RummyCard[]
  isMyTurn: boolean
  canAct: boolean
  onDiscard?: (cardId: string) => void
  onGoOut?: (melds: string[][], discardCardId: string | null) => void
}) {
  // Meld builder state: cardId -> meld index (0-based). Undefined = still in the hand.
  const [assignment, setAssignment] = useState<Record<string, number>>({})
  const [meldCount, setMeldCount] = useState(0)
  const [discardChoice, setDiscardChoice] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const inHand: RummyCard[] = []
    const melds: RummyCard[][] = Array.from({ length: meldCount }, () => [])
    for (const c of hand) {
      const m = assignment[c.id]
      if (m == null || m >= meldCount) inHand.push(c)
      else melds[m].push(c)
    }
    return { inHand, melds }
  }, [hand, assignment, meldCount])

  const meldIdsForServer: string[][] = useMemo(() => grouped.melds.map((meld) => meld.map((c) => c.id)), [grouped])

  const canGo = useMemo(() => {
    if (grouped.melds.length === 0) return false
    if (grouped.melds.some((m) => m.length < 3)) return false
    if (grouped.melds.some((m) => !classifyMeld(m))) return false
    const discardCard = discardChoice ? hand.find((c) => c.id === discardChoice) : null
    if (discardChoice && !discardCard) return false
    return canGoOut(hand, grouped.melds, { discard: discardCard ?? null })
  }, [grouped, hand, discardChoice])

  const addNewMeldPile = () => setMeldCount((n) => n + 1)
  const assignToMeld = (cardId: string, meldIndex: number) => {
    setAssignment((prev) => ({ ...prev, [cardId]: meldIndex }))
    if (discardChoice === cardId) setDiscardChoice(null)
  }
  const returnToHand = (cardId: string) => {
    setAssignment((prev) => {
      const next = { ...prev }
      delete next[cardId]
      return next
    })
  }
  const toggleDiscard = (cardId: string) => {
    setDiscardChoice((prev) => (prev === cardId ? null : cardId))
  }

  return (
    <div className="space-y-3">
      <RummyCardBox className="p-3 space-y-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Your hand · {hand.length} cards · {rummyHandSum(hand)} deadwood
          </span>
          <span>{isMyTurn && canAct ? 'Discard, or lay down and go out' : 'Watching'}</span>
        </div>
        <div className="flex flex-wrap gap-2 justify-center">
          {grouped.inHand.map((c) => (
            <HandCardChip
              key={c.id}
              card={c}
              disabled={!isMyTurn || !canAct}
              selected={discardChoice === c.id}
              onDiscardToggle={() => toggleDiscard(c.id)}
              onAssign={(mi) => assignToMeld(c.id, mi)}
              meldCount={meldCount}
              onAddMeld={addNewMeldPile}
            />
          ))}
          {grouped.inHand.length === 0 && (
            <span className="text-xs text-muted">All cards assigned. Choose a discard (or none) and go out.</span>
          )}
        </div>

        {isMyTurn && canAct && (
          <div className="flex gap-2">
            <RummySecondaryButton
              onClick={() => {
                if (discardChoice) onDiscard?.(discardChoice)
              }}
              disabled={!discardChoice || meldCount > 0}
            >
              Discard {discardChoice ? rummyCardLabel(hand.find((c) => c.id === discardChoice)!) : '…'}
            </RummySecondaryButton>
          </div>
        )}
      </RummyCardBox>

      {(meldCount > 0 || (isMyTurn && canAct)) && (
        <RummyCardBox className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Melds to lay down</span>
            {isMyTurn && canAct && (
              <button
                type="button"
                onClick={addNewMeldPile}
                className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--surface-inset-bg)]"
              >
                + New meld pile
              </button>
            )}
          </div>
          {grouped.melds.length === 0 && <p className="text-xs text-muted">No melds yet. Add a pile to start.</p>}
          <div className="space-y-2">
            {grouped.melds.map((meld, idx) => {
              const kind = classifyMeld(meld)
              return (
                <div key={idx} className="rounded-lg border border-[var(--border)] p-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>
                      Meld #{idx + 1} — {meld.length} card{meld.length === 1 ? '' : 's'}
                      {' · '}
                      <span className={kind ? 'text-emerald-400' : 'text-amber-400'}>
                        {kind ? kind.toUpperCase() : meld.length < 3 ? 'needs 3+' : 'invalid'}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {meld.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => returnToHand(c.id)}
                        disabled={!isMyTurn || !canAct}
                        className="disabled:opacity-60"
                        title="Return to hand"
                      >
                        <PlayingCard card={c} small />
                      </button>
                    ))}
                    {meld.length === 0 && (
                      <span className="text-xs text-muted italic self-center">
                        (Empty — click a hand card and choose meld #{idx + 1})
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {isMyTurn && canAct && (
            <RummyPrimaryButton onClick={() => onGoOut?.(meldIdsForServer, discardChoice)} disabled={!canGo}>
              Go out {discardChoice ? `+ discard ${rummyCardLabel(hand.find((c) => c.id === discardChoice)!)}` : ''}
            </RummyPrimaryButton>
          )}
        </RummyCardBox>
      )}
    </div>
  )
}

/**
 * A hand card that opens a small action menu: either discard it to end the turn, or
 * assign it to one of the meld piles. Keeps the meld builder inline so laying down
 * doesn't need a full-screen modal.
 */
function HandCardChip({
  card,
  disabled,
  selected,
  onDiscardToggle,
  onAssign,
  meldCount,
  onAddMeld,
}: {
  card: RummyCard
  disabled: boolean
  selected: boolean
  onDiscardToggle: () => void
  onAssign: (meldIndex: number) => void
  meldCount: number
  onAddMeld: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={[
          'transition-transform',
          selected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-transparent scale-105' : '',
          disabled ? 'opacity-70 cursor-not-allowed' : 'hover:scale-105 active:scale-95',
        ].join(' ')}
      >
        <PlayingCard card={card} />
      </button>
      {open && !disabled && (
        <div className="absolute z-10 top-full mt-1 left-1/2 -translate-x-1/2 glass-card p-2 flex flex-col gap-1 min-w-[8rem] shadow-xl">
          <button
            type="button"
            className={[
              'text-xs px-2 py-1 rounded text-left',
              selected ? 'bg-amber-500/20' : 'hover:bg-[var(--surface-inset-bg)]',
            ].join(' ')}
            onClick={() => {
              onDiscardToggle()
              setOpen(false)
            }}
          >
            {selected ? '✓ Marked as discard' : 'Mark as discard'}
          </button>
          {Array.from({ length: meldCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              className="text-xs px-2 py-1 rounded text-left hover:bg-[var(--surface-inset-bg)]"
              onClick={() => {
                onAssign(i)
                setOpen(false)
              }}
            >
              Add to meld #{i + 1}
            </button>
          ))}
          <button
            type="button"
            className="text-xs px-2 py-1 rounded text-left hover:bg-[var(--surface-inset-bg)]"
            onClick={() => {
              onAddMeld()
              // The new meld's index is meldCount (0-based) — assign this card there.
              onAssign(meldCount)
              setOpen(false)
            }}
          >
            Start new meld with this card
          </button>
        </div>
      )}
    </div>
  )
}

/** Compact standings box for the finished screen — winner first, then everyone by hand total. */
export function RummyStandingsBox({
  session,
  players,
  hands,
  myPlayerId,
}: {
  session: RummySession
  players: Player[]
  hands: RummyPlayerHand[]
  myPlayerId: string | null
}) {
  const rows = session.turn_order.map((id) => {
    const p = players.find((x) => x.id === id)
    const hand = hands.find((h) => h.player_id === id)
    const cards = (hand?.cards as RummyCard[] | null) ?? []
    return {
      id,
      name: p?.name ?? 'Player',
      cardCount: cards.length,
      handSum: rummyHandSum(cards),
      isWinner: id === session.winner_player_id,
    }
  })
  rows.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1
    if (a.handSum !== b.handSum) return a.handSum - b.handSum
    return a.cardCount - b.cardCount
  })
  return (
    <RummyCardBox className="p-3">
      <p className="text-sm font-bold mb-2">Standings</p>
      <ul className="space-y-1 text-sm">
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={[
              'flex items-center justify-between px-2 py-1 rounded',
              r.isWinner ? 'bg-amber-500/15' : '',
              r.id === myPlayerId ? 'font-bold' : '',
            ].join(' ')}
          >
            <span>
              {i + 1}. {r.name}
              {r.isWinner ? ' 🏆' : ''}
              {r.id === myPlayerId ? ' (you)' : ''}
            </span>
            <span className="text-muted tabular-nums text-xs">
              {r.cardCount} card{r.cardCount === 1 ? '' : 's'} · {r.handSum} pts
            </span>
          </li>
        ))}
      </ul>
    </RummyCardBox>
  )
}
