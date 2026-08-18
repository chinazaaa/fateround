import { StyleSheet, Text, View } from 'react-native'
import { MONOPOLY_BOARD_SIZE, type MonopolyBoardSize } from '@fateround/shared/monopoly-board'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { formatThemedMoney, themedSpaceName } from './monopoly-theme'
import { buildTradeSideItems, tradeSideCountLabel, tradeSideHasValue } from './manage-logic'

function TradeSideItems({
  cash,
  propertyIndexes,
  jailCards,
  themeId,
  boardSize,
}: {
  cash: number
  propertyIndexes: unknown
  jailCards: number
  themeId?: string | null
  boardSize: MonopolyBoardSize
}) {
  const styles = useThemedStyles(makeStyles)
  const items = buildTradeSideItems(cash, propertyIndexes, jailCards, boardSize)
  if (items.length === 0) return <Text style={styles.nothing}>Nothing</Text>
  return (
    <View style={styles.itemList}>
      {items.map((item) => {
        if (item.kind === 'cash') {
          return (
            <Text key="cash" style={styles.item}>
              <Text style={styles.itemMuted}>Cash </Text>
              {formatThemedMoney(item.amount, themeId)}
            </Text>
          )
        }
        if (item.kind === 'property') {
          return (
            <Text key={`prop-${item.index}`} style={styles.item}>
              {themedSpaceName(item.name, item.index, themeId, boardSize)}
            </Text>
          )
        }
        return (
          <Text key="jail" style={styles.item}>
            {item.count} skip-the-queue card{item.count === 1 ? '' : 's'}
          </Text>
        )
      })}
    </View>
  )
}

export function MonopolyTradeReview({
  giveLabel,
  getLabel,
  giveCash,
  giveProps,
  getCash,
  getProps,
  giveJailCards = 0,
  getJailCards = 0,
  themeId,
  boardSize = MONOPOLY_BOARD_SIZE,
}: {
  giveLabel: string
  getLabel: string
  giveCash: number
  giveProps: unknown
  getCash: number
  getProps: unknown
  giveJailCards?: number
  getJailCards?: number
  themeId?: string | null
  boardSize?: MonopolyBoardSize
}) {
  const styles = useThemedStyles(makeStyles)
  const oneSidedGift =
    tradeSideHasValue(giveCash, giveProps, giveJailCards, boardSize) &&
    !tradeSideHasValue(getCash, getProps, getJailCards, boardSize)
  const oneSidedReceive =
    tradeSideHasValue(getCash, getProps, getJailCards, boardSize) &&
    !tradeSideHasValue(giveCash, giveProps, giveJailCards, boardSize)
  const giveCountLabel = tradeSideCountLabel(giveCash, giveProps, giveJailCards, boardSize)
  const getCountLabel = tradeSideCountLabel(getCash, getProps, getJailCards, boardSize)

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        <View style={[styles.side, styles.giveSide]}>
          <View style={styles.sideHeader}>
            <Text style={[styles.sideLabel, styles.giveLabel]}>{giveLabel}</Text>
            {giveCountLabel ? <Text style={[styles.countLabel, styles.giveLabel]}>{giveCountLabel}</Text> : null}
          </View>
          <TradeSideItems
            cash={giveCash}
            propertyIndexes={giveProps}
            jailCards={giveJailCards}
            themeId={themeId}
            boardSize={boardSize}
          />
        </View>
        <View style={[styles.side, styles.getSide]}>
          <View style={styles.sideHeader}>
            <Text style={[styles.sideLabel, styles.getLabel]}>{getLabel}</Text>
            {getCountLabel ? <Text style={[styles.countLabel, styles.getLabel]}>{getCountLabel}</Text> : null}
          </View>
          <TradeSideItems
            cash={getCash}
            propertyIndexes={getProps}
            jailCards={getJailCards}
            themeId={themeId}
            boardSize={boardSize}
          />
        </View>
      </View>
      {oneSidedGift ? (
        <Text style={[styles.warn, styles.warnGive]}>
          You are not asking for anything in return — this is a one-way gift, not a swap.
        </Text>
      ) : null}
      {oneSidedReceive ? (
        <Text style={[styles.warn, styles.warnGet]}>
          You are not offering anything — you would only receive from them.
        </Text>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    grid: { flexDirection: 'row', gap: 8 },
    side: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 10, gap: 4 },
    giveSide: { borderColor: '#ef444455', backgroundColor: '#ef444414' },
    getSide: { borderColor: '#10b98155', backgroundColor: '#10b98114' },
    sideHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 },
    sideLabel: { flexShrink: 1, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    giveLabel: { color: '#f87171' },
    getLabel: { color: '#34d399' },
    countLabel: { flexShrink: 0, fontSize: 10, fontWeight: '700' },
    itemList: { gap: 2 },
    item: { fontSize: 13, fontWeight: '600', color: theme.text },
    itemMuted: { fontWeight: '400', color: theme.textMuted },
    nothing: { fontSize: 13, fontStyle: 'italic', color: theme.textMuted },
    warn: { fontSize: 12, lineHeight: 17, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
    warnGive: { color: '#f87171', borderColor: '#ef444540', backgroundColor: '#ef444414' },
    warnGet: { color: '#fbbf24', borderColor: '#f59e0b40', backgroundColor: '#f59e0b14' },
  })
