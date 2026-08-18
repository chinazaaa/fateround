import type { Game, UnoCard, UnoCardColor, UnoColor, UnoPlayerHand, UnoSession } from './types'

/**
 * Client-safe UNO helpers — mirrors the read-only half of web's `src/lib/uno.ts`.
 * The mutation/server functions (initializeUnoGame, processUnoPlay, processUnoDraw, …) stay
 * web-only: mobile never writes uno_sessions/uno_player_hands directly, it calls the same
 * web API routes over HTTP (see apps/mobile/lib/game-api.ts postUno*). Only the pure
 * display/validation logic needed to render the board and pre-validate a tap is duplicated here.
 *
 * PHASE 2: Multi-Play, Team-Up (2v2), Jump-In, and Team-Up quick-chat are now wired into
 * mobile UI (see apps/mobile/components/games/UnoPlayerView.tsx and
 * apps/mobile/hooks/useUnoQuickChat.ts).
 */

export const UNO_MIN_PLAYERS = 2
export const UNO_MAX_PLAYERS = 10
export const UNO_DEFAULT_MAX_PLAYERS = 6

/** Cards dealt to each player at the start of a hand. */
export const UNO_DEAL_COUNT = 7

/** Whole-game session length (seconds). 0 = no limit. */
export const UNO_GAME_DURATION_OPTIONS = [0, 600, 900, 1800, 2700, 3600, 5400] as const

/** The four playable colours (excludes the colourless `wild` slot). */
export const UNO_COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue']

export const UNO_COLOR_LABELS: Record<UnoColor, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
}

/** Hex accents for each colour — mirrors the web card faces. */
export const UNO_COLOR_HEX: Record<UnoColor, string> = {
  red: '#ef4444',
  yellow: '#f59e0b',
  green: '#22c55e',
  blue: '#3b82f6',
}

// ── Rules ───────────────────────────────────────────────────────────────────────
export type UnoMode = 'classic' | 'no_mercy'
export type UnoNoMercyWin = 'first_out' | 'last_standing'

/** Mercy rule: hitting this many cards in No Mercy knocks the player out. */
export const UNO_MERCY_HAND_LIMIT = 25

export type UnoRules = {
  /** Top-level UNO shape. */
  mode: UnoMode
  /** Allow challenging a Wild Draw Four. Core. Forced OFF in No Mercy. */
  wd4Challenge: boolean
  /** Cards drawn for a missed "UNO" call. Core. */
  unoPenalty: number
  /** Cards a failed challenger draws. Core. */
  wd4ChallengePenalty: number
  /** 0 = all hands pass in play direction; 7 = swap hands with a chosen player.
   *  Forced ON in No Mercy. */
  zeroSeven: boolean
  /** Allow stacking Draw cards. Forced ON in No Mercy (with cross-kind equal-or-higher chaining). */
  stacking: boolean
  /** Multi-Play grouping rule. */
  multiPlay: UnoMultiPlayMode
  /** 2v2 Team-Up mode. */
  teamMode: boolean
  /** Jump-In. */
  jumpIn: boolean
  /** No Mercy: how the round ends. Ignored in Classic. */
  noMercyWin: UnoNoMercyWin
}

export const UNO_TEAM_PLAYERS = 4

/** Multi-Play grouping rule. `off` = Classic (one card per turn). Phase 2 — unused on mobile. */
export type UnoMultiPlayMode = 'off' | 'same_color' | 'same_number' | 'same_color_or_number'

const MULTI_PLAY_MODES: UnoMultiPlayMode[] = ['off', 'same_color', 'same_number', 'same_color_or_number']

export function parseMultiPlayMode(raw: unknown): UnoMultiPlayMode {
  return (MULTI_PLAY_MODES as readonly string[]).includes(String(raw)) ? (raw as UnoMultiPlayMode) : 'off'
}

export function parseUnoMode(raw: unknown): UnoMode {
  return raw === 'no_mercy' ? 'no_mercy' : 'classic'
}

export function parseUnoNoMercyWin(raw: unknown): UnoNoMercyWin {
  return raw === 'last_standing' ? 'last_standing' : 'first_out'
}

