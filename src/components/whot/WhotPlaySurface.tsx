'use client'

/**
 * Whot — design-system play surface (player, mobile-faithful).
 *
 * The presentational shell for the active / watching states of
 * WhotPlayerView, ported from the "Card Table" design (`Player · Mobile`).
 * It renders the turn rail, the felt (draw + discard piles, status/toasts),
 * and the fanned hand + draw action using the shared card-table primitives.
 *
 * This component is PRESENTATION ONLY — every game action is delegated to
 * the callbacks passed in from WhotPlayerView; no state or logic lives here
 * beyond the local wild-call picker tab. It is designed to mount inside the
 * `.fr-room fr-room-phone` shell (set up by `game/[code]/page.tsx`), directly
 * under the top voice rail — exactly like the poll room player view.
 */

import { useState } from 'react'
import {
  ActionToast,
  CardTableSurface,
  DrawPile,
  GameTimerBar,
  Hand,
  PickerGrid,
  PickerOverlay,
  PickerTabs,
  Piles,
  Table,
  TurnRail,
  TurnStatus,
  WhotCardFace,
  type TurnSeat,
} from '@/components/rooms/card-table/primitives'
import { WhotShapeIcon } from '@/components/whot/WhotShapeIcon'
import { canPlayCard, WHOT_SHAPE_LABELS, type WhotRules } from '@/lib/whot'
import { formatCountdown } from '@/lib/timer-format'
import type { WhotCard, WhotSession, WhotShape } from '@/types'

/** Deck accent for the Whot card backs (emerald, matching the design). */
const WHOT_ACCENT = '#059669'

/** Shapes callable from a WHOT wild (the design's picker set — no `whot`). */
const WHOT_CALL_SHAPES: WhotShape[] = ['circle', 'triangle', 'cross', 'square', 'star']
/** Numbers callable from a WHOT wild (the design's picker set). */
const WHOT_CALL_NUMBERS = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14]

type Player = { id: string; name: string; spectator?: boolean | null }

export type WhotPlaySurfaceProps = {
  session: WhotSession
  players: Player[]
  /** the viewer's own player id — marks their seat "(you)" in the turn rail */
  myPlayerId?: string | null
  myHand: WhotCard[]
  handCounts: Record<string, number>
  rules: WhotRules
  /** the id of the seat whose turn it is */
  turnPlayerId: string | null
  isMyTurn: boolean
  /** read-only spectator / out-of-cards viewer */
  watching?: boolean
  /** hide the hand section entirely (e.g. game finished in solo practice) */
  hideHand?: boolean
  acting: boolean
  drawCount: number
  drawDepleted: boolean
  myCanPlay: boolean
  whotCallActive: boolean
  pickPenalty: { type: 'pick2' | 'pick3' | null; count: number }
  /** per-turn countdown for the active seat (from useWhotTurnTimer) */
  turnTimer?: { secondsLeft: number; hasTimer: boolean; urgent: boolean }
  /** overall game-duration timer (from useWhotGameTimer) */
  gameTimer?: { active: boolean; label: string; secondsLeft: number; durationSeconds: number }
  onPlay: (cardId: string) => void
  onDraw: () => void
  onChooseShape: (shape: WhotShape) => void
  onChooseNumber: (n: number) => void
}

