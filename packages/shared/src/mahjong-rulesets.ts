import type { MahjongRuleOptions, MahjongRuleset } from './types'

export const MAHJONG_RULESETS: MahjongRuleset[] = ['fate_round', 'hong_kong', 'riichi', 'mcr']
export const DEFAULT_MAHJONG_RULESET: MahjongRuleset = 'fate_round'

export const MAHJONG_RULESET_LABELS: Record<MahjongRuleset, { label: string; description: string }> = {
  fate_round: {
    label: 'Simple Mahjong',
    description: 'Beginner-friendly — draw, discard, calls, simple scoring.',
  },
  hong_kong: {
    label: 'Hong Kong Old Style',
    description: 'Flowers/seasons and faan-style scoring.',
  },
  riichi: {
    label: 'Japanese Riichi',
    description: 'Dead wall, dora, red fives, riichi actions.',
  },
  mcr: {
    label: 'MCR',
    description: 'Competition rules — 8-point minimum.',
  },
}

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

export function parseMahjongRuleset(raw: unknown): MahjongRuleset {
  return MAHJONG_RULESETS.includes(raw as MahjongRuleset) ? (raw as MahjongRuleset) : DEFAULT_MAHJONG_RULESET
}

export function parseMahjongRuleOptions(raw: unknown): MahjongRuleOptions {
  if (!raw || typeof raw !== 'object') return DEFAULT_MAHJONG_RULE_OPTIONS
  return { ...DEFAULT_MAHJONG_RULE_OPTIONS, ...(raw as MahjongRuleOptions) }
}
