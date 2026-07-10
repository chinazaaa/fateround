import { useState } from 'react'
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { EditNameInline } from '@/components/session/EditNameInline'
import { LeaveGameButton } from '@/components/session/LeaveGameButton'
import { GameRulesLink } from '@/components/ui/GameRulesLink'
import { gameLabel } from '@/lib/mobile-registry'

type Props = {
  gameCode: string
  gameType?: GameType | string | null
  playerId: string
  playerName: string
  onRenamed: (name: string) => void
  onLeft: () => void
}

export function PlayerSessionMenu({ gameCode, gameType, playerId, playerName, onRenamed, onLeft }: Props) {
  const [open, setOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)

  const close = () => {
    setOpen(false)
    setEditingName(false)
  }

  return (
    <>
      <Pressable style={styles.menuBtn} onPress={() => setOpen(true)} hitSlop={8}>
        <Text style={styles.menuIcon}>⋮</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
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
                <Pressable
                  style={styles.row}
                  onPress={() => setEditingName(true)}
                >
                  <Text style={styles.rowText}>✏️  Edit your name</Text>
                </Pressable>

                {gameType ? (
                  <View style={styles.row}>
                    <GameRulesLink gameType={gameType} />
                  </View>
                ) : null}

                <View style={styles.leaveRow}>
                  <LeaveGameButton
                    gameCode={gameCode}
                    playerId={playerId}
                    onLeft={() => {
                      close()
                      onLeft()
                    }}
                    quiet={false}
                  />
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

const styles = StyleSheet.create({
  menuBtn: { paddingHorizontal: 10, paddingVertical: 6 },
  menuIcon: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 22 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#17171d',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderColor: '#2a2a35',
    gap: 4,
  },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  sheetMeta: { color: '#9ca3af', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  row: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a35' },
  rowText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  editBlock: { gap: 12, paddingVertical: 8 },
  cancelEdit: { alignSelf: 'flex-start', paddingVertical: 8 },
  cancelEditText: { color: '#9ca3af', fontSize: 14 },
  leaveRow: { paddingTop: 16 },
  dismiss: { paddingTop: 16, alignItems: 'center' },
  dismissText: { color: '#9ca3af', fontSize: 15, fontWeight: '600' },
})
