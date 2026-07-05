import {
  MAHJONG_SEATS,
  SUITS,
  ceilHundred,
  countsFor,
  isGreenTile,
  isHonor,
  isSimple,
  isSuited,
  isTerminal,
  isTerminalOrHonor,
  isValuePair,
  mahjongTileBase,
  mahjongTileLabel,
  makeSuitTile,
  removeOne,
  roundWindTile,
  ruleOptionsForSession,
  seatWindTile,
  sortMahjongTiles,
  tileNumber,
  tileSuit,
} from '@/lib/mahjong-core'
import {
  allVisibleTiles,
  analyzeMahjongWinForRuleset,
  isClosedHand,
  repeatedTile,
  type MahjongWinAnalysis,
} from '@/lib/mahjong-hand'
import type {
  MahjongMeldType,
  MahjongPlayerState,
  MahjongRuleset,
  MahjongScoreLine,
  MahjongScorePayment,
  MahjongScoreSummary,
  MahjongSession,
  MahjongWinType,
  MahjongWinningPattern,
} from '@/types'

type ScoringGroup = {
  type: MahjongMeldType
  tiles: string[]
  concealed: boolean
}

type ScoringLine = MahjongScoreLine & {
  qualifies?: boolean
  excludes?: string[]
}

type ScoreContext = {
  tiles: string[]
  groups: ScoringGroup[]
  pairTile: string | null
  suitedTiles: string[]
  suits: Set<string>
  pattern: MahjongWinningPattern
  closed: boolean
}

function buildScoreContext(
  winnerState: MahjongPlayerState,
  winTiles: string[],
  analysis: MahjongWinAnalysis
): ScoreContext {
  const meldGroups: ScoringGroup[] = winnerState.melds.map((meld) => ({
    type: meld.type,
    tiles: meld.tiles.map(mahjongTileBase),
    concealed: !meld.from_player_id || !!meld.concealed,
  }))
  const concealedGroups: ScoringGroup[] = (analysis.concealedGroups ?? []).map((group) => ({
    type: group.type,
    tiles: group.tiles.map(mahjongTileBase),
    concealed: true,
  }))
  const tiles = allVisibleTiles(winTiles, winnerState.melds).map(mahjongTileBase)
  const suitedTiles = tiles.filter(isSuited)

  return {
    tiles,
    groups: [...meldGroups, ...concealedGroups],
    pairTile: analysis.pair?.[0] ? mahjongTileBase(analysis.pair[0]) : null,
    suitedTiles,
    suits: new Set(suitedTiles.map(tileSuit)),
    pattern: analysis.pattern ?? 'standard',
    closed: isClosedHand(winnerState.melds),
  }
}

function groupRepeatedTile(group: ScoringGroup): string | null {
  if (group.type === 'chow') return null
  return repeatedTile(group.tiles.map(mahjongTileBase))
}

function groupSequence(group: ScoringGroup): { suit: string; start: number } | null {
  if (group.type !== 'chow') return null
  const sorted = sortMahjongTiles(group.tiles.map(mahjongTileBase))
  const first = sorted[0]
  if (!first || !isSuited(first)) return null
  return { suit: tileSuit(first), start: tileNumber(first) }
}

function chowSequences(groups: ScoringGroup[]): Array<{ suit: string; start: number }> {
  return groups.flatMap((group) => {
    const sequence = groupSequence(group)
    return sequence ? [sequence] : []
  })
}

function countSequences(sequences: Array<{ suit: string; start: number }>, suit: string, start: number): number {
  return sequences.filter((seq) => seq.suit === suit && seq.start === start).length
}

function hasPureStraight(groups: ScoringGroup[]): boolean {
  const sequences = chowSequences(groups)
  return SUITS.some(
    (suit) =>
      countSequences(sequences, suit, 1) > 0 &&
      countSequences(sequences, suit, 4) > 0 &&
      countSequences(sequences, suit, 7) > 0
  )
}

function hasMixedStraight(groups: ScoringGroup[]): boolean {
  const sequences = chowSequences(groups)
  const starts = [1, 4, 7]
  const suitPermutations = [
    ['m', 'p', 's'],
    ['m', 's', 'p'],
    ['p', 'm', 's'],
    ['p', 's', 'm'],
    ['s', 'm', 'p'],
    ['s', 'p', 'm'],
  ]
  return suitPermutations.some((suits) =>
    starts.every((start, index) => countSequences(sequences, suits[index] ?? '', start) > 0)
  )
}

function hasMixedTripleChow(groups: ScoringGroup[]): boolean {
  const sequences = chowSequences(groups)
  return [1, 2, 3, 4, 5, 6, 7].some((start) => SUITS.every((suit) => countSequences(sequences, suit, start) > 0))
}

function hasPureTripleChow(groups: ScoringGroup[]): boolean {
  const sequences = chowSequences(groups)
  return SUITS.some((suit) => [1, 2, 3, 4, 5, 6, 7].some((start) => countSequences(sequences, suit, start) >= 3))
}

function pureShiftedChowLength(groups: ScoringGroup[]): number {
  const sequences = chowSequences(groups)
  let best = 0
  for (const suit of SUITS) {
    const starts = new Set(sequences.filter((seq) => seq.suit === suit).map((seq) => seq.start))
    for (let start = 1; start <= 5; start += 1) {
      if (starts.has(start) && starts.has(start + 1) && starts.has(start + 2)) best = Math.max(best, 3)
      if (start <= 4 && starts.has(start) && starts.has(start + 1) && starts.has(start + 2) && starts.has(start + 3)) {
        best = Math.max(best, 4)
      }
    }
  }
  return best
}

function mixedShiftedChows(groups: ScoringGroup[]): boolean {
  const sequences = chowSequences(groups)
  return [1, 2, 3, 4, 5].some((start) => {
    const required = [start, start + 1, start + 2]
    return SUITS.every((suit, index) => countSequences(sequences, suit, required[index] ?? 0) > 0)
  })
}

