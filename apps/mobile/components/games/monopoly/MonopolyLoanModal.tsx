import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { mortgageValue, spaceAt, type MonopolyBoardSize } from '@fateround/shared/monopoly-board'
import { parseMortgaged, parsePropertyOwners } from './manage-logic'
import {
  calculateMonopolyCreditLimit,
  calculateMonopolyLoanTotalDue,
  getActiveMonopolyLoan,
  hasDefaultedMonopolyLoan,
  loanPresetTiersForSize,
  minLoanAmountForSize,
} from '@fateround/shared/monopoly-loans'
import type { MonopolyBoard, MonopolyPlayerState } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { formatThemedMoney } from './monopoly-theme'

type LoanTab = 'borrow' | 'repay'

/**
 * Mobile port of src/components/monopoly/MonopolyLoanModal.tsx. Borrow against
 * the same credit line (cash + half of unencumbered mortgage value, capped), or
 * repay any active loan in whole or part. All numbers are computed via the
 * shared engine so behaviour tracks web.
 */
export function MonopolyLoanModal({
  open,
  onClose,
  board,
  myState,
  themeId,
  acting = false,
  interestRate = 15,
  termRounds = 4,
  onBorrow,
  onRepay,
}: {
  open: boolean
  onClose: () => void
  board: MonopolyBoard
  myState: MonopolyPlayerState | undefined
  themeId?: string | null
  acting?: boolean
  interestRate?: number
  termRounds?: number
  onBorrow: (amount: number) => Promise<unknown>
  onRepay: (amount: number) => Promise<unknown>
}) {
  const styles = useThemedStyles(makeStyles)
  const playerId = myState?.player_id ?? ''
  const boardSize: MonopolyBoardSize = (board.board_size ?? 40) as MonopolyBoardSize
  const minLoanAmount = minLoanAmountForSize(boardSize)
  const presetTiers = loanPresetTiersForSize(boardSize)
  const activeLoan = getActiveMonopolyLoan(board.loans, playerId)
  const hasDefault = hasDefaultedMonopolyLoan(board.loans, playerId)
  const defaultTab: LoanTab = activeLoan ? 'repay' : 'borrow'
  const [selectedTab, setSelectedTab] = useState<LoanTab | null>(null)
  const tab = selectedTab ?? defaultTab
  const [submitting, setSubmitting] = useState(false)

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

  const creditLimit = useMemo(
    () => calculateMonopolyCreditLimit(myState?.cash ?? 0, unencumberedMortgages, boardSize),
    [myState?.cash, unencumberedMortgages, boardSize]
  )

  const [customBorrowAmount, setCustomBorrowAmount] = useState<number | null>(null)
  const [customRepayAmount, setCustomRepayAmount] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const defaultBorrowSuggestion = presetTiers[1] ?? minLoanAmount
  const borrowAmount = Math.min(
    creditLimit,
    Math.max(minLoanAmount, customBorrowAmount ?? Math.min(defaultBorrowSuggestion, creditLimit))
  )
  const totalDueForBorrow = calculateMonopolyLoanTotalDue(borrowAmount, interestRate / 100)
  const interestAmount = totalDueForBorrow - borrowAmount

  const maxRepay = activeLoan && myState ? Math.min(myState.cash, activeLoan.balance_remaining) : 0
  const repayAmount =
    customRepayAmount !== null ? Math.min(maxRepay, Math.max(0, customRepayAmount)) : maxRepay

  const busy = submitting || acting

  const handleBorrow = async () => {
    if (borrowAmount < minLoanAmount || borrowAmount > creditLimit || busy) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await onBorrow(borrowAmount)
      onClose()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Borrow failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRepay = async (amountToPay: number, closeOnFinish = false) => {
    if (!myState) return
    if (amountToPay <= 0 || amountToPay > myState.cash || busy) return
    setSubmitting(true)
    setErrorMessage(null)
    try {
      await onRepay(amountToPay)
      if (closeOnFinish || (activeLoan && amountToPay >= activeLoan.balance_remaining)) {
        onClose()
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Repayment failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!myState) return null

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Bank Loan Facility</Text>

          <View style={styles.tabRow}>
            <Pressable
              onPress={() => !activeLoan && setSelectedTab('borrow')}
              disabled={Boolean(activeLoan)}
              style={[
                styles.tab,
                tab === 'borrow' && styles.tabActive,
                Boolean(activeLoan) && styles.tabDisabled,
              ]}
            >
              <Text style={[styles.tabLabel, tab === 'borrow' && styles.tabLabelActive]}>Take Loan</Text>
            </Pressable>
            <Pressable
              onPress={() => activeLoan && setSelectedTab('repay')}
              disabled={!activeLoan}
              style={[styles.tab, tab === 'repay' && styles.tabActive, !activeLoan && styles.tabDisabled]}
            >
              <Text style={[styles.tabLabel, tab === 'repay' && styles.tabLabelActive]}>
                Repay Debt
                {activeLoan ? ` (${formatThemedMoney(activeLoan.balance_remaining, themeId)})` : ''}
              </Text>
            </Pressable>
          </View>

          {hasDefault ? (
            <View style={styles.defaultedBox}>
              <Text style={styles.defaultedText}>
                You have a defaulted loan on record. The bank will not extend new credit until it is settled.
              </Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.body}>
            {tab === 'borrow' ? (
              <View style={styles.section}>
                <View style={styles.creditBox}>
                  <Text style={styles.creditLabel}>Your Maximum Credit Limit</Text>
                  <Text style={styles.creditValue}>{formatThemedMoney(creditLimit, themeId)}</Text>
                  <Text style={styles.creditHint}>
                    Based on current liquid cash + unencumbered property collateral
                  </Text>
                </View>

                <Text style={styles.subheader}>Choose Amount</Text>
                <View style={styles.presetGrid}>
                  {presetTiers.map((tier) => {
                    const disabled = tier > creditLimit
                    const selected = borrowAmount === tier
                    return (
                      <Pressable
                        key={tier}
                        disabled={disabled}
                        onPress={() => setCustomBorrowAmount(tier)}
                        style={[
                          styles.preset,
                          selected && styles.presetSelected,
                          disabled && styles.presetDisabled,
                        ]}
                      >
                        <Text style={[styles.presetLabel, selected && styles.presetLabelSelected]}>
                          {formatThemedMoney(tier, themeId)}
                        </Text>
                      </Pressable>
                    )
                  })}
                  <Pressable
                    disabled={creditLimit < minLoanAmount}
                    onPress={() => setCustomBorrowAmount(creditLimit)}
                    style={[
                      styles.preset,
                      borrowAmount === creditLimit && styles.presetSelected,
                      creditLimit < minLoanAmount && styles.presetDisabled,
                    ]}
                  >
                    <Text
                      style={[styles.presetLabel, borrowAmount === creditLimit && styles.presetLabelSelected]}
                    >
                      Max
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.breakdown}>
                  <BreakdownRow
                    styles={styles}
                    label="Principal Borrowed"
                    value={formatThemedMoney(borrowAmount, themeId)}
                  />
                  <BreakdownRow
                    styles={styles}
                    label={`Flat Interest (${interestRate}%)`}
                    value={`+${formatThemedMoney(interestAmount, themeId)}`}
                    accent="warn"
                  />
                  <View style={styles.divider} />
                  <BreakdownRow
                    styles={styles}
                    label="Total Repayment Due"
                    value={formatThemedMoney(totalDueForBorrow, themeId)}
                    bold
                  />
                  <BreakdownRow
                    styles={styles}
                    label="Repayment Window"
                    value={`${termRounds} full rounds`}
                    muted
                  />
                </View>

                <View style={styles.warnBox}>
                  <Text style={styles.warnText}>
                    ⚠️ Foreclosure warning: if not fully repaid within {termRounds} rounds, the bank will seize
                    your cash, liquidate buildings at 50%, and foreclose properties.
                  </Text>
                </View>

                <Pressable
                  disabled={busy || hasDefault || borrowAmount < minLoanAmount || borrowAmount > creditLimit}
                  onPress={handleBorrow}
                  style={[
                    styles.primary,
                    (busy || hasDefault || borrowAmount < minLoanAmount || borrowAmount > creditLimit) &&
                      styles.primaryDisabled,
                  ]}
                >
                  <Text style={styles.primaryLabel}>
                    {submitting ? 'Processing…' : `Borrow ${formatThemedMoney(borrowAmount, themeId)}`}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {tab === 'repay' && activeLoan ? (
              <View style={styles.section}>
                <View style={styles.statusBox}>
                  <View style={styles.statusHead}>
                    <Text style={styles.subheader}>Status</Text>
                    <View
                      style={[
                        styles.badge,
                        activeLoan.rounds_remaining <= 1
                          ? styles.badgeDanger
                          : activeLoan.rounds_remaining === 2
                            ? styles.badgeWarn
                            : styles.badgeSafe,
                      ]}
                    >
                      <Text style={styles.badgeLabel}>
                        {activeLoan.rounds_remaining} {activeLoan.rounds_remaining === 1 ? 'round' : 'rounds'} left
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.balanceLabel}>Remaining Balance Due</Text>
                  <Text style={styles.balanceValue}>
                    {formatThemedMoney(activeLoan.balance_remaining, themeId)}
                  </Text>

                  <View style={styles.divider} />
                  <BreakdownRow
                    styles={styles}
                    label="Initial Principal"
                    value={formatThemedMoney(activeLoan.principal, themeId)}
                    muted
                  />
                  <BreakdownRow
                    styles={styles}
                    label="Already Repaid"
                    value={formatThemedMoney(activeLoan.amount_repaid, themeId)}
                    accent="good"
                    muted
                  />
                  <BreakdownRow
                    styles={styles}
                    label="Your Available Cash"
                    value={formatThemedMoney(myState.cash, themeId)}
                    muted
                  />
                </View>

                <Pressable
                  disabled={busy || myState.cash < activeLoan.balance_remaining}
                  onPress={() => handleRepay(activeLoan.balance_remaining, true)}
                  style={[
                    styles.primary,
                    (busy || myState.cash < activeLoan.balance_remaining) && styles.primaryDisabled,
                  ]}
                >
                  <Text style={styles.primaryLabel}>
                    {submitting
                      ? 'Processing…'
                      : `Pay in Full (${formatThemedMoney(activeLoan.balance_remaining, themeId)})`}
                  </Text>
                </Pressable>

                {myState.cash > 0 && activeLoan.balance_remaining > 50 ? (
                  <View style={styles.partialBlock}>
                    <View style={styles.partialHead}>
                      <Text style={styles.subheader}>Make Partial Payment</Text>
                      <Text style={styles.partialAmount}>{formatThemedMoney(repayAmount, themeId)}</Text>
                    </View>
                    <View style={styles.presetGrid}>
                      {[50, 100, 250].map((presetAmount) => {
                        const disabled = presetAmount > myState.cash || presetAmount > activeLoan.balance_remaining
                        const selected = repayAmount === presetAmount
                        return (
                          <Pressable
                            key={presetAmount}
                            disabled={disabled}
                            onPress={() => setCustomRepayAmount(presetAmount)}
                            style={[
                              styles.preset,
                              selected && styles.presetSelected,
                              disabled && styles.presetDisabled,
                            ]}
                          >
                            <Text style={[styles.presetLabel, selected && styles.presetLabelSelected]}>
                              {formatThemedMoney(presetAmount, themeId)}
                            </Text>
                          </Pressable>
                        )
                      })}
                      <Pressable
                        disabled={maxRepay <= 0}
                        onPress={() => setCustomRepayAmount(maxRepay)}
                        style={[styles.preset, maxRepay <= 0 && styles.presetDisabled]}
                      >
                        <Text style={styles.presetLabel}>Max</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      disabled={busy || repayAmount < 1 || repayAmount > myState.cash}
                      onPress={() => handleRepay(repayAmount, false)}
                      style={[
                        styles.secondary,
                        (busy || repayAmount < 1 || repayAmount > myState.cash) && styles.primaryDisabled,
                      ]}
                    >
                      <Text style={styles.secondaryLabel}>
                        {submitting ? 'Processing…' : `Pay ${formatThemedMoney(repayAmount, themeId)}`}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function BreakdownRow({
  styles,
  label,
  value,
  bold,
  muted,
  accent,
}: {
  styles: ReturnType<typeof makeStyles>
  label: string
  value: string
  bold?: boolean
  muted?: boolean
  accent?: 'warn' | 'good'
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.rowLabelMuted]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          bold && styles.rowValueBold,
          accent === 'warn' && styles.rowValueWarn,
          accent === 'good' && styles.rowValueGood,
        ]}
      >
        {value}
      </Text>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.space.md,
    },
    card: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '90%',
      backgroundColor: theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.md,
      gap: theme.space.md,
    },
    title: { color: theme.text, fontSize: 18, fontWeight: '800' },
    tabRow: {
      flexDirection: 'row',
      backgroundColor: theme.bgElevated,
      borderRadius: 12,
      padding: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: 'center',
    },
    tabActive: { backgroundColor: theme.surface },
    tabDisabled: { opacity: 0.4 },
    tabLabel: { color: theme.textMuted, fontWeight: '700', fontSize: 12 },
    tabLabelActive: { color: theme.text },
    body: { gap: theme.space.md },
    section: { gap: theme.space.md },
    subheader: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    creditBox: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: theme.space.md,
      alignItems: 'center',
      gap: 2,
      backgroundColor: theme.bgElevated,
    },
    creditLabel: { color: theme.textMuted, fontSize: 11 },
    creditValue: { color: theme.primary, fontWeight: '900', fontSize: 24 },
    creditHint: { color: theme.textMuted, fontSize: 10, textAlign: 'center' },
    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    preset: {
      flexGrow: 1,
      flexBasis: '22%',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingVertical: 8,
      alignItems: 'center',
      backgroundColor: theme.surface,
    },
    presetSelected: {
      borderColor: theme.primary,
      backgroundColor: theme.bgElevated,
    },
    presetDisabled: { opacity: 0.4 },
    presetLabel: { color: theme.textMuted, fontWeight: '700', fontSize: 12 },
    presetLabelSelected: { color: theme.text },
    breakdown: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      padding: theme.space.md,
      gap: 6,
      backgroundColor: theme.bgElevated,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rowLabel: { color: theme.text, fontSize: 12 },
    rowLabelMuted: { color: theme.textMuted },
    rowValue: { color: theme.text, fontSize: 12, fontWeight: '600' },
    rowValueBold: { fontWeight: '800' },
    rowValueWarn: { color: '#d97706' },
    rowValueGood: { color: '#10b981' },
    divider: { height: 1, backgroundColor: theme.border, marginVertical: 4 },
    warnBox: {
      borderWidth: 1,
      borderColor: '#d9770633',
      backgroundColor: '#d9770614',
      borderRadius: 10,
      padding: 10,
    },
    warnText: { color: '#b45309', fontSize: 11, lineHeight: 15 },
    primary: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    primaryLabel: { color: '#fff', fontWeight: '800', fontSize: 14 },
    primaryDisabled: { opacity: 0.5 },
    secondary: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    secondaryLabel: { color: theme.text, fontWeight: '700', fontSize: 13 },
    close: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    closeLabel: { color: theme.textMuted, fontWeight: '700' },
    statusBox: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: theme.space.md,
      gap: 6,
      backgroundColor: theme.bgElevated,
    },
    statusHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    balanceLabel: { color: theme.textMuted, fontSize: 11, textAlign: 'center' },
    balanceValue: { color: '#ef4444', fontWeight: '900', fontSize: 26, textAlign: 'center' },
    badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    badgeSafe: { backgroundColor: '#10b98126' },
    badgeWarn: { backgroundColor: '#f59e0b26' },
    badgeDanger: { backgroundColor: '#ef444426' },
    badgeLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
    partialBlock: { gap: 10, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
    partialHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    partialAmount: { color: theme.primary, fontWeight: '800' },
    errorBox: {
      borderWidth: 1,
      borderColor: '#ef444455',
      backgroundColor: '#ef444414',
      borderRadius: 10,
      padding: 10,
    },
    errorText: { color: '#b91c1c', fontSize: 12, lineHeight: 16 },
    defaultedBox: {
      borderWidth: 1,
      borderColor: '#ef444455',
      backgroundColor: '#ef444414',
      borderRadius: 10,
      padding: 10,
    },
    defaultedText: { color: '#b91c1c', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  })
