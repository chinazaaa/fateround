import { DEFAULT_MAHJONG_RULESET, mahjongRulesetConfig, parseMahjongRuleOptions } from '@/lib/mahjong-rulesets'
import type { MahjongPlayerState, MahjongRuleOptions, MahjongRuleset, MahjongSeat, MahjongSession } from '@/types'

export const MAHJONG_MIN_PLAYERS = 4
export const MAHJONG_MAX_PLAYERS = 4
export const MAHJONG_DEFAULT_MAX_PLAYERS = 4

export const MAHJONG_SEATS: MahjongSeat[] = ['east', 'south', 'west', 'north']

export const MAHJONG_SEAT_LABELS: Record<MahjongSeat, string> = {
  east: 'East',
  south: 'South',
  west: 'West',
  north: 'North',
}

export const SUITS = ['m', 'p', 's'] as const
export const HONORS = ['we', 'ws', 'ww', 'wn', 'dr', 'dg', 'dw'] as const
export const FLOWERS = ['f1', 'f2', 'f3', 'f4', 'se1', 'se2', 'se3', 'se4'] as const
export const RED_FIVES = ['m5r', 'p5r', 's5r'] as const
export const TILE_ORDER = [
  ...SUITS.flatMap((suit) => Array.from({ length: 9 }, (_, i) => `${suit}${i + 1}`)),
  ...HONORS,
  ...FLOWERS,
]
export const THIRTEEN_ORPHANS = ['m1', 'm9', 'p1', 'p9', 's1', 's9', ...HONORS]
export const GREEN_TILES = new Set(['s2', 's3', 's4', 's6', 's8', 'dg'])
export const ROUND_WINDS: MahjongSeat[] = ['east', 'south', 'west', 'north']

const TILE_LABELS: Record<string, string> = {
  m1: '1 Man',
  m2: '2 Man',
  m3: '3 Man',
  m4: '4 Man',
  m5: '5 Man',
  m5r: 'Red 5 Man',
  m6: '6 Man',
  m7: '7 Man',
  m8: '8 Man',
  m9: '9 Man',
  p1: '1 Dot',
  p2: '2 Dot',
  p3: '3 Dot',
  p4: '4 Dot',
  p5: '5 Dot',
  p5r: 'Red 5 Dot',
  p6: '6 Dot',
  p7: '7 Dot',
  p8: '8 Dot',
  p9: '9 Dot',
  s1: '1 Bam',
  s2: '2 Bam',
  s3: '3 Bam',
  s4: '4 Bam',
  s5: '5 Bam',
  s5r: 'Red 5 Bam',
  s6: '6 Bam',
  s7: '7 Bam',
  s8: '8 Bam',
  s9: '9 Bam',
  we: 'East',
  ws: 'South',
  ww: 'West',
  wn: 'North',
  dr: 'Red',
  dg: 'Green',
  dw: 'White',
  f1: 'Plum',
  f2: 'Orchid',
  f3: 'Chrysanthemum',
  f4: 'Bamboo Flower',
  se1: 'Spring',
  se2: 'Summer',
  se3: 'Autumn',
  se4: 'Winter',
}

