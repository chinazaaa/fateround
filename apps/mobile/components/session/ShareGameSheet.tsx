import { useMemo } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native'
import { ShareGameInviteContent } from '@/components/session/ShareGameInviteContent'
import { theme } from '@/constants/theme'
import { buildShareLinks, shareSheetSubtitle } from '@/lib/game-links'

type Props = {
  visible: boolean
  gameCode: string
  hostToken?: string | null
  resumeToken?: string | null
  onClose: () => void
}

export function ShareGameSheet({ visible, gameCode, hostToken, resumeToken, onClose }: Props) {
  const subtitle = useMemo(
    () => shareSheetSubtitle(buildShareLinks({ gameCode, hostToken, resumeToken })),
    [gameCode, hostToken, resumeToken]
  )

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.sheetTitle}>Share game</Text>
            <Text style={styles.sheetSubtitle}>{subtitle}</Text>
            <ShareGameInviteContent
              gameCode={gameCode}
              hostToken={hostToken}
              resumeToken={resumeToken}
              compact
            />
            <Pressable style={styles.dismiss} onPress={onClose}>
              <Text style={styles.dismissText}>Close</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderTopWidth: 1,
    borderColor: theme.border,
    maxHeight: '92%',
  },
  scroll: {
    paddingHorizontal: theme.space.lg,
    paddingTop: theme.space.md,
    paddingBottom: 32,
    gap: theme.space.sm,
  },
  sheetTitle: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  sheetSubtitle: {
    color: theme.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: theme.space.xs,
  },
  dismiss: {
    paddingTop: theme.space.sm,
    alignItems: 'center',
  },
  dismissText: {
    color: theme.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
})
