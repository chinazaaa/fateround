import { useRef, useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { EditNameInline } from '@/components/session/EditNameInline'
import { LeaveGameButton } from '@/components/session/LeaveGameButton'
import { RotatePlayerCodeRow } from '@/components/session/RotatePlayerCodeRow'
import { PushMuteToggle } from '@/components/push/PushMuteToggle'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameLabel } from '@/lib/mobile-registry'

import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  gameType?: GameType | string | null
  playerId: string
  playerName: string
  onRenamed: (name: string) => void
  onLeft: () => void
}

export function PlayerSessionMenu({ gameCode, gameType, playerId, playerName, onRenamed, onLeft }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  // Navigating (router.replace) while this Modal is still on screen orphans it
  // over the destination (home) on iOS — a transparent backdrop that blocks all
  // touches, so the page looks "frozen". Defer the leave until the modal is gone:
  // run it in the Modal's onDismiss (iOS fires it after full dismissal); Android
  // has no onDismiss and doesn't orphan, so a short timeout covers it.
  const pendingLeave = useRef(false)

  const close = () => {
    setOpen(false)
    setEditingName(false)
  }

  const requestLeave = () => {
    pendingLeave.current = true
    close()
    if (Platform.OS !== 'ios') {
      setTimeout(() => {
        if (pendingLeave.current) {
          pendingLeave.current = false
          onLeft()
        }
      }, 250)
    }
  }

  return (
    <>
      <Pressable style={styles.menuBtn} onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={styles.menuIcon}>⋯</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={close}
        onDismiss={() => {
          // iOS: fires after the modal has fully left the screen — safe to leave now.
          if (pendingLeave.current) {
            pendingLeave.current = false
            onLeft()
          }
        }}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{gameCode.toUpperCase()}</Text>
            {gameType ? <Text style={styles.sheetMeta}>{gameLabel(gameType as GameType)}</Text> : null}

            {editingName ? (
              <View style={styles.editBlock}>
                <EditNameInline
                  gameCode={gameCode}
                  playerId={playerId}
                  currentName={playerName}
                  startEditing
                  onRenamed={(name) => {
                    onRenamed(name)
                    setEditingName(false)
                    close()
                  }}
                />
                <Pressable style={styles.cancelEdit} onPress={() => setEditingName(false)}>
                  <Text style={styles.cancelEditText}>Cancel</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable style={styles.row} onPress={() => setEditingName(true)}>
                  <Text style={styles.rowText}>✏️ Edit your name</Text>
                </Pressable>

                {gameType ? (
                  <View style={styles.row}>
                    <GameRulesLink gameType={gameType} />
                  </View>
                ) : null}

                <PushMuteToggle gameCode={gameCode} />

                <RotatePlayerCodeRow gameCode={gameCode} style={styles.row} textStyle={styles.rowText} />

                <View style={styles.leaveRow}>
                  <LeaveGameButton gameCode={gameCode} playerId={playerId} onLeft={requestLeave} quiet={false} />
                </View>
              </>
            )}

            {!editingName ? (
              <Pressable style={styles.dismiss} onPress={close}>
                <Text style={styles.dismissText}>Close</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    menuBtn: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuIcon: { color: theme.text, fontSize: 18, fontWeight: '800', lineHeight: 20 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      paddingHorizontal: theme.space.lg,
      paddingTop: theme.space.md,
      paddingBottom: 32,
      borderTopWidth: 1,
      borderColor: theme.border,
      gap: 4,
    },
    sheetTitle: { color: theme.text, fontSize: 20, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
    sheetMeta: { color: theme.textMuted, fontSize: 14, textAlign: 'center', marginBottom: 12 },
    row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
    rowText: { color: theme.text, fontSize: 16, fontWeight: '600' },
    editBlock: { gap: 12, paddingVertical: 8 },
    cancelEdit: { alignSelf: 'flex-start', paddingVertical: 8 },
    cancelEditText: { color: theme.textMuted, fontSize: 14 },
    leaveRow: { paddingTop: 16 },
    dismiss: { paddingTop: 16, alignItems: 'center' },
    dismissText: { color: theme.textMuted, fontSize: 15, fontWeight: '600' },
  })
