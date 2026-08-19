/**
 * Estate Kings (Monopoly) — Bank Loan Facilities Engine
 *
 * Implements loan issuance, interest compounding, partial/full repayments,
 * turn-cycle maturity countdowns, and automated bank foreclosure / asset seizure.
 */

import type { MonopolyBoard, MonopolyLoan, MonopolyPlayerState } from '@/types'
import {
  calculateMonopolyCreditLimit,
  calculateMonopolyLoanTotalDue,
  getActiveMonopolyLoan,
  hasDefaultedMonopolyLoan,
  MONOPOLY_DEFAULT_LOAN_INTEREST_RATE,
  MONOPOLY_DEFAULT_LOAN_TERM_ROUNDS,
  MONOPOLY_MIN_LOAN_AMOUNT,
} from '../../packages/shared/src/monopoly-loans'
import { mortgageValue, spaceAt, type MonopolyBoardSize, type MonopolySpace } from './monopoly-board'
import { parseBuildings, parseMortgaged, parsePropertyOwners } from './monopoly-rent'

export {
  calculateMonopolyCreditLimit,
  calculateMonopolyLoanTotalDue,
  getActiveMonopolyLoan,
  hasDefaultedMonopolyLoan,
  isTradeBlockedByLoan,
  MONOPOLY_DEFAULT_LOAN_INTEREST_RATE,
  MONOPOLY_DEFAULT_LOAN_TERM_ROUNDS,
  MONOPOLY_MIN_LOAN_AMOUNT,
  MONOPOLY_MAX_LOAN_CAP,
  MONOPOLY_LOAN_PRESET_TIERS,
} from '../../packages/shared/src/monopoly-loans'

/**
 * Validates and issues a new bank loan to a player.
 */
