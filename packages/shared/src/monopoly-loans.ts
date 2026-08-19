/**
 * Estate Kings (Monopoly) — Loan Facilities Core Calculations
 */

import type { MonopolyLoan } from './types'

export const MONOPOLY_DEFAULT_LOAN_INTEREST_RATE = 0.15 // 15% flat interest
export const MONOPOLY_DEFAULT_LOAN_TERM_ROUNDS = 4 // 4 full round rotations
export const MONOPOLY_MIN_LOAN_AMOUNT = 100
export const MONOPOLY_MAX_LOAN_CAP = 1500
export const MONOPOLY_LOAN_PRESET_TIERS = [250, 500, 1000] as const

/**
 * Calculates the maximum credit limit a player can borrow.
 * Formula: min(CAP, cash + 0.5 * totalUnencumberedMortgageValue)
 * If collateral base is below the minimum loan threshold (₦100), credit limit is 0.
 */
export function calculateMonopolyCreditLimit(
  cash: number,
  unencumberedMortgageValues: number[],
  maxCap: number = MONOPOLY_MAX_LOAN_CAP
): number {
  const mortgageSum = unencumberedMortgageValues.reduce((sum, val) => sum + Math.max(0, val), 0)
  const collateralBase = Math.max(0, cash) + Math.round(0.5 * mortgageSum)
  if (collateralBase < MONOPOLY_MIN_LOAN_AMOUNT) return 0
  return Math.min(maxCap, collateralBase)
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
      reason: `Trade blocked: your remaining assets (₦${Math.max(0, postTradeLiquidValue)}) would be less than your active loan balance (₦${remainingBalance}).`,
    }
  }

  return { blocked: false }
}
