import { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  visible: boolean
  onPick: (emoji: string) => void
  onClose: () => void
}

/**
 * emoji-mart isn't available in React Native, so this is a curated categorised
 * grid that fills the same role as the web EmojiPickerPopover — pick any emoji,
 * not just the 6 quick ones.
 */
const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'Smileys',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
      '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙',
      '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔',
      '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
      '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🥵', '🥶',
      '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁',
      '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥',
      '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱',
      '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '💩', '🤡', '👻',
    ],
  },
  {
    label: 'Gestures',
    emojis: [
      '👍', '👎', '👌', '🤌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈',
      '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝',
      '🙏', '✍️', '💪', '👏', '🙌', '👐', '🤲', '🫶', '❤️', '🧡',
      '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '🔥', '✨', '⭐', '🌟',
      '💯', '💥', '💫', '🎉', '🎊', '🥂', '🍾', '👑', '💎', '🏆',
    ],
  },
  {
    label: 'Animals & Food',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
      '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦄', '🐝', '🦋',
      '🍎', '🍕', '🍔', '🍟', '🌮', '🍿', '🍩', '🍪', '🎂', '🍰',
      '🍫', '🍬', '🍭', '🍺', '🍻', '☕', '🍵', '🧋', '🍹', '🥤',
    ],
  },
]

export function EmojiPickerSheet({ visible, onPick, onClose }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [tab, setTab] = useState(0)
  const category = useMemo(() => EMOJI_CATEGORIES[tab] ?? EMOJI_CATEGORIES[0], [tab])

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Pick an emoji</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <View style={styles.tabs}>
            {EMOJI_CATEGORIES.map((cat, i) => (
              <Pressable
                key={cat.label}
                style={[styles.tab, i === tab && styles.tabActive]}
                onPress={() => setTab(i)}
              >
                <Text style={[styles.tabText, i === tab && styles.tabTextActive]}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={styles.grid} keyboardShouldPersistTaps="handled">
            {category.emojis.map((e, i) => (
              <Pressable key={`${e}-${i}`} style={styles.cell} onPress={() => onPick(e)} hitSlop={2}>
                <Text style={styles.emoji}>{e}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.bgElevated,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: theme.space.md,
      gap: theme.space.sm,
      height: '60%',
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.border, alignSelf: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: theme.text, fontSize: 16, fontWeight: '800' },
    close: { color: theme.primaryMuted, fontSize: 15, fontWeight: '700' },
    tabs: { flexDirection: 'row', gap: 6 },
    tab: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
    },
    tabActive: { backgroundColor: theme.primarySoft, borderColor: theme.primary },
    tabText: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    tabTextActive: { color: theme.primaryMuted },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: theme.space.lg },
    cell: {
      width: '12.5%',
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: { fontSize: 26 },
  })
