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
import { useEffect, useRef, useState } from 'react'
import {
  canPlayCard,
  cardLabel,
  cardShortLabel,
  isJumpInMatch,
  multiSetGroupingOk,
  validateMultiSet,
  UNO_COLORS,
  UNO_COLOR_HEX,
  UNO_COLOR_LABELS,
  type UnoMultiPlayMode,
} from '@/lib/uno'
import { formatCountdown } from '@/lib/timer-format'
import { UNO_QUICK_MESSAGES, unoQuickMessage, type UnoQuickMessage } from '@/lib/uno-quick-messages'
import type { UnoColor, UnoCard, UnoSession } from '@/types'

/** Deck accent for the UNO card backs (classic UNO red). */
const UNO_ACCENT = '#e2231a'

/** Short glyph for the compact partner mini-cards (symbols beat long words like "Reverse"). */
function miniGlyph(card: UnoCard): string {
  switch (card.kind) {
    case 'number':
      return String(card.value ?? '')
    case 'skip':
      return '⊘'
    case 'reverse':
      return '↺'
    case 'draw2':
      return '+2'
    case 'wild':
      return '🌈'
    case 'wild_draw4':
      return '+4'
    case 'draw6':
      return '+6'
    case 'draw10':
      return '+10'
    case 'wild_reverse_draw4':
      return '↺+4'
    case 'wild_color_roulette':
      return '🎲'
    case 'discard_all':
      return 'DA'
    case 'skip_everyone':
      return '⊘⊘'
    default:
      return ''
  }
}

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
  /** Multi-Play grouping mode ('off' hides the multi-play affordance). */
  multiPlayMode?: UnoMultiPlayMode
  /** Play several cards at once (ids in play order — last stays on top). */
  onPlayMulti: (cardIds: string[]) => void
  /** Jump-In host rule is on — surfaces exact-match cards to play out of turn. */
  jumpInEnabled?: boolean
  /** Play an exact-match card out of turn (Jump-In). */
  onJumpIn?: (cardId: string) => void
  /** Team-Up: your teammate's hand, shown read-only ("Partner" panel). */
  partner?: { id: string; name: string; cards: UnoCard[] } | null
  /** Team-Up quick messages — partner-private emote channel (colour/value/action hints). */
  quickChat?: {
    incoming: { key: number; fromName: string; messageId: string } | null
    onSend: (messageId: string) => void
    onDismiss: () => void
  } | null
  /** Team-Up: after a teammate leaves, the remaining partner continues solo or forfeits. */
  onTeamLeaveDecision?: (decision: 'continue' | 'forfeit') => void
}

