import type { GameType } from '@fateround/shared'
import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { GameTypePicker } from '@/components/create/GameTypePicker'
import { gameLabel } from '@/lib/mobile-registry'
import { gameTypeMeta } from '@/lib/game-type-meta'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  options: GameType[]
  value: GameType
  onChange: (type: GameType) => void
}

/**
 * Compact game selector: shows the chosen game as a tappable bar and opens a
 * full-screen picker (search + categories) so the long game list never lives
 * inline in the create form.
 */
export function GameTypePickerField({ options, value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const meta = gameTypeMeta(value)

  const select = (type: GameType) => {
    onChange(type)
    setOpen(false)
  }

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerEmoji}>{meta.emoji}</Text>
        <View style={styles.triggerText}>
          <Text style={styles.triggerLabel}>{gameLabel(value)}</Text>
          <Text style={styles.triggerBlurb} numberOfLines={1}>
            {meta.blurb}
          </Text>
        </View>
        <Text style={styles.triggerAction}>Change</Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Choose a game</Text>
            <Pressable hitSlop={12} onPress={() => setOpen(false)}>
              <Text style={styles.sheetClose}>Done</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.sheetBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <GameTypePicker options={options} value={value} onChange={select} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.md,
    backgroundColor: theme.bgElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.primary,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.md,
  },
  triggerEmoji: { fontSize: 28 },
  triggerText: { flex: 1, gap: 2 },
  triggerLabel: { color: theme.text, fontSize: 17, fontWeight: '800' },
  triggerBlurb: { color: theme.textMuted, fontSize: 13 },
  triggerAction: { color: theme.primaryMuted, fontSize: 14, fontWeight: '700' },
  sheet: { flex: 1, backgroundColor: theme.bg },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sheetTitle: { color: theme.text, fontSize: 20, fontWeight: '800' },
  sheetClose: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
  sheetBody: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: 40,
  },
})