function identicalChowPairCount(groups: ScoringGroup[]): number {
  const counts = new Map<string, number>()
  for (const seq of chowSequences(groups)) {
    const key = `${seq.suit}${seq.start}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.values()].filter((count) => count >= 2).length
}

function maxIdenticalChowCount(groups: ScoringGroup[]): number {
  const counts = new Map<string, number>()
  for (const seq of chowSequences(groups)) {
    const key = `${seq.suit}${seq.start}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Math.max(0, ...counts.values())
}

function mixedDoubleChowCount(groups: ScoringGroup[]): number {
  const sequences = chowSequences(groups)
  let count = 0
  for (let start = 1; start <= 7; start += 1) {
    const suits = SUITS.filter((suit) => countSequences(sequences, suit, start) > 0)
    if (suits.length >= 2) count += Math.floor(suits.length / 2)
  }
  return count
}

function terminalChowPairCount(groups: ScoringGroup[]): number {
  const sequences = chowSequences(groups)
  return SUITS.reduce((sum, suit) => {
    return sum + Math.min(countSequences(sequences, suit, 1), countSequences(sequences, suit, 7))
  }, 0)
}

function shortStraightCount(groups: ScoringGroup[]): number {
  const sequences = chowSequences(groups)
  let count = 0
  for (const suit of SUITS) {
    for (const start of [1, 4]) {
      count += Math.min(countSequences(sequences, suit, start), countSequences(sequences, suit, start + 3))
    }
  }
  return count
}

function pungTiles(groups: ScoringGroup[]): string[] {
  return groups.flatMap((group) => {
    const tile = groupRepeatedTile(group)
    return tile ? [tile] : []
  })
}

function countConcealedPungs(groups: ScoringGroup[]): number {
  return groups.filter((group) => group.type !== 'chow' && group.concealed).length
}

function countConcealedKongs(groups: ScoringGroup[]): number {
  return groups.filter((group) => group.type === 'kong' && group.concealed).length
}

function countMeldedKongs(groups: ScoringGroup[]): number {
  return groups.filter((group) => group.type === 'kong' && !group.concealed).length
}

function dragonPungCount(groups: ScoringGroup[]): number {
  const pungs = pungTiles(groups)
  return ['dr', 'dg', 'dw'].filter((dragon) => pungs.includes(dragon)).length
}

function windPungCount(groups: ScoringGroup[]): number {
  const pungs = pungTiles(groups)
  return ['we', 'ws', 'ww', 'wn'].filter((wind) => pungs.includes(wind)).length
}

function isAllChows(context: ScoreContext): boolean {
  return (
    context.pattern === 'standard' &&
    context.groups.length === 4 &&
    context.groups.every((group) => group.type === 'chow')
  )
}

function isAllPungs(context: ScoreContext): boolean {
  return (
    context.pattern === 'standard' &&
    context.groups.length === 4 &&
    context.groups.every((group) => group.type !== 'chow')
  )
}

function isAllEvenPungs(context: ScoreContext): boolean {
  return (
    isAllPungs(context) &&
    context.tiles.length > 0 &&
    context.tiles.every((tile) => isSuited(tile) && [2, 4, 6, 8].includes(tileNumber(tile)))
  )
}

function isPinfu(context: ScoreContext, winnerState: MahjongPlayerState, session?: MahjongSession): boolean {
  return context.closed && isAllChows(context) && !!context.pairTile && !isValuePair(context.pairTile, winnerState, session)
}

function hasOutsideHand(context: ScoreContext, honorsAllowed: boolean): boolean {
  if (context.pattern !== 'standard') return false
  if (!context.groups.some((group) => group.type === 'chow')) return false
  const pairOk = context.pairTile
    ? honorsAllowed
      ? isTerminalOrHonor(context.pairTile)
      : isTerminal(context.pairTile)
    : false
  return (
    pairOk &&
    context.groups.every((group) => {
      if (group.type === 'chow') return group.tiles.some(isTerminal)
      const tile = groupRepeatedTile(group)
      return !!tile && (honorsAllowed ? isTerminalOrHonor(tile) : isTerminal(tile))
    })
  )
}

function hasLittleThreeDragons(context: ScoreContext): boolean {
  return dragonPungCount(context.groups) === 2 && !!context.pairTile && ['dr', 'dg', 'dw'].includes(context.pairTile)
}

function sameNumberPungPairCount(groups: ScoringGroup[]): number {
  const pungs = pungTiles(groups).filter(isSuited)
  let count = 0
  for (let n = 1; n <= 9; n += 1) {
    const suits = new Set(pungs.filter((tile) => tileNumber(tile) === n).map(tileSuit))
    if (suits.size >= 2) count += Math.floor(suits.size / 2)
  }
  return count
}

function hasPureShiftedPungs(groups: ScoringGroup[], length: 3 | 4): boolean {
  const pungs = pungTiles(groups).filter(isSuited)
  return SUITS.some((suit) => {
    const numbers = new Set(pungs.filter((tile) => tileSuit(tile) === suit).map(tileNumber))
    for (let start = 1; start <= 10 - length; start += 1) {
      if (Array.from({ length }, (_, index) => start + index).every((n) => numbers.has(n))) return true
    }
    return false
  })
}

function hasMixedShiftedPungs(groups: ScoringGroup[]): boolean {
  const pungs = pungTiles(groups).filter(isSuited)
  return [1, 2, 3, 4, 5, 6, 7].some((start) => {
    const needed = [start, start + 1, start + 2]
    return SUITS.every((suit, index) =>
      pungs.some((tile) => tileSuit(tile) === suit && tileNumber(tile) === (needed[index] ?? 0))
    )
  })
}

function hasPureTerminalChows(context: ScoreContext): boolean {
  const sequences = chowSequences(context.groups)
  return (
    context.pairTile != null &&
    isSuited(context.pairTile) &&
    tileNumber(context.pairTile) === 5 &&
    SUITS.some((suit) => countSequences(sequences, suit, 1) >= 2 && countSequences(sequences, suit, 7) >= 2)
  )
}

function hasThreeSuitedTerminalChows(context: ScoreContext): boolean {
  const sequences = chowSequences(context.groups)
  return (
    context.pairTile != null &&
    isSuited(context.pairTile) &&
    tileNumber(context.pairTile) === 5 &&
    SUITS.every((suit) => countSequences(sequences, suit, 1) + countSequences(sequences, suit, 7) > 0)
  )
}

function isUpperFour(context: ScoreContext): boolean {
  return context.tiles.length > 0 && context.tiles.every((tile) => isSuited(tile) && tileNumber(tile) >= 6)
}

function isLowerFour(context: ScoreContext): boolean {
  return context.tiles.length > 0 && context.tiles.every((tile) => isSuited(tile) && tileNumber(tile) <= 4)
}

function hasTileHog(context: ScoreContext): boolean {
  return (
    [...countsFor(context.tiles).values()].some((count) => count >= 4) &&
    !context.groups.some((group) => group.type === 'kong')
  )
}

function isLastAvailableTile(context: ScoreContext, winningTile: string | null): boolean {
  return !!winningTile && (countsFor(context.tiles).get(mahjongTileBase(winningTile)) ?? 0) === 4
}

function hasNineGates(context: ScoreContext): boolean {
  if (
    !context.closed ||
    context.tiles.length !== 14 ||
    context.suits.size !== 1 ||
    context.tiles.some((tile) => !isSuited(tile))
  ) {
    return false
  }
  const counts = countsFor(context.tiles)
  const suit = tileSuit(context.tiles[0] ?? '')
  return (
    (counts.get(`${suit}1`) ?? 0) >= 3 &&
    (counts.get(`${suit}9`) ?? 0) >= 3 &&
    [2, 3, 4, 5, 6, 7, 8].every((n) => (counts.get(`${suit}${n}`) ?? 0) >= 1)
  )
}

function hasSevenShiftedPairs(context: ScoreContext): boolean {
  if (context.pattern !== 'seven_pairs' || context.suits.size !== 1 || context.tiles.some((tile) => !isSuited(tile)))
    return false
  const numbers = [...countsFor(context.tiles).entries()]
    .filter(([, count]) => count === 2)
    .map(([tile]) => tileNumber(tile))
    .sort((a, b) => a - b)
  return numbers.length === 7 && numbers.every((number, index) => number === numbers[0] + index)
}

function dedupeScoreLines(lines: MahjongScoreLine[]): MahjongScoreLine[] {
  const seen = new Map<string, MahjongScoreLine>()
  for (const line of lines) {
    const current = seen.get(line.label)
    if (!current || line.fan > current.fan) seen.set(line.label, line)
  }
  return [...seen.values()]
}

function doraTileFromIndicator(indicator: string): string {
  const base = mahjongTileBase(indicator)
  if (/^[mps][1-9]$/.test(base)) {
    const n = tileNumber(base)
    return makeSuitTile(tileSuit(base), n === 9 ? 1 : n + 1)
  }
  const windOrder = ['we', 'ws', 'ww', 'wn']
  const dragonOrder = ['dw', 'dg', 'dr']
  const windIndex = windOrder.indexOf(base)
  if (windIndex !== -1) return windOrder[(windIndex + 1) % windOrder.length]
  const dragonIndex = dragonOrder.indexOf(base)
  if (dragonIndex !== -1) return dragonOrder[(dragonIndex + 1) % dragonOrder.length]
  return base
}

function countDora(tiles: string[], indicators: string[] | undefined): number {
  if (!indicators?.length) return 0
  const counts = countsFor(tiles)
  return indicators.reduce((sum, indicator) => sum + (counts.get(doraTileFromIndicator(indicator)) ?? 0), 0)
}

export function dealerPlayerId(session?: MahjongSession): string | null {
  if (!session?.turn_order.length) return null
  return session.turn_order[session.dealer_index % session.turn_order.length] ?? null
}

function riichiLimitLabel(fan: number, fu: number, yakuman: number, session?: MahjongSession): string | null {
  const options = ruleOptionsForSession(session)
  if (yakuman > 1) return `${yakuman}x Yakuman`
  if (yakuman === 1) return 'Yakuman'
  if (fan >= 13) return options.kazoeYakuman ? 'Kazoe Yakuman' : 'Sanbaiman'
  if (fan >= 11) return 'Sanbaiman'
  if (fan >= 8) return 'Baiman'
  if (fan >= 6) return 'Haneman'
  if (
    fan >= 5 ||
    (fan === 4 && fu >= 40) ||
    (fan === 3 && fu >= 70) ||
    (options.kiriageMangan && ((fan === 4 && fu === 30) || (fan === 3 && fu === 60)))
  )
    return 'Mangan'
  return null
}

function riichiBasePoints(fan: number, fu: number, yakuman: number, session?: MahjongSession): number {
  const options = ruleOptionsForSession(session)
  if (yakuman > 0) return 8000 * yakuman
  if (fan >= 13) return options.kazoeYakuman ? 8000 : 6000
  if (fan >= 11) return 6000
  if (fan >= 8) return 4000
  if (fan >= 6) return 3000
  if (
    fan >= 5 ||
    (fan === 4 && fu >= 40) ||
    (fan === 3 && fu >= 70) ||
    (options.kiriageMangan && ((fan === 4 && fu === 30) || (fan === 3 && fu === 60)))
  )
    return 2000
  return Math.min(2000, fu * 2 ** (fan + 2))
}

function isClosedOrEdgeWait(context: ScoreContext, winningTile: string | null): boolean {
  if (!winningTile || context.pattern !== 'standard') return false
  const win = mahjongTileBase(winningTile)
  if (!isSuited(win)) return false
  const winNumber = tileNumber(win)
  return context.groups.some((group) => {
    const sequence = groupSequence(group)
    if (!sequence || sequence.suit !== tileSuit(win)) return false
    if (!group.tiles.includes(win)) return false
    const end = sequence.start + 2
    const closedWait = winNumber === sequence.start + 1
    const edgeWait = (sequence.start === 1 && winNumber === 3) || (end === 9 && winNumber === 7)
    return closedWait || edgeWait
  })
}

function isDoubleRiichiWindow(session: MahjongSession | undefined, state: MahjongPlayerState): boolean {
  if (!state.riichi_declared) return false
  const discardIndex = state.riichi_discard_index ?? Number.MAX_SAFE_INTEGER
  const uninterrupted = !(session?.discard_pile ?? []).some(
    (discard) => discard.claimed_as && discard.claimed_as !== 'mahjong'
  )
  return uninterrupted && discardIndex <= 3 && state.discarded.length <= 1
}

function isHeavenlyHand(
  session: MahjongSession | undefined,
  state: MahjongPlayerState,
  winType: MahjongWinType
): boolean {
  return (
    winType === 'self_draw' && dealerPlayerId(session) === state.player_id && (session?.discard_pile.length ?? 0) === 0
  )
}

function isEarthlyHand(
  session: MahjongSession | undefined,
  state: MahjongPlayerState,
  winType: MahjongWinType
): boolean {
  const uninterrupted = !(session?.discard_pile ?? []).some(
    (discard) => discard.claimed_as && discard.claimed_as !== 'mahjong'
  )
  return (
    winType === 'self_draw' &&
    dealerPlayerId(session) !== state.player_id &&
    state.discarded.length === 0 &&
    uninterrupted &&
    (session?.discard_pile.length ?? 0) <= 3
  )
}

function isRenhouWindow(
  session: MahjongSession | undefined,
  state: MahjongPlayerState,
  winType: MahjongWinType
): boolean {
  const uninterrupted = !(session?.discard_pile ?? []).some(
    (discard) => discard.claimed_as && discard.claimed_as !== 'mahjong'
  )
  return (
    winType === 'discard' && state.discarded.length === 0 && uninterrupted && (session?.discard_pile.length ?? 0) <= 4
  )
}

function isThirteenSidedKokushi(context: ScoreContext, winningTile: string | null): boolean {
  return (
    context.pattern === 'thirteen_orphans' &&
    !!winningTile &&
    context.tiles.filter((tile) => tile === mahjongTileBase(winningTile)).length === 2
  )
}

function isSuuankouTanki(context: ScoreContext, winningTile: string | null): boolean {
  return (
    context.pattern === 'standard' &&
    countConcealedPungs(context.groups) === 4 &&
    !!winningTile &&
    !!context.pairTile &&
    context.pairTile === mahjongTileBase(winningTile)
  )
}

function isPureNineGatesWait(context: ScoreContext, winningTile: string | null): boolean {
  if (!winningTile || !hasNineGates(context)) return false
  const beforeWin = removeOne(context.tiles, winningTile)
  if (!beforeWin || beforeWin.length !== 13) return false
  const suit = tileSuit(winningTile)
  const counts = countsFor(beforeWin)
  return (
    (counts.get(`${suit}1`) ?? 0) === 3 &&
    (counts.get(`${suit}9`) ?? 0) === 3 &&
    [2, 3, 4, 5, 6, 7, 8].every((n) => (counts.get(`${suit}${n}`) ?? 0) === 1)
  )
}

function calculateRiichiFu(opts: {
  context: ScoreContext
  winnerState: MahjongPlayerState
  winType: MahjongWinType
  winningTile: string | null
  session?: MahjongSession
}): number {
  if (opts.context.pattern === 'seven_pairs') return 25

  const pinfu = isPinfu(opts.context, opts.winnerState, opts.session)
  if (pinfu && opts.winType === 'self_draw' && opts.context.closed) return 20
  if (pinfu && opts.winType === 'discard' && opts.context.closed) return 30

  let fu = 20
  if (opts.winType === 'discard' && opts.context.closed) fu += 10
  if (opts.winType === 'self_draw' && !pinfu) fu += 2

  if (opts.context.pairTile) {
    if (['dr', 'dg', 'dw'].includes(opts.context.pairTile)) fu += 2
    if (opts.context.pairTile === seatWindTile(opts.winnerState.seat)) fu += 2
    if (opts.context.pairTile === roundWindTile(opts.session)) fu += 2
    if (opts.winningTile && mahjongTileBase(opts.winningTile) === opts.context.pairTile) fu += 2
  }
  if (!opts.context.pairTile || !opts.winningTile || mahjongTileBase(opts.winningTile) !== opts.context.pairTile) {
    if (isClosedOrEdgeWait(opts.context, opts.winningTile)) fu += 2
  }

  for (const group of opts.context.groups) {
    if (group.type === 'chow') continue
    const tile = groupRepeatedTile(group)
    if (!tile) continue
    const terminalOrHonor = isTerminalOrHonor(tile)
    if (group.type === 'kong') {
      fu += group.concealed ? (terminalOrHonor ? 32 : 16) : terminalOrHonor ? 16 : 8
    } else {
      fu += group.concealed ? (terminalOrHonor ? 8 : 4) : terminalOrHonor ? 4 : 2
    }
  }

  return Math.max(20, Math.ceil(fu / 10) * 10)
}

export function buildRiichiPayments(opts: {
  winnerId: string
  winType: MahjongWinType
  fromPlayerId?: string | null
  turnOrder: string[]
  session?: MahjongSession
  basePoints: number
  riichiSticks: number
}): MahjongScoreSummary['payments'] {
  const dealerId = dealerPlayerId(opts.session)
  const winnerIsDealer = opts.winnerId === dealerId
  const honba = opts.session?.honba ?? 0
  const opponents = opts.turnOrder.filter((id) => id !== opts.winnerId)
  const payments: MahjongScoreSummary['payments'] = []
  let winnerDelta = opts.riichiSticks * 1000

  if (opts.winType === 'self_draw') {
    for (const playerId of opponents) {
      const amount = winnerIsDealer
        ? ceilHundred(opts.basePoints * 2) + honba * 100
        : ceilHundred(opts.basePoints * (playerId === dealerId ? 2 : 1)) + honba * 100
      payments.push({ player_id: playerId, delta: -amount, reason: 'Pays Tsumo' })
      winnerDelta += amount
    }
  } else {
    const payer = opts.fromPlayerId ?? opponents[0] ?? null
    if (payer) {
      const amount = ceilHundred(opts.basePoints * (winnerIsDealer ? 6 : 4)) + honba * 300
      payments.push({ player_id: payer, delta: -amount, reason: 'Pays Ron' })
      winnerDelta += amount
    }
  }

  payments.push({
    player_id: opts.winnerId,
    delta: winnerDelta,
    reason: opts.riichiSticks > 0 ? 'Win plus Riichi sticks' : opts.winType === 'self_draw' ? 'Tsumo win' : 'Ron win',
  })
  return payments
}

function buildRiichiScoreSummary(opts: {
  winnerState: MahjongPlayerState
  winTiles: string[]
  analysis: MahjongWinAnalysis
  winType: MahjongWinType
  ruleset: MahjongRuleset
  session?: MahjongSession
  fromPlayerId?: string | null
  turnOrder: string[]
  winningTile?: string | null
}): MahjongScoreSummary {
  const context = buildScoreContext(opts.winnerState, opts.winTiles, opts.analysis)
  const options = ruleOptionsForSession(opts.session)
  const lines: MahjongScoreLine[] = []
  const yakumanLines: MahjongScoreLine[] = []
  const addYaku = (label: string, fan: number, detail?: string) => lines.push({ label, fan, detail })
  const addYakuman = (label: string, multiplier = 1) =>
    yakumanLines.push({ label, fan: 13 * multiplier, detail: multiplier > 1 ? `${multiplier}x Yakuman` : 'Yakuman' })
  const winningTile = opts.winningTile ?? null

  if (isHeavenlyHand(opts.session, opts.winnerState, opts.winType)) addYakuman('Tenhou')
  if (isEarthlyHand(opts.session, opts.winnerState, opts.winType)) addYakuman('Chiihou')
  if (context.pattern === 'thirteen_orphans') {
    addYakuman('Kokushi Musou', options.doubleYakuman && isThirteenSidedKokushi(context, winningTile) ? 2 : 1)
  }
  if (dragonPungCount(context.groups) === 3) addYakuman('Daisangen')
  if (windPungCount(context.groups) === 4) addYakuman('Daisuushi', options.doubleYakuman ? 2 : 1)
  if (windPungCount(context.groups) === 3 && context.pairTile && ['we', 'ws', 'ww', 'wn'].includes(context.pairTile)) {
    addYakuman('Shousuushi')
  }
  if (context.tiles.length > 0 && context.tiles.every(isHonor)) addYakuman('Tsuuiisou')
  if (context.tiles.length > 0 && context.tiles.every(isTerminal)) addYakuman('Chinroutou')
  if (context.tiles.length > 0 && context.tiles.every(isGreenTile)) addYakuman('Ryuuiisou')
  if (context.groups.filter((group) => group.type === 'kong').length === 4) addYakuman('Suukantsu')
  if (context.pattern === 'standard' && countConcealedPungs(context.groups) === 4) {
    addYakuman('Suuankou', options.doubleYakuman && isSuuankouTanki(context, winningTile) ? 2 : 1)
  }
  if (hasNineGates(context)) {
    addYakuman('Chuuren Poutou', options.doubleYakuman && isPureNineGatesWait(context, winningTile) ? 2 : 1)
  }

  let yakuman = yakumanLines.reduce((sum, line) => sum + Math.max(1, Math.round(line.fan / 13)), 0)
  if (yakuman === 0) {
    if (opts.winnerState.riichi_declared) {
      if (isDoubleRiichiWindow(opts.session, opts.winnerState)) addYaku('Double Riichi', 2)
      else addYaku('Riichi', 1)
    }
    if (options.renhou === 'mangan' && isRenhouWindow(opts.session, opts.winnerState, opts.winType))
      addYaku('Renhou', 5)
    if (opts.session?.ippatsu_eligible_player_ids?.includes(opts.winnerState.player_id)) addYaku('Ippatsu', 1)
    if (opts.winType === 'self_draw' && context.closed) addYaku('Menzen Tsumo', 1)
    if (isPinfu(context, opts.winnerState, opts.session)) addYaku('Pinfu', 1)
    if (context.tiles.length > 0 && context.tiles.every(isSimple) && (context.closed || options.openTanyao)) {
      addYaku('Tanyao', 1)
    }
    if (context.closed) {
      const identicalPairs = identicalChowPairCount(context.groups)
      if (identicalPairs >= 2) addYaku('Ryanpeikou', 3)
      else if (identicalPairs === 1) addYaku('Iipeikou', 1)
    }
    if (context.pattern === 'seven_pairs') addYaku('Chiitoitsu', 2)
    if (isAllPungs(context)) addYaku('Toitoi', 2)
    if (countConcealedPungs(context.groups) >= 3) addYaku('Sanankou', 2)
    if (context.groups.filter((group) => group.type === 'kong').length >= 3) addYaku('Sankantsu', 2)
    if (hasMixedTripleChow(context.groups)) addYaku('Sanshoku Doujun', context.closed ? 2 : 1)
    if (
      [1, 2, 3, 4, 5, 6, 7, 8, 9].some((n) => SUITS.every((suit) => pungTiles(context.groups).includes(`${suit}${n}`)))
    ) {
      addYaku('Sanshoku Doukou', 2)
    }
    if (hasPureStraight(context.groups)) addYaku('Ittsu', context.closed ? 2 : 1)
    if (hasOutsideHand(context, true)) addYaku('Chanta', context.closed ? 2 : 1)
    if (hasOutsideHand(context, false)) addYaku('Junchan', context.closed ? 3 : 2)
    if (context.tiles.length > 0 && context.tiles.every(isTerminalOrHonor)) addYaku('Honroutou', 2)
    if (hasLittleThreeDragons(context)) addYaku('Shousangen', 2)
    if (context.suits.size === 1 && context.tiles.some(isHonor)) addYaku('Honitsu', context.closed ? 3 : 2)
    if (context.suits.size === 1 && context.tiles.every(isSuited)) addYaku('Chinitsu', context.closed ? 6 : 5)

    for (const dragon of ['dr', 'dg', 'dw']) {
      if (pungTiles(context.groups).includes(dragon)) addYaku(`Yakuhai ${mahjongTileLabel(dragon)}`, 1)
    }
    const seatWind = seatWindTile(opts.winnerState.seat)
    if (pungTiles(context.groups).includes(seatWind)) addYaku('Yakuhai seat wind', 1)
    if (pungTiles(context.groups).includes(roundWindTile(opts.session))) addYaku('Yakuhai round wind', 1)
    if (opts.session?.rinshan_player_id === opts.winnerState.player_id) addYaku('Rinshan Kaihou', 1)
    if (opts.session?.chankan_player_id === opts.winnerState.player_id) addYaku('Chankan', 1)
    if (opts.winType === 'self_draw' && (opts.session?.wall.length ?? 1) === 0) addYaku('Haitei', 1)
    if (opts.winType === 'discard' && (opts.session?.wall.length ?? 1) === 0) addYaku('Houtei', 1)
  }

  if (yakuman === 0 && options.renhou === 'yakuman' && isRenhouWindow(opts.session, opts.winnerState, opts.winType)) {
    addYakuman('Renhou')
    yakuman = 1
  }

  const yakuFan = yakuman > 0 ? yakuman * 13 : lines.reduce((sum, line) => sum + line.fan, 0)
  const bonusLines: MahjongScoreLine[] = []
  if (yakuman === 0) {
    const tilesWithRed = allVisibleTiles(opts.winTiles, opts.winnerState.melds)
    const doraCount = countDora(tilesWithRed, opts.session?.dora_indicators)
    if (doraCount > 0) bonusLines.push({ label: 'Dora', fan: doraCount })
    const redFiveCount = tilesWithRed.filter((tile) => tile !== mahjongTileBase(tile)).length
    if (redFiveCount > 0) bonusLines.push({ label: 'Aka dora', fan: redFiveCount })
    if (opts.winnerState.riichi_declared) {
      const uraDoraCount = countDora(tilesWithRed, opts.session?.ura_dora_indicators)
      if (uraDoraCount > 0) bonusLines.push({ label: 'Ura dora', fan: uraDoraCount })
    }
  }

  const scoredLines = yakuman > 0 ? yakumanLines : [...lines, ...bonusLines]
  const fan = yakuman > 0 ? yakuFan : scoredLines.reduce((sum, line) => sum + line.fan, 0)
  const fu = yakuman > 0 ? null : calculateRiichiFu({ ...opts, context, winningTile })
  const basePoints = riichiBasePoints(fan, fu ?? 0, yakuman, opts.session)
  const riichiSticks = opts.session?.riichi_sticks ?? 0
  const payments = buildRiichiPayments({
    winnerId: opts.winnerState.player_id,
    winType: opts.winType,
    fromPlayerId: opts.fromPlayerId,
    turnOrder: opts.turnOrder,
    session: opts.session,
    basePoints,
    riichiSticks,
  })

  return {
    ruleset: opts.ruleset,
    pattern: context.pattern,
    fan,
    yaku_fan: yakuFan,
    yakuman,
    limit: riichiLimitLabel(fan, fu ?? 0, yakuman, opts.session),
    fu,
    base_points: basePoints,
    total_points: payments
      .filter((payment) => payment.player_id === opts.winnerState.player_id)
      .reduce((sum, p) => sum + p.delta, 0),
    lines: scoredLines,
    payments,
    payer_player_id: opts.fromPlayerId ?? null,
    winner_player_ids: [opts.winnerState.player_id],
    honba: opts.session?.honba ?? 0,
    riichi_sticks: riichiSticks,
  }
}

function buildHongKongScoreSummary(opts: {
  winnerState: MahjongPlayerState
  winTiles: string[]
  analysis: MahjongWinAnalysis
  winType: MahjongWinType
  ruleset: MahjongRuleset
  session?: MahjongSession
  fromPlayerId?: string | null
  turnOrder: string[]
  winningTile?: string | null
}): MahjongScoreSummary {
  const context = buildScoreContext(opts.winnerState, opts.winTiles, opts.analysis)
  const lines: MahjongScoreLine[] = []
  const add = (label: string, fan: number) => lines.push({ label, fan })

  if (context.pattern === 'thirteen_orphans') add('Thirteen orphans', 13)
  if (context.pattern === 'seven_pairs') add('Seven pairs', 4)
  if (windPungCount(context.groups) === 4) add('Big four winds', 13)
  if (windPungCount(context.groups) === 3 && context.pairTile && ['we', 'ws', 'ww', 'wn'].includes(context.pairTile)) {
    add('Little four winds', 10)
  }
  if (dragonPungCount(context.groups) === 3) add('Big three dragons', 8)
  if (hasLittleThreeDragons(context)) add('Little three dragons', 5)
  if (context.tiles.length > 0 && context.tiles.every(isHonor)) add('All honors', 10)
  if (context.tiles.length > 0 && context.tiles.every(isTerminal)) add('All terminals', 10)
  if (context.tiles.length > 0 && context.tiles.every(isGreenTile)) add('All green', 8)
  if (hasNineGates(context)) add('Nine gates', 10)
  if (context.suits.size === 1 && context.tiles.every(isSuited)) add('Pure one suit', 7)
  if (context.suits.size === 1 && context.tiles.some(isHonor)) add('Half flush', 3)
  if (isAllPungs(context)) add('All pungs', 3)
  if (context.tiles.length > 0 && context.tiles.every(isSimple)) add('All simples', 1)
  if (opts.winType === 'self_draw') add('Self draw', 1)
  if (context.closed) add('Concealed hand', 1)

  for (const dragon of ['dr', 'dg', 'dw']) {
    if (pungTiles(context.groups).includes(dragon)) add(`${mahjongTileLabel(dragon)} dragon`, 1)
  }
  const seatWind = seatWindTile(opts.winnerState.seat)
  if (pungTiles(context.groups).includes(seatWind)) add('Seat wind', 1)
  if (pungTiles(context.groups).includes(roundWindTile(opts.session))) add('Round wind', 1)

  const flowerCount = opts.winnerState.flowers?.length ?? 0
  if (flowerCount > 0) {
    const seatIndex = MAHJONG_SEATS.indexOf(opts.winnerState.seat) + 1
    const matchingFlowers =
      opts.winnerState.flowers?.filter((tile) => tile === `f${seatIndex}` || tile === `se${seatIndex}`).length ?? 0
    if (matchingFlowers > 0) add('Seat flower/season', matchingFlowers)
    if (flowerCount >= 8) add('All flowers and seasons', 8)
  } else {
    add('No flowers', 1)
  }

  const options = ruleOptionsForSession(opts.session)
  const fan = lines.reduce((sum, line) => sum + line.fan, 0)
  const basePoints = hongKongSimplifiedBasePoints(Math.min(fan, options.hongKongLimitFan))
  const dealerId = dealerPlayerId(opts.session)
  const winnerIsDealer = opts.winnerState.player_id === dealerId
  const opponents = opts.turnOrder.filter((id) => id !== opts.winnerState.player_id)
  const payments: MahjongScoreSummary['payments'] = []
  let winnerDelta = 0

  const payer = opts.winType === 'discard' ? (opts.fromPlayerId ?? opponents[0] ?? null) : null
  for (const playerId of opponents) {
    let amount = basePoints
    if (opts.winType === 'self_draw') amount *= 2
    if (opts.winType === 'discard' && playerId === payer) amount *= 2
    if (winnerIsDealer) amount *= 2
    if (playerId === dealerId) amount *= 2
    payments.push({
      player_id: playerId,
      delta: -amount,
      reason:
        opts.winType === 'self_draw'
          ? 'Pays self draw'
          : playerId === payer
            ? 'Pays discarded winning tile'
            : 'Pays table win',
    })
    winnerDelta += amount
  }
  payments.push({ player_id: opts.winnerState.player_id, delta: winnerDelta, reason: 'Hong Kong faan win' })

  return {
    ruleset: opts.ruleset,
    pattern: context.pattern,
    fan,
    yaku_fan: fan,
    yakuman: 0,
    limit: fan >= options.hongKongLimitFan ? 'Limit hand' : null,
    fu: null,
    base_points: basePoints,
    total_points: winnerDelta,
    lines: dedupeScoreLines(lines),
    payments,
    payer_player_id: opts.fromPlayerId ?? null,
    winner_player_ids: [opts.winnerState.player_id],
    honba: opts.session?.honba ?? 0,
    riichi_sticks: opts.session?.riichi_sticks ?? 0,
  }
}

function hongKongSimplifiedBasePoints(fan: number): number {
  if (fan < 3) return 0
  if (fan === 3) return 100
  if (fan <= 6) return 200
  if (fan <= 9) return 400
  return 800
}

function applyMcrExclusions(lines: ScoringLine[]): ScoringLine[] {
  return lines.filter((line) => !lines.some((other) => other !== line && (other.excludes ?? []).includes(line.label)))
}

function buildMcrScoreSummary(opts: {
  winnerState: MahjongPlayerState
  winTiles: string[]
  analysis: MahjongWinAnalysis
  winType: MahjongWinType
  ruleset: MahjongRuleset
  session?: MahjongSession
  fromPlayerId?: string | null
  winningTile?: string | null
  turnOrder: string[]
}): MahjongScoreSummary {
  const context = buildScoreContext(opts.winnerState, opts.winTiles, opts.analysis)
  const rawLines: ScoringLine[] = []
  const add = (label: string, fan: number, excludes: string[] = [], qualifies = true) =>
    rawLines.push({ label, fan, excludes, qualifies })
  const pungs = pungTiles(context.groups)
  const kongCount = context.groups.filter((group) => group.type === 'kong').length
  const winningTile = opts.winningTile ?? opts.winTiles.at(-1) ?? null

  if (windPungCount(context.groups) === 4)
    add('Big Four Winds', 88, ['All Pungs', 'Pung of Terminals or Honors', 'Seat Wind', 'Prevalent Wind'])
  if (dragonPungCount(context.groups) === 3) add('Big Three Dragons', 88, ['Dragon Pung', 'Two Dragon Pungs'])
  if (context.tiles.length > 0 && context.tiles.every(isGreenTile)) add('All Green', 88)
  if (hasNineGates(context)) add('Nine Gates', 88, ['Full Flush', 'Concealed Hand', 'No Honors'])
  if (kongCount === 4)
    add('Four Kongs', 88, ['Three Kongs', 'Two Melded Kongs', 'Concealed Kong', 'Melded Kong', 'All Pungs'])
  if (hasSevenShiftedPairs(context)) add('Seven Shifted Pairs', 88, ['Seven Pairs', 'Full Flush', 'Concealed Hand'])
  if (context.pattern === 'thirteen_orphans') add('Thirteen Orphans', 88, ['All Types', 'Concealed Hand'])

  if (context.tiles.length > 0 && context.tiles.every(isTerminal))
    add('All Terminals', 64, ['All Pungs', 'Outside Hand', 'No Honors'])
  if (hasPureTerminalChows(context))
    add('Pure Terminal Chows', 64, ['Full Flush', 'Pure Double Chow', 'Two Terminal Chows'])
  if (windPungCount(context.groups) === 3 && context.pairTile && ['we', 'ws', 'ww', 'wn'].includes(context.pairTile)) {
    add('Little Four Winds', 64, ['Big Three Winds', 'Pung of Terminals or Honors'])
  }
  if (hasLittleThreeDragons(context)) add('Little Three Dragons', 64, ['Dragon Pung', 'Two Dragon Pungs'])
  if (context.tiles.length > 0 && context.tiles.every(isHonor))
    add('All Honors', 64, ['All Pungs', 'Pung of Terminals or Honors'])
  if (countConcealedPungs(context.groups) === 4) add('Four Concealed Pungs', 64, ['All Pungs', 'Two Concealed Pungs'])

  if (maxIdenticalChowCount(context.groups) >= 4) add('Quadruple Chow', 48, ['Pure Double Chow', 'Pure Triple Chow'])
  if (hasPureShiftedPungs(context.groups, 4)) add('Four Pure Shifted Pungs', 48, ['Pure Shifted Pungs'])

  if (pureShiftedChowLength(context.groups) >= 4) add('Four Pure Shifted Chows', 32, ['Pure Shifted Chows'])
  if (kongCount === 3) add('Three Kongs', 32, ['Two Melded Kongs', 'Melded Kong'])
  if (context.tiles.length > 0 && context.tiles.every(isTerminalOrHonor))
    add('All Terminals and Honors', 32, ['All Pungs', 'Outside Hand'])

  if (context.pattern === 'seven_pairs') add('Seven Pairs', 24, ['Concealed Hand'])
  if (context.pattern === 'greater_honors_knitted')
    add('Greater Honors and Knitted Tiles', 24, ['All Types', 'Concealed Hand'])
  if (isAllEvenPungs(context)) add('All Even Pungs', 24, ['All Pungs', 'All Simples'])
  if (context.suits.size === 1 && context.tiles.every(isSuited)) add('Full Flush', 24, ['No Honors'])
  if (hasPureTripleChow(context.groups)) add('Pure Triple Chow', 24, ['Pure Double Chow'])
  if (hasPureShiftedPungs(context.groups, 3)) add('Pure Shifted Pungs', 24)
  if (context.tiles.length > 0 && context.tiles.every((tile) => isSuited(tile) && tileNumber(tile) >= 7))
    add('Upper Tiles', 24, ['No Honors'])
  if (
    context.tiles.length > 0 &&
    context.tiles.every((tile) => isSuited(tile) && tileNumber(tile) >= 4 && tileNumber(tile) <= 6)
  ) {
    add('Middle Tiles', 24, ['All Simples', 'No Honors'])
  }
  if (context.tiles.length > 0 && context.tiles.every((tile) => isSuited(tile) && tileNumber(tile) <= 3))
    add('Lower Tiles', 24, ['No Honors'])

  if (hasPureStraight(context.groups)) add('Pure Straight', 16, ['Short Straight'])
  if (hasThreeSuitedTerminalChows(context))
    add('Three-Suited Terminal Chows', 16, ['Mixed Double Chow', 'Two Terminal Chows'])
  if (pureShiftedChowLength(context.groups) >= 3) add('Pure Shifted Chows', 16)
  if (context.tiles.length > 0 && context.tiles.every((tile) => !isSuited(tile) || tileNumber(tile) === 5))
    add('All Fives', 16)
  if ([1, 2, 3, 4, 5, 6, 7, 8, 9].some((n) => SUITS.every((suit) => pungs.includes(`${suit}${n}`))))
    add('Triple Pung', 16, ['Double Pung'])
  if (countConcealedPungs(context.groups) >= 3) add('Three Concealed Pungs', 16, ['Two Concealed Pungs'])

  if (context.pattern === 'lesser_honors_knitted') add('Lesser Honors and Knitted Tiles', 12, ['Concealed Hand'])
  if (context.pattern === 'knitted_straight') add('Knitted Straight', 12)
  if (isUpperFour(context)) add('Upper Four', 12)
  if (isLowerFour(context)) add('Lower Four', 12)
  if (windPungCount(context.groups) >= 3) add('Big Three Winds', 12, ['Prevalent Wind', 'Seat Wind'])

  if (hasMixedStraight(context.groups)) add('Mixed Straight', 8, ['Short Straight'])
  if (hasMixedTripleChow(context.groups)) add('Mixed Triple Chow', 8, ['Mixed Double Chow'])
  if (hasMixedShiftedPungs(context.groups)) add('Mixed Shifted Pungs', 8)
  if (
    context.tiles.length > 0 &&
    context.tiles.every((tile) =>
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p8', 'p9', 's2', 's4', 's5', 's6', 's8', 's9', 'dw'].includes(tile)
    )
  ) {
    add('Reversible Tiles', 8)
  }
  if (opts.session?.rinshan_player_id === opts.winnerState.player_id) add('Out with Replacement Tile', 8)
  if (opts.session?.chankan_player_id === opts.winnerState.player_id) add('Robbing the Kong', 8)
  if (opts.winType === 'self_draw' && (opts.session?.wall.length ?? 1) === 0) add('Last Tile Draw', 8)
  if (opts.winType === 'discard' && (opts.session?.wall.length ?? 1) === 0) add('Last Tile Claim', 8)
  if (countConcealedKongs(context.groups) >= 2) add('Two Concealed Kongs', 8, ['Concealed Kong'])

  if (isAllPungs(context)) add('All Pungs', 6)
  if (context.suits.size === 1 && context.tiles.some(isHonor)) add('Half Flush', 6)
  if (mixedShiftedChows(context.groups)) add('Mixed Shifted Chows', 6)
  if (SUITS.every((suit) => context.tiles.some((tile) => tileSuit(tile) === suit)) && context.tiles.some(isHonor))
    add('All Types', 6)
  if (!context.closed && context.groups.every((group) => !group.concealed)) add('Melded Hand', 6)
  if (dragonPungCount(context.groups) >= 2) add('Two Dragon Pungs', 6, ['Dragon Pung'])

  if (hasOutsideHand(context, true)) add('Outside Hand', 4)
  if (context.closed && opts.winType === 'self_draw') add('Fully Concealed Hand', 4, ['Concealed Hand', 'Self Draw'])
  if (countMeldedKongs(context.groups) >= 2) add('Two Melded Kongs', 4, ['Melded Kong'])
  if (isLastAvailableTile(context, winningTile)) add('Last Tile', 4)

  if (context.closed && opts.winType === 'discard') add('Concealed Hand', 2)
  if (isAllChows(context)) add('All Chows', 2)
  if (context.tiles.length > 0 && context.tiles.every(isSimple)) add('All Simples', 2)
  if (hasTileHog(context)) add('Tile Hog', 2)
  if (sameNumberPungPairCount(context.groups) > 0) add('Double Pung', 2)
  if (countConcealedPungs(context.groups) >= 2) add('Two Concealed Pungs', 2)
  for (const dragon of ['dr', 'dg', 'dw']) if (pungs.includes(dragon)) add('Dragon Pung', 2)
  if (pungs.includes(seatWindTile(opts.winnerState.seat))) add('Seat Wind', 2)
  if (pungs.includes(roundWindTile(opts.session))) add('Prevalent Wind', 2)

  if (identicalChowPairCount(context.groups) > 0) add('Pure Double Chow', 1)
  if (mixedDoubleChowCount(context.groups) > 0) add('Mixed Double Chow', 1)
  if (shortStraightCount(context.groups) > 0) add('Short Straight', 1)
  if (terminalChowPairCount(context.groups) > 0) add('Two Terminal Chows', 1)
  if (context.suits.size < 3) add('One Voided Suit', 1)
  if (!context.tiles.some(isHonor)) add('No Honors', 1)
  if (isClosedOrEdgeWait(context, winningTile)) add('Edge/Closed Wait', 1)
  if (context.pairTile && winningTile && context.pairTile === mahjongTileBase(winningTile)) add('Single Wait', 1)
  if (opts.winType === 'self_draw') add('Self Draw', 1)
  for (const group of context.groups) {
    const tile = groupRepeatedTile(group)
    if (tile && isTerminalOrHonor(tile)) add('Pung of Terminals or Honors', 1)
    if (group.type === 'kong' && group.concealed) add('Concealed Kong', 2)
    if (group.type === 'kong' && !group.concealed) add('Melded Kong', 1)
  }
  const flowerCount = opts.winnerState.flowers?.length ?? 0
  if (flowerCount > 0) add('Flower Tiles', flowerCount, [], false)

  const preChickenQualifyingPoints = applyMcrExclusions(rawLines)
    .filter((line) => line.qualifies !== false)
    .reduce((sum, line) => sum + line.fan, 0)
  if (preChickenQualifyingPoints === 0) add('Chicken Hand', 8)

  const filtered = dedupeScoreLines(
    applyMcrExclusions(rawLines).map(({ label, fan, detail }) => ({ label, fan, detail }))
  )
  const qualifyingPoints = applyMcrExclusions(rawLines)
    .filter((line) => line.qualifies !== false)
    .reduce((sum, line) => sum + line.fan, 0)
  const points = filtered.reduce((sum, line) => sum + line.fan, 0)
  const basePoints = points
  const opponents = opts.turnOrder.filter((id) => id !== opts.winnerState.player_id)
  const payments: MahjongScoreSummary['payments'] = []
  let winnerDelta = 0

  if (opts.winType === 'self_draw') {
    for (const playerId of opponents) {
      const amount = points + 8
      payments.push({ player_id: playerId, delta: -amount, reason: 'MCR self draw payment' })
      winnerDelta += amount
    }
  } else {
    const payer = opts.fromPlayerId ?? opponents[0] ?? null
    for (const playerId of opponents) {
      const amount = playerId === payer ? points + 8 : 8
      payments.push({
        player_id: playerId,
        delta: -amount,
        reason: playerId === payer ? 'MCR discarder payment' : 'MCR table payment',
      })
      winnerDelta += amount
    }
  }
  payments.push({ player_id: opts.winnerState.player_id, delta: winnerDelta, reason: 'MCR win' })

  return {
    ruleset: opts.ruleset,
    pattern: context.pattern,
    fan: points,
    yaku_fan: qualifyingPoints,
    yakuman: 0,
    limit: null,
    fu: null,
    base_points: basePoints,
    total_points: winnerDelta,
    lines: filtered,
    payments,
    payer_player_id: opts.fromPlayerId ?? null,
    winner_player_ids: [opts.winnerState.player_id],
    honba: opts.session?.honba ?? 0,
    riichi_sticks: opts.session?.riichi_sticks ?? 0,
  }
}

function buildFateRoundScoreSummary(opts: {
  winnerState: MahjongPlayerState
  winTiles: string[]
  analysis: MahjongWinAnalysis
  winType: MahjongWinType
  ruleset: MahjongRuleset
  session?: MahjongSession
  fromPlayerId?: string | null
  turnOrder: string[]
}): MahjongScoreSummary {
  const context = buildScoreContext(opts.winnerState, opts.winTiles, opts.analysis)
  const lines: MahjongScoreLine[] = [{ label: 'Mahjong', fan: 1 }]

  if (context.pattern === 'seven_pairs') lines.push({ label: 'Seven pairs', fan: 2 })
  if (context.pattern === 'thirteen_orphans') lines.push({ label: 'Thirteen orphans', fan: 13 })
  if (opts.winType === 'self_draw') lines.push({ label: 'Self draw', fan: 1 })
  if (context.closed) lines.push({ label: 'Concealed hand', fan: 1 })
  if (isAllPungs(context)) lines.push({ label: 'All Pungs', fan: 3 })
  if (context.tiles.length > 0 && context.tiles.every(isSimple)) lines.push({ label: 'All simples', fan: 1 })
  if (context.suits.size === 1 && context.tiles.some(isHonor)) lines.push({ label: 'Half flush', fan: 3 })
  if (context.suits.size === 1 && context.tiles.every(isSuited)) lines.push({ label: 'Pure suit', fan: 6 })
  for (const dragon of ['dr', 'dg', 'dw']) {
    if (pungTiles(context.groups).includes(dragon))
      lines.push({ label: `${mahjongTileLabel(dragon)} dragon set`, fan: 1 })
  }
  if (pungTiles(context.groups).includes(seatWindTile(opts.winnerState.seat)))
    lines.push({ label: 'Seat wind set', fan: 1 })
  if (pungTiles(context.groups).includes(roundWindTile(opts.session))) lines.push({ label: 'Round wind set', fan: 1 })

  const fan = lines.reduce((sum, line) => sum + line.fan, 0)
  const basePoints = 20
  const handPoints = basePoints + fan * 10
  const opponentIds = opts.turnOrder.filter((playerId) => playerId !== opts.winnerState.player_id)
  const payments: MahjongScoreSummary['payments'] = []

  if (opts.winType === 'self_draw') {
    const eachPayment = Math.ceil(handPoints / 2)
    payments.push({
      player_id: opts.winnerState.player_id,
      delta: eachPayment * opponentIds.length,
      reason: 'Self draw win',
    })
    for (const playerId of opponentIds)
      payments.push({ player_id: playerId, delta: -eachPayment, reason: 'Pays self draw' })
  } else {
    const payerPlayerId = opts.fromPlayerId ?? opponentIds[0] ?? null
    payments.push({ player_id: opts.winnerState.player_id, delta: handPoints, reason: 'Discard win' })
    if (payerPlayerId) payments.push({ player_id: payerPlayerId, delta: -handPoints, reason: 'Discarded winning tile' })
  }

  return {
    ruleset: opts.ruleset,
    pattern: context.pattern,
    fan,
    yaku_fan: fan,
    yakuman: 0,
    limit: null,
    fu: null,
    base_points: basePoints,
    total_points: payments
      .filter((payment) => payment.player_id === opts.winnerState.player_id)
      .reduce((sum, p) => sum + p.delta, 0),
    lines,
    payments,
    payer_player_id: opts.fromPlayerId ?? null,
    winner_player_ids: [opts.winnerState.player_id],
    honba: opts.session?.honba ?? 0,
    riichi_sticks: opts.session?.riichi_sticks ?? 0,
  }
}

export function buildMahjongScoreSummary(opts: {
  winnerState: MahjongPlayerState
  winTiles: string[]
  analysis: MahjongWinAnalysis
  winType: MahjongWinType
  ruleset: MahjongRuleset
  session?: MahjongSession
  fromPlayerId?: string | null
  turnOrder: string[]
  winningTile?: string | null
}): MahjongScoreSummary {
  if (opts.ruleset === 'riichi') return buildRiichiScoreSummary(opts)
  if (opts.ruleset === 'hong_kong') return buildHongKongScoreSummary(opts)
  if (opts.ruleset === 'mcr') return buildMcrScoreSummary(opts)
  return buildFateRoundScoreSummary(opts)
}

export function scoreMahjongHandForRuleset(opts: {
  winnerState: MahjongPlayerState
  winTiles?: string[]
  winType: MahjongWinType
  ruleset: MahjongRuleset
  session?: MahjongSession
  fromPlayerId?: string | null
  turnOrder?: string[]
  winningTile?: string | null
}): MahjongScoreSummary | null {
  const winTiles = opts.winTiles ?? opts.winnerState.hand
  const analysis = analyzeMahjongWinForRuleset(winTiles, opts.winnerState.melds, opts.ruleset)
  if (!analysis.valid) return null

  return buildMahjongScoreSummary({
    winnerState: opts.winnerState,
    winTiles,
    analysis,
    winType: opts.winType,
    ruleset: opts.ruleset,
    session: opts.session,
    fromPlayerId: opts.fromPlayerId,
    turnOrder: opts.turnOrder ?? opts.session?.turn_order ?? [opts.winnerState.player_id],
    winningTile: opts.winningTile ?? winTiles.at(-1) ?? null,
  })
}
