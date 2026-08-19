/**
 * DateTimeFieldSheet — tap-to-open date and time pickers for schedule-a-game
 * forms, matching the pattern used on the notifications quiet-hours screen.
 *
 * Each field is a Pressable that opens a bottom-sheet list; the caller supplies
 * a string value (`YYYY-MM-DD` for date, `HH:MM` for time) and gets the same
 * shape back on change. Keeps the raw string contract so existing combineIso
 * helpers keep working without touching form state.
 */

import { useMemo, useRef, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// 60 days out covers "next month" without pretending to be a full calendar.
const DATE_OFFSETS: number[] = Array.from({ length: 60 }, (_, i) => i)
// Half-hour slots — enough resolution for a scheduled game without overwhelming.
const TIME_SLOTS: number[] = Array.from({ length: 48 }, (_, i) => i * 30)

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function dateLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Today'
  if (offsetDays === 1) return 'Tomorrow'
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + offsetDays)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function timeLabel(m: number): string {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

type FieldProps = {
  label: string
  value: string
  placeholder: string
  onChange: (next: string) => void
}

export function DatePickerField({ label, value, placeholder, onChange }: FieldProps) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const listRef = useRef<FlatList<number> | null>(null)

  // Snap to today (or the current value if it matches one of the visible days).
  const initialIndex = useMemo(() => {
    const idx = DATE_OFFSETS.find((o) => isoDate(o) === value)
    return idx ?? 0
  }, [value])

  return (
    <View style={styles.col}>
      <Text style={styles.subLabel}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.input, styles.btn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Currently ${value || placeholder}.`}
      >
        <Text style={[styles.inputText, !value && styles.placeholder]}>{value || placeholder}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={styles.sheet}>
              <View style={styles.grabber} />
              <View style={styles.header}>
                <Text style={styles.title}>{label}</Text>
                <Pressable hitSlop={12} onPress={() => setOpen(false)}>
                  <Text style={styles.close}>Done</Text>
                </Pressable>
              </View>
              <FlatList
                ref={listRef}
                data={DATE_OFFSETS}
                keyExtractor={(o) => String(o)}
                initialScrollIndex={initialIndex}
                getItemLayout={(_, i) => ({ length: 48, offset: 48 * i, index: i })}
                onScrollToIndexFailed={({ index }) => {
                  setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 50)
                }}
                renderItem={({ item }) => {
                  const iso = isoDate(item)
                  const selected = iso === value
                  return (
                    <Pressable
                      onPress={() => {
                        onChange(iso)
                        setOpen(false)
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        selected && { backgroundColor: theme.primarySoft },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.rowText, selected && { color: theme.primary, fontWeight: '800' }]}>
                        {dateLabel(item)}
                      </Text>
                      {selected ? <Text style={styles.check}>✓</Text> : null}
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

export function TimePickerField({ label, value, placeholder, onChange }: FieldProps) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const listRef = useRef<FlatList<number> | null>(null)

  const initialIndex = useMemo(() => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return 0
    const mins = Number(match[1]) * 60 + Number(match[2])
    return Math.min(TIME_SLOTS.length - 1, Math.round(mins / 30))
  }, [value])

  return (
    <View style={styles.col}>
      <Text style={styles.subLabel}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.input, styles.btn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${label}. Currently ${value || placeholder}.`}
      >
        <Text style={[styles.inputText, !value && styles.placeholder]}>{value || placeholder}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={styles.sheet}>
              <View style={styles.grabber} />
              <View style={styles.header}>
                <Text style={styles.title}>{label}</Text>
                <Pressable hitSlop={12} onPress={() => setOpen(false)}>
                  <Text style={styles.close}>Done</Text>
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
                  const label = timeLabel(item)
                  const selected = label === value
                  return (
                    <Pressable
                      onPress={() => {
                        onChange(label)
                        setOpen(false)
                      }}
                      style={({ pressed }) => [
                        styles.row,
                        selected && { backgroundColor: theme.primarySoft },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.rowText, selected && { color: theme.primary, fontWeight: '800' }]}>
                        {label}
                      </Text>
                      {selected ? <Text style={styles.check}>✓</Text> : null}
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    col: { flex: 1, gap: 4 },
    subLabel: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    input: {
      backgroundColor: theme.bg,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      paddingVertical: 10,
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    pressed: { opacity: 0.7 },
    inputText: { color: theme.text, fontSize: 18, fontWeight: '700' },
    placeholder: { color: theme.textFaint, fontWeight: '600' },
    chevron: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderTopWidth: 1,
      borderColor: theme.border,
      maxHeight: '70%',
      paddingBottom: theme.space.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      marginTop: theme.space.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.lg,
      paddingVertical: theme.space.md,
    },
    title: { color: theme.text, fontSize: 18, fontWeight: '800' },
    close: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
    row: {
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.lg,
    },
    rowText: { color: theme.text, fontSize: 18, fontWeight: '600' },
    check: { color: theme.primary, fontSize: 18, fontWeight: '800' },
  })
