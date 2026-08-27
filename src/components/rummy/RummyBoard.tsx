'use client'

/**
 * Rummy — design-system play surface.
 *
 * Uses the shared card-table primitives (`CardTableSurface`, `TurnRail`, `Piles`,
 * `DrawPile`, `RummyCardFace`, `Hand`, `GameTimerBar`, `ActionToast`) so Rummy reads
 * as one of the FateRound card games rather than a bespoke panel — same felt, same
 * seats, same look for the hand fan. Rummy adds one custom section on top of the shell:
 * the inline meld builder, which lets a player assign hand cards into meld piles and
 * "Go out" without a full-screen modal (there's no equivalent in Whot / Crazy Eights).
 *
 * Presentation only — every action is delegated to callbacks on the parent view.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  ActionToast,
  CardTableSurface,
  DrawPile,
  GameTimerBar,
  Hand,
  Piles,
  RummyCardFace,
  Table,
  TurnRail,
  TurnStatus,
  type TurnSeat,
} from '@/components/rooms/card-table/primitives'
import { RummyCard as RummyCardBox } from './RummyChrome'
import { canGoOut, classifyMeld, rummyCardLabel, rummyHandSum } from '@/lib/rummy'
import { formatCountdown } from '@/lib/timer-format'
import type { Player, RummyCard, RummyPlayerHand, RummySession } from '@/types'

/** Deck accent for Rummy's card backs (classic table cyan). */
const RUMMY_ACCENT = '#0891b2'

export function RummyGamePanel({
  session,
  players,
  myPlayerId,
  myHand,
  isMyTurn,
  isViewer,
  acting,
  secondsLeft,
  hasTimer,
  urgent,
  gameCountdown,
  gameSecondsLeft,
  gameDurationSeconds,
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
  secondsLeft?: number
  hasTimer?: boolean
  urgent?: boolean
  /** Whole-game clock label ("2:14") — null/undefined when there is no cap. */
  gameCountdown?: string | null
  gameSecondsLeft?: number
  gameDurationSeconds?: number
  onDraw?: (source: 'pile' | 'discard') => void
  onDiscard?: (cardId: string) => void
  onGoOut?: (melds: string[][], discardCardId: string | null) => void
}) {
  const turnPlayerId = session.turn_order[session.current_turn_index] ?? null
  const turnName = players.find((p) => p.id === turnPlayerId)?.name ?? 'Player'
  const topDiscard = session.top_discard
  const drawCount = (session.draw_pile as RummyCard[] | null | undefined)?.length ?? 0
  const canDrawNow = isMyTurn && !isViewer && session.turn_step === 'draw' && !acting

  const turnTimeLabel = hasTimer && secondsLeft != null && secondsLeft > 0 ? formatCountdown(secondsLeft) : undefined
  const handCountFor = (id: string): number => {
    const row = players.find((p) => p.id === id)
    if (!row) return 0
    // The whole-hand payload isn't in `session` — for the turn rail we can only see the
    // local player's hand length; other seats fall back to a placeholder.
    if (id === myPlayerId && myHand) return myHand.length
    return -1
  }

  const seats: TurnSeat[] = session.turn_order
    .map((id) => ({
      id,
      p: players.find((x) => x.id === id),
    }))
    .filter((s): s is { id: string; p: Player } => !!s.p)
    .map(({ id, p }) => {
      const isTurn = id === turnPlayerId
      const count = handCountFor(id)
      return {
        name: p.name,
        cards: count >= 0 ? count : undefined,
        turn: isTurn,
        you: id === myPlayerId,
        winner: id === session.winner_player_id,
        timeLabel: isTurn ? turnTimeLabel : undefined,
        timeLow: isTurn ? urgent : undefined,
      }
    })

  const gamePct =
    gameSecondsLeft != null && gameDurationSeconds && gameDurationSeconds > 0
      ? Math.max(0, Math.min(100, (gameSecondsLeft / gameDurationSeconds) * 100))
      : 0

  return (
    <CardTableSurface>
      {gameCountdown && (
        <GameTimerBar label={gameCountdown} pct={gamePct} low={gameSecondsLeft != null && gameSecondsLeft <= 60} />
      )}
      <TurnRail seats={seats} />

      <Table>
        <Piles
          draw={
            <button
              type="button"
              className="reset-btn"
              disabled={!canDrawNow}
              onClick={() => onDraw?.('pile')}
              aria-label="Draw from pile"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: canDrawNow ? 'pointer' : 'not-allowed',
              }}
            >
              <DrawPile count={drawCount} accent={RUMMY_ACCENT} />
            </button>
          }
          discard={
            topDiscard ? (
              <button
                type="button"
                className="reset-btn"
                disabled={!canDrawNow}
                onClick={() => onDraw?.('discard')}
                aria-label={`Take top of discard: ${rummyCardLabel(topDiscard)}`}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: canDrawNow ? 'pointer' : 'not-allowed',
                }}
              >
                <RummyCardFace card={topDiscard} big />
              </button>
            ) : (
              <span className="turn-status g">No discard</span>
            )
          }
        />

        {isViewer ? (
          <TurnStatus muted>Watching — {turnName}&apos;s turn</TurnStatus>
        ) : isMyTurn ? (
          <TurnStatus>
            {session.turn_step === 'draw' ? 'Your turn — draw a card' : 'Your turn — now discard or go out'}
          </TurnStatus>
        ) : session.status_message ? (
          <ActionToast tone="ok">{session.status_message}</ActionToast>
        ) : (
          <TurnStatus muted>Waiting for {turnName}…</TurnStatus>
        )}
      </Table>

      {myHand ? (
        <HandAndActions
          hand={myHand}
          isMyTurn={isMyTurn && !isViewer}
          canAct={session.turn_step === 'discard' && !acting}
          canDraw={canDrawNow}
          drawCount={drawCount}
          topDiscard={topDiscard}
          onDraw={onDraw}
          onDiscard={onDiscard}
          onGoOut={onGoOut}
        />
      ) : (
        <RummyCardBox className="p-4 text-center text-sm text-muted mx-3">
          {isViewer ? 'You are watching this round.' : 'Waiting for your seat…'}
        </RummyCardBox>
      )}
    </CardTableSurface>
  )
}

