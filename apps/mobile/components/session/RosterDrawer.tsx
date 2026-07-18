import { useEffect, useRef, useState } from 'react'
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRosterDrawer, type RosterRow } from '@/components/session/RosterDrawerContext'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Right-side slide-in drawer holding the unified roster (seat · name · score ·
 * status). Lives in a Modal so it paints above the shell body (incl. the
 * floating VoiceRail), gets Android back for free via onRequestClose, and — not
 * being a descendant of the page ScrollView — its list owns the vertical drag
 * without the nested-scroll trap that LeaderboardPanel warns about.
 */
export function RosterDrawer() {
  const ctx = useRosterDrawer()
  const styles = useThemedStyles(makeStyles)
  const { width } = useWindowDimensions()
  // Read insets from the OUTER provider (this component renders in the shell,
  // inside SafeAreaProvider) and apply them manually. A SafeAreaView *inside* the
  // Modal measures 0 on the first open — the Modal is a separate iOS view tree —
  // so the header would tuck under the notch until reopened.
  const insets = useSafeAreaInsets()
  const drawerWidth = Math.min(380, width * 0.85)

  const open = !!ctx?.open
  // Stay mounted through the exit animation, then unmount.
  const [mounted, setMounted] = useState(open)
  const x = useRef(new Animated.Value(drawerWidth)).current
  const fade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (open) {
      setMounted(true)
      Animated.parallel([
        Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start()
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(x, { toValue: drawerWidth, duration: 180, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false)
      })
    }
  }, [open, mounted, drawerWidth, x, fade])

  if (!ctx || !mounted) return null
  const close = () => ctx.setOpen(false)
  const watching = ctx.rows.length - ctx.participantCount
  const headerLabel =
    watching > 0 ? `${ctx.participantCount} playing · ${watching} watching` : `Players · ${ctx.participantCount}`

  return (
    <Modal visible transparent animationType="none" onRequestClose={close}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdropFill, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close players" />
        </Animated.View>
        <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX: x }] }]}>
          <View
            style={[styles.safe, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingRight: insets.right }]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>{headerLabel}</Text>
              <Pressable hitSlop={12} onPress={close} accessibilityRole="button" accessibilityLabel="Close">
                <Text style={styles.close}>✕</Text>
              </Pressable>
            </View>
            <FlatList
              data={ctx.rows}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <RosterRowView
                  row={item}
                  styles={styles}
                  // Host's own client knows its host player id (manage config); other
                  // clients rely on `row.host` (from game.host_player_id). Either marks HOST.
                  isHost={item.host || (!!ctx.manage?.hostPlayerId && item.id === ctx.manage.hostPlayerId)}
                  onRemove={
                    ctx.manage && !item.isMe && item.id !== ctx.manage.hostPlayerId
                      ? () => ctx.manage?.onRemove(item)
                      : undefined
                  }
                />
              )}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

/** 1 = 🥇 Winner, 2 = 🥈 Runner-up, 3 = 🥉 3rd, else Nth. Null for unplaced. */
function placementLabel(place: number | undefined): string | null {
  if (place == null) return null
  if (place === 1) return '🥇 Winner'
  if (place === 2) return '🥈 Runner-up'
  if (place === 3) return '🥉 3rd'
  return `${place}th`
}

function RosterRowView({
  row,
  styles,
  isHost = false,
  onRemove,
}: {
  row: RosterRow
  styles: ReturnType<typeof makeStyles>
  isHost?: boolean
  onRemove?: () => void
}) {
  const scoreText =
    row.score === null || row.score === undefined
      ? null
      : typeof row.score === 'number'
        ? `${row.score}${row.scoreSuffix ?? ''}`
        : row.score
  const statusText = row.eliminated ? 'Out' : row.viewer ? 'Watching' : (row.status ?? null)
  const placeLabel = placementLabel(row.placement)

  return (
    <View style={[styles.row, row.isMe && styles.rowMe]}>
      <Text style={styles.seat}>{row.seat}</Text>
      <View style={styles.nameCol}>
        <View style={styles.nameLine}>
          <Text style={styles.name} numberOfLines={1}>
            {row.name}
            {row.isMe ? <Text style={styles.youTag}> · you</Text> : null}
          </Text>
          {isHost ? (
            <View style={styles.hostPill}>
              <Text style={styles.hostPillText}>HOST</Text>
            </View>
          ) : null}
          {placeLabel ? (
            <View style={[styles.placePill, row.placement === 1 && styles.placePillWinner]}>
              <Text style={[styles.placePillText, row.placement === 1 && styles.placePillTextWinner]}>
                {placeLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
      </View>
      {scoreText != null ? (
        <Text style={styles.score} numberOfLines={1}>
          {scoreText}
        </Text>
      ) : null}
      {onRemove ? (
        <Pressable hitSlop={8} onPress={onRemove} accessibilityRole="button" accessibilityLabel={`Remove ${row.name}`}>
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
    backdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
    drawer: {
      backgroundColor: t.bg,
      borderLeftWidth: 1,
      borderLeftColor: t.border,
    },
    safe: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.space.lg,
      paddingVertical: t.space.md,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    title: {
      color: t.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    close: { color: t.textMuted, fontSize: 18, fontWeight: '700' },
    listContent: { paddingHorizontal: t.space.md, paddingVertical: t.space.sm },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.space.sm,
      paddingVertical: 10,
      paddingHorizontal: t.space.sm,
      borderRadius: t.radius.md,
    },
    rowMe: { backgroundColor: t.primarySoft },
    seat: { color: t.textFaint, fontWeight: '700', width: 22, fontSize: 13, textAlign: 'center' },
    nameCol: { flex: 1, gap: 3 },
    nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { color: t.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    youTag: { color: t.textFaint, fontSize: 12, fontWeight: '700' },
    hostPill: {
      backgroundColor: t.primarySoft,
      borderRadius: t.radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 2,
      flexShrink: 0,
    },
    hostPillText: {
      color: t.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    placePill: {
      backgroundColor: t.surfaceHover,
      borderRadius: t.radius.pill,
      paddingHorizontal: 8,
      paddingVertical: 2,
      flexShrink: 0,
    },
    placePillWinner: { backgroundColor: t.primarySoft },
    placePillText: { color: t.textSecondary, fontSize: 11, fontWeight: '800' },
    placePillTextWinner: { color: t.primary },
    status: { color: t.textFaint, fontSize: 11, fontWeight: '600' },
    score: { color: t.primaryMuted, fontWeight: '700', fontSize: 14, flexShrink: 0 },
    remove: { color: t.error, fontSize: 13, fontWeight: '700', flexShrink: 0 },
  })
