'use client'

/**
 * UNO — design-system play surface (player, mobile-faithful).
 *
 * Presentational shell for the active / watching states of UnoPlayerView +
 * UnoHostView, ported from the "Card Table" design that Whot + Crazy Eights use.
 * It renders the turn rail, the felt (draw + discard piles, required-colour
 * demand, status / toasts), the fanned hand + draw action, the colour picker
 * (Wild / Wild Draw Four), the Wild Draw Four challenge choice, and the
 * "Call UNO!" button — all via the shared card-table primitives.
 *
 * PRESENTATION ONLY — every game action is delegated to the callbacks passed in
 * from the view; no state or logic lives here.
 */

import {
  ActionToast,
  CardTableSurface,
  DrawPile,
  GameTimerBar,
  Hand,
  PickerOverlay,
  Piles,
  Table,
  TurnRail,
  TurnStatus,
  UnoCardFace,
  type TurnSeat,
} from '@/components/rooms/card-table/primitives'
import { canPlayCard, UNO_COLORS, UNO_COLOR_HEX, UNO_COLOR_LABELS } from '@/lib/uno'
import { formatCountdown } from '@/lib/timer-format'
import type { UnoColor, UnoCard, UnoSession } from '@/types'

/** Deck accent for the UNO card backs (classic UNO red). */
const UNO_ACCENT = '#e2231a'

type Player = { id: string; name: string; spectator?: boolean | null }

export type UnoPlaySurfaceProps = {
  session: UnoSession
  players: Player[]
  /** the viewer's own player id — marks their seat "(you)" in the turn rail */
  myPlayerId?: string | null
  myHand: UnoCard[]
  handCounts: Record<string, number>
  /** the id of the seat whose turn it is */
  turnPlayerId: string | null
  isMyTurn: boolean
  /** read-only spectator / out-of-cards viewer */
  watching?: boolean
  acting: boolean
  drawCount: number
  drawDepleted: boolean
  myCanPlay: boolean
  /** pending forced draw the current player must take (Draw Two / Draw Four) */
  drawPenalty: number
  /** per-turn countdown for the active seat (from useUnoTurnTimer) */
  turnTimer?: { secondsLeft: number; hasTimer: boolean; urgent: boolean }
  /** overall game-duration timer (from useUnoGameTimer) */
  gameTimer?: { active: boolean; label: string; secondsLeft: number; durationSeconds: number }
  onPlay: (cardId: string) => void
  onDraw: () => void
  onChooseColor: (color: UnoColor) => void
  onChallenge: (challenge: boolean) => void
  onCallUno: () => void
  /** 0-7 rule: pick whose hand to swap with after playing a 7. */
  onSwap: (targetId: string) => void
  /** Keep the card you just drew instead of playing it (ends your turn). */
  onPass: () => void
}

