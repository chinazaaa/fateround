import type { MahjongRuleOptions, MahjongRuleset } from '@/types'

export const MAHJONG_RULESETS: MahjongRuleset[] = ['fate_round', 'hong_kong', 'riichi', 'mcr']
export const DEFAULT_MAHJONG_RULESET: MahjongRuleset = 'fate_round'

export const DEFAULT_MAHJONG_RULE_OPTIONS: Required<MahjongRuleOptions> = {
  matchLength: 'hanchan',
  startingScore: 25000,
  returnScore: 30000,
  bankruptcyEndsMatch: true,
  agariYame: true,
  okaEnabled: true,
  uma: [15000, 5000, -5000, -15000],
  doubleYakuman: true,
  kazoeYakuman: true,
  kiriageMangan: false,
  openTanyao: true,
  redFives: true,
  abortiveDraws: true,
  nagashiMangan: true,
  renhou: 'off',
  chomboPenalty: 'mangan',
  hongKongMinimumFan: 3,
  hongKongLimitFan: 10,
  mcrMinimumPoints: 8,
}

export type MahjongRulesetConfig = {
  id: MahjongRuleset
  label: string
  shortLabel: string
  description: string
  tileSet: '136' | '144'
  flowers: boolean
  redFives: boolean
  deadWall: boolean
  dora: boolean
  riichi: boolean
  minimumFan: number
  minimumPoints: number
}

export const MAHJONG_RULESET_CONFIG: Record<MahjongRuleset, MahjongRulesetConfig> = {
  fate_round: {
    id: 'fate_round',
    label: 'Simple Mahjong',
    shortLabel: 'Simple',
    description: 'Beginner-friendly mode with normal draw, discard, calls, and simple scoring.',
    tileSet: '136',
    flowers: false,
    redFives: false,
    deadWall: false,
    dora: false,
    riichi: false,
    minimumFan: 0,
    minimumPoints: 0,
  },
  hong_kong: {
    id: 'hong_kong',
    label: 'Hong Kong Old Style',
    shortLabel: 'HK',
    description: 'Hong Kong style table with flowers/seasons and faan-style scoring.',
    tileSet: '144',
    flowers: true,
    redFives: false,
    deadWall: false,
    dora: false,
    riichi: false,
    minimumFan: 3,
    minimumPoints: 0,
  },
  riichi: {
    id: 'riichi',
    label: 'Japanese Riichi',
    shortLabel: 'Riichi',
    description: 'Japanese rules with dead wall, dora, red fives, and Riichi-specific actions.',
    tileSet: '136',
    flowers: false,
    redFives: true,
    deadWall: true,
    dora: true,
    riichi: true,
    minimumFan: 1,
    minimumPoints: 0,
  },
  mcr: {
    id: 'mcr',
    label: 'MCR',
    shortLabel: 'MCR',
    description: 'Mahjong Competition Rules mode with flowers/seasons and 8-point minimum.',
    tileSet: '144',
    flowers: true,
    redFives: false,
    deadWall: false,
    dora: false,
    riichi: false,
    minimumFan: 0,
    minimumPoints: 8,
  },
}

export function parseMahjongRuleset(raw: unknown): MahjongRuleset {
  return MAHJONG_RULESETS.includes(raw as MahjongRuleset) ? (raw as MahjongRuleset) : DEFAULT_MAHJONG_RULESET
}

export function mahjongRulesetLabel(raw: unknown): string {
  return MAHJONG_RULESET_CONFIG[parseMahjongRuleset(raw)].label
}

export function mahjongRulesetConfig(raw: unknown): MahjongRulesetConfig {
  return MAHJONG_RULESET_CONFIG[parseMahjongRuleset(raw)]
}

function numberOption(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

export function parseMahjongRuleOptions(raw: unknown): Required<MahjongRuleOptions> {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const umaRaw = Array.isArray(input.uma) ? input.uma : DEFAULT_MAHJONG_RULE_OPTIONS.uma
  const uma = [0, 1, 2, 3].map((index) =>
    numberOption(umaRaw[index], DEFAULT_MAHJONG_RULE_OPTIONS.uma[index], -100000, 100000)
  ) as [number, number, number, number]

  return {
    matchLength: input.matchLength === 'east' ? 'east' : 'hanchan',
    startingScore: numberOption(input.startingScore, DEFAULT_MAHJONG_RULE_OPTIONS.startingScore, 0, 100000),
    returnScore: numberOption(input.returnScore, DEFAULT_MAHJONG_RULE_OPTIONS.returnScore, 0, 100000),
    bankruptcyEndsMatch: input.bankruptcyEndsMatch !== false,
    agariYame: input.agariYame !== false,
    okaEnabled: input.okaEnabled !== false,
    uma,
    doubleYakuman: input.doubleYakuman !== false,
    kazoeYakuman: input.kazoeYakuman !== false,
    kiriageMangan: input.kiriageMangan === true,
    openTanyao: input.openTanyao !== false,
    redFives: input.redFives !== false,
    abortiveDraws: input.abortiveDraws !== false,
    nagashiMangan: input.nagashiMangan !== false,
    renhou: input.renhou === 'mangan' || input.renhou === 'yakuman' ? input.renhou : 'off',
    chomboPenalty: input.chomboPenalty === 'none' ? 'none' : 'mangan',
    hongKongMinimumFan: numberOption(input.hongKongMinimumFan, DEFAULT_MAHJONG_RULE_OPTIONS.hongKongMinimumFan, 0, 13),
    hongKongLimitFan: numberOption(input.hongKongLimitFan, DEFAULT_MAHJONG_RULE_OPTIONS.hongKongLimitFan, 3, 13),
    mcrMinimumPoints: numberOption(input.mcrMinimumPoints, DEFAULT_MAHJONG_RULE_OPTIONS.mcrMinimumPoints, 0, 88),
  }
}
