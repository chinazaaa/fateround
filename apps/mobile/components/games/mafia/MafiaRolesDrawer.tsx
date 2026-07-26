import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from '@fateround/shared/mafia'
import type { MafiaRole } from '@fateround/shared/mafia'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const TEAM_COLOR: Record<string, string> = {
  village: '#34d399',
  mafia: '#f87171',
  solo: '#fbbf24',
  special: '#f472b6',
}

const TEAM_LABEL: Record<string, string> = {
  village: 'Village',
  mafia: 'Mafia',
  solo: 'Solo',
  special: 'Special',
}

const AURA_COLOR: Record<string, string> = {
  good: '#34d399',
  evil: '#f87171',
  unknown: '#a78bfa',
}

const AURA_LABEL: Record<string, string> = {
  good: 'Good',
  evil: 'Evil',
  unknown: 'Unknown',
}

interface MafiaRolesDrawerProps {
  rolesInGame: MafiaRole[]
  myRole?: MafiaRole | null
  roleCounts?: Partial<Record<MafiaRole, number>>
}

/**
 * "ℹ️ Roles" button that opens a full-screen modal listing every role in play — rules text,
 * team, and count — with the local player's own role pinned first. Mobile port of web's
 * MafiaRolesDrawer, filtered the same way (only roles actually assigned this game).
 */
export function MafiaRolesDrawer({ rolesInGame, myRole, roleCounts }: MafiaRolesDrawerProps) {
  const styles = useThemedStyles(makeStyles)
  const [open, setOpen] = useState(false)
  const sortedRoles = myRole ? [myRole, ...rolesInGame.filter((r) => r !== myRole)] : rolesInGame

  return (
    <>
      <Pressable style={styles.triggerBtn} onPress={() => setOpen(true)}>
        <Text style={styles.triggerText}>ℹ️ Roles</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Roles in this game</Text>
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {sortedRoles.map((role) => {
              const info = MAFIA_ROLE_INFO[role]
              if (!info) return null
              const isMine = role === myRole
              const teamColor = TEAM_COLOR[info.team] ?? '#34d399'
              return (
                <View key={role} style={[styles.roleCard, isMine && { borderColor: teamColor }]}>
                  <Text style={styles.roleEmoji}>{mafiaRoleEmoji(role)}</Text>
                  <View style={styles.roleBody}>
                    <Text style={[styles.roleName, { color: teamColor }]}>
                      {info.name}
                      {roleCounts ? <Text style={styles.roleCount}> x{roleCounts[role] ?? 0}</Text> : null}
                      {isMine ? <Text style={styles.roleMine}> (your role)</Text> : null}
                    </Text>
                    <Text style={styles.roleDesc}>{info.description}</Text>
                    <View style={styles.chipRow}>
                      <View
                        style={[styles.teamChip, { borderColor: `${teamColor}44`, backgroundColor: `${teamColor}18` }]}
                      >
                        <Text style={[styles.teamChipText, { color: teamColor }]}>
                          Team: {TEAM_LABEL[info.team] ?? info.team}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.teamChip,
                          {
                            borderColor: `${AURA_COLOR[info.aura] ?? '#a78bfa'}44`,
                            backgroundColor: `${AURA_COLOR[info.aura] ?? '#a78bfa'}18`,
                          },
                        ]}
                      >
                        <Text style={[styles.teamChipText, { color: AURA_COLOR[info.aura] ?? '#a78bfa' }]}>
                          Aura: {AURA_LABEL[info.aura] ?? info.aura}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              )
            })}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable style={styles.footerCloseBtn} onPress={() => setOpen(false)}>
              <Text style={styles.footerCloseBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    triggerBtn: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    triggerText: { color: theme.text, fontSize: 12, fontWeight: '700' },
    modalRoot: { flex: 1, backgroundColor: theme.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    headerTitle: { color: theme.text, fontSize: 16, fontWeight: '900' },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 999,
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnText: { color: theme.text, fontSize: 15, fontWeight: '700' },
    list: { padding: 16, gap: 10 },
    roleCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
    },
    roleEmoji: { fontSize: 26 },
    roleBody: { flex: 1, gap: 4 },
    roleName: { fontSize: 14, fontWeight: '800' },
    roleCount: { color: theme.textMuted, fontWeight: '400' },
    roleMine: { color: theme.primary, fontWeight: '400' },
    roleDesc: { color: theme.textMuted, fontSize: 12, lineHeight: 17 },
    chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 2 },
    teamChip: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    teamChipText: { fontSize: 10, fontWeight: '700' },
    footer: { padding: 16, borderTopWidth: 1, borderTopColor: theme.border },
    footerCloseBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    footerCloseBtnText: { color: '#fff', fontWeight: '800' },
  })