export function UnoPlaySurface({
  session,
  players,
  myPlayerId,
  myHand,
  handCounts,
  turnPlayerId,
  isMyTurn,
  watching,
  acting,
  drawCount,
  drawDepleted,
  myCanPlay,
  drawPenalty,
  turnTimer,
  gameTimer,
  onPlay,
  onDraw,
  onChooseColor,
  onChallenge,
  onCallUno,
  onSwap,
  onPass,
}: UnoPlaySurfaceProps) {
  const turnTimeLabel =
    turnTimer?.hasTimer && turnTimer.secondsLeft > 0 ? formatCountdown(turnTimer.secondsLeft) : undefined

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
  const choosing = isMyTurn && !watching && session.phase === 'choose_color'
  const deciding = isMyTurn && !watching && session.phase === 'challenge_window'
  const swapping = isMyTurn && !watching && session.phase === 'swap_target'
  const canAct = isMyTurn && !watching && session.phase === 'playing'
  const turnName = players.find((p) => p.id === turnPlayerId)?.name ?? 'next player'

  // 0-7 rule: candidates to swap hands with (other seated players still holding cards).
  const swapTargets = session.turn_order
    .filter((id) => id !== myPlayerId && (handCounts[id] ?? 0) > 0)
    .map((id) => byId.get(id))
    .filter((p): p is Player => !!p)

  const requiredColor = session.required_color
  const reversed = session.direction < 0

  // "Call UNO!" is owed when I dropped to one card and haven't called yet.
  const owesUnoCall = !watching && session.uno_pending_player === myPlayerId && !session.uno_called

  // After a voluntary draw, the drawn (playable) card can be played or kept — show "Keep it".
  const hasDrawn = canAct && session.drawn_card_id != null

  const many = myHand.length > 8

  const drawLabel = drawDepleted ? 'Pass turn' : drawPenalty > 0 ? `Draw ${drawPenalty}` : 'Draw a card'

  const gamePct =
    gameTimer && gameTimer.durationSeconds > 0
      ? Math.max(0, Math.min(100, (gameTimer.secondsLeft / gameTimer.durationSeconds) * 100))
      : 0

  return (
    <CardTableSurface variant="uno">
      {gameTimer?.active && <GameTimerBar label={gameTimer.label} pct={gamePct} low={gameTimer.secondsLeft <= 60} />}
      <TurnRail seats={seats} />

      <Table>
        <Piles
          draw={<DrawPile count={drawCount} accent={UNO_ACCENT} />}
          discard={top ? <UnoCardFace card={top} big /> : <span className="turn-status g">No card</span>}
        />

        {/* Persistent demand badge — the called colour stays visible for the whole
            call, even after a player draws (which overwrites status_message). */}
        {requiredColor && (
          <div className="whot-demand" role="status">
            <span className="whot-demand__lbl">Must play</span>
            <span className="whot-demand__val">
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: UNO_COLOR_HEX[requiredColor],
                }}
              />
              {UNO_COLOR_LABELS[requiredColor]}
            </span>
          </div>
        )}

        {watching ? (
          <TurnStatus muted>
            Spectating — {turnName}&apos;s turn · <span className="g">you can join the voice room</span>
          </TurnStatus>
        ) : session.status_message ? (
          <ActionToast tone="ok">{session.status_message}</ActionToast>
        ) : session.phase === 'choose_color' ? (
          <TurnStatus>
            {isMyTurn ? 'You played a wild card — choose the colour to match' : `${turnName} is choosing a colour…`}
          </TurnStatus>
        ) : session.phase === 'challenge_window' ? (
          <TurnStatus>{isMyTurn ? 'Wild Draw Four played against you' : `${turnName} is deciding…`}</TurnStatus>
        ) : session.phase === 'swap_target' ? (
          <TurnStatus>
            {isMyTurn ? 'You played a 7 — choose a player to swap hands with' : `${turnName} is swapping hands…`}
          </TurnStatus>
        ) : drawPenalty > 0 && canAct ? (
          <ActionToast tone="hot">
            🔥 Draw {drawPenalty}
            {session.draw_penalty_kind === 'draw2'
              ? ' — or stack a Draw Two'
              : session.draw_penalty_kind === 'wild_draw4'
                ? ' — or stack a Wild Draw Four'
                : ' — no defence'}
          </ActionToast>
        ) : isMyTurn ? (
          <TurnStatus>Your turn</TurnStatus>
        ) : (
          <TurnStatus muted>Waiting for {turnName}…</TurnStatus>
        )}

        {reversed && <div className="act-toast warn">↺ Play reversed</div>}

        {/* Wild Draw Four challenge — the targeted player accepts or challenges. */}
        {deciding && (
          <div className="uno-challenge">
            <button type="button" disabled={acting} onClick={() => onChallenge(false)}>
              Draw {drawPenalty || 4}
            </button>
            <button type="button" className="hot" disabled={acting} onClick={() => onChallenge(true)}>
              ⚖️ Challenge
            </button>
          </div>
        )}
      </Table>

      {watching ? null : (
        <Hand
          count={myHand.length}
          many={many}
          hint={
            hasDrawn
              ? 'You drew a card — play it or keep it'
              : canAct
                ? `Tap a highlighted card to play it${many ? ' · swipe to see more' : ''}`
                : undefined
          }
          actions={
            <>
              {owesUnoCall && (
                <button type="button" className="uno-call-btn" disabled={acting} onClick={onCallUno}>
                  Call UNO!
                </button>
              )}
              {hasDrawn ? (
                <button
                  type="button"
                  className="fr-btn fr-btn--secondary fr-btn--block"
                  disabled={acting}
                  onClick={onPass}
                >
                  Keep it
                </button>
              ) : canAct && !(drawDepleted && myCanPlay) ? (
                <button
                  type="button"
                  className="fr-btn fr-btn--secondary fr-btn--block"
                  disabled={acting}
                  onClick={onDraw}
                >
                  {drawLabel}
                </button>
              ) : null}
            </>
          }
        >
          {myHand.map((card) => {
            const playable = canAct && canPlayCard(card, session)
            return (
              <UnoCardFace
                key={card.id}
                card={card}
                playable={playable}
                sel={card.id === session.drawn_card_id}
                dim={canAct && !playable}
                onClick={playable && !acting ? () => onPlay(card.id) : undefined}
              />
            )
          })}
        </Hand>
      )}

      {choosing && (
        <PickerOverlay title="Choose a colour" desc="The next player must match the colour you pick.">
          <div className="picker-grid uno">
            {UNO_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`uno-${color}`}
                disabled={acting}
                aria-label={UNO_COLOR_LABELS[color]}
                title={UNO_COLOR_LABELS[color]}
                onClick={() => onChooseColor(color)}
              >
                {UNO_COLOR_LABELS[color]}
              </button>
            ))}
          </div>
        </PickerOverlay>
      )}

      {swapping && (
        <PickerOverlay title="Swap hands" desc="Pick a player to trade your whole hand with (7 rule).">
          <div className="uno-swap-list">
            {swapTargets.map((p) => (
              <button key={p.id} type="button" disabled={acting} onClick={() => onSwap(p.id)}>
                <span className="uno-swap-name">{p.name}</span>
                <span className="uno-swap-count">
                  {handCounts[p.id] ?? 0} card{(handCounts[p.id] ?? 0) === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        </PickerOverlay>
      )}
    </CardTableSurface>
  )
}
