'use client'

/**
 * Crazy Eights — design-system play surface (player, mobile-faithful).
 *
 * The presentational shell for the active / watching states of
 * CrazyEightsPlayerView + CrazyEightsHostView, ported from the "Card Table"
 * design (`Player · Mobile` + the Crazy Eights deck sheet). It renders the
 * turn rail, the felt (draw + discard piles, required-suit demand, status /
 * toasts), and the fanned hand + draw action using the shared card-table
 * primitives — the exact same shell Whot uses, so the two card games read
 * identically.
 *
 * This component is PRESENTATION ONLY — every game action is delegated to
 * the callbacks passed in from the view; no state or logic lives here. It is
 * designed to mount inside the `.fr-room fr-room-phone` shell (player /host
 * room shell), directly under the top voice rail — like the Whot surface.
 */

import {
  ActionToast,
  CardTableSurface,
  CrazyCardFace,
  DrawPile,
  GameTimerBar,
  Hand,
  PickerGrid,
  PickerOverlay,
  Piles,
  Table,
  TurnRail,
  TurnStatus,
  type TurnSeat,
} from '@/components/rooms/card-table/primitives'
import {
  canPlayCard,
  CRAZY8_SUITS,
  CRAZY8_SUIT_LABELS,
  CRAZY8_SUIT_SYMBOLS,
  type CrazyEightsRules,
} from '@/lib/crazy-eights'
import { formatCountdown } from '@/lib/timer-format'
import type { CrazyEightsCalledSuit, CrazyEightsCard, CrazyEightsSession } from '@/types'

/** Deck accent for the Crazy Eights card backs (classic playing-card blue). */
const CRAZY8_ACCENT = '#2563eb'

type Player = { id: string; name: string; spectator?: boolean | null }

export type CrazyEightsPlaySurfaceProps = {
  session: CrazyEightsSession
  players: Player[]
  /** the viewer's own player id — marks their seat "(you)" in the turn rail */
  myPlayerId?: string | null
  myHand: CrazyEightsCard[]
  handCounts: Record<string, number>
  rules: CrazyEightsRules
  /** the id of the seat whose turn it is */
  turnPlayerId: string | null
  isMyTurn: boolean
  /** read-only spectator / out-of-cards viewer */
  watching?: boolean
  acting: boolean
  drawCount: number
  drawDepleted: boolean
  myCanPlay: boolean
  suitCallActive: boolean
  penalties: { pickTwo: number; jokerPenalty: number }
  /** per-turn countdown for the active seat (from useCrazyEightsTurnTimer) */
  turnTimer?: { secondsLeft: number; hasTimer: boolean; urgent: boolean }
  /** overall game-duration timer (from useCrazyEightsGameTimer) */
  gameTimer?: { active: boolean; label: string; secondsLeft: number; durationSeconds: number }
  onPlay: (cardId: string) => void
  onDraw: () => void
  onChooseSuit: (suit: CrazyEightsCalledSuit) => void
}