export function borrowMonopolyLoan(
  board: MonopolyBoard,
  playerState: MonopolyPlayerState,
  requestedAmount: number,
  options?: {
    interestRate?: number
    termRounds?: number
    boardSize?: MonopolyBoardSize
  }
): {
  success: boolean
  board: MonopolyBoard
  playerState: MonopolyPlayerState
  loan?: MonopolyLoan
  error?: string
} {
  const playerId = playerState.player_id
  const loans = Array.isArray(board.loans) ? [...board.loans] : []

  // Invariant 1: Player must not already have an active loan
  const existingActiveLoan = getActiveMonopolyLoan(loans, playerId)
  if (existingActiveLoan) {
    return {
      success: false,
      board,
      playerState,
      error: `You already have an active bank loan with ₦${existingActiveLoan.balance_remaining} remaining.`,
    }
  }

  // Invariant 2: Player must not have an unsettled defaulted loan
  if (hasDefaultedMonopolyLoan(loans, playerId)) {
    return {
      success: false,
      board,
      playerState,
      error: 'You have a defaulted loan on record. Settle your debts before borrowing again.',
    }
  }

  // Invariant 3: Player must not be bankrupt
  if (playerState.bankrupt) {
    return {
      success: false,
      board,
      playerState,
      error: 'Bankrupt players cannot borrow funds.',
    }
  }

  // Calculate unencumbered mortgage values for credit limit
  const boardSize = options?.boardSize ?? board.board_size ?? 40
  const owners = parsePropertyOwners(board.property_owners)
  const mortgagedMap = parseMortgaged(board.mortgaged_properties)

  const unencumberedMortgageValues: number[] = []
  for (const [spaceIndexString, ownerId] of Object.entries(owners)) {
    if (ownerId === playerId) {
      const spaceIndex = Number(spaceIndexString)
      if (!mortgagedMap[spaceIndex]) {
        const space = spaceAt(spaceIndex, boardSize)
        if (space && space.price) {
          unencumberedMortgageValues.push(mortgageValue(space))
        }
      }
    }
  }

  const creditLimit = calculateMonopolyCreditLimit(playerState.cash, unencumberedMortgageValues)
  const amount = Math.floor(requestedAmount)

  if (creditLimit < MONOPOLY_MIN_LOAN_AMOUNT) {
    return {
      success: false,
      board,
      playerState,
      error: 'Insufficient collateral to qualify for a bank loan.',
    }
  }

  if (amount < MONOPOLY_MIN_LOAN_AMOUNT) {
    return {
      success: false,
      board,
      playerState,
      error: `Minimum loan amount is ₦${MONOPOLY_MIN_LOAN_AMOUNT}.`,
    }
  }

  if (amount > creditLimit) {
    return {
      success: false,
      board,
      playerState,
      error: `Requested amount (₦${amount}) exceeds your credit limit of ₦${creditLimit}.`,
    }
  }

  const interestRate = options?.interestRate ?? MONOPOLY_DEFAULT_LOAN_INTEREST_RATE
  const termRounds = options?.termRounds ?? MONOPOLY_DEFAULT_LOAN_TERM_ROUNDS
  const totalDue = calculateMonopolyLoanTotalDue(amount, interestRate)

  const newLoan: MonopolyLoan = {
    id: `loan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    player_id: playerId,
    principal: amount,
    interest_rate: interestRate,
    total_due: totalDue,
    amount_repaid: 0,
    balance_remaining: totalDue,
    term_rounds: termRounds,
    rounds_remaining: termRounds,
    created_at: new Date().toISOString(),
    status: 'active',
  }

  loans.push(newLoan)

  const updatedPlayerState: MonopolyPlayerState = {
    ...playerState,
    cash: playerState.cash + amount,
  }

  const updatedBoard: MonopolyBoard = {
    ...board,
    loans,
    last_cash_event: {
      seq: (board.last_cash_event?.seq ?? 0) + 1,
      player_id: playerId,
      change: amount,
      balance_after: updatedPlayerState.cash,
      label: `Took bank loan of ₦${amount} (₦${totalDue} due in ${termRounds} rounds)`,
    },
    status_message: `Player received ₦${amount} bank loan (Repay ₦${totalDue} in ${termRounds} rounds).`,
  }

  return {
    success: true,
    board: updatedBoard,
    playerState: updatedPlayerState,
    loan: newLoan,
  }
}

/**
 * Validates and executes a repayment towards an active bank loan.
 */
export function repayMonopolyLoan(
  board: MonopolyBoard,
  playerState: MonopolyPlayerState,
  paymentAmount: number
): {
  success: boolean
  board: MonopolyBoard
  playerState: MonopolyPlayerState
  loan?: MonopolyLoan
  fullyRepaid: boolean
  error?: string
} {
  const playerId = playerState.player_id
  const loans = Array.isArray(board.loans) ? [...board.loans] : []
  const loanIndex = loans.findIndex(
    (existingLoan) => existingLoan.player_id === playerId && existingLoan.status === 'active'
  )

  if (loanIndex === -1) {
    return {
      success: false,
      board,
      playerState,
      fullyRepaid: false,
      error: 'No active bank loan found to repay.',
    }
  }

  const loan = loans[loanIndex]
  const amount = Math.floor(paymentAmount)

  if (amount <= 0) {
    return {
      success: false,
      board,
      playerState,
      fullyRepaid: false,
      error: 'Repayment amount must be greater than ₦0.',
    }
  }

  if (playerState.cash < amount) {
    return {
      success: false,
      board,
      playerState,
      fullyRepaid: false,
      error: `Insufficient cash (₦${playerState.cash}) for repayment of ₦${amount}.`,
    }
  }

  // Pay at most the remaining balance
  const effectivePayment = Math.min(amount, loan.balance_remaining)
  const newAmountRepaid = loan.amount_repaid + effectivePayment
  const newBalanceRemaining = Math.max(0, loan.total_due - newAmountRepaid)
  const fullyRepaid = newBalanceRemaining === 0

  const updatedLoan: MonopolyLoan = {
    ...loan,
    amount_repaid: newAmountRepaid,
    balance_remaining: newBalanceRemaining,
    status: fullyRepaid ? 'repaid' : 'active',
  }

  loans[loanIndex] = updatedLoan

  // Prune old resolved loans if history exceeds 20 entries
  const prunedLoans =
    loans.length > 20
      ? loans
          .filter((item) => item.status === 'active' || (item.status === 'defaulted' && item.balance_remaining > 0))
          .concat(
            loans
              .filter(
                (item) => item.status === 'repaid' || (item.status === 'defaulted' && item.balance_remaining === 0)
              )
              .slice(-5)
          )
      : loans

  const updatedPlayerState: MonopolyPlayerState = {
    ...playerState,
    cash: playerState.cash - effectivePayment,
  }

  const updatedBoard: MonopolyBoard = {
    ...board,
    loans: prunedLoans,
    last_cash_event: {
      seq: (board.last_cash_event?.seq ?? 0) + 1,
      player_id: playerId,
      change: -effectivePayment,
      balance_after: updatedPlayerState.cash,
      label: fullyRepaid
        ? `Fully repaid bank loan (₦${effectivePayment})`
        : `Paid ₦${effectivePayment} towards bank loan (₦${newBalanceRemaining} remaining)`,
    },
    status_message: fullyRepaid
      ? 'Bank loan has been fully settled!'
      : `Repaid ₦${effectivePayment} towards loan. ₦${newBalanceRemaining} remaining.`,
  }

  return {
    success: true,
    board: updatedBoard,
    playerState: updatedPlayerState,
    loan: updatedLoan,
    fullyRepaid,
  }
}

/**
 * Decrements the loan rounds counter when a player begins their turn.
 * If rounds expire with an unpaid balance, triggers foreclosure.
 */
export function checkAndAdvanceMonopolyLoanRound(
  board: MonopolyBoard,
  playerId: string
): {
  board: MonopolyBoard
  defaultedLoan?: MonopolyLoan
} {
  const loans = Array.isArray(board.loans) ? [...board.loans] : []
  const loanIndex = loans.findIndex(
    (existingLoan) => existingLoan.player_id === playerId && existingLoan.status === 'active'
  )

  if (loanIndex === -1) {
    return { board }
  }

  const loan = loans[loanIndex]
  const newRoundsRemaining = loan.rounds_remaining - 1

  if (newRoundsRemaining <= 0 && loan.balance_remaining > 0) {
    // Mark as defaulted and return for foreclosure execution
    const defaultedLoan: MonopolyLoan = {
      ...loan,
      rounds_remaining: 0,
      status: 'defaulted',
    }
    loans[loanIndex] = defaultedLoan
    return {
      board: { ...board, loans },
      defaultedLoan,
    }
  }

  loans[loanIndex] = {
    ...loan,
    rounds_remaining: newRoundsRemaining,
  }

  return {
    board: { ...board, loans },
  }
}

/**
 * Executes Bank Foreclosure & Asset Seizure upon loan default.
 * Liquidation order:
 * 1. Liquid cash seizure
 * 2. Building demolition at 50% bank buyback (cheapest first, stopping immediately when debt is cleared)
 * 3. Raw property title foreclosure (unmortgaged first to seize fewer deeds; mortgaged credit ₦0)
 * 4. Insolvency bankruptcy check & refund of any excess over-seizure
 */
export function executeBankForeclosure(
  board: MonopolyBoard,
  playerState: MonopolyPlayerState,
  loan: MonopolyLoan,
  boardSize: MonopolyBoardSize = 40
): {
  board: MonopolyBoard
  playerState: MonopolyPlayerState
  seizedCash: number
  seizedBuildingsRefund: number
  seizedPropertyIndices: number[]
  bankrupt: boolean
  summaryMessage: string
} {
  const playerId = playerState.player_id
  let remainingDebt = loan.balance_remaining
  let currentCash = playerState.cash

  // 1. Seize liquid cash
  const seizedCash = Math.min(Math.max(0, currentCash), remainingDebt)
  currentCash -= seizedCash
  remainingDebt -= seizedCash

  // 2. Liquidate buildings if debt remains (cheapest house cost first, breaking as soon as remainingDebt <= 0)
  let seizedBuildingsRefund = 0
  const buildingsMap = { ...parseBuildings(board.property_buildings) }
  const owners = parsePropertyOwners(board.property_owners)
  let housesInBank = board.houses_in_bank ?? 32
  let hotelsInBank = board.hotels_in_bank ?? 12

  if (remainingDebt > 0) {
    const playerBuildingSpaces: { index: number; space: MonopolySpace; buildingCost: number }[] = []
    for (const [spaceIndexString, buildingCount] of Object.entries(buildingsMap)) {
      const spaceIndex = Number(spaceIndexString)
      if (owners[String(spaceIndex)] === playerId && buildingCount > 0) {
        const space = spaceAt(spaceIndex, boardSize)
        playerBuildingSpaces.push({
          index: spaceIndex,
          space,
          buildingCost: space?.houseCost ?? 50,
        })
      }
    }

    // Sort by house cost ascending (demolish cheaper buildings first)
    playerBuildingSpaces.sort((spaceA, spaceB) => spaceA.buildingCost - spaceB.buildingCost)

    for (const item of playerBuildingSpaces) {
      if (remainingDebt <= 0) break

      const refundPerUnit = Math.floor(item.buildingCost / 2)
      let currentLevel = buildingsMap[item.index] ?? 0

      while (currentLevel > 0 && remainingDebt > 0) {
        if (currentLevel === 5) {
          // Demolishing hotel (level 5): returns 1 hotel to bank.
          hotelsInBank += 1
          const totalHotelRefund = refundPerUnit * 5
          seizedBuildingsRefund += totalHotelRefund
          remainingDebt -= totalHotelRefund
          currentLevel = 0
          delete buildingsMap[item.index]
        } else {
          // Demolishing house: returns 1 house to bank.
          housesInBank += 1
          seizedBuildingsRefund += refundPerUnit
          remainingDebt -= refundPerUnit
          currentLevel -= 1
          if (currentLevel === 0) {
            delete buildingsMap[item.index]
          } else {
            buildingsMap[item.index] = currentLevel
          }
        }
      }
    }
  }

  // 3. Foreclose properties if debt remains (unmortgaged first to seize fewer deeds)
  const seizedPropertyIndices: number[] = []
  const propertyOwners = { ...owners }
  const mortgagedMap = { ...parseMortgaged(board.mortgaged_properties) }

  if (remainingDebt > 0) {
    const ownedSpaces: { index: number; space: MonopolySpace; price: number; isMortgaged: boolean }[] = []
    for (const [spaceIndexString, ownerId] of Object.entries(propertyOwners)) {
      if (ownerId === playerId) {
        const spaceIndex = Number(spaceIndexString)
        const space = spaceAt(spaceIndex, boardSize)
        if (space) {
          ownedSpaces.push({
            index: spaceIndex,
            space,
            price: space.price ?? 50,
            isMortgaged: Boolean(mortgagedMap[spaceIndex]),
          })
        }
      }
    }

    // Sort: unmortgaged first (so we seize fewer total deeds for the same recovery), then price ascending
    ownedSpaces.sort((spaceA, spaceB) => {
      if (spaceA.isMortgaged !== spaceB.isMortgaged) {
        return spaceA.isMortgaged ? 1 : -1
      }
      return spaceA.price - spaceB.price
    })

    for (const item of ownedSpaces) {
      if (remainingDebt <= 0) break

      delete propertyOwners[String(item.index)]
      delete mortgagedMap[item.index]
      delete buildingsMap[item.index]
      seizedPropertyIndices.push(item.index)

      // If property was NOT mortgaged, bank credits mortgageValue(item.space).
      // If property was ALREADY mortgaged, player already received the cash earlier (₦0 credit).
      if (!item.isMortgaged) {
        const creditValue = mortgageValue(item.space)
        remainingDebt -= creditValue
      }
    }
  }

  // If debt was overpaid by building/property liquidation, refund the excess to player cash
  if (remainingDebt < 0) {
    currentCash += Math.abs(remainingDebt)
    remainingDebt = 0
  }

  // 4. Insolvency check: if debt still remains after seizing all cash, buildings, and properties, player is bankrupt
  const isBankrupt = remainingDebt > 0

  // Update loan record
  const loans = Array.isArray(board.loans) ? [...board.loans] : []
  const loanIndex = loans.findIndex((existingLoan) => existingLoan.id === loan.id)
  if (loanIndex !== -1) {
    loans[loanIndex] = {
      ...loans[loanIndex],
      balance_remaining: Math.max(0, remainingDebt),
      status: 'defaulted',
    }
  }

  const updatedPlayerState: MonopolyPlayerState = {
    ...playerState,
    cash: Math.max(0, currentCash),
    bankrupt: isBankrupt || playerState.bankrupt,
  }

  const propertyNames = seizedPropertyIndices
    .map((index) => spaceAt(index, boardSize)?.name ?? `Space ${index}`)
    .slice(0, 3)
    .join(', ')

  const summaryParts: string[] = ['Bank Foreclosure! Defaulted on loan.']
  if (seizedCash > 0) {
    summaryParts.push(`Seized ₦${seizedCash} cash.`)
  }
  if (seizedBuildingsRefund > 0) {
    summaryParts.push(`Liquidated ₦${seizedBuildingsRefund} of buildings.`)
  }
  if (seizedPropertyIndices.length > 0) {
    summaryParts.push(`Foreclosed properties: ${propertyNames}.`)
  }
  const summaryMessage = summaryParts.join(' ')

  const updatedBoard: MonopolyBoard = {
    ...board,
    loans,
    property_owners: propertyOwners,
    property_buildings: buildingsMap,
    mortgaged_properties: mortgagedMap,
    houses_in_bank: Math.max(0, housesInBank),
    hotels_in_bank: Math.max(0, hotelsInBank),
    status_message: summaryMessage,
    last_cash_event: {
      seq: (board.last_cash_event?.seq ?? 0) + 1,
      player_id: playerId,
      change: -seizedCash,
      balance_after: updatedPlayerState.cash,
      label: `Bank foreclosure seizure for defaulted loan`,
      bankrupt: isBankrupt,
    },
  }

  return {
    board: updatedBoard,
    playerState: updatedPlayerState,
    seizedCash,
    seizedBuildingsRefund,
    seizedPropertyIndices,
    bankrupt: isBankrupt,
    summaryMessage,
  }
}