export function shuffle<T>(items: T[]): T[] {
  const next = [...items]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function tileSortValue(tile: string): number {
  const base = mahjongTileBase(tile)
  const index = TILE_ORDER.indexOf(base)
  return (index === -1 ? 999 : index) + (tile !== base ? 0.1 : 0)
}

export function mahjongTileBase(tile: string): string {
  return RED_FIVES.includes(tile as (typeof RED_FIVES)[number]) ? tile.slice(0, 2) : tile
}

export function sortMahjongTiles(tiles: string[]): string[] {
  return [...tiles].sort((a, b) => tileSortValue(a) - tileSortValue(b))
}

export function mahjongTileLabel(tile: string): string {
  return TILE_LABELS[tile] ?? tile
}

export function mahjongTileShortLabel(tile: string): string {
  const base = mahjongTileBase(tile)
  if (/^[mps][1-9]$/.test(base)) {
    const suit = base[0]
    const suffix = suit === 'm' ? 'M' : suit === 'p' ? 'D' : 'B'
    return `${base[1]}${suffix}${tile !== base ? 'r' : ''}`
  }
  if (tile === 'we') return 'East'
  if (tile === 'ws') return 'South'
  if (tile === 'ww') return 'West'
  if (tile === 'wn') return 'North'
  if (tile === 'dr') return 'Red'
  if (tile === 'dg') return 'Green'
  if (tile === 'dw') return 'White'
  if (tile === 'f1') return 'Plum'
  if (tile === 'f2') return 'Orchid'
  if (tile === 'f3') return 'Chrys'
  if (tile === 'f4') return 'Bamboo'
  if (tile === 'se1') return 'Spring'
  if (tile === 'se2') return 'Summer'
  if (tile === 'se3') return 'Autumn'
  if (tile === 'se4') return 'Winter'
  return tile
}

export function isFlowerTile(tile: string): boolean {
  return FLOWERS.includes(tile as (typeof FLOWERS)[number])
}

export function buildMahjongWall(
  ruleset: MahjongRuleset = DEFAULT_MAHJONG_RULESET,
  ruleOptions?: MahjongRuleOptions | null
): string[] {
  const cfg = mahjongRulesetConfig(ruleset)
  const options = parseMahjongRuleOptions(ruleOptions)
  const tiles: string[] = []
  for (const tile of TILE_ORDER.filter((tile) => !isFlowerTile(tile))) {
    const redFive =
      cfg.redFives && options.redFives && (tile === 'm5' || tile === 'p5' || tile === 's5') ? `${tile}r` : null
    if (redFive) tiles.push(redFive)
    for (let i = 0; i < (redFive ? 3 : 4); i += 1) tiles.push(tile)
  }
  if (cfg.flowers) tiles.push(...FLOWERS)
  return shuffle(tiles)
}

export function countsFor(tiles: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tile of tiles) {
    const base = mahjongTileBase(tile)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  return counts
}

export function isSuited(tile: string): boolean {
  return /^[mps][1-9]$/.test(mahjongTileBase(tile))
}

export function tileSuit(tile: string): string {
  return mahjongTileBase(tile)[0] ?? ''
}

export function tileNumber(tile: string): number {
  return Number(mahjongTileBase(tile).slice(1))
}

export function makeSuitTile(suit: string, n: number): string {
  return `${suit}${n}`
}

export function isHonor(tile: string): boolean {
  return HONORS.includes(tile as (typeof HONORS)[number])
}

export function isSimple(tile: string): boolean {
  return isSuited(tile) && tileNumber(tile) >= 2 && tileNumber(tile) <= 8
}

export function isTerminal(tile: string): boolean {
  return isSuited(tile) && (tileNumber(tile) === 1 || tileNumber(tile) === 9)
}

export function isTerminalOrHonor(tile: string): boolean {
  return isTerminal(tile) || isHonor(tile)
}

export function isGreenTile(tile: string): boolean {
  return GREEN_TILES.has(mahjongTileBase(tile))
}

export function seatWindTile(seat: MahjongSeat): string {
  if (seat === 'east') return 'we'
  if (seat === 'south') return 'ws'
  if (seat === 'west') return 'ww'
  return 'wn'
}

export function nextRoundWind(wind: MahjongSeat): MahjongSeat {
  const index = ROUND_WINDS.indexOf(wind)
  return ROUND_WINDS[(index + 1) % ROUND_WINDS.length] ?? 'east'
}

export function roundWindTile(session?: MahjongSession): string {
  return seatWindTile(session?.round_wind ?? 'east')
}

export function isValuePair(tile: string, state: MahjongPlayerState, session?: MahjongSession): boolean {
  const base = mahjongTileBase(tile)
  return base === seatWindTile(state.seat) || base === roundWindTile(session) || ['dr', 'dg', 'dw'].includes(base)
}

export function ceilHundred(value: number): number {
  return Math.ceil(value / 100) * 100
}

export function ruleOptionsForSession(session?: MahjongSession | null) {
  return parseMahjongRuleOptions(session?.rule_options)
}

export function scoreEntries(
  scores: Record<string, number> | undefined,
  turnOrder: string[]
): Array<{ playerId: string; score: number }> {
  return turnOrder.map((playerId) => ({ playerId, score: scores?.[playerId] ?? 0 }))
}

export function rankedScoreEntries(scores: Record<string, number> | undefined, turnOrder: string[]) {
  return scoreEntries(scores, turnOrder).sort(
    (a, b) => b.score - a.score || turnOrder.indexOf(a.playerId) - turnOrder.indexOf(b.playerId)
  )
}

export function removeOne(tiles: string[], tile: string): string[] | null {
  let index = tiles.indexOf(tile)
  if (index === -1) index = tiles.findIndex((item) => mahjongTileBase(item) === mahjongTileBase(tile))
  if (index === -1) return null
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)]
}

export function removeMany(tiles: string[], remove: string[]): string[] | null {
  let next = [...tiles]
  for (const tile of remove) {
    const removed = removeOne(next, tile)
    if (!removed) return null
    next = removed
  }
  return next
}

export function drawPlayableTileFromWall(
  wall: string[],
  ruleset: MahjongRuleset
): { tile: string | null; wall: string[]; flowers: string[] } {
  const cfg = mahjongRulesetConfig(ruleset)
  const nextWall = [...wall]
  const flowers: string[] = []

  while (nextWall.length > 0) {
    const tile = nextWall.pop()
    if (!tile) break
    if (cfg.flowers && isFlowerTile(tile)) {
      flowers.push(tile)
      continue
    }
    return { tile, wall: nextWall, flowers }
  }

  return { tile: null, wall: nextWall, flowers }
}

export function splitDeadWall(wall: string[], ruleset: MahjongRuleset) {
  const cfg = mahjongRulesetConfig(ruleset)
  if (!cfg.deadWall) {
    return { wall, deadWall: [], doraIndicators: [], uraDoraIndicators: [] }
  }

  const liveWall = [...wall]
  const deadWall = liveWall.splice(Math.max(0, liveWall.length - 14), 14)
  return {
    wall: liveWall,
    deadWall,
    doraIndicators: deadWall[4] ? [deadWall[4]] : deadWall[0] ? [deadWall[0]] : [],
    uraDoraIndicators: deadWall[9] ? [deadWall[9]] : [],
  }
}

export function initialMahjongScores(
  playerIds: string[],
  ruleset: MahjongRuleset,
  ruleOptions?: MahjongRuleOptions | null
): Record<string, number> {
  const options = parseMahjongRuleOptions(ruleOptions)
  const start = ruleset === 'riichi' ? options.startingScore : 0
  return Object.fromEntries(playerIds.map((playerId) => [playerId, start]))
}

export function doraIndicatorsAfterKong(session: MahjongSession, deadWall: string[]): string[] {
  const current = session.dora_indicators ?? []
  if (current.length >= 5) return current
  const next = deadWall[4 + current.length]
  return next ? [...current, next] : current
}
