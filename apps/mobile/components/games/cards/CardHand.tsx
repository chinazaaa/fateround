import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type HandLayout = 'stack' | 'separate'
const HAND_LAYOUT_KEY = 'fr-hand-layout'
// Card faces are 56px wide — a −32 gap leaves ~24px of each card showing in
// stack mode (enough to read the corner rank/shape), while later cards paint on
// top so the rightmost is fully visible.
const STACK_OVERLAP = -32
const SEPARATE_GAP = 8

/**
 * The player's own hand with a personal Stack / Separate layout toggle (parity
 * with the web card table). Stack overlaps the cards compactly so a big hand
 * fits; Separate spreads each card fully and scrolls. The choice is persisted
 * (SecureStore, mirroring web's `fr-hand-layout`) — a view preference, not game
 * state. Pass the card Pressables as children; renders its own "Your hand (N)"
 * header, so callers should drop their separate hand label.
 */
export function CardHand({
  count,
  many,
  hint,
  children,
}: {
  count: number
  /** Big hand → default to Stack so it fits without a long scroll. */
  many?: boolean
  hint?: ReactNode
  children: ReactNode
}) {
  const styles = useThemedStyles(makeStyles)
  const [layout, setLayout] = useState<HandLayout>(many ? 'stack' : 'separate')

  // A stored choice overrides the per-hand default. Loaded once on mount.
  useEffect(() => {
    void SecureStore.getItemAsync(HAND_LAYOUT_KEY)
      .then((v) => {
        if (v === 'stack' || v === 'separate') setLayout(v)
      })
      .catch(() => {})
  }, [])

  const choose = (next: HandLayout) => {
    setLayout(next)
    void SecureStore.setItemAsync(HAND_LAYOUT_KEY, next).catch(() => {})
  }

  const cards = Children.toArray(children).filter(isValidElement)

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Your hand ({count})</Text>
        <View style={styles.toggle} accessibilityRole="tablist">
          {(['stack', 'separate'] as HandLayout[]).map((opt) => {
            const on = layout === opt
            return (
              <Pressable
                key={opt}
                style={[styles.toggleBtn, on && styles.toggleBtnOn]}
                onPress={() => choose(opt)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.toggleText, on && styles.toggleTextOn]}>
                  {opt === 'stack' ? 'Stack' : 'Separate'}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {cards.map((child, i) => (
          <View
            key={child.key ?? i}
            style={{ marginLeft: i === 0 ? 0 : layout === 'stack' ? STACK_OVERLAP : SEPARATE_GAP }}
          >
            {child}
          </View>
        ))}
      </ScrollView>
      {hint != null ? hint : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { alignSelf: 'stretch', gap: 6 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
    title: { color: theme.textMuted, fontSize: 13, fontWeight: '700' },
    toggle: {
      flexDirection: 'row',
      backgroundColor: theme.surface,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 2,
      gap: 2,
    },
    toggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.sm - 2 },
    toggleBtnOn: { backgroundColor: theme.primary },
    toggleText: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    toggleTextOn: { color: '#fff' },
    rail: { paddingVertical: 8, paddingRight: 8 },
  })
