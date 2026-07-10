import { StyleSheet, Text, View } from 'react-native'
import type { MahjongPlayerState, Player } from '@fateround/shared'
import { MAHJONG_SEAT_LABELS, playerName } from '@fateround/shared/mahjong'
import { MahjongTileFace } from './MahjongTileFace'

export function MahjongTableView({
  states,
  players,
  turnPlayerId,
  myPlayerId,
  lastDiscardTile,
  lastDiscardPlayerId,
}: {
  states: MahjongPlayerState[]
  players: Player[]
  turnPlayerId: string | null
  myPlayerId?: string | null
  lastDiscardTile?: string | null
  lastDiscardPlayerId?: string | null
}) {
  const bySeat = (seat: string) => states.find((s) => s.seat === seat)

  const seatPanel = (seat: 'east' | 'south' | 'west' | 'north', align: 'top' | 'bottom' | 'left' | 'right') => {
    const state = bySeat(seat)
    if (!state) return null
    const isTurn = state.player_id === turnPlayerId
    const isMe = state.player_id === myPlayerId
    const count = state.hand_count ?? state.hand?.length ?? 0

    return (
      <View
        style={[
          styles.seat,
          align === 'top' && styles.seatTop,
          align === 'bottom' && styles.seatBottom,
          align === 'left' && styles.seatLeft,
          align === 'right' && styles.seatRight,
          isTurn && styles.seatActive,
        ]}
      >
        <Text style={styles.seatLabel}>{MAHJONG_SEAT_LABELS[seat]}</Text>
        <Text style={styles.seatName} numberOfLines={1}>
          {playerName(players, state.player_id)}
          {isMe ? ' · you' : ''}
        </Text>
        <Text style={styles.seatMeta}>
          {count} tiles{state.riichi_declared ? ' · Riichi' : ''}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.table}>
      {seatPanel('north', 'top')}
      <View style={styles.middleRow}>
        {seatPanel('west', 'left')}
        <View style={styles.pond}>
          <Text style={styles.pondLabel}>Discard</Text>
          {lastDiscardTile ? (
            <>
              <MahjongTileFace tile={lastDiscardTile} compact />
              <Text style={styles.pondBy}>
                {playerName(players, lastDiscardPlayerId ?? null)}
              </Text>
            </>
          ) : (
            <Text style={styles.pondEmpty}>—</Text>
          )}
        </View>
        {seatPanel('east', 'right')}
      </View>
      {seatPanel('south', 'bottom')}
    </View>
  )
}

const styles = StyleSheet.create({
  table: { gap: 8, marginVertical: 8 },
  middleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  seat: {
    backgroundColor: '#17171d',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2a2a35',
    minWidth: 88,
  },
  seatTop: { alignSelf: 'center', maxWidth: 200 },
  seatBottom: { alignSelf: 'center', maxWidth: 200 },
  seatLeft: { flex: 1, maxWidth: 110 },
  seatRight: { flex: 1, maxWidth: 110 },
  seatActive: { borderColor: '#f43f5e' },
  seatLabel: { color: '#fda4af', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  seatName: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 2 },
  seatMeta: { color: '#9ca3af', fontSize: 11, marginTop: 2 },
  pond: {
    flex: 1,
    minHeight: 100,
    backgroundColor: '#14532d',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#166534',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
  },
  pondLabel: { color: '#86efac', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  pondBy: { color: '#d1d5db', fontSize: 11 },
  pondEmpty: { color: '#6b7280', fontSize: 20 },
})
