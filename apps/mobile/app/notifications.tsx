/**
 * Notifications — per-game-type push subscription screen (Phase B).
 *
 * Every row is a game type + a toggle. First time the user turns ON any row
 * we request the device's push permission and register the token — subsequent
 * toggles just insert/delete a subscription row for (device, game_type).
 *
 * The quiet-hours block at the top has two modes:
 *   - Quiet     "Don't ping me between START and END."
 *   - Available "Only ping me between START and END."
 * Pushes outside the allowed window are DROPPED server-side, never queued.
 *
 * No new native modules — tapping a From/To field opens a bottom-sheet list of
 * 30-minute slots (a full date-time picker was scope creep for a two-value
 * time window).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Stack } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { GameType } from '@fateround/shared'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { ListRow } from '@/components/ui/ListRow'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { SegmentedControl } from '@/components/create/SegmentedControl'
import { MOBILE_SUPPORTED_GAMES } from '@/components/games/GameRouter'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import { getExpoPushToken, requestPushPermission } from '@/lib/push-notifications'
import {
  fetchNotifications,
  patchQuietHours,
  subscribeGameType,
  unsubscribeGameType,
  type NotificationsSnapshot,
  type QuietHoursState,
} from '@/lib/notifications-api'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

// Sorted A-Z for a "settings screen" feel; game-type meta drives the emoji.
const GAME_TYPES = [...MOBILE_SUPPORTED_GAMES].sort((a, b) => gameLabel(a).localeCompare(gameLabel(b)))

function formatMinutes(m: number | null): string {
  if (m == null) return ''
  const hh = String(Math.floor(m / 60)).padStart(2, '0')
  const mm = String(m % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

// 30-minute increments cover the "quiet hours" use case without a native picker.
const TIME_SLOTS: number[] = Array.from({ length: 48 }, (_, i) => i * 30)

function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

export default function NotificationsScreen() {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [tokenKey, setTokenKey] = useState<string | null>(null)
  const [permissionState, setPermissionState] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [snapshot, setSnapshot] = useState<NotificationsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingType, setPendingType] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async (token: string | null) => {
    if (!token) {
      setSnapshot({
        subscribedGameTypes: [],
        quietHours: { mode: 'off', startMinutes: null, endMinutes: null, timezone: null },
        countsByGameType: {},
      })
      setLoading(false)
      return
    }
    try {
      setSnapshot(await fetchNotifications(token))
    } finally {
      setLoading(false)
    }
  }, [])

  // On mount: try to read an already-granted push token without prompting. If
  // the user has never allowed pushes, we defer the prompt to the first ON tap.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const token = await getExpoPushToken()
      if (cancelled) return
      setTokenKey(token)
      setPermissionState(token ? 'granted' : 'unknown')
      await load(token)
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const subscribed = useMemo(() => new Set(snapshot?.subscribedGameTypes ?? []), [snapshot])
  const counts = snapshot?.countsByGameType ?? {}
  const quiet = snapshot?.quietHours ?? { mode: 'off', startMinutes: null, endMinutes: null, timezone: null }

  const ensureToken = useCallback(async (): Promise<string | null> => {
    if (tokenKey) return tokenKey
    const permitted = await requestPushPermission()
    if (!permitted) {
      setPermissionState('denied')
      Alert.alert(
        'Notifications off',
        'Turn notifications on in Settings to let FateRound ping you when new public games open.'
      )
      return null
    }
    const token = await getExpoPushToken()
    if (!token) return null
    setTokenKey(token)
    setPermissionState('granted')
    return token
  }, [tokenKey])

  const onToggleGame = useCallback(
    async (gameType: string, next: boolean) => {
      setPendingType(gameType)
      try {
        const token = await ensureToken()
        if (!token) return
        if (next) {
          await subscribeGameType(token, gameType, deviceTimezone())
          setSnapshot((s) => (s ? { ...s, subscribedGameTypes: [...s.subscribedGameTypes, gameType] } : s))
        } else {
          await unsubscribeGameType(token, gameType)
          setSnapshot((s) =>
            s ? { ...s, subscribedGameTypes: s.subscribedGameTypes.filter((t) => t !== gameType) } : s
          )
        }
      } catch (err) {
        Alert.alert('Could not update', err instanceof Error ? err.message : 'Try again in a moment.')
      } finally {
        setPendingType(null)
      }
    },
    [ensureToken]
  )

  const onQuietChange = useCallback(
    async (patch: Partial<QuietHoursState>) => {
      if (!tokenKey) return
      const next = { ...quiet, ...patch }
      setSnapshot((s) => (s ? { ...s, quietHours: next } : s))
      try {
        await patchQuietHours(tokenKey, { ...patch, timezone: deviceTimezone() })
      } catch {
        // Non-blocking — the UI already reflects the intended state.
      }
    },
    [quiet, tokenKey]
  )

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: 'Notifications' }} />
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Notifications' }} />
      <AmbientBackground />
      <KeyboardFormScreen contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.kicker}>🔔 Get pinged</Text>
          <Text style={styles.title}>When your favourite games open</Text>
          <Text style={styles.blurb}>
            Pick the games you want a heads-up about. We only ping you when someone opens a new Public game.
          </Text>
        </View>

        {permissionState === 'denied' ? (
          <SurfaceCard>
            <Text style={styles.warn}>
              Notifications are turned off for FateRound. Open your phone’s Settings → Notifications → FateRound to turn
              them on.
            </Text>
          </SurfaceCard>
        ) : null}

        <SurfaceCard>
          <Text style={styles.sectionTitle}>Quiet hours</Text>
          <SegmentedControl
            value={quiet.mode}
            onChange={(mode) => void onQuietChange({ mode: mode as QuietHoursState['mode'] })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'quiet', label: 'Quiet' },
              { value: 'available', label: 'Available' },
            ]}
          />
          {quiet.mode !== 'off' ? (
            <View style={styles.timeRow}>
              <TimePickerField
                label="From"
                value={quiet.startMinutes}
                placeholder="09:00"
                onChange={(m) => void onQuietChange({ startMinutes: m })}
              />
              <TimePickerField
                label="To"
                value={quiet.endMinutes}
                placeholder="17:00"
                onChange={(m) => void onQuietChange({ endMinutes: m })}
              />
            </View>
          ) : null}
          <Text style={styles.hint}>
            {quiet.mode === 'quiet'
              ? 'Pushes during this window are dropped, not queued — a game happening at 2pm is already over by 6pm.'
              : quiet.mode === 'available'
                ? 'Only pushes inside this window are delivered.'
                : 'All pings delivered whenever they fire.'}
          </Text>
        </SurfaceCard>

        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search games…"
          placeholderTextColor={theme.textFaint}
          autoCorrect={false}
          returnKeyType="search"
        />

        <FilteredGameList
          search={search}
          subscribed={subscribed}
          counts={counts}
          pendingType={pendingType}
          onToggleGame={onToggleGame}
        />
      </KeyboardFormScreen>
    </SafeAreaView>
  )
}

function TimePickerField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: number | null
  placeholder: string
  onChange: (minutes: number) => void
}) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const listRef = useRef<FlatList<number> | null>(null)

  // When the sheet opens, snap the list to the current (or a sensible default)
  // slot so the user isn't hunting for their own value.
  const initialIndex = useMemo(() => {
    if (value == null) return 0
    // Nearest 30-min slot.
    return Math.min(TIME_SLOTS.length - 1, Math.round(value / 30))
  }, [value])

  const display = value == null ? '' : formatMinutes(value)

  return (
    <View style={styles.timeCol}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.timeInput, styles.timePickerBtn, pressed && styles.timePickerPressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label} time. Currently ${display || placeholder}.`}
      >
        <Text style={[styles.timeInputText, !display && styles.timeInputPlaceholder]}>
          {display || placeholder}
        </Text>
        <Text style={styles.timeChevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.pickerSheetWrap} onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={styles.pickerSheet}>
              <View style={styles.pickerGrabber} />
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{label}</Text>
                <Pressable hitSlop={12} onPress={() => setOpen(false)}>
                  <Text style={styles.pickerClose}>Done</Text>
                </Pressable>
              </View>
              <FlatList
                ref={listRef}
                data={TIME_SLOTS}
                keyExtractor={(m) => String(m)}
                initialScrollIndex={initialIndex}
                getItemLayout={(_, i) => ({ length: 48, offset: 48 * i, index: i })}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 50)
                }}
                renderItem={({ item }) => {
                  const selected = value != null && Math.round(value / 30) * 30 === item
                  return (
                    <Pressable
                      onPress={() => {
                        onChange(item)
                        setOpen(false)
                      }}
                      style={({ pressed }) => [
                        styles.pickerRow,
                        selected && styles.pickerRowSelected,
                        pressed && styles.pickerRowPressed,
                      ]}
                    >
                      <Text style={[styles.pickerRowText, selected && styles.pickerRowTextSelected]}>
                        {formatMinutes(item)}
                      </Text>
                      {selected ? <Text style={styles.pickerCheck}>✓</Text> : null}
                    </Pressable>
                  )
                }}
              />
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

function FilteredGameList({
  search,
  subscribed,
  counts,
  pendingType,
  onToggleGame,
}: {
  search: string
  subscribed: Set<string>
  counts: Record<string, number>
  pendingType: string | null
  onToggleGame: (gameType: string, next: boolean) => void
}) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const q = search.trim().toLowerCase()
  const filtered = q ? GAME_TYPES.filter((gt) => gameLabel(gt).toLowerCase().includes(q)) : GAME_TYPES
  if (filtered.length === 0) {
    return (
      <SurfaceCard>
        <Text style={styles.hint}>No games match “{search}”.</Text>
      </SurfaceCard>
    )
  }
  return (
    <SurfaceCard padding={0} gap={0}>
      {filtered.map((gameType, i) => {
        const meta = gameTypeMeta(gameType as GameType)
        const isOn = subscribed.has(gameType)
        const count = counts[gameType] ?? 0
        return (
          <ListRow
            key={gameType}
            divider={i < filtered.length - 1}
            left={
              <View style={styles.emojiBadge}>
                <Text style={styles.emojiText}>{meta.emoji}</Text>
              </View>
            }
            title={gameLabel(gameType as GameType)}
            subtitle={count > 0 ? `${count} game${count === 1 ? '' : 's'} today` : 'No games today'}
            right={
              pendingType === gameType ? (
                <ActivityIndicator color={theme.primary} />
              ) : (
                <Switch
                  value={isOn}
                  onValueChange={(next) => void onToggleGame(gameType, next)}
                  trackColor={{ false: theme.border, true: theme.primary }}
                />
              )
            }
          />
        )
      })}
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bg },
    scroll: { padding: theme.space.md, gap: theme.space.md, paddingBottom: theme.space.xl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    hero: { alignItems: 'center', paddingVertical: theme.space.sm, gap: 4 },
    kicker: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    title: { color: theme.text, fontSize: theme.type.title.size, fontWeight: '800', textAlign: 'center' },
    blurb: {
      color: theme.textMuted,
      fontSize: theme.type.body.size,
      textAlign: 'center',
      maxWidth: 320,
      marginTop: 4,
    },
    warn: { color: theme.textMuted, fontSize: theme.type.body.size },
    sectionTitle: { color: theme.text, fontSize: theme.type.section.size, fontWeight: '800' },
    hint: { color: theme.textMuted, fontSize: 13 },
    timeRow: { flexDirection: 'row', gap: theme.space.md },
    timeCol: { flex: 1, gap: 4 },
    timeLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    timeInput: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 2,
      textAlign: 'center',
      paddingVertical: 10,
    },
    timePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    timePickerPressed: { opacity: 0.7 },
    timeInputText: {
      color: theme.text,
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: 2,
    },
    timeInputPlaceholder: { color: theme.textFaint, fontWeight: '600' },
    timeChevron: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
    pickerBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    pickerSheetWrap: { width: '100%' },
    pickerSheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderTopWidth: 1,
      borderColor: theme.border,
      maxHeight: '70%',
      paddingBottom: theme.space.sm,
    },
    pickerGrabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginTop: theme.space.sm,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.lg,
      paddingVertical: theme.space.md,
    },
    pickerTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
    pickerClose: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
    pickerRow: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.lg,
    },
    pickerRowSelected: { backgroundColor: theme.primarySoft },
    pickerRowPressed: { opacity: 0.6 },
    pickerRowText: { color: theme.text, fontSize: 18, fontWeight: '600', letterSpacing: 1 },
    pickerRowTextSelected: { color: theme.primary, fontWeight: '800' },
    pickerCheck: { color: theme.primary, fontSize: 18, fontWeight: '800' },
    searchInput: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 16,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    emptySearch: { color: theme.textMuted, fontSize: theme.type.body.size, padding: theme.space.md },
    emojiBadge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: theme.primarySoft,
      borderWidth: 1,
      borderColor: theme.borderAccent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emojiText: { fontSize: 22 },
  })
