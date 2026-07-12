import { StyleSheet, Text, View } from 'react-native'
import type { CodewordsPlayerRole } from '@fateround/shared'
import { roleLabel, teamLabel } from '@fateround/shared/codewords'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const RULES = [
  'Two teams — Red and Blue — each with one spymaster and operatives.',
  'Spymasters see the secret colour key and give a one-word clue plus a number (how many words it relates to).',
  'Operatives tap words on the 5×5 grid to guess. Correct guesses let you keep going; wrong guesses end your turn.',
  'First team to find all their words wins. Hit the assassin and your team loses!',
]

/**
 * Codewords-owned lobby activity: role badge + how-to-play rules that render
 * inside the shared LobbyView's `activity` slot for the non-pick waiting state.
 * Mirrors web CodewordsWaitingPanel (role badge + rules card). The shared
 * LobbyView already provides the spectator "get ready" button and roster.
 */
export function CodewordsWaitingActivity({
  myRole,
  isSpectator = false,
  roles = [],
  playerNameById,
}: {
  myRole?: CodewordsPlayerRole | null
  isSpectator?: boolean
  /** All seated players' roles — powers the two-column team rosters. */
  roles?: CodewordsPlayerRole[]
  playerNameById?: Map<string, string>
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      {isSpectator ? (
        <Text style={styles.spectatorHint}>
          You&apos;re watching. Use the get-ready button above to join the next round.
        </Text>
      ) : null}

      {myRole ? (
        <View style={styles.roleRow}>
          <View
            style={[
              styles.teamChip,
              myRole.team === 'red' ? styles.teamChipRed : styles.teamChipBlue,
            ]}
          >
            <Text style={styles.teamChipText}>{teamLabel(myRole.team)}</Text>
          </View>
          <Text style={styles.roleText}>{roleLabel(myRole.role)}</Text>
        </View>
      ) : null}

      {/* Two-column team rosters so you can see who's on each team (🕵️ = spymaster). */}
      <View style={styles.grid}>
        {(['red', 'blue'] as const).map((team) => {
          const members = roles.filter((r) => r.team === team)
          return (
            <View
              key={team}
              style={[styles.teamCard, team === 'red' ? styles.teamCardRed : styles.teamCardBlue]}
            >
              <View style={[styles.teamCardBadge, team === 'red' ? styles.teamChipRed : styles.teamChipBlue]}>
                <Text style={styles.teamChipText}>{team === 'red' ? '🔴 Red' : '🔵 Blue'}</Text>
              </View>
              {members.length > 0 ? (
                members.map((r) => (
                  <Text key={r.player_id} style={styles.memberName} numberOfLines={2}>
                    {r.role === 'spymaster' ? '🕵️ ' : ''}
                    {playerNameById?.get(r.player_id) ?? 'Player'}
                  </Text>
                ))
              ) : (
                <Text style={styles.membersMuted}>No players yet</Text>
              )}
            </View>
          )
        })}
      </View>

      <View style={styles.rulesCard}>
        <Text style={styles.rulesTitle}>How to play</Text>
        {RULES.map((rule) => (
          <Text key={rule} style={styles.ruleLine}>
            {'•'}  {rule}
          </Text>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    spectatorHint: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
    roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    teamChip: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 999,
    },
    // Functional team colors, fixed in both schemes.
    teamChipRed: { backgroundColor: '#dc2626' },
    teamChipBlue: { backgroundColor: '#2563eb' },
    teamChipText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    roleText: { color: theme.textSecondary, fontWeight: '700', fontSize: 14 },
    grid: { flexDirection: 'row', gap: 8 },
    teamCard: {
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: 0,
      borderWidth: 1,
      borderRadius: 12,
      padding: 10,
      gap: 6,
    },
    teamCardRed: { borderColor: '#dc262655', backgroundColor: '#dc26260d' },
    teamCardBlue: { borderColor: '#2563eb55', backgroundColor: '#2563eb0d' },
    teamCardBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
    memberName: { color: theme.text, fontSize: 14 },
    membersMuted: { color: theme.textFaint, fontSize: 12, fontStyle: 'italic' },
    rulesCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      gap: 6,
    },
    rulesTitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    ruleLine: { color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
  })