export function WhotPlaySurface({
  session,
  players,
  myPlayerId,
  myHand,
  handCounts,
  rules,
  turnPlayerId,
  isMyTurn,
  watching,
  hideHand,
  acting,
  drawCount,
  drawDepleted,
  myCanPlay,
  whotCallActive,
  pickPenalty,
  turnTimer,
  gameTimer,
  onPlay,
  onDraw,
  onChooseShape,
  onChooseNumber,
}: WhotPlaySurfaceProps) {
  const [pickTab, setPickTab] = useState<'shape' | 'number'>('shape')

  // Per-turn countdown chip shown on the active seat (mono, red when urgent).
  const turnTimeLabel =
    turnTimer?.hasTimer && turnTimer.secondsLeft > 0 ? formatCountdown(turnTimer.secondsLeft) : undefined

  // Turn rail: cluster players who've already finished (winner first, then
  // runner-ups in finishing order) at the front of the rail, followed by the
  // players still playing in turn order. This keeps the "podium" together
  // instead of leaving finished players stranded in their original seat.
  const byId = new Map(players.map((p) => [p.id, p]))
  const finishOrder = session.finish_order ?? []
  const winnerId = finishOrder[0]
  const finishedIds = new Set(finishOrder)
  const orderedIds = [
    ...finishOrder.filter((id) => byId.has(id)),
    ...session.turn_order.filter((id) => !finishedIds.has(id)),
  ]
  const seats: TurnSeat[] = orderedIds
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
  const choosing = isMyTurn && !watching && session.phase === 'choose_whot'
  const canAct = isMyTurn && !watching && session.phase === 'playing'
  const turnName = players.find((p) => p.id === turnPlayerId)?.name ?? 'next player'

  // Required-match hint (shape/number the current player must follow).
  let requirement: string | null = null
  if (session.required_shape) requirement = `match ${WHOT_SHAPE_LABELS[session.required_shape]}`
  else if (session.required_number != null) requirement = `match number ${session.required_number}`

  const many = myHand.length > 8

  const drawLabel = drawDepleted
    ? 'Pass turn'
    : pickPenalty.type === 'pick2'
      ? `Draw ${pickPenalty.count} (Pick 2)`
      : pickPenalty.type === 'pick3'
        ? `Draw ${pickPenalty.count} (Pick 3)`
        : 'Draw a card'

  const gamePct =
    gameTimer && gameTimer.durationSeconds > 0
      ? Math.max(0, Math.min(100, (gameTimer.secondsLeft / gameTimer.durationSeconds) * 100))
      : 0

  return (
    <CardTableSurface variant="whot">
      {gameTimer?.active && <GameTimerBar label={gameTimer.label} pct={gamePct} low={gameTimer.secondsLeft <= 60} />}
      <TurnRail seats={seats} />

      <Table>
        <Piles
          draw={<DrawPile count={drawCount} accent={WHOT_ACCENT} />}
          discard={top ? <WhotCardFace card={top} big /> : <span className="turn-status g">No card</span>}
        />

        {/* Persistent demand badge — stays visible for the whole WHOT call, even
            after a player draws (which overwrites status_message without the hint). */}
        {requirement && (
          <div className="whot-demand" role="status">
            <span className="whot-demand__lbl">Must play</span>
            {session.required_shape ? (
              <span className="whot-demand__val">
                <WhotShapeIcon shape={session.required_shape} size="sm" />
                {WHOT_SHAPE_LABELS[session.required_shape]}
              </span>
            ) : (
              <span className="whot-demand__val">number {session.required_number}</span>
            )}
          </div>
        )}

        {/* Commentary — status_message, pick penalties and the WHOT-call prompt — is shown to
            spectators too so they can follow the action ("Ibrahim to draw 3", etc.), not just
            players. Only fall back to the plain "Spectating" hint when there's no live event. */}
        {session.status_message ? (
          <ActionToast tone="ok">{session.status_message}</ActionToast>
        ) : session.phase === 'choose_whot' ? (
          <TurnStatus>
            {!watching && isMyTurn
              ? `You played WHOT — choose ${rules.numberCallsEnabled ? 'a shape or number' : 'a shape'}`
              : `${turnName} is calling the next play…`}
          </TurnStatus>
        ) : pickPenalty.type === 'pick2' ? (
          <ActionToast tone="hot">
            🔥 Pick 2 —{' '}
            {watching
              ? `${turnName} must play a 2 or draw ${pickPenalty.count}`
              : `play a 2 or draw ${pickPenalty.count}`}
          </ActionToast>
        ) : pickPenalty.type === 'pick3' ? (
          <ActionToast tone="hot">
            🔥 Pick 3 —{' '}
            {watching
              ? `${turnName} must play a 5 or draw ${pickPenalty.count}`
              : `play a 5 or draw ${pickPenalty.count}`}
          </ActionToast>
        ) : watching ? (
          <TurnStatus muted>
            Spectating — {turnName}&apos;s turn · <span className="g">you can join the voice room</span>
          </TurnStatus>
        ) : isMyTurn ? (
          // The required shape/number is shown persistently by the demand badge
          // above, so the turn prompt no longer repeats it inline.
          <TurnStatus>Your turn</TurnStatus>
        ) : (
          <TurnStatus muted>Waiting for {turnName}…</TurnStatus>
        )}
      </Table>

      {/* Spectators see who's playing (names + card counts + whose turn) on the table
          above the draw/discard piles, so no separate standings list here. Who's-here
          + remove lives in the roster side-drawer (header people button). */}
      {watching || hideHand ? null : (
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
              <WhotCardFace
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
        <PickerOverlay title="Call the next play" desc="The next player must match what you pick.">
          {rules.numberCallsEnabled && (
            <PickerTabs
              tabs={[
                { k: 'shape', label: 'Shape' },
                { k: 'number', label: 'Number' },
              ]}
              value={pickTab}
              onPick={(k) => setPickTab(k as 'shape' | 'number')}
            />
          )}
          {pickTab === 'shape' || !rules.numberCallsEnabled ? (
            <PickerGrid>
              {WHOT_CALL_SHAPES.map((sh) => (
                <button key={sh} type="button" disabled={acting} onClick={() => onChooseShape(sh)}>
                  <WhotShapeIcon shape={sh} size="lg" />
                </button>
              ))}
            </PickerGrid>
          ) : (
            <PickerGrid nums>
              {WHOT_CALL_NUMBERS.map((n) => (
                <button key={n} type="button" disabled={acting} onClick={() => onChooseNumber(n)}>
                  {n}
                </button>
              ))}
            </PickerGrid>
          )}
        </PickerOverlay>
      )}
    </CardTableSurface>
  )
}
