import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Game } from '@fateround/shared'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { GameInfoChips, gameInfoItems } from '@/components/GameInfoChips'

/**
 * Header pill that opens a bottom sheet showing the game's "Rules in play" chip summary,
 * so a player or host can recall the house rules the host picked (bank loans, UNO no-mercy,
 * forced auctions, Wordle category, …) without leaving the live game.
 *
 * Renders nothing when the game has no rule chips to show — a chess or tic-tac-toe header
 * stays lean rather than showing a bare "Rules" pill that opens an empty sheet.
 *
 * Mirrors the "Rules in play" section that HostActiveSettings + RulesInPlaySection render
 * on web; the pill compresses the same content into a mobile-friendly disclosure.
 */
export function RulesInPlayButton({ game }: { game: Game | null | undefined }) {
  const [open, setOpen] = useState(false)
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  // Bail before rendering anything — an empty pill is worse than none.
  if (gameInfoItems(game).length === 0) return null
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Show rules in play"
      >
        <Text style={styles.btnText}>Rules</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheetWrap} onPress={() => {}}>
            <SafeAreaView edges={['bottom']} style={styles.sheet}>
              <View style={styles.grabber} />
              <View style={styles.header}>
                <Text style={styles.title}>Rules in play</Text>
                <Pressable hitSlop={12} onPress={() => setOpen(false)}>
                  <Text style={styles.close}>Done</Text>
                </Pressable>
              </View>
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
                <Text style={styles.note}>
                  Set by the host in the lobby. Everyone in the room plays under the same rules.
                </Text>
                <GameInfoChips game={game} />
              </ScrollView>
            </SafeAreaView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    btn: {
      height: 40,
      paddingHorizontal: 12,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.7 },
    btnText: { color: theme.text, fontSize: 13, fontWeight: '700' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheetWrap: { width: '100%' },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderTopWidth: 1,
      borderColor: theme.border,
      paddingBottom: theme.space.sm,
      maxHeight: '75%',
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
    title: { color: theme.text, fontSize: 20, fontWeight: '800' },
    close: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
    body: { paddingHorizontal: theme.space.lg },
    bodyContent: { gap: theme.space.md, paddingBottom: theme.space.lg },
    note: { color: theme.textMuted, fontSize: 13, lineHeight: 18 },
  })