export function parseUnoRules(
  game:
    | Pick<
        Game,
        | 'uno_wd4_challenge'
        | 'uno_uno_penalty'
        | 'uno_wd4_challenge_penalty'
        | 'uno_zero_seven'
        | 'uno_stacking'
        | 'uno_multi_play_mode'
        | 'uno_team_mode'
        | 'uno_jump_in'
        | 'uno_mode'
        | 'uno_no_mercy_win'
      >
    | null
    | undefined
): UnoRules {
  const penalty = Number(game?.uno_uno_penalty ?? 2)
  const wd4Penalty = Number(game?.uno_wd4_challenge_penalty ?? 6)
  const mode = parseUnoMode(game?.uno_mode)
  const noMercy = mode === 'no_mercy'
  return {
    mode,
    // No Mercy has no WD4 challenge, forces 0/7 and stacking on, and disables Team-Up.
    wd4Challenge: noMercy ? false : game?.uno_wd4_challenge !== false,
    unoPenalty: penalty === 4 ? 4 : 2,
    wd4ChallengePenalty: wd4Penalty === 4 ? 4 : 6,
    zeroSeven: noMercy ? true : game?.uno_zero_seven === true,
    stacking: noMercy ? true : game?.uno_stacking === true,
    // High Stakes has Discard Colour (drop every card of a colour in one turn) built in, so
    // Multi-Play adds little on top and interacts badly with cross-kind Draw stacking. Forced off.
    // Multi-Play is allowed in High Stakes too — mirrors src/lib/uno.ts.
    multiPlay: parseMultiPlayMode(game?.uno_multi_play_mode),
    teamMode: noMercy ? false : game?.uno_team_mode === true,
    // Jump-In is OFF in High Stakes (see src/lib/uno.ts sibling for the reason).
    jumpIn: noMercy ? false : game?.uno_jump_in === true,
    noMercyWin: parseUnoNoMercyWin(game?.uno_no_mercy_win),
  }
}

export function clampUnoGameDuration(raw: unknown): number {
  const n = Number(raw ?? 0)
  return (UNO_GAME_DURATION_OPTIONS as readonly number[]).includes(n) ? n : 0
}

