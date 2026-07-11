// Colour-set portfolio helper for the mobile Monopoly manage panel.
// Mirrors web src/lib/monopoly-color-portfolio.ts `buildColorGroupStatuses`,
// which — unlike the lighter Map-returning version in ./manage-logic — also
// computes the list of streets still MISSING from each set (and who holds
// them: the bank or another player). Kept in the monopoly game directory so it
// can't collide with shared files edited by other agents.
import {
  countOwnedInGroup,
  ownsColorMonopoly,
  spacesInGroup,
  type MonopolyColorGroup,
} from '@fateround/shared/monopoly-board'
import { COLOR_GROUP_LABELS, COLOR_SET_ORDER } from './manage-logic'

export type ColorGroupMissing = {
  name: string
  index: number
  heldBy: 'bank' | 'other'
  ownerName?: string
}

export type ColorPortfolioStatus = {
  group: MonopolyColorGroup
  label: string
  owned: number
  total: number
  complete: boolean
  missing: ColorGroupMissing[]
}

/**
 * Build a per-group portfolio (in COLOR_SET_ORDER) for `playerId`, including the
 * streets still needed to complete each partially-owned set.
 */
export function buildColorPortfolio(
  owners: Record<string, string>,
  playerId: string,
  playerNames: Map<string, string>
): ColorPortfolioStatus[] {
  return COLOR_SET_ORDER.map((group) => {
    const spaces = spacesInGroup(group)
    const owned = countOwnedInGroup(owners, playerId, group)
    const missing: ColorGroupMissing[] = spaces
      .filter((s) => owners[String(s.index)] !== playerId)
      .map((s) => {
        const ownerId = owners[String(s.index)]
        return {
          name: s.name,
          index: s.index,
          heldBy: ownerId ? ('other' as const) : ('bank' as const),
          ownerName: ownerId ? playerNames.get(ownerId) : undefined,
        }
      })

    return {
      group,
      label: COLOR_GROUP_LABELS[group],
      owned,
      total: spaces.length,
      complete: owned > 0 && ownsColorMonopoly(owners, playerId, group),
      missing,
    }
  })
}
