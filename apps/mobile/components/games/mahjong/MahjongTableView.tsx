import { StyleSheet, Text, View } from 'react-native'
import type { MahjongPlayerState, MahjongSession, Player } from '@fateround/shared'
import { MAHJONG_SEAT_LABELS, playerName } from '@fateround/shared/mahjong'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { MahjongTileFace } from './MahjongTileFace'

/** Small 28-cell wall preview: filled cells ≈ tiles remaining / 3 (mirrors web WallPreview). */
function WallPreview({ remaining }: { remaining: number }) {
  const styles = useThemedStyles(makeStyles)
  const visible = Math.max(0, Math.min(28, Math.ceil(remaining / 3)))
  return (
    <View style={styles.wallGrid}>
      {Array.from({ length: 28 }, (_, index) => (
        <View key={index} style={[styles.wallCell, index < visible ? styles.wallCellOn : styles.wallCellOff]} />
      ))}
    </View>
  )
}

function MeldStrip({ melds }: { melds: MahjongPlayerState['melds'] }) {
  const styles = useThemedStyles(makeStyles)
  if (!melds.length) return null
  return (
    <View style={styles.subGroup}>
      <Text style={styles.subLabel}>Melds</Text>
      <View style={styles.miniWrap}>
        {melds.map((meld, index) => (
          <View key={`${meld.type}-${index}`} style={styles.meldChip}>
            <Text style={styles.meldChipLabel}>{meld.type}</Text>
            <View style={styles.miniRow}>
              {meld.tiles.map((tile, tileIndex) => (
                <MahjongTileFace key={`${tile}-${tileIndex}`} tile={tile} compact />
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function TileGroup({ label, tiles, limit }: { label: string; tiles: string[]; limit?: number }) {
  const styles = useThemedStyles(makeStyles)
  if (!tiles.length) return null
  const shown = limit ? tiles.slice(-limit) : tiles
  return (
    <View style={styles.subGroup}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.miniRow}>
        {shown.map((tile, index) => (
          <MahjongTileFace key={`${tile}-${index}`} tile={tile} compact />
        ))}
      </View>
    </View>
  )
}

export function MahjongTableView({
  session,
  states,
  players,
  turnPlayerId,
  myPlayerId,
}: {
  session: MahjongSession
  states: MahjongPlayerState[]
  players: Player[]
  turnPlayerId: string | null
  myPlayerId?: string | null
}) {
  const styles = useThemedStyles(makeStyles)
  const bySeat = (seat: string) => states.find((s) => s.seat === seat)
  const lastDiscardTile = session.last_discard?.tile ?? null
  const lastDiscardPlayerId = session.last_discard?.player_id ?? null
  const deadWallCount = session.dead_wall?.length ?? 0
  const doraIndicators = session.dora_indicators ?? []

  const seatPanel = (seat: 'east' | 'south' | 'west' | 'north', align: 'top' | 'bottom' | 'left' | 'right') => {
    const state = bySeat(seat)
    if (!state) return null
    const isTurn = state.player_id === turnPlayerId
    const isMe = state.player_id === myPlayerId
    const count = state.hand_count ?? state.hand?.length ?? 0
    const furiten = !!state.permanent_furiten || !!state.temporary_furiten
    const score = session.scores?.[state.player_id]

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
        <View style={styles.seatHeader}>
          <Text style={styles.seatLabel}>{MAHJONG_SEAT_LABELS[seat]}</Text>
          <Text style={styles.seatCount}>{score != null ? `${score} pts` : `${count} tiles`}</Text>
        </View>
        {score != null ? <Text style={styles.seatSubCount}>{count} tiles</Text> : null}
        <Text style={styles.seatName} numberOfLines={1}>
          {playerName(players, state.player_id)}
          {isMe ? ' · you' : ''}
        </Text>
        {state.riichi_declared || furiten ? (
          <View style={styles.flagRow}>
            {state.riichi_declared ? (
              <View style={styles.riichiFlag}>
                <Text style={styles.riichiFlagText}>Riichi</Text>
              </View>
            ) : null}
            {furiten ? (
              <View style={styles.furitenFlag}>
                <Text style={styles.furitenFlagText}>Furiten</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <MeldStrip melds={state.melds} />
        <TileGroup label="Flowers" tiles={state.flowers ?? []} />
        <TileGroup label="River" tiles={state.discarded} limit={14} />
      </View>
    )
  }

  return (
    <View style={styles.table}>
      {seatPanel('north', 'top')}
      <View style={styles.middleRow}>
        {seatPanel('west', 'left')}
        <View style={styles.center}>
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Wall</Text>
            <Text style={styles.wallCount}>{session.wall.length}</Text>
            {deadWallCount > 0 ? <Text style={styles.deadWall}>Dead wall {deadWallCount}</Text> : null}
            <WallPreview remaining={session.wall.length} />
          </View>

          {doraIndicators.length > 0 ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoLabel}>Dora</Text>
              <View style={styles.miniRow}>
                {doraIndicators.map((tile, index) => (
                  <MahjongTileFace key={`${tile}-${index}`} tile={tile} compact />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.pond}>
            <Text style={styles.pondLabel}>Discard</Text>
            {lastDiscardTile ? (
              <>
                <MahjongTileFace tile={lastDiscardTile} compact />
                <Text style={styles.pondBy}>{playerName(players, lastDiscardPlayerId)}</Text>
              </>
            ) : (
              <Text style={styles.pondEmpty}>—</Text>
            )}
          </View>
        </View>
        {seatPanel('east', 'right')}
      </View>
      {seatPanel('south', 'bottom')}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    table: { gap: 8, marginVertical: 8 },
    middleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    seat: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 8,
      borderWidth: 1,
      borderColor: theme.border,
      minWidth: 96,
      gap: 4,
    },
    seatTop: { alignSelf: 'stretch' },
    seatBottom: { alignSelf: 'stretch' },
    seatLeft: { flex: 1, maxWidth: 118 },
    seatRight: { flex: 1, maxWidth: 118 },
    seatActive: { borderColor: theme.primary },
    seatHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
    seatLabel: { color: theme.primaryMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    seatCount: { color: theme.textMuted, fontSize: 11 },
    seatSubCount: { color: theme.textFaint, fontSize: 10 },
    seatName: { color: theme.text, fontSize: 13, fontWeight: '700' },
    flagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    riichiFlag: { backgroundColor: theme.primarySoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    riichiFlagText: { color: theme.primaryMuted, fontSize: 10, fontWeight: '800' },
    // Furiten warning — red carries meaning, kept fixed across schemes.
    furitenFlag: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    furitenFlagText: { color: '#ef4444', fontSize: 10, fontWeight: '800' },
    subGroup: { gap: 3 },
    subLabel: { color: theme.textFaint, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    miniWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    miniRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    meldChip: { backgroundColor: theme.bgElevated, borderRadius: 8, padding: 4, gap: 2 },
    meldChipLabel: { color: theme.textFaint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },
    center: { flex: 1, gap: 8 },
    infoCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 8,
      gap: 4,
      alignItems: 'center',
    },
    infoLabel: { color: theme.primaryMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    wallCount: { color: theme.text, fontSize: 26, fontWeight: '900' },
    deadWall: { color: theme.textFaint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    wallGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'center', maxWidth: 140 },
    wallCell: { width: 14, height: 8, borderRadius: 2, borderWidth: 1 },
    wallCellOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    wallCellOff: { borderColor: theme.border, backgroundColor: theme.bgElevated, opacity: 0.5 },
    pond: {
      minHeight: 96,
      // Green felt table — functional, fixed in both schemes.
      backgroundColor: '#14532d',
      borderRadius: 12,
      borderWidth: 2,
      borderColor: '#166534',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      padding: 8,
    },
    // pondLabel/pondBy/pondEmpty sit on the fixed green felt — kept light-on-felt.
    pondLabel: { color: '#86efac', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    pondBy: { color: '#d1d5db', fontSize: 11 },
    pondEmpty: { color: '#6b7280', fontSize: 20 },
  })