export function formatUnoGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} minutes`
}

// ── Card helpers ──────────────────────────────────────────────────────────────
// Keep in lockstep with src/lib/uno.ts. draw6 + draw10 are colourless — they take a
// colour choice and can carry pending penalties through choose_color.
const WILD_KINDS: UnoCard['kind'][] = [
  'wild',
  'wild_draw4',
  'wild_reverse_draw4',
  'wild_color_roulette',
  'draw6',
  'draw10',
]

export function isWildCard(card: UnoCard): boolean {
  return WILD_KINDS.includes(card.kind)
}

export function isActionCard(card: UnoCard): boolean {
  return (
    card.kind === 'skip' ||
    card.kind === 'reverse' ||
    card.kind === 'draw2' ||
    card.kind === 'discard_all' ||
    card.kind === 'skip_everyone'
  )
}

/**
 * Draw penalty this card carries when played / stacked. 0 = not a draw card.
 * Used by No-Mercy stacking (any Draw card can stack onto a pending penalty of equal or lower value).
 */
export function drawCardValue(kind: UnoCard['kind']): number {
  switch (kind) {
    case 'draw2':
      return 2
    case 'wild_draw4':
    case 'wild_reverse_draw4':
      return 4
    case 'draw6':
      return 6
    case 'draw10':
      return 10
    default:
      return 0
  }
}

export function isDrawCard(card: UnoCard): boolean {
  return drawCardValue(card.kind) > 0
}

const KIND_SHORT: Record<UnoCard['kind'], string> = {
  number: '',
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: '+2',
  wild: 'Wild',
  wild_draw4: '+4',
  discard_all: 'Discard Colour',
  skip_everyone: 'Skip All',
  draw6: '+6',
  draw10: '+10',
  wild_reverse_draw4: 'Reverse +4',
  wild_color_roulette: 'Roulette',
}

export function cardLabel(card: UnoCard): string {
  if (card.kind === 'number') return `${UNO_COLOR_LABELS[card.color as UnoColor]} ${card.value}`
  if (card.kind === 'wild') return 'Wild'
  if (card.kind === 'wild_draw4') return 'Draw 4'
  if (card.kind === 'wild_reverse_draw4') return 'Reverse Draw 4'
  if (card.kind === 'wild_color_roulette') return 'Colour Roulette'
  if (card.kind === 'draw6') return 'Draw 6'
  if (card.kind === 'draw10') return 'Draw 10'
  return `${UNO_COLOR_LABELS[card.color as UnoColor]} ${KIND_SHORT[card.kind]}`
}

export function cardShortLabel(card: UnoCard): string {
  if (card.kind === 'number') return String(card.value)
  return KIND_SHORT[card.kind]
}

/** Points a card is worth when tallying hands at game end (lowest wins). */
export function cardPoints(card: UnoCard): number {
  if (card.kind === 'number') return card.value ?? 0
  if (isWildCard(card)) return 50
  return 20 // any coloured action card
}

export function unoHandSum(cards: UnoCard[]): number {
  return cards.reduce((sum, card) => sum + cardPoints(card), 0)
}

// ── Team-Up (2v2) ────────────────────────────────────────────────────────────────
/**
 * Team-Up teams are derived from seating parity: turn_order alternates A–B–A–B, so seats at
 * even indices are team 0 and odd indices are team 1. Returns the team (0/1) for a player, or
 * null if they're not seated.
 */
export function unoTeamIndex(turnOrder: string[], playerId: string): 0 | 1 | null {
  const i = (turnOrder ?? []).indexOf(playerId)
  if (i < 0) return null
  return (i % 2) as 0 | 1
}

/** The player id of `playerId`'s teammate (same parity, other seat), or null. */
export function unoTeammateId(turnOrder: string[], playerId: string): string | null {
  const order = turnOrder ?? []
  const i = order.indexOf(playerId)
  if (i < 0) return null
  return order.find((id, j) => j !== i && j % 2 === i % 2) ?? null
}

/** Ids of players who left mid-round — kept in turn_order (parity) but skipped by play + placement. */
export function unoLeftPlayerIds(session: Pick<UnoSession, 'left_player_ids'>): string[] {
  return (session.left_player_ids as string[] | undefined) ?? []
}

/**
 * Did `playerId` win this round? True for the winner, and — in Team-Up — also for
 * the winner's teammate (both partners share the win).
 */
export function unoPlayerSharesWin(
  turnOrder: string[],
  winnerId: string | null | undefined,
  playerId: string | null | undefined,
  teamMode: boolean
): boolean {
  if (!winnerId || !playerId) return false
  if (winnerId === playerId) return true
  return teamMode && unoTeammateId(turnOrder ?? [], winnerId) === playerId
}

export function currentPlayerId(session: UnoSession): string | null {
  const order = session.turn_order ?? []
  if (order.length === 0) return null
  const len = order.length
  return order[((session.current_turn_index % len) + len) % len] ?? null
}

export function unoTurnDeadline(timerSeconds: number): string | null {
  if (!timerSeconds || timerSeconds <= 0) return null
  return new Date(Date.now() + timerSeconds * 1000).toISOString()
}

export function unoSecondsLeft(deadlineAt: string | null | undefined): number {
  if (!deadlineAt) return 0
  return Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000))
}

export function specialCardMessage(card: UnoCard): string | null {
  switch (card.kind) {
    case 'skip':
      return 'Skip — next player loses their turn'
    case 'reverse':
      return 'Reverse — direction of play flips'
    case 'draw2':
      return 'Draw 2 — next player draws 2 and loses their turn'
    case 'wild':
      return 'Wild — choose a colour'
    case 'wild_draw4':
      return 'Draw 4 — next player draws 4 and loses their turn'
    case 'discard_all':
      return 'Discard Colour — drop every matching-colour card in your hand'
    case 'skip_everyone':
      return 'Skip All — everyone else is skipped, go again'
    case 'draw6':
      return 'Draw 6 — next player draws 6 and loses their turn'
    case 'draw10':
      return 'Draw 10 — next player draws 10 and loses their turn'
    case 'wild_reverse_draw4':
      return 'Reverse Draw 4 — reverse, then next player draws 4'
    case 'wild_color_roulette':
      return 'Colour Roulette — next player picks a colour and draws until they hit it'
    default:
      return null
  }
}

/** Colour the current top card / call demands the next player match. */
export function activeColor(session: UnoSession): UnoColor | null {
  if (session.required_color) return session.required_color
  const top = session.top_card
  if (!top || top.color === 'wild') return null
  return top.color as UnoColor
}

export function canPlayCard(card: UnoCard, session: UnoSession): boolean {
  // A pending forced draw (Draw Two / Draw Four / Six / Ten / Wild Rev Draw 4) must be taken —
  // unless a Draw card of equal or higher value is played to stack. In Classic stacking,
  // draw_penalty_kind is set to the ONLY compatible kind ('draw2' or 'wild_draw4'). In No Mercy
  // stacking, any Draw card whose value >= the pending value is legal.
  if ((session.draw_penalty ?? 0) > 0) {
    const pendingKind = session.draw_penalty_kind
    if (!pendingKind) return false
    const cardVal = drawCardValue(card.kind)
    if (cardVal === 0) return false
    const pendingVal = drawCardValue(pendingKind)
    // Classic stacking is same-kind only; No Mercy uses value-based cross-kind chaining.
    // We treat any pending kind that isn't 'draw2' / 'wild_draw4' as No-Mercy-only, and
    // for the two classic kinds we require an exact kind match to preserve classic behaviour.
    if (pendingKind === 'draw2' || pendingKind === 'wild_draw4') {
      // Classic path — must be exact kind. No Mercy allows any >= draw card.
      // We can't see the mode here, but new draw kinds don't exist in a classic deck, so any
      // caller that produces them is by definition running No Mercy — allow value-based stacking.
      if (card.kind === pendingKind) return true
      if (
        cardVal >= pendingVal &&
        (card.kind === 'draw6' || card.kind === 'draw10' || card.kind === 'wild_reverse_draw4')
      ) {
        return true
      }
      return false
    }
    return cardVal >= pendingVal
  }

  if (isWildCard(card)) return true

  const reqColor = session.required_color
  if (reqColor) return card.color === reqColor

  const top = session.top_card
  if (!top) return true
  if (top.color === 'wild' && !reqColor) return true

  if (card.color === top.color) return true
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  if (card.kind !== 'number' && card.kind === top.kind) return true
  return false
}

export function playPenaltyError(card: UnoCard, session: UnoSession): string | null {
  const penalty = session.draw_penalty ?? 0
  if (penalty <= 0) return null
  if (canPlayCard(card, session)) return null // a legal stack
  const kind = session.draw_penalty_kind
  if (kind === 'draw2') return `Draw ${penalty} — stack with a Draw 2 (or higher in High Stakes)`
  if (kind === 'wild_draw4') return `Draw ${penalty} — stack with a Draw 4 (or higher in High Stakes)`
  return `Draw ${penalty} — stack with a Draw card of equal or higher value`
}

export function hasPlayableCard(hand: UnoCard[], session: UnoSession): boolean {
  return hand.some((c) => canPlayCard(c, session))
}

/**
 * Jump-In eligibility: `card` is an EXACT match for the settled top card — same colour AND same
 * number (for number cards) or same symbol (Skip/Reverse/Draw Two). Wild and Wild Draw Four are
 * never eligible (no fixed colour/number to match).
 */
export function isJumpInMatch(card: UnoCard, top: UnoCard | null): boolean {
  if (!top) return false
  if (isWildCard(card) || isWildCard(top)) return false
  if (card.color !== top.color) return false
  if (card.kind === 'number' && top.kind === 'number') return card.value === top.value
  return card.kind !== 'number' && card.kind === top.kind
}

// ── Multi-Play ──────────────────────────────────────────────────────────────────
/** A card that can be part of a Multi-Play set (wilds are colourless — must be played alone). */
export function isMultiPlayableCard(card: UnoCard): boolean {
  return !isWildCard(card)
}

/** Do these cards form a legal Multi-Play group under the mode? Order-independent. */
export function multiSetGroupingOk(cards: UnoCard[], mode: UnoMultiPlayMode): boolean {
  if (mode === 'off' || cards.length < 2) return false
  if (cards.some((c) => isWildCard(c))) return false
  const first = cards[0]!
  const allSameColor = cards.every((c) => c.color === first.color)
  const allSameValue = cards.every((c) => c.kind === 'number' && c.value === first.value)
  if (mode === 'same_color') return allSameColor
  if (mode === 'same_number') return allSameValue
  return allSameColor || allSameValue // same_color_or_number
}

/**
 * Validate a Multi-Play. `cards` are IN PLAY ORDER — the FIRST must legally match the top of
 * the discard, and every card must satisfy the grouping rule. Returns an error string or null.
 */
export function validateMultiSet(cards: UnoCard[], session: UnoSession, mode: UnoMultiPlayMode): string | null {
  if (mode === 'off') return 'Multi-Play is off'
  if ((session.draw_penalty ?? 0) > 0) return 'Resolve the draw penalty first'
  if (cards.length < 2) return 'Select at least two cards'
  if (cards.some((c) => isWildCard(c))) return 'Wild cards must be played on their own'
  if (!multiSetGroupingOk(cards, mode)) {
    return mode === 'same_color'
      ? 'All cards must be the same colour'
      : mode === 'same_number'
        ? 'All cards must be the same number'
        : 'All cards must share a colour or a number'
  }
  if (!canPlayCard(cards[0]!, session)) return 'The first card must match the top card'
  return null
}

export function unoHandCount(hands: UnoPlayerHand[], playerId: string): number {
  return ((hands.find((h) => h.player_id === playerId)?.cards as UnoCard[]) ?? []).length
}

/** True when the player has no cards left and is watching the rest of the game. */
export function isUnoPlayerOut(handCount: number, spectator?: boolean | null): boolean {
  return handCount === 0 || spectator === true
}

/**
 * Shared by the server (full row, service role) and the client (redacted row: `draw_pile` and
 * `discard_pile` are revoked from anon/authenticated, only the generated counts come back).
 *
 * Prefer the counts; fall back to the array lengths for service-role rows and fixtures written
 * before the counts existed. Where NEITHER is readable, return `false` — "I cannot see the pile"
 * must never be reported as "the pile is empty", which would flip live games into pass-turn and
 * reshuffle states on a redacted field read as meaningful state.
 */
export function isDrawPileDepleted(session: UnoSession): boolean {
  const drawLen = session.draw_count ?? (Array.isArray(session.draw_pile) ? session.draw_pile.length : null)
  const discardLen = session.discard_count ?? (Array.isArray(session.discard_pile) ? session.discard_pile.length : null)
  if (drawLen == null || discardLen == null) return false
  return drawLen === 0 && discardLen === 0
}

export function unoGameSessionExpired(
  sessionStartedAt: string | null | undefined,
  durationSeconds: number | null | undefined
): boolean {
  if (!durationSeconds || durationSeconds <= 0) return false
  if (!sessionStartedAt) return false
  const deadline = new Date(sessionStartedAt).getTime() + durationSeconds * 1000
  return deadline <= Date.now()
}

// ── Standings / placement ───────────────────────────────────────────────────────
export type UnoStanding = {
  playerId: string
  name: string
  cardCount: number
  handSum: number
  rank: number
}

type UnoRankableHand = { player_id: string; cards: UnoCard[] | null }

/**
 * Final placement order (1st → last). Players who emptied their hand rank FIRST, in the
 * exact order they finished (`finishOrder`); everyone still holding cards follows, ordered
 * by lowest hand total then fewest cards. Mirrors web's unoPlacementOrder, including the
 * Team-Up branch (teams win/lose together).
 */
export function unoPlacementOrder(
  hands: UnoRankableHand[],
  turnOrder: string[],
  finishOrder: string[],
  teamMode = false,
  leftPlayerIds: string[] = [],
  // No Mercy — Mercy-knockout ids ALWAYS sort after every live seat, regardless of
  // hand-sum. Mirrors src/lib/uno.ts.
  eliminatedPlayerIds: string[] = []
): string[] {
  const activeIds = new Set(turnOrder ?? [])
  const finished = (finishOrder ?? []).filter((id) => activeIds.has(id))
  const finishedSet = new Set(finished)
  const leftSet = new Set(leftPlayerIds)
  const eliminatedSet = new Set(eliminatedPlayerIds)

  const order = turnOrder ?? []
  if (teamMode && order.length === UNO_TEAM_PLAYERS) {
    const sumOf = (id: string) => unoHandSum((hands.find((h) => h.player_id === id)?.cards as UnoCard[]) ?? [])
    const teamActive = (parity: number) => order.filter((id, i) => i % 2 === parity && !leftSet.has(id))
    let winTeam: number
    if (finished.length > 0) winTeam = order.indexOf(finished[0]!) % 2
    else if (teamActive(0).length === 0) winTeam = 1
    else if (teamActive(1).length === 0) winTeam = 0
    else {
      const s0 = teamActive(0).reduce((s, id) => s + sumOf(id), 0)
      const s1 = teamActive(1).reduce((s, id) => s + sumOf(id), 0)
      winTeam = s0 <= s1 ? 0 : 1
    }
    const byLeft = (a: string, b: string) => (leftSet.has(a) ? 1 : 0) - (leftSet.has(b) ? 1 : 0)
    const winners = order
      .filter((_, i) => i % 2 === winTeam)
      .sort(
        (a, b) =>
          byLeft(a, b) ||
          (finishedSet.has(b) ? 1 : 0) - (finishedSet.has(a) ? 1 : 0) ||
          sumOf(a) - sumOf(b) ||
          a.localeCompare(b)
      )
    const losers = order
      .filter((_, i) => i % 2 !== winTeam)
      .sort((a, b) => byLeft(a, b) || sumOf(a) - sumOf(b) || a.localeCompare(b))
    return [...winners, ...losers]
  }
  const stillHolding = hands
    .filter((h) => activeIds.has(h.player_id) && !finishedSet.has(h.player_id))
    .map((h) => {
      const cards = (h.cards as UnoCard[]) ?? []
      return {
        playerId: h.player_id,
        handSum: unoHandSum(cards),
        cardCount: cards.length,
        eliminated: eliminatedSet.has(h.player_id),
      }
    })
    .sort((a, b) => {
      if (a.handSum !== b.handSum) return a.handSum - b.handSum
      if (a.cardCount !== b.cardCount) return a.cardCount - b.cardCount
      return a.playerId.localeCompare(b.playerId)
    })
  const live = stillHolding.filter((r) => !r.eliminated).map((r) => r.playerId)
  const eliminated = stillHolding.filter((r) => r.eliminated).map((r) => r.playerId)
  return [...finished, ...live, ...eliminated]
}

export function buildUnoStandings(
  hands: UnoPlayerHand[],
  players: { id: string; name: string }[],
  turnOrder: string[],
  finishOrder: string[] = [],
  teamMode = false,
  leftPlayerIds: string[] = [],
  eliminatedPlayerIds: string[] = []
): UnoStanding[] {
  const activeIds = new Set(turnOrder ?? [])
  const byId = new Map(hands.filter((h) => activeIds.has(h.player_id)).map((h) => [h.player_id, h]))
  return unoPlacementOrder(hands, turnOrder, finishOrder, teamMode, leftPlayerIds, eliminatedPlayerIds).map(
    (playerId, index) => {
      const cards = (byId.get(playerId)?.cards as UnoCard[]) ?? []
      return {
        playerId,
        name: players.find((p) => p.id === playerId)?.name ?? 'Player',
        cardCount: cards.length,
        handSum: unoHandSum(cards),
        rank: index + 1,
      }
    }
  )
}

/** Colour accent for the required-colour card-table hint (falls back to a neutral slate). */
export function unoColorHex(color: UnoCardColor | null | undefined): string {
  if (!color || color === 'wild') return '#334155'
  return UNO_COLOR_HEX[color]
}

// ── Pure helpers needed by shared uno-solo (mirrors src/lib/uno.ts) ─────────────

/** Build the standard 108-card UNO deck. Pure — mirrors the web helper. */
export function buildUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = []
  for (const color of UNO_COLORS) {
    deck.push({ id: `${color}-0`, color, kind: 'number', value: 0 })
    for (let value = 1; value <= 9; value += 1) {
      deck.push({ id: `${color}-${value}-a`, color, kind: 'number', value })
      deck.push({ id: `${color}-${value}-b`, color, kind: 'number', value })
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      deck.push({ id: `${color}-${kind}-a`, color, kind })
      deck.push({ id: `${color}-${kind}-b`, color, kind })
    }
  }
  for (let i = 0; i < 4; i += 1) {
    deck.push({ id: `wild-${i}`, color: 'wild', kind: 'wild' })
    deck.push({ id: `wild4-${i}`, color: 'wild', kind: 'wild_draw4' })
  }
  return deck
}

/**
 * Walk a Multi-Play set into the resulting turn-advance directives (direction,
 * accumulated Draw Two penalty, skips before/after the Draw Two target). Pure —
 * mirrors the web helper. See src/lib/uno.ts for the full semantic notes.
 */
export function resolveMultiPlayAdvance(
  cards: UnoCard[],
  session: Pick<UnoSession, 'direction'>,
  activeCount: number
): { direction: number; penalty: number; skipsBefore: number; skipsAfter: number } {
  const baseDirection = session.direction < 0 ? -1 : 1
  let direction = baseDirection
  let skipsBefore = 0
  let skipsAfter = 0
  let penalty = 0
  let seenDraw2 = false
  for (const c of cards) {
    if (c.kind === 'reverse') {
      if (activeCount <= 2) {
        if (seenDraw2) skipsAfter += 1
        else skipsBefore += 1
      } else {
        direction = -direction
      }
    } else if (c.kind === 'skip') {
      if (seenDraw2) skipsAfter += 1
      else skipsBefore += 1
    } else if (c.kind === 'draw2') {
      seenDraw2 = true
      penalty += 2
    } else {
      direction = baseDirection
      skipsBefore = 0
      skipsAfter = 0
      penalty = 0
      seenDraw2 = false
    }
  }
  return { direction, penalty, skipsBefore, skipsAfter }
}
