import {
  canAddHotel,
  canAddHouse,
} from '@/lib/monopoly-build'
import { parseBuildings, parseMortgaged } from '@/lib/monopoly-rent'
import { parsePropertyOwners, playerProperties } from '@/lib/monopoly'
import type { MonopolyBoard } from '@/types'

export function getMonopolyBuildActionCount(board: MonopolyBoard, myPlayerId: string): number {
  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const housesInBank = board.houses_in_bank ?? 32
  const hotelsInBank = board.hotels_in_bank ?? 12
  let count = 0

  for (const space of playerProperties(owners, myPlayerId)) {
    if (canAddHouse(space.index, myPlayerId, owners, buildings, mortgaged, housesInBank)) count += 1
    if (canAddHotel(space.index, myPlayerId, owners, buildings, mortgaged, hotelsInBank)) count += 1
  }

  return count
}
