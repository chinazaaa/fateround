import {
  countOwnedInGroup,
  ownsColorMonopoly,
  spacesInGroup,
  type MonopolyBoardSize,
  type MonopolyColorGroup,
} from '@/lib/monopoly-board'

export const COLOR_SET_ORDER: MonopolyColorGroup[] = [
  'brown',
  'light_blue',
  'pink',
  'orange',
  'red',
  'yellow',
  'green',
  'dark_blue',
  'teal',
  'violet',
  'indigo',
  'coral',
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
  teal: 'Teal',
  violet: 'Violet',
  indigo: 'Indigo',
  coral: 'Coral',
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
  playerNames: Map<string, string>,
  boardSize: MonopolyBoardSize = 40
): ColorGroupStatus[] {
  const statuses: ColorGroupStatus[] = []
  for (const group of COLOR_SET_ORDER) {
    const spaces = spacesInGroup(group, boardSize)
    if (spaces.length === 0) continue
    const owned = countOwnedInGroup(owners, playerId, group, boardSize)
    const missing: ColorGroupMissing[] = spaces
      .filter((s) => owners[String(s.index)] !== playerId)
      .map((s) => {
        const ownerId = owners[String(s.index)]
        return {
          name: s.name,
          index: s.index,
          heldBy: ownerId ? 'other' : 'bank',
          ownerName: ownerId ? playerNames.get(ownerId) : undefined,
        }
      })

    statuses.push({
      group,
      label: COLOR_GROUP_LABELS[group],
      owned,
      total: spaces.length,
      complete: owned > 0 && ownsColorMonopoly(owners, playerId, group, boardSize),
      missing,
    })
  }
  return statuses
}

/** Property groups the player has a stake in, in board order. */
export function ownedColorGroups(
  owners: Record<string, string>,
  playerId: string,
  boardSize: MonopolyBoardSize = 40
): MonopolyColorGroup[] {
  return COLOR_SET_ORDER.filter((group) => countOwnedInGroup(owners, playerId, group, boardSize) > 0)
}

export function propertiesInGroupForPlayer(
  owners: Record<string, string>,
  playerId: string,
  group: MonopolyColorGroup,
  boardSize: MonopolyBoardSize = 40
) {
  return spacesInGroup(group, boardSize).filter((space) => owners[String(space.index)] === playerId)
}
