'use client'

import { useState, useMemo } from 'react'
import { MonopolyModal, MonopolyPrimaryButton, MonopolySecondaryButton } from '@/components/monopoly/MonopolyChrome'
import {
  calculateMonopolyCreditLimit,
  calculateMonopolyLoanTotalDue,
  getActiveMonopolyLoan,
  loanPresetTiersForSize,
  minLoanAmountForSize,
} from '@/lib/monopoly-loan'
import { formatThemedMoney } from '@/components/monopoly/monopoly-themes'
import { mortgageValue, spaceAt, parsePropertyOwners } from '@/lib/monopoly'
import { parseMortgaged } from '@/lib/monopoly-rent'
import type { MonopolyBoard, MonopolyPlayerState } from '@/types'

type LoanTab = 'borrow' | 'repay'

export function MonopolyLoanModal({
  open,
  onClose,
  board,
  myState,
  themeId,
  postAction,
  acting = false,
  interestRate = 15,
  termRounds = 4,
}: {
  open: boolean
  onClose: () => void
  board: MonopolyBoard
  myState: MonopolyPlayerState | undefined
  themeId?: string | null
  postAction: (url: string, body?: Record<string, unknown>) => Promise<void>
  acting?: boolean
  interestRate?: number
  termRounds?: number
}) {
  const playerId = myState?.player_id ?? ''
  const boardSize = board.board_size ?? 40
  const minLoanAmount = minLoanAmountForSize(boardSize)
  const presetTiers = loanPresetTiersForSize(boardSize)
  const activeLoan = getActiveMonopolyLoan(board.loans, playerId)
  const defaultTab: LoanTab = activeLoan ? 'repay' : 'borrow'
  const [selectedTab, setSelectedTab] = useState<LoanTab | null>(null)
  const tab = selectedTab ?? defaultTab
  const [submitting, setSubmitting] = useState(false)

  // Calculate unencumbered mortgage values for credit limit
  const unencumberedMortgages = useMemo(() => {
    if (!myState) return []
    const owners = parsePropertyOwners(board.property_owners)
    const mortgagedMap = parseMortgaged(board.mortgaged_properties)
    const values: number[] = []

    for (const [spaceIndexString, owner] of Object.entries(owners)) {
      if (owner === playerId) {
        const spaceIndex = Number(spaceIndexString)
        if (!mortgagedMap[spaceIndex]) {
          const space = spaceAt(spaceIndex, boardSize)
          if (space?.price) values.push(mortgageValue(space))
        }
      }
    }
    return values
  }, [boardSize, board.property_owners, board.mortgaged_properties, playerId, myState])

  const creditLimit = useMemo(() => {
    return calculateMonopolyCreditLimit(myState?.cash ?? 0, unencumberedMortgages, boardSize)
  }, [myState?.cash, unencumberedMortgages, boardSize])

  const [customBorrowAmount, setCustomBorrowAmount] = useState<number | null>(null)
  const [customRepayAmount, setCustomRepayAmount] = useState<number | null>(null)

  // Default suggestion is the board's middle preset (₦500 on 40 spaces, ₦1,500 on 48) so the
  // opening amount stays proportionate to the credit ceiling instead of a flat ₦500.
  const defaultBorrowSuggestion = presetTiers[1] ?? minLoanAmount
  const borrowAmount = Math.min(
    creditLimit,
    Math.max(minLoanAmount, customBorrowAmount ?? Math.min(defaultBorrowSuggestion, creditLimit))
  )

  const maxRepay = activeLoan && myState ? Math.min(myState.cash, activeLoan.balance_remaining) : 0
  const minRepay = Math.min(50, maxRepay)
  const repayAmount = customRepayAmount !== null ? Math.min(maxRepay, Math.max(0, customRepayAmount)) : maxRepay

  if (!open || !myState) return null

  const handleBorrow = async () => {
    if (borrowAmount < minLoanAmount || borrowAmount > creditLimit || submitting || acting) return
    setSubmitting(true)
    try {
      await postAction('/api/monopoly/loan/borrow', { amount: borrowAmount })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  const handleRepay = async (amountToPay: number, closeOnFinish = false) => {
    if (amountToPay <= 0 || amountToPay > myState.cash || submitting || acting) return
    setSubmitting(true)
    try {
      await postAction('/api/monopoly/loan/repay', { amount: amountToPay })
      if (closeOnFinish || (activeLoan && amountToPay >= activeLoan.balance_remaining)) {
        onClose()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const totalDueForBorrow = calculateMonopolyLoanTotalDue(borrowAmount, interestRate / 100)
  const interestAmount = totalDueForBorrow - borrowAmount

  return (
    <MonopolyModal open={open} onClose={onClose} title="Bank Loan Facility">
      <div className="space-y-4">
        {/* Tab switch */}
        <div className="flex rounded-xl bg-[var(--background-secondary)] p-1">
          <button
            type="button"
            onClick={() => setSelectedTab('borrow')}
            disabled={Boolean(activeLoan)}
            className={[
              'flex-1 rounded-lg py-1.5 text-xs font-bold transition-all',
              tab === 'borrow'
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                : 'text-muted hover:text-[var(--foreground)]',
              Boolean(activeLoan) && 'opacity-40 cursor-not-allowed',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            Take Loan
          </button>
          <button
            type="button"
            onClick={() => setSelectedTab('repay')}
            disabled={!activeLoan}
            className={[
              'flex-1 rounded-lg py-1.5 text-xs font-bold transition-all',
              tab === 'repay'
                ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                : 'text-muted hover:text-[var(--foreground)]',
              !activeLoan && 'opacity-40 cursor-not-allowed',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            Repay Debt {activeLoan ? `(${formatThemedMoney(activeLoan.balance_remaining, themeId)})` : ''}
          </button>
        </div>

        {/* Tab: Borrow */}
        {tab === 'borrow' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] p-3 text-center">
              <span className="text-xs text-muted block">Your Maximum Credit Limit</span>
              <span className="text-2xl font-black text-[var(--primary)]">
                {formatThemedMoney(creditLimit, themeId)}
              </span>
              <span className="text-[10px] text-muted block mt-0.5">
                Based on current liquid cash + unencumbered property collateral
              </span>
            </div>

            {/* Quick Preset Buttons */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted block">Choose Amount</label>
              <div className="grid grid-cols-4 gap-2">
                {presetTiers.map((tier: number) => (
                  <button
                    key={tier}
                    type="button"
                    disabled={tier > creditLimit}
                    onClick={() => setCustomBorrowAmount(tier)}
                    className={[
                      'rounded-lg border py-2 text-xs font-bold transition-all',
                      borrowAmount === tier
                        ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] text-[var(--foreground)]'
                        : 'border-[var(--border)] bg-[var(--card)] text-muted hover:border-[var(--primary)]',
                      tier > creditLimit && 'opacity-40 cursor-not-allowed',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {formatThemedMoney(tier, themeId)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomBorrowAmount(creditLimit)}
                  className={[
                    'rounded-lg border py-2 text-xs font-bold transition-all',
                    borrowAmount === creditLimit
                      ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] text-[var(--foreground)]'
                      : 'border-[var(--border)] bg-[var(--card)] text-muted hover:border-[var(--primary)]',
                  ].join(' ')}
                >
                  Max
                </button>
              </div>
            </div>

            {/* Custom Slider */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted">
                <span>Custom: {formatThemedMoney(borrowAmount, themeId)}</span>
                <span>Max: {formatThemedMoney(creditLimit, themeId)}</span>
              </div>
              <input
                type="range"
                min={minLoanAmount}
                max={Math.max(minLoanAmount, creditLimit)}
                step={50}
                value={borrowAmount}
                onChange={(event) => setCustomBorrowAmount(Number(event.target.value))}
                className="w-full accent-[var(--primary)]"
              />
            </div>

            {/* Loan Breakdown Card */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted">Principal Borrowed</span>
                <span className="font-semibold">{formatThemedMoney(borrowAmount, themeId)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Flat Interest ({interestRate}%)</span>
                <span className="font-semibold text-amber-500">+{formatThemedMoney(interestAmount, themeId)}</span>
              </div>
              <div className="border-t border-[var(--border)] pt-1.5 flex justify-between font-bold">
                <span>Total Repayment Due</span>
                <span className="text-[var(--primary)]">{formatThemedMoney(totalDueForBorrow, themeId)}</span>
              </div>
              <div className="flex justify-between text-muted text-[11px]">
                <span>Repayment Window</span>
                <span>{termRounds} full rounds</span>
              </div>
            </div>

            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-[11px] text-amber-600 dark:text-amber-400 leading-snug">
              ⚠️ <strong>Foreclosure Warning:</strong> If not fully repaid within {termRounds} rounds, the bank will
              automatically seize your cash, liquidate buildings at 50%, and foreclose properties.
            </div>

            <MonopolyPrimaryButton
              onClick={handleBorrow}
              disabled={submitting || acting || borrowAmount < minLoanAmount || borrowAmount > creditLimit}
            >
              {submitting ? 'Processing...' : `Borrow ${formatThemedMoney(borrowAmount, themeId)}`}
            </MonopolyPrimaryButton>
          </div>
        )}

        {/* Tab: Repay */}
        {tab === 'repay' && activeLoan && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background-secondary)] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted">Status</span>
                <span
                  className={[
                    'text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                    activeLoan.rounds_remaining <= 1
                      ? 'bg-red-500/20 text-red-500 animate-pulse'
                      : activeLoan.rounds_remaining === 2
                        ? 'bg-amber-500/20 text-amber-500'
                        : 'bg-emerald-500/20 text-emerald-500',
                  ].join(' ')}
                >
                  {activeLoan.rounds_remaining} {activeLoan.rounds_remaining === 1 ? 'round' : 'rounds'} left
                </span>
              </div>

              <div className="text-center py-1">
                <span className="text-xs text-muted block">Remaining Balance Due</span>
                <span className="text-2xl font-black text-red-500">
                  {formatThemedMoney(activeLoan.balance_remaining, themeId)}
                </span>
              </div>

              <div className="text-xs text-muted space-y-1 pt-1 border-t border-[var(--border)]">
                <div className="flex justify-between">
                  <span>Initial Principal</span>
                  <span>{formatThemedMoney(activeLoan.principal, themeId)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Already Repaid</span>
                  <span className="text-emerald-500">{formatThemedMoney(activeLoan.amount_repaid, themeId)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Your Available Cash</span>
                  <span className="font-semibold">{formatThemedMoney(myState.cash, themeId)}</span>
                </div>
              </div>
            </div>

            {/* Quick 1-Click Pay Full */}
            <MonopolyPrimaryButton
              onClick={() => handleRepay(activeLoan.balance_remaining, true)}
              disabled={submitting || acting || myState.cash < activeLoan.balance_remaining}
            >
              {submitting
                ? 'Processing...'
                : `Pay in Full (${formatThemedMoney(activeLoan.balance_remaining, themeId)})`}
            </MonopolyPrimaryButton>

            {/* Partial Repayment Options */}
            {myState.cash > 0 && activeLoan.balance_remaining > 50 && (
              <div className="space-y-2.5 pt-2 border-t border-[var(--border)]">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-semibold text-muted">Make Partial Payment</label>
                  <span className="font-bold text-[var(--primary)]">{formatThemedMoney(repayAmount, themeId)}</span>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {[50, 100, 250].map((presetAmount: number) => (
                    <button
                      key={presetAmount}
                      type="button"
                      disabled={presetAmount > myState.cash || presetAmount > activeLoan.balance_remaining}
                      onClick={() => setCustomRepayAmount(presetAmount)}
                      className={[
                        'rounded-lg border py-1.5 text-xs font-bold transition-all',
                        repayAmount === presetAmount
                          ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_20%,transparent)] text-[var(--foreground)]'
                          : 'border-[var(--border)] bg-[var(--card)] text-muted hover:border-[var(--primary)]',
                        (presetAmount > myState.cash || presetAmount > activeLoan.balance_remaining) &&
                          'opacity-40 cursor-not-allowed',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {formatThemedMoney(presetAmount, themeId)}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCustomRepayAmount(maxRepay)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] py-1.5 text-xs font-bold text-muted hover:border-[var(--primary)]"
                  >
                    Max
                  </button>
                </div>

                <input
                  type="range"
                  min={minRepay}
                  max={Math.max(minRepay, maxRepay)}
                  step={25}
                  value={repayAmount}
                  onChange={(event) => setCustomRepayAmount(Number(event.target.value))}
                  className="w-full accent-[var(--primary)] cursor-pointer"
                />

                <MonopolySecondaryButton
                  onClick={() => handleRepay(repayAmount, false)}
                  disabled={submitting || acting || repayAmount < 1 || repayAmount > myState.cash}
                >
                  {submitting ? 'Processing...' : `Pay ${formatThemedMoney(repayAmount, themeId)}`}
                </MonopolySecondaryButton>
              </div>
            )}
          </div>
        )}

        <MonopolySecondaryButton onClick={onClose}>Close</MonopolySecondaryButton>
      </div>
    </MonopolyModal>
  )
}
