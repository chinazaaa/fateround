import { Pressable, StyleSheet, Text, View } from 'react-native'
import { TEAM_EMOJI, teamLabel } from '@fateround/shared/describe-it'
import { teamChipStyle } from './team-colors'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export function TeamPickerGrid({
  numTeams,
  myTeam,
  teamCounts,
  teamMembers,
  onPickTeam,
  acting,
  help,
}: {
  numTeams: number
  myTeam?: number | null
  teamCounts: number[]
  teamMembers: Map<number, string[]>
  onPickTeam: (team: number) => void
  acting?: boolean
  help?: string
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.wrap}>
      {help ? <Text style={styles.help}>{help}</Text> : null}
      {/* Two-column card grid (mirrors web): side-by-side teams so the height is
          the taller roster, not the sum — a 12-player lobby no longer elongates. */}
      <View style={styles.grid}>
        {Array.from({ length: numTeams }, (_, i) => i + 1).map((team) => {
          const colors = teamChipStyle(team)
          const members = teamMembers.get(team) ?? []
          const mine = myTeam === team
          return (
            <View
              key={team}
              style={[
                styles.card,
                { backgroundColor: colors.bg, borderColor: colors.border },
                mine && styles.cardActive,
              ]}
            >
              <View style={styles.header}>
                <View style={[styles.badge, { backgroundColor: colors.badge }]}>
                  <Text style={styles.badgeText}>
                    {TEAM_EMOJI[team - 1] ?? '⬜'} {teamLabel(team)}
                  </Text>
                </View>
                <Text style={styles.count}>{teamCounts[team] ?? 0}</Text>
              </View>

              <View style={styles.memberList}>
                {members.length > 0 ? (
                  members.map((name, idx) => (
                    <Text key={`${team}-${idx}`} style={styles.member} numberOfLines={1}>
                      {name}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.membersMuted}>No players yet</Text>
                )}
              </View>

              <Pressable
                style={[styles.joinBtn, mine && styles.joinBtnMine]}
                disabled={acting || mine}
                onPress={() => onPickTeam(team)}
              >
                <Text style={[styles.joinText, mine && styles.joinTextMine]}>{mine ? 'Your team' : 'Join'}</Text>
              </Pressable>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 10 },
    help: { color: theme.textSecondary, fontSize: 15, marginBottom: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    card: {
      // flexBasis just under half + grow → two per row, wrapping for 3–4 teams.
      flexGrow: 1,
      flexBasis: '47%',
      minWidth: 150,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      gap: 8,
    },
    cardActive: { borderWidth: 2 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    badge: {
      borderRadius: theme.radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    // Team-colour badges read on both schemes with white text.
    badgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    count: { color: theme.textMuted, fontSize: 14, fontWeight: '700' },
    memberList: { gap: 3, minHeight: 22 },
    member: { color: theme.text, fontSize: 14 },
    membersMuted: { color: theme.textFaint, fontSize: 13, fontStyle: 'italic' },
    joinBtn: {
      marginTop: 2,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingVertical: 9,
      alignItems: 'center',
      backgroundColor: theme.surface,
    },
    joinBtnMine: { backgroundColor: 'transparent', opacity: 0.7 },
    joinText: { color: theme.text, fontSize: 14, fontWeight: '800' },
    joinTextMine: { color: theme.textMuted },
  })