export function CrazyEightsPlaySurface({
  session,
  players,
  myPlayerId,
  myHand,
  handCounts,
  rules,
  turnPlayerId,
  isMyTurn,
  watching,
  acting,
  drawCount,
  drawDepleted,
  myCanPlay,
  penalties,
  turnTimer,
  gameTimer,
  onPlay,
  onDraw,
  onChooseSuit,
}: CrazyEightsPlaySurfaceProps) {
  // Per-turn countdown chip shown on the active seat (mono, red when urgent).
  const turnTimeLabel =
    turnTimer?.hasTimer && turnTimer.secondsLeft > 0 ? formatCountdown(turnTimer.secondsLeft) : undefined

  // Turn rail: order players by turn_order so seats read left→right in play order.
  const byId = new Map(players.map((p) => [p.id, p]))
  const winnerId = (session.finish_order ?? [])[0]
  const seats: TurnSeat[] = session.turn_order
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p)
    .map((p) => {
      const isTurn = p.id === turnPlayerId
      return {
        name: p.name,
        cards: handCounts[p.id] ?? 0,
        turn: isTurn,
        you: p.id === myPlayerId,
        winner: p.id === winnerId,
        timeLabel: isTurn ? turnTimeLabel : undefined,
        timeLow: isTurn ? turnTimer?.urgent : undefined,
      }
    })

  const top = session.top_card
  const choosing = isMyTurn && !watching && session.phase === 'choose_suit'
  const canAct = isMyTurn && !watching && session.phase === 'playing'
  const turnName = players.find((p) => p.id === turnPlayerId)?.name ?? 'next player'

  const requiredSuit = session.required_suit
  const requiredIsRed = requiredSuit === 'hearts' || requiredSuit === 'diamonds'
  const reversed = session.direction < 0

  const many = myHand.length > 8

  const drawLabel = drawDepleted
    ? 'Pass turn'
    : penalties.pickTwo > 0
      ? `Draw ${penalties.pickTwo} (Pick 2)`
      : penalties.jokerPenalty > 0
        ? `Draw ${penalties.jokerPenalty} (Joker)`
        : 'Draw a card'

  const gamePct =
    gameTimer && gameTimer.durationSeconds > 0
      ? Math.max(0, Math.min(100, (gameTimer.secondsLeft / gameTimer.durationSeconds) * 100))
      : 0

  return (
    <CardTableSurface variant="crazy">
      {gameTimer?.active && <GameTimerBar label={gameTimer.label} pct={gamePct} low={gameTimer.secondsLeft <= 60} />}
      <TurnRail seats={seats} />

      <Table>
        <Piles
          draw={<DrawPile count={drawCount} accent={CRAZY8_ACCENT} />}
          discard={top ? <CrazyCardFace card={top} big /> : <span className="turn-status g">No card</span>}
        />

        {/* Persistent demand badge — the called suit stays visible for the whole
            call, even after a player draws (which overwrites status_message).
            Reuses the shared `.whot-demand` badge styling. */}
        {requiredSuit && (
          <div className="whot-demand" role="status">
            <span className="whot-demand__lbl">Must play</span>
            <span className="whot-demand__val">
              <span style={requiredIsRed ? { color: '#dc2626' } : undefined}>{CRAZY8_SUIT_SYMBOLS[requiredSuit]}</span>
              {CRAZY8_SUIT_LABELS[requiredSuit]}
            </span>
          </div>
        )}

        {watching ? (
          <TurnStatus muted>
            Spectating — {turnName}&apos;s turn · <span className="g">you can join the voice room</span>
          </TurnStatus>
        ) : session.status_message ? (
          <ActionToast tone="ok">{session.status_message}</ActionToast>
        ) : session.phase === 'choose_suit' ? (
          <TurnStatus>
            {isMyTurn ? 'You played a wild card — choose the suit to match' : `${turnName} is choosing a suit…`}
          </TurnStatus>
        ) : penalties.pickTwo > 0 ? (
          <ActionToast tone="hot">🔥 Pick 2 — play a 2 or draw {penalties.pickTwo}</ActionToast>
        ) : penalties.jokerPenalty > 0 ? (
          <ActionToast tone="hot">🃏 Joker — draw {penalties.jokerPenalty} (no defending)</ActionToast>
        ) : isMyTurn ? (
          // The required suit is shown persistently by the demand badge above.
          <TurnStatus>Your turn</TurnStatus>
        ) : (
          <TurnStatus muted>Waiting for {turnName}…</TurnStatus>
        )}

        {reversed && <div className="act-toast warn">↺ Play reversed</div>}
      </Table>

      {/* Spectators see who's playing (names + card counts + whose turn) on the
          turn rail above the piles, so no separate standings list here. Who's-here
          + remove lives in the roster side-drawer (header people button). */}
      {watching ? null : (
        <Hand
          count={myHand.length}
          many={many}
          hint={canAct ? `Tap a highlighted card to play it${many ? ' · swipe to see more' : ''}` : undefined}
          actions={
            canAct && !(drawDepleted && myCanPlay) ? (
              <button
                type="button"
                className="fr-btn fr-btn--secondary fr-btn--block"
                disabled={acting}
                onClick={onDraw}
              >
                {drawLabel}
              </button>
            ) : undefined
          }
        >
          {myHand.map((card) => {
            const playable = canAct && canPlayCard(card, session, rules)
            return (
              <CrazyCardFace
                key={card.id}
                card={card}
                playable={playable}
                dim={canAct && !playable}
                onClick={playable && !acting ? () => onPlay(card.id) : undefined}
              />
            )
          })}
        </Hand>
      )}

      {choosing && (
        <PickerOverlay title="Choose a suit" desc="The next player must match the suit you pick.">
          <PickerGrid>
            {CRAZY8_SUITS.map((suit) => {
              const red = suit === 'hearts' || suit === 'diamonds'
              return (
                <button
                  key={suit}
                  type="button"
                  className={red ? 'red' : undefined}
                  disabled={acting}
                  aria-label={CRAZY8_SUIT_LABELS[suit]}
                  title={CRAZY8_SUIT_LABELS[suit]}
                  onClick={() => onChooseSuit(suit)}
                >
                  {CRAZY8_SUIT_SYMBOLS[suit]}
                </button>
              )
            })}
          </PickerGrid>
        </PickerOverlay>
      )}
    </CardTableSurface>
  )
}
