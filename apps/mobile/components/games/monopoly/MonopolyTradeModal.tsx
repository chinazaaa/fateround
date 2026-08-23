import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Player } from '@fateround/shared'
import { MONOPOLY_BOARD_SIZE, type MonopolyBoardSize } from '@fateround/shared/monopoly-board'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { MonopolyTradeReview } from './MonopolyTradeReview'
import { buildTradeSideItems, type MonopolyPendingTrade } from './manage-logic'

export function MonopolyTradeModal({
  trade,
  players,
  acting,
  themeId,
  boardSize = MONOPOLY_BOARD_SIZE,
  onRespond,
  onMinimize,
}: {
  trade: MonopolyPendingTrade
  players: Player[]
  acting: boolean
  themeId?: string | null
  boardSize?: MonopolyBoardSize
  onRespond: (accept: boolean) => void
  /** When set, renders a Hide button that lets the receiver tuck the modal away and
   *  keep looking at the board. Parent owns the minimized state + the restore pill. */
  onMinimize?: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const fromName = players.find((p) => p.id === trade.from_player_id)?.name ?? 'player'
  const receiveCount = buildTradeSideItems(
    trade.offer_cash,
    trade.offer_properties,
    trade.offer_get_out_cards,
    boardSize
  ).length
  const payCount = buildTradeSideItems(
    trade.request_cash,
    trade.request_properties,
    trade.request_get_out_cards ?? 0,
    boardSize
  ).length

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Trade from {fromName}</Text>
              <Text style={styles.subtitle}>Review every item before you accept</Text>
            </View>
            {onMinimize ? (
              <Pressable
                style={styles.hideBtn}
                onPress={onMinimize}
                accessibilityRole="button"
                accessibilityLabel="Hide trade offer"
              >
                <Text style={styles.hideBtnText}>Hide</Text>
              </Pressable>
            ) : null}
          </View>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <Text style={styles.note}>
              If you accept, everything listed below happens immediately. Decline if the count or items look wrong.
            </Text>
            {receiveCount > 0 ? (
              <Text style={styles.emphasis}>
                You receive {receiveCount} item{receiveCount === 1 ? '' : 's'} in this trade.
              </Text>
            ) : null}
            {payCount > 0 ? (
              <Text style={styles.emphasis}>
                You pay {payCount} item{payCount === 1 ? '' : 's'} in this trade.
              </Text>
            ) : null}
            <MonopolyTradeReview
              themeId={themeId}
              boardSize={boardSize}
              giveLabel="You pay"
              getLabel="You receive"
              giveCash={trade.request_cash}
              giveProps={trade.request_properties}
              giveJailCards={trade.request_get_out_cards ?? 0}
              getCash={trade.offer_cash}
              getProps={trade.offer_properties}
              getJailCards={trade.offer_get_out_cards}
            />
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.primaryBtn, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => onRespond(true)}
            >
              <Text style={styles.primaryBtnText}>Accept trade</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.secondaryBtn, acting && styles.btnDisabled]}
              disabled={acting}
              onPress={() => onRespond(false)}
            >
              <Text style={styles.secondaryBtnText}>Decline</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
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
      padding: 18,
      gap: 10,
      maxHeight: '85%',
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    headerText: { flex: 1, minWidth: 0 },
    title: { color: theme.text, fontSize: 18, fontWeight: '800' },
    subtitle: { color: theme.textMuted, fontSize: 13 },
    hideBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: theme.surfaceHover,
    },
    hideBtnText: { color: theme.text, fontSize: 12, fontWeight: '700' },
    body: { maxHeight: 360 },
    bodyContent: { gap: 10 },
    note: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
    emphasis: { color: theme.text, fontSize: 14, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 8 },
    btn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    primaryBtn: { backgroundColor: theme.primary },
    // white on the solid rose button — intentional
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    secondaryBtn: { backgroundColor: theme.border },
    secondaryBtnText: { color: theme.text, fontWeight: '600', fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
  })