/** The swatch (colour) or glyph tile that fronts a quick message in both the picker and the bubble. */
function QuickMessageBadge({ msg }: { msg: UnoQuickMessage }) {
  if (msg.kind === 'color') {
    return <span className="uno-qm-swatch" style={{ background: UNO_COLOR_HEX[msg.color] }} aria-hidden />
  }
  return (
    <span className="uno-qm-glyph" aria-hidden>
      {msg.glyph}
    </span>
  )
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
  multiPlayMode = 'off',
  onPlayMulti,
  jumpInEnabled,
  onJumpIn,
  partner,
  quickChat,
  onTeamLeaveDecision,
}: UnoPlaySurfaceProps) {
  const [quickPickerOpen, setQuickPickerOpen] = useState(false)
  // Close the quick-message picker on a click/tap anywhere outside it (or Escape) —
  // so you can dismiss it without sending a hint.
  const quickTriggerRef = useRef<HTMLButtonElement>(null)
  const quickPickerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!quickPickerOpen) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (quickTriggerRef.current?.contains(t) || quickPickerRef.current?.contains(t)) return
      setQuickPickerOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickPickerOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [quickPickerOpen])
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
  // Multi-Play visibility: when a set covered earlier cards (e.g. a Draw Two under a Skip), only
  // the last card shows on the pile — surface the whole set so buried effects stay visible.
  const lastPlaySet = (session.last_play_cards as UnoCard[] | null) ?? []
  const showLastPlay = lastPlaySet.length > 1
  const choosing = isMyTurn && !watching && session.phase === 'choose_color'
  // Colour Roulette lands the picker on the NEXT player, and isMyTurn tracks that seat
  // (unoPlay bumps current_turn_index into the roulette phase). Two sub-states: BEFORE
  // the target has picked a colour (required_color null → picker overlay) and AFTER
  // (required_color set → the target clicks Draw one at a time to reveal until they hit).
  const rouletteChoosing = isMyTurn && !watching && session.phase === 'color_roulette' && !session.required_color
  const rouletteDrawing = isMyTurn && !watching && session.phase === 'color_roulette' && !!session.required_color
  const deciding = isMyTurn && !watching && session.phase === 'challenge_window'
  const swapping = isMyTurn && !watching && session.phase === 'swap_target'
  const canAct = isMyTurn && !watching && session.phase === 'playing'
  // Jump-In: out of turn, play an exact match for the settled top card. Only while the pile is
  // settled (no pending Draw penalty) and it isn't already your turn (then you'd just play normally).
  const canJumpIn =
    !!jumpInEnabled &&
    !!onJumpIn &&
    !watching &&
    !isMyTurn &&
    session.phase === 'playing' &&
    (session.draw_penalty ?? 0) === 0
  const jumpableCards = canJumpIn ? myHand.filter((c) => isJumpInMatch(c, top)) : []
  const canJumpNow = jumpableCards.length > 0
  // Stacking + challenge: a pending Wild Draw Four penalty may be challenged during normal play
  // (wd4_player_id is kept only while the challenge is available).
  const canChallengeStack =
    canAct &&
    (session.draw_penalty ?? 0) > 0 &&
    session.draw_penalty_kind === 'wild_draw4' &&
    session.wd4_player_id != null
  const turnName = players.find((p) => p.id === turnPlayerId)?.name ?? 'next player'

  // Wild Draw Four challenge context — who played it and the colour that was in play before, so the
  // targeted player can judge whether to challenge. A challenge wins if that player was *hiding* a
  // card of the previous colour (they should have played it instead of the Wild Draw Four).
  const wd4PlayerName = session.wd4_player_id ? (byId.get(session.wd4_player_id)?.name ?? 'They') : null
  const wd4PrevColor = session.challenge_prev_color as UnoColor | null
  const challengeHint =
    wd4PlayerName != null ? (
      <div className="uno-challenge-hint">
        <p className="uno-challenge-hint__lead">
          <strong>{wd4PlayerName}</strong> played a Draw 4
          {wd4PrevColor ? (
            <>
              {' '}
              over{' '}
              <span className="uno-challenge-hint__chip">
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: UNO_COLOR_HEX[wd4PrevColor],
                  }}
                />
                {UNO_COLOR_LABELS[wd4PrevColor]}
              </span>
            </>
          ) : null}
          .
        </p>
        <p className="uno-challenge-hint__q">
          Do you think {wd4PlayerName} was still holding a{' '}
          {wd4PrevColor ? <strong>{UNO_COLOR_LABELS[wd4PrevColor]}</strong> : 'matching'} card?
        </p>
        <p className="uno-challenge-hint__legend">
          <span>
            <strong>Yes</strong> → Challenge
          </span>
          <span>
            <strong>No</strong> → Draw {drawPenalty || 4}
          </span>
        </p>
      </div>
    ) : null

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

  // ── Multi-Play selection ──────────────────────────────────────────────────────
  const multiEnabled = canAct && !hasDrawn && drawPenalty === 0 && multiPlayMode !== 'off' && myHand.length >= 2
  const [multiMode, setMultiMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // Reset the builder whenever it's no longer usable (turn passed, drew, penalty, etc.).
  useEffect(() => {
    if (!multiEnabled) {
      setMultiMode(false)
      setSelectedIds([])
    }
  }, [multiEnabled])

  const handById = new Map(myHand.map((c) => [c.id, c]))
  const selectedCards = selectedIds.map((id) => handById.get(id)).filter((c): c is UnoCard => !!c)
  const multiValid =
    multiMode && selectedCards.length >= 2 && validateMultiSet(selectedCards, session, multiPlayMode) === null
  // A card can be added to the current set: as the first pick it must be playable on top;
  // afterwards it must keep the group legal under the mode.
  const canAddToSet = (card: UnoCard): boolean => {
    if (card.color === 'wild') return false
    if (selectedCards.length === 0) return canPlayCard(card, session)
    return multiSetGroupingOk([...selectedCards, card], multiPlayMode)
  }
  const toggleSelect = (card: UnoCard) => {
    setSelectedIds((prev) =>
      prev.includes(card.id) ? prev.filter((id) => id !== card.id) : canAddToSet(card) ? [...prev, card.id] : prev
    )
  }
  const enterMultiMode = () => {
    setMultiMode(true)
    setSelectedIds([])
  }
  const exitMultiMode = () => {
    setMultiMode(false)
    setSelectedIds([])
  }

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

        {/* Multi-Play reveal — the full set that was just laid, so covered cards (e.g. a Draw Two
            played under a Skip) stay visible. The rightmost chip is the card on top of the pile. */}
        {showLastPlay && (
          <div className="uno-lastplay" role="status">
            <span className="uno-lastplay__lbl">Played together</span>
            <div className="uno-lastplay__cards">
              {lastPlaySet.map((c, i) => {
                const isTop = i === lastPlaySet.length - 1
                return (
                  <span
                    key={`${c.id}-${i}`}
                    className={`uno-mini ${c.color === 'wild' ? 'uno-mini-wild' : `uno-mini-${c.color}`}${
                      isTop ? ' uno-mini--top' : ''
                    }`}
                    title={
                      isTop
                        ? `${c.color === 'wild' ? '' : `${c.color} `}${cardShortLabel(c)} — on top`
                        : `${c.color === 'wild' ? '' : `${c.color} `}${cardShortLabel(c)} — covered`
                    }
                  >
                    <span className="uno-mini-oval">{miniGlyph(c)}</span>
                  </span>
                )
              })}
            </div>
          </div>
        )}

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
          <TurnStatus>{isMyTurn ? 'Draw 4 played against you' : `${turnName} is deciding…`}</TurnStatus>
        ) : session.phase === 'swap_target' ? (
          <TurnStatus>
            {isMyTurn ? 'You played a 7 — choose a player to swap hands with' : `${turnName} is swapping hands…`}
          </TurnStatus>
        ) : session.phase === 'color_roulette' ? (
          <TurnStatus>
            {isMyTurn
              ? session.required_color
                ? `Colour Roulette on you — click Draw until you hit ${session.required_color}`
                : 'Colour Roulette on you — pick a colour'
              : `${turnName} is spinning the Color Roulette…`}
          </TurnStatus>
        ) : drawPenalty > 0 && canAct ? (
          <ActionToast tone="hot">
            🔥 Draw {drawPenalty}
            {session.draw_penalty_kind === 'draw2'
              ? ' — or stack a Draw 2'
              : session.draw_penalty_kind === 'wild_draw4'
                ? canChallengeStack
                  ? ' — stack a Draw 4, or challenge'
                  : ' — or stack a Draw 4'
                : session.draw_penalty_kind === 'draw6'
                  ? ' — or stack a Draw of 6 or higher'
                  : session.draw_penalty_kind === 'draw10'
                    ? ' — or stack a Draw 10'
                    : session.draw_penalty_kind === 'wild_reverse_draw4'
                      ? ' — or stack a Draw of 4 or higher'
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
          <div className="uno-challenge-decide">
            {challengeHint}
            <div className="uno-challenge">
              <button type="button" disabled={acting} onClick={() => onChallenge(false)}>
                Draw {drawPenalty || 4}
              </button>
              <button type="button" className="hot" disabled={acting} onClick={() => onChallenge(true)}>
                ⚖️ Challenge
              </button>
            </div>
          </div>
        )}

        {/* Team-Up: a teammate left — the remaining partner plays on solo or forfeits. */}
        {session.phase === 'team_leave_decision' &&
          !watching &&
          myPlayerId === session.team_decider_id &&
          onTeamLeaveDecision && (
            <div className="uno-team-leave">
              <p className="uno-team-leave-title">🤝 Your teammate left</p>
              <p className="uno-team-leave-desc">Play on alone against both opponents, or forfeit the round?</p>
              <div className="uno-challenge">
                <button type="button" disabled={acting} onClick={() => onTeamLeaveDecision('continue')}>
                  🙋 Continue solo · 1 v 2
                </button>
                <button type="button" className="hot" disabled={acting} onClick={() => onTeamLeaveDecision('forfeit')}>
                  🏳️ Forfeit
                </button>
              </div>
            </div>
          )}
      </Table>

      {/* Team-Up: your teammate's hand, read-only. A digital-only advantage — you can see it,
          opponents can't. */}
      {partner && (
        <div className="uno-partner">
          <div className="uno-partner-head">
            <span className="uno-partner-name">🤝 {partner.name} (partner)</span>
            <div className="uno-partner-head-right">
              {quickChat && !watching && (
                <button
                  type="button"
                  ref={quickTriggerRef}
                  className={`uno-qm-trigger${quickPickerOpen ? ' open' : ''}`}
                  aria-expanded={quickPickerOpen}
                  aria-label="Send a quick message to your partner"
                  onClick={() => setQuickPickerOpen((v) => !v)}
                >
                  💬 Hint
                </button>
              )}
              <span className="uno-partner-count">
                {partner.cards.length} card{partner.cards.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {quickChat && quickPickerOpen && !watching && (
            <div className="uno-qm-picker" role="menu" aria-label="Quick messages" ref={quickPickerRef}>
              {UNO_QUICK_MESSAGES.map((msg) => (
                <button
                  key={msg.id}
                  type="button"
                  role="menuitem"
                  className="uno-qm-chip"
                  onClick={() => {
                    quickChat.onSend(msg.id)
                    setQuickPickerOpen(false)
                  }}
                >
                  <QuickMessageBadge msg={msg} />
                  <span className="uno-qm-label">{msg.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="uno-partner-cards">
            {partner.cards.map((card) => (
              <span
                key={card.id}
                className={`uno-mini ${card.color === 'wild' ? 'uno-mini-wild' : `uno-mini-${card.color}`}`}
                title={card.color === 'wild' ? cardShortLabel(card) : `${card.color} ${cardShortLabel(card)}`}
              >
                <span className="uno-mini-oval">{miniGlyph(card)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Incoming quick message from your partner — a transient bubble, self-dismisses. */}
      {quickChat?.incoming &&
        (() => {
          const msg = unoQuickMessage(quickChat.incoming.messageId)
          if (!msg) return null
          return (
            <button
              key={quickChat.incoming.key}
              type="button"
              className="uno-qm-bubble"
              onClick={quickChat.onDismiss}
              aria-label={`${quickChat.incoming.fromName} says ${msg.label} — tap to dismiss`}
            >
              <span className="uno-qm-bubble-from">🤝 {quickChat.incoming.fromName}</span>
              <QuickMessageBadge msg={msg} />
              <span className="uno-qm-bubble-label">{msg.label}</span>
            </button>
          )
        })()}

      {watching ? null : (
        <Hand
          count={myHand.length}
          many={many}
          hint={
            multiMode
              ? selectedCards.length
                ? `${selectedCards.length} selected — the last card you pick lands on top`
                : 'Tap matching cards to lay them down together'
              : rouletteDrawing
                ? `Colour Roulette — click Draw until you turn up a ${session.required_color}`
                : hasDrawn
                  ? 'You drew a card — play it or keep it'
                  : canAct
                    ? `Tap a highlighted card to play it${many ? ' · swipe to see more' : ''}`
                    : canJumpNow
                      ? `⚡ Jump-In! Tap your ${cardLabel(top!)} to play it out of turn`
                      : undefined
          }
          actions={
            <>
              {owesUnoCall && (
                <button type="button" className="uno-call-btn" disabled={acting} onClick={onCallUno}>
                  Last card!
                </button>
              )}
              {canChallengeStack ? (
                // Draw (accept) + Challenge side by side, in the pinned hand actions so both
                // stay on-screen together — plus you can still tap a Wild Draw Four to stack.
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                  {challengeHint}
                  <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                    <button
                      type="button"
                      className="fr-btn fr-btn--secondary"
                      style={{ flex: 1 }}
                      disabled={acting}
                      onClick={onDraw}
                    >
                      Draw {drawPenalty}
                    </button>
                    <button
                      type="button"
                      className="fr-btn fr-btn--primary"
                      style={{ flex: 1 }}
                      disabled={acting}
                      onClick={() => onChallenge(true)}
                    >
                      ⚖️ Challenge
                    </button>
                  </div>
                </div>
              ) : multiMode ? (
                <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                  <button
                    type="button"
                    className="fr-btn fr-btn--secondary"
                    style={{ flex: 1 }}
                    disabled={acting}
                    onClick={exitMultiMode}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="fr-btn fr-btn--primary"
                    style={{ flex: 2 }}
                    disabled={acting || !multiValid}
                    onClick={() => {
                      const ids = selectedIds
                      exitMultiMode()
                      onPlayMulti(ids)
                    }}
                  >
                    Play {selectedCards.length || ''} card{selectedCards.length === 1 ? '' : 's'}
                  </button>
                </div>
              ) : hasDrawn ? (
                <button
                  type="button"
                  className="fr-btn fr-btn--secondary fr-btn--block"
                  disabled={acting}
                  onClick={onPass}
                >
                  Keep it
                </button>
              ) : rouletteDrawing ? (
                // Colour Roulette reveal: one card per click until the target hits their
                // chosen colour. Server-side processUnoDraw routes to the roulette-reveal
                // helper when phase === 'color_roulette'.
                <button
                  type="button"
                  className="fr-btn fr-btn--primary fr-btn--block"
                  disabled={acting}
                  onClick={onDraw}
                >
                  Draw a card
                </button>
              ) : (
                <>
                  {canAct && !(drawDepleted && myCanPlay) ? (
                    <button
                      type="button"
                      className="fr-btn fr-btn--secondary fr-btn--block"
                      disabled={acting}
                      onClick={onDraw}
                    >
                      {drawLabel}
                    </button>
                  ) : null}
                  {multiEnabled && (
                    <button
                      type="button"
                      className="fr-btn fr-btn--ghost fr-btn--block"
                      disabled={acting}
                      onClick={enterMultiMode}
                    >
                      ➕ Play multiple
                    </button>
                  )}
                </>
              )}
            </>
          }
        >
          {myHand.map((card) => {
            if (multiMode) {
              const selected = selectedIds.includes(card.id)
              const eligible = selected || canAddToSet(card)
              return (
                <UnoCardFace
                  key={card.id}
                  card={card}
                  playable={eligible && !selected}
                  sel={selected}
                  dim={!eligible}
                  onClick={eligible && !acting ? () => toggleSelect(card) : undefined}
                />
              )
            }
            const normalPlayable = canAct && canPlayCard(card, session)
            const jumpable = canJumpIn && isJumpInMatch(card, top)
            const playable = normalPlayable || jumpable
            const clickable = playable && !acting
            const onClick = clickable ? (normalPlayable ? () => onPlay(card.id) : () => onJumpIn?.(card.id)) : undefined
            return (
              <UnoCardFace
                key={card.id}
                card={card}
                playable={playable}
                sel={card.id === session.drawn_card_id}
                // Spotlight the matches: dim non-playable cards on your turn, and dim
                // everything but the exact matches when a Jump-In is available.
                dim={(canAct && !playable) || (canJumpIn && !jumpable)}
                onClick={onClick}
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

      {rouletteChoosing && (
        <PickerOverlay
          title="Colour Roulette — pick a colour"
          desc="You'll reveal cards from the draw pile until you turn up a card of this colour. Everything revealed lands in your hand."
        >
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
                <span className="uno-swap-av">{p.name.charAt(0).toUpperCase()}</span>
                <span className="uno-swap-meta">
                  <span className="uno-swap-name">{p.name}</span>
                  <span className="uno-swap-count">
                    {handCounts[p.id] ?? 0} card{(handCounts[p.id] ?? 0) === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </PickerOverlay>
      )}
    </CardTableSurface>
  )
}
