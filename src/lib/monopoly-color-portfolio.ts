import { countOwnedInGroup, ownsColorMonopoly, spacesInGroup, type MonopolyColorGroup } from '@/lib/monopoly-board'

export const COLOR_SET_ORDER: MonopolyColorGroup[] = [
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'station',
  'utility',
]

export const COLOR_GROUP_LABELS: Record<MonopolyColorGroup, string> = {
  brown: 'Brown',
  light_blue: 'Light blue',
  pink: 'Pink',
  orange: 'Orange',
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  dark_blue: 'Dark blue',
  station: 'Stations',
  utility: 'Utilities',
}

export type ColorGroupMissing = {
  name: string
  index: number
  heldBy: 'bank' | 'other'
  ownerName?: string
}

export type ColorGroupStatus = {
  group: MonopolyColorGroup
  label: string
  owned: number
  total: number
  complete: boolean
  missing: ColorGroupMissing[]
}

export function buildColorGroupStatuses(
  owners: Record<string, string>,
  playerId: string,
  playerNames: Map<string, string>
): ColorGroupStatus[] {
  return COLOR_SET_ORDER.map((group) => {
    const spaces = spacesInGroup(group)
    const owned = countOwnedInGroup(owners, playerId, group)
    const missing = spaces
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

/** Property groups the player has a stake in, in board order. */
export function ownedColorGroups(owners: Record<string, string>, playerId: string): MonopolyColorGroup[] {
  return COLOR_SET_ORDER.filter((group) => countOwnedInGroup(owners, playerId, group) > 0)
}

export function propertiesInGroupForPlayer(
  owners: Record<string, string>,
  playerId: string,
  group: MonopolyColorGroup
) {
  return spacesInGroup(group).filter((s) => owners[String(s.index)] === playerId)
}
