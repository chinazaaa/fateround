/**
 * Estate Kings (Monopoly) — Loan Facilities Core Calculations
 */

import type { MonopolyLoan } from './types'
import { formatMonopolyMoney, type MonopolyBoardSize } from './monopoly-board'

export const MONOPOLY_DEFAULT_LOAN_INTEREST_RATE = 0.15 // 15% flat interest
export const MONOPOLY_DEFAULT_LOAN_TERM_ROUNDS = 4 // 4 full round rotations
export const MONOPOLY_MIN_LOAN_AMOUNT = 100
export const MONOPOLY_MAX_LOAN_CAP = 1500
export const MONOPOLY_LOAN_PRESET_TIERS = [250, 500, 1000] as const

/**
 * 48-space equivalents, scaled 3× off the 40-space figures.
 *
 * The multiplier tracks rent rather than starting cash: the expanded board's top hotel rent is
 * ₦6,000 against ₦2,000, so a ₦4,500 ceiling preserves the 40-space board's 75% worst-rent
 * coverage — the loan can still clear the debt it is usually taken against. Scaling by starting
 * cash instead (4×, ₦6,000) would leave the cap at or above every player's opening bank, which
 * pins `calculateMonopolyCreditLimit` to its ceiling and makes the collateral term dead weight.
 */
export const MONOPOLY_EXPANDED_MIN_LOAN_AMOUNT = 300
export const MONOPOLY_EXPANDED_MAX_LOAN_CAP = 4500
export const MONOPOLY_EXPANDED_LOAN_PRESET_TIERS = [750, 1500, 3000] as const

export function minLoanAmountForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? MONOPOLY_EXPANDED_MIN_LOAN_AMOUNT : MONOPOLY_MIN_LOAN_AMOUNT
}

export function maxLoanCapForSize(boardSize: MonopolyBoardSize = 40): number {
  return boardSize === 48 ? MONOPOLY_EXPANDED_MAX_LOAN_CAP : MONOPOLY_MAX_LOAN_CAP
}

export function loanPresetTiersForSize(boardSize: MonopolyBoardSize = 40): readonly number[] {
  return boardSize === 48 ? MONOPOLY_EXPANDED_LOAN_PRESET_TIERS : MONOPOLY_LOAN_PRESET_TIERS
}

/**
 * Calculates the maximum credit limit a player can borrow.
 * Formula: min(capForSize, cash + 0.5 * totalUnencumberedMortgageValue)
 * If the collateral base is below the board's minimum loan threshold, credit limit is 0.
 */
export function calculateMonopolyCreditLimit(
  cash: number,
  unencumberedMortgageValues: number[],
  boardSize: MonopolyBoardSize = 40
): number {
  const mortgageSum = unencumberedMortgageValues.reduce((sum, val) => sum + Math.max(0, val), 0)
  const collateralBase = Math.max(0, cash) + Math.round(0.5 * mortgageSum)
  if (collateralBase < minLoanAmountForSize(boardSize)) return 0
  return Math.min(maxLoanCapForSize(boardSize), collateralBase)
}

/**
 * Calculates the total repayment due including flat interest.
 */
export function calculateMonopolyLoanTotalDue(
  principal: number,
  interestRate: number = MONOPOLY_DEFAULT_LOAN_INTEREST_RATE
): number {
  const clampedPrincipal = Math.max(0, Math.round(principal))
  const interest = Math.round(clampedPrincipal * interestRate)
  return clampedPrincipal + interest
}

/**
 * Gets the active loan for a player if one exists.
 */
export function getActiveMonopolyLoan(
  loans: MonopolyLoan[] | undefined | null,
  playerId: string
): MonopolyLoan | undefined {
  if (!loans || !Array.isArray(loans)) return undefined
  return loans.find((loan) => loan.player_id === playerId && loan.status === 'active')
}

/**
 * Checks if a player has an outstanding defaulted loan.
 */
export function hasDefaultedMonopolyLoan(loans: MonopolyLoan[] | undefined | null, playerId: string): boolean {
  if (!loans || !Array.isArray(loans)) return false
  return loans.some((loan) => loan.player_id === playerId && loan.status === 'defaulted' && loan.balance_remaining > 0)
}

/**
 * Checks if a proposed outgoing trade would strip player assets below their remaining loan balance.
 * Anti-exploit protection against fraudulent asset transfer before default.
 */
export function isTradeBlockedByLoan(
  currentCash: number,
  ownedPropertyMortgageValues: number[],
  outgoingCash: number,
  outgoingPropertyMortgageValues: number[],
  activeLoan: MonopolyLoan | undefined
): { blocked: boolean; reason?: string } {
  if (!activeLoan || activeLoan.status !== 'active') {
    return { blocked: false }
  }

  const remainingBalance = activeLoan.balance_remaining
  const totalCurrentMortgage = ownedPropertyMortgageValues.reduce((sum, val) => sum + Math.max(0, val), 0)
  const totalOutgoingMortgage = outgoingPropertyMortgageValues.reduce((sum, val) => sum + Math.max(0, val), 0)

  const postTradeCash = currentCash - outgoingCash
  const postTradeMortgageValue = totalCurrentMortgage - totalOutgoingMortgage
  const postTradeLiquidValue = postTradeCash + postTradeMortgageValue

  if (postTradeLiquidValue < remainingBalance) {
    return {
      blocked: true,
      reason: `Trade blocked: your remaining assets (${formatMonopolyMoney(Math.max(0, postTradeLiquidValue))}) would be less than your active loan balance (${formatMonopolyMoney(remainingBalance)}).`,
    }
  }

  return { blocked: false }
}
