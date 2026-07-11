// "All players" list for the Monopoly board — mobile port of web's
// MonopolyPlayerList (src/components/monopoly/MonopolyBoard.tsx). Each row is a
// token-emoji avatar in a colour circle, the player's name + "(you)", turn /
// jail / out pills, a "N properties · Space X" subline, and the player's cash
// on the right in the theme primary colour. Sorted by player_order; the current
// turn and "me" get highlighted borders; bankrupt rows are dimmed.
import { StyleSheet, Text, View } from 'react-native'
import type { MonopolyPlayerState, Player } from '@fateround/shared'
import { monopolyTokenEmoji } from '@fateround/shared/monopoly-tokens'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { formatThemedMoney } from './monopoly-theme'
import { parsePropertyOwners, playerProperties } from './manage-logic'
import { TOKEN_COLORS } from './MonopolyBoardView'

export function MonopolyPlayerList({
  states,
  players,
  currentPlayerId,
  propertyOwners,
  myPlayerId,
  themeId,
}: {
  states: MonopolyPlayerState[]
  players: Player[]
  currentPlayerId?: string | null
  propertyOwners: unknown
  myPlayerId?: string | null
  themeId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const owners = parsePropertyOwners(propertyOwners)

  return (
    <View style={styles.list}>
      {states
        .slice()
        .sort((a, b) => a.player_order - b.player_order)
        .map((state) => {
          const player = players.find((p) => p.id === state.player_id)
          const name = player?.name ?? 'Player'
          const propCount = playerProperties(owners, state.player_id).length
          const isTurn = state.player_id === currentPlayerId
          const isMe = state.player_id === myPlayerId
          const tokenColor = TOKEN_COLORS[state.player_order % TOKEN_COLORS.length]

          return (
            <View
              key={state.player_id}
              style={[
                styles.row,
                isMe ? styles.rowMe : isTurn ? styles.rowTurn : null,
                state.bankrupt && styles.rowBankrupt,
              ]}
            >
              <View style={[styles.avatar, { backgroundColor: tokenColor, borderColor: tokenColor }]}>
                <Text style={styles.avatarEmoji}>
                  {monopolyTokenEmoji(player?.monopoly_token, state.player_order)}
                </Text>
              </View>

              <View style={styles.body}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {name}
                    {isMe ? <Text style={styles.youTag}> (you)</Text> : null}
                  </Text>
                  {isTurn ? (
                    <View style={[styles.pill, styles.pillTurn]}>
                      <Text style={[styles.pillText, styles.pillTurnText]}>Turn</Text>
                    </View>
                  ) : null}
                  {state.in_jail ? (
                    <View style={[styles.pill, styles.pillJail]}>
                      <Text style={[styles.pillText, styles.pillJailText]}>Jail</Text>
                    </View>
                  ) : null}
                  {state.bankrupt ? (
                    <View style={[styles.pill, styles.pillOut]}>
                      <Text style={[styles.pillText, styles.pillOutText]}>Out</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {propCount} propert{propCount === 1 ? 'y' : 'ies'} · Space {state.position}
                </Text>
              </View>

              <View style={styles.cashCol}>
                <Text style={styles.cashLabel}>CASH</Text>
                <Text style={styles.cash}>{formatThemedMoney(state.cash, themeId)}</Text>
              </View>
            </View>
          )
        })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    list: { gap: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    rowMe: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    rowTurn: { borderColor: theme.borderAccent, backgroundColor: theme.surface },
    rowBankrupt: { opacity: 0.4 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarEmoji: { fontSize: 20, lineHeight: 24 },
    body: { flex: 1, minWidth: 0, gap: 2 },
    nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    name: { color: theme.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
    youTag: { color: theme.primaryMuted, fontSize: 12, fontWeight: '400' },
    pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    pillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
    pillTurn: { backgroundColor: theme.primarySoft },
    pillTurnText: { color: theme.primaryMuted },
    pillJail: { backgroundColor: '#f59e0b33' },
    pillJailText: { color: '#f59e0b' },
    pillOut: { backgroundColor: '#ef444433' },
    pillOutText: { color: '#ef4444' },
    sub: { color: theme.textFaint, fontSize: 12 },
    cashCol: { alignItems: 'flex-end' },
    cashLabel: {
      color: theme.textFaint,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    cash: { color: theme.primary, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  })