/**
 * Hand fan + inline meld builder.
 *
 * On the draw step this is a preview only (the hand still shows but "Discard" and
 * "Go out" are disabled — the player has to draw first). On the discard step:
 *  - clicking a hand card opens its tiny menu: mark it as the discard, add it to
 *    an existing meld pile, or start a new meld with it.
 *  - The go-out button is disabled until the assembled melds legally clear the hand.
 * The server also re-validates going out, so a client bug can't fabricate a bad
 * lay-down.
 */
function HandAndActions({
  hand,
  isMyTurn,
  canAct,
  canDraw,
  drawCount,
  topDiscard,
  onDraw,
  onDiscard,
  onGoOut,
}: {
  hand: RummyCard[]
  isMyTurn: boolean
  canAct: boolean
  canDraw: boolean
  drawCount: number
  topDiscard: RummyCard | null
  onDraw?: (source: 'pile' | 'discard') => void
  onDiscard?: (cardId: string) => void
  onGoOut?: (melds: string[][], discardCardId: string | null) => void
}) {
  // Meld builder state: cardId -> meld index (0-based). Undefined = still in the hand.
  const [assignment, setAssignment] = useState<Record<string, number>>({})
  const [meldCount, setMeldCount] = useState(0)
  const [discardChoice, setDiscardChoice] = useState<string | null>(null)
  // Which hand card's popup menu is open. null = none.
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  // Drop the builder state as soon as the discard step ends — otherwise a leftover
  // meld pile (or a stale `discardChoice`) from a previous turn would block the next
  // turn's discard the moment it starts.
  useEffect(() => {
    if (isMyTurn && canAct) return
    setAssignment({})
    setMeldCount(0)
    setDiscardChoice(null)
    setOpenMenu(null)
  }, [isMyTurn, canAct])

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
  /** Remove an empty meld pile the player added by accident (or changed their mind on).
   *  Shifts higher-indexed piles down so the assignment map stays contiguous. */
  const removeMeldPile = (idx: number) => {
    setAssignment((prev) => {
      const next: Record<string, number> = {}
      for (const [cardId, m] of Object.entries(prev)) {
        if (m === idx) continue
        next[cardId] = m > idx ? m - 1 : m
      }
      return next
    })
    setMeldCount((n) => Math.max(0, n - 1))
  }
  const toggleDiscard = (cardId: string) => {
    setDiscardChoice((prev) => (prev === cardId ? null : cardId))
  }

  const many = grouped.inHand.length > 8

  return (
    <>
      <Hand
        count={grouped.inHand.length}
        many={many}
        hint={
          isMyTurn && canAct
            ? meldCount > 0
              ? `${rummyHandSum(hand)} deadwood · tap a card to assign it`
              : `${rummyHandSum(hand)} deadwood · tap a card to pick your discard`
            : isMyTurn && canDraw
              ? `${rummyHandSum(hand)} deadwood · draw one card, then discard one to end your turn`
              : `${hand.length} cards · ${rummyHandSum(hand)} deadwood`
        }
        actions={
          isMyTurn && canDraw ? (
            <div className="flex gap-2 w-full">
              <button
                type="button"
                className="fr-btn fr-btn--primary fr-btn--block"
                disabled={drawCount === 0}
                onClick={() => onDraw?.('pile')}
              >
                Draw a card
              </button>
              <button
                type="button"
                className="fr-btn fr-btn--secondary fr-btn--block"
                disabled={!topDiscard}
                onClick={() => onDraw?.('discard')}
              >
                {topDiscard ? `Take discard (${rummyCardLabel(topDiscard)})` : 'Take discard'}
              </button>
            </div>
          ) : isMyTurn && canAct ? (
            <div className="flex flex-col gap-2 w-full">
              {openMenu && meldCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-inset-bg)] p-2">
                  <span className="text-xs text-muted mr-1">
                    Selected: <strong>{rummyCardLabel(hand.find((c) => c.id === openMenu)!)}</strong>
                  </span>
                  <button
                    type="button"
                    className="fr-btn fr-btn--secondary"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                    onClick={() => {
                      toggleDiscard(openMenu)
                      setOpenMenu(null)
                    }}
                  >
                    {discardChoice === openMenu ? '✓ Marked to discard' : 'Mark as discard'}
                  </button>
                  {Array.from({ length: meldCount }).map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      className="fr-btn fr-btn--secondary"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                      onClick={() => {
                        assignToMeld(openMenu, i)
                        setOpenMenu(null)
                      }}
                    >
                      Add to meld #{i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ml-auto text-xs text-muted hover:text-[var(--foreground)]"
                    onClick={() => setOpenMenu(null)}
                    aria-label="Cancel"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex gap-2 w-full">
                <button
                  type="button"
                  className="fr-btn fr-btn--primary fr-btn--block"
                  disabled={!discardChoice || grouped.melds.some((m) => m.length > 0)}
                  onClick={() => discardChoice && onDiscard?.(discardChoice)}
                >
                  {discardChoice
                    ? `Discard ${rummyCardLabel(hand.find((c) => c.id === discardChoice)!)}`
                    : 'Pick a card to discard'}
                </button>
                {meldCount === 0 ? (
                  <button
                    type="button"
                    className="fr-btn fr-btn--secondary fr-btn--block"
                    onClick={addNewMeldPile}
                    title="Advanced — lay your hand down as valid melds to end the round"
                  >
                    Try to go out…
                  </button>
                ) : (
                  <button type="button" className="fr-btn fr-btn--secondary fr-btn--block" onClick={addNewMeldPile}>
                    + Another meld pile
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted text-center">
                {meldCount === 0
                  ? 'One card in, one card out — pick a card and Discard to end your turn.'
                  : `Fill each meld pile with 3+ of a rank or 3+ consecutive of one suit, then Go out below.`}
              </p>
            </div>
          ) : undefined
        }
      >
        {grouped.inHand.map((card) => {
          const handleTap =
            isMyTurn && canAct
              ? meldCount > 0
                ? () => setOpenMenu(openMenu === card.id ? null : card.id)
                : () => toggleDiscard(card.id)
              : undefined
          return (
            <div key={card.id}>
              <RummyCardFace card={card} sel={discardChoice === card.id || openMenu === card.id} onClick={handleTap} />
            </div>
          )
        })}
      </Hand>

      {meldCount > 0 && (
        <div className="mx-3 mb-3 space-y-2">
          {grouped.melds.map((meld, idx) => {
            const kind = classifyMeld(meld)
            return (
              <div
                key={idx}
                className="rounded-lg border p-2"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-inset-bg)' }}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>
                    Meld #{idx + 1} — {meld.length} card{meld.length === 1 ? '' : 's'}
                    {' · '}
                    <span style={{ color: kind ? '#34d399' : '#fbbf24' }}>
                      {kind ? kind.toUpperCase() : meld.length < 3 ? 'needs 3+' : 'invalid'}
                    </span>
                  </span>
                  {isMyTurn && canAct && (
                    <button
                      type="button"
                      onClick={() => removeMeldPile(idx)}
                      className="text-xs text-muted hover:text-[var(--foreground)]"
                      aria-label={`Remove meld pile ${idx + 1}`}
                      title="Remove this meld pile"
                    >
                      ✕
                    </button>
                  )}
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
                      style={{ background: 'none', border: 'none', padding: 0 }}
                    >
                      <RummyCardFace card={c} />
                    </button>
                  ))}
                  {meld.length === 0 && (
                    <span className="text-xs text-muted italic self-center">
                      (Empty — pick a hand card and choose meld #{idx + 1})
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {isMyTurn && canAct && (
            <button
              type="button"
              className="fr-btn fr-btn--primary fr-btn--block"
              onClick={() => onGoOut?.(meldIdsForServer, discardChoice)}
              disabled={!canGo}
            >
              Go out {discardChoice ? `+ discard ${rummyCardLabel(hand.find((c) => c.id === discardChoice)!)}` : ''}
            </button>
          )}
        </div>
      )}
    </>
  )
}

/** Compact standings box for the finished screen — winner first, then everyone by
 *  closest-to-going-out (a Rummy-ready hand beats one just holding cheap cards). */
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
