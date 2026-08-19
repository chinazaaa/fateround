import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  MONOPOLY_BOARD_SIZE,
  MONOPOLY_HOTEL_LEVEL,
  countOwnedInGroup,
  mortgageValue,
  spaceAt,
  type MonopolyBoardSize,
  type MonopolySpace,
} from '@fateround/shared/monopoly-board'
import { MONOPOLY_COLOR_HEX } from '@fateround/shared/monopoly-board-layout'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { formatThemedMoney, themedSpaceName } from './monopoly-theme'
import { buildingLevel } from './manage-logic'

/**
 * Full title-deed detail for a tapped board space — mobile port of web's
 * TitleDeedSection + MonopolyCurrentSpace (src/components/monopoly/MonopolyBoard.tsx,
 * PR #669 tap-to-inspect + PR #679 full title deed). Shows purchase price, the
 * complete rent ladder (site rent through hotel), mortgage value, build costs,
 * the station rent schedule, or utility multipliers — whichever applies to the
 * tapped space — and highlights the row matching the property's current level.
 */
export function MonopolyPropertyModal({
  spaceIndex,
  onClose,
  ownerId,
  ownerName,
  owners,
  buildings,
  mortgaged,
  themeId,
  boardSize = MONOPOLY_BOARD_SIZE,
}: {
  spaceIndex: number | null
  onClose: () => void
  ownerId?: string | null
  ownerName?: string | null
  owners: Record<string, string>
  buildings: Record<string, number>
  mortgaged: Record<string, boolean>
  themeId?: string | null
  boardSize?: MonopolyBoardSize
}) {
  const styles = useThemedStyles(makeStyles)
  const open = spaceIndex !== null
  const space = spaceIndex !== null ? spaceAt(spaceIndex, boardSize) : null

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {space ? (
            <>
              {space.color ? (
                <View style={[styles.colorBar, { backgroundColor: MONOPOLY_COLOR_HEX[space.color] }]} />
              ) : null}
              <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.title}>{themedSpaceName(space.name, spaceIndex!, themeId, boardSize)}</Text>
                <Text style={styles.ownerLine}>
                  {mortgaged[String(spaceIndex)]
                    ? 'Mortgaged'
                    : ownerId
                      ? `Owned by ${ownerName ?? 'a player'}`
                      : ownerId === undefined || ownerId === null
                        ? 'Unowned'
                        : 'Unowned'}
                </Text>
                <TitleDeedRows
                  space={space}
                  spaceIndex={spaceIndex!}
                  owners={owners}
                  buildings={buildings}
                  ownerId={ownerId ?? undefined}
                  themeId={themeId}
                  boardSize={boardSize}
                  styles={styles}
                />
              </ScrollView>
            </>
          ) : null}
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

type Row = { label: string; value: string; active?: boolean; section?: boolean }

function TitleDeedRows({
  space,
  spaceIndex,
  owners,
  buildings,
  ownerId,
  themeId,
  boardSize,
  styles,
}: {
  space: MonopolySpace
  spaceIndex: number
  owners: Record<string, string>
  buildings: Record<string, number>
  ownerId?: string
  themeId?: string | null
  boardSize: MonopolyBoardSize
  styles: ReturnType<typeof makeStyles>
}) {
  const fmt = (amount: number) => formatThemedMoney(amount, themeId)
  const rows: Row[] = []

  if (space.type === 'property' && space.rentTable && space.houseCost != null) {
    const level = buildingLevel(buildings, spaceIndex)
    rows.push({ label: 'Price', value: fmt(space.price!), section: true })
    rows.push({ label: 'Site rent', value: fmt(space.rentTable[0]!), active: !!ownerId && level === 0 })
    for (let h = 1; h < MONOPOLY_HOTEL_LEVEL; h++) {
      rows.push({
        label: `With ${h} house${h > 1 ? 's' : ''}`,
        value: fmt(space.rentTable[h]!),
        active: !!ownerId && level === h,
      })
    }
    rows.push({
      label: 'With hotel',
      value: fmt(space.rentTable[MONOPOLY_HOTEL_LEVEL]!),
      active: !!ownerId && level === MONOPOLY_HOTEL_LEVEL,
    })
    rows.push({ label: 'Mortgage value', value: fmt(mortgageValue(space)), section: true })
    rows.push({ label: 'House cost', value: fmt(space.houseCost) })
    rows.push({ label: 'Hotel cost', value: fmt(space.houseCost) })
  } else if (space.type === 'station') {
    const ownedCount = ownerId ? countOwnedInGroup(owners, ownerId, 'station', boardSize) : 0
    const baseRent = space.rent ?? 25
    rows.push({ label: 'Price', value: fmt(space.price!), section: true })
    for (let n = 1; n <= 4; n++) {
      const rent = baseRent * 2 ** (n - 1)
      rows.push({
        label: `${n} station${n > 1 ? 's' : ''} owned`,
        value: fmt(rent),
        active: !!ownerId && ownedCount === n,
      })
    }
    rows.push({ label: 'Mortgage value', value: fmt(mortgageValue(space)), section: true })
  } else if (space.type === 'utility') {
    const ownedCount = ownerId ? countOwnedInGroup(owners, ownerId, 'utility', boardSize) : 0
    rows.push({ label: 'Price', value: fmt(space.price!), section: true })
    rows.push({ label: '1 utility owned', value: '4× dice roll', active: !!ownerId && ownedCount === 1 })
    rows.push({ label: '2 utilities owned', value: '10× dice roll', active: !!ownerId && ownedCount === 2 })
    rows.push({ label: 'Mortgage value', value: fmt(mortgageValue(space)), section: true })
  }

  if (rows.length === 0) {
    return <Text style={styles.noDetail}>No purchase details for this space.</Text>
  }

  return (
    <View style={styles.rows}>
      {rows.map((row, i) => (
        <View
          key={i}
          style={[styles.row, i > 0 && styles.rowBorder, row.active && styles.rowActive]}
          accessibilityRole="text"
          accessibilityLabel={`${row.label}: ${row.value}`}
        >
          <Text style={[styles.rowLabel, row.section && styles.rowLabelSection]}>{row.label}</Text>
          <Text style={[styles.rowValue, row.active && styles.rowValueActive]}>{row.value}</Text>
        </View>
      ))}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: 20 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
      maxHeight: '80%',
    },
    colorBar: { height: 8, width: '100%' },
    body: { padding: 16, gap: 10 },
    title: { color: theme.text, fontSize: 18, fontWeight: '800' },
    ownerLine: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    noDetail: { color: theme.textMuted, fontSize: 13 },
    rows: { marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
    rowActive: { backgroundColor: theme.primarySoft },
    rowLabel: { color: theme.textMuted, fontSize: 13 },
    rowLabelSection: { color: theme.text, fontWeight: '700' },
    rowValue: { color: theme.text, fontSize: 13, fontWeight: '600' },
    rowValueActive: { color: theme.primary, fontWeight: '800' },
    closeBtn: {
      borderTopWidth: 1,
      borderTopColor: theme.border,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: theme.bg,
    },
    closeBtnText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  })
