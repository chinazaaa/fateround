import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { CalledNumbersBoard } from '@/components/games/bingo/CalledNumbersBoard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  calledNumbers: Set<number>
  lastCalled?: number | null
  /** Whether the board starts expanded (host defaults open, player collapsed). */
  defaultOpen?: boolean
}

/**
 * Collapsible full B-I-N-G-O board of all 75 numbers with called ones
 * highlighted. Mirrors the web collapsible "Called numbers board" available to
 * players and the host (React Native has no <details>, so this is a toggle).
 */
export function CalledNumbersBoardSection({ calledNumbers, lastCalled, defaultOpen = false }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(defaultOpen)

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.header} onPress={() => setOpen((v) => !v)}>
        <Text style={styles.summary}>Called numbers board</Text>
        <Text style={styles.chevron}>{open ? '▾' : '▸'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <CalledNumbersBoard calledNumbers={calledNumbers} lastCalled={lastCalled} />
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.md,
      paddingVertical: 12,
    },
    summary: { color: theme.textMuted, fontSize: 14, fontWeight: '600' },
    chevron: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
    body: { paddingHorizontal: theme.space.md, paddingBottom: theme.space.md },
  })
