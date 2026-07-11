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
      {Array.from({ length: numTeams }, (_, i) => i + 1).map((team) => {
        const colors = teamChipStyle(team)
        const members = teamMembers.get(team) ?? []
        const active = myTeam === team
        return (
          <Pressable
            key={team}
            style={[
              styles.card,
              { backgroundColor: colors.bg, borderColor: colors.border },
              active && styles.cardActive,
            ]}
            disabled={acting}
            onPress={() => onPickTeam(team)}
          >
            <View style={styles.header}>
              <Text style={styles.emoji}>{TEAM_EMOJI[team - 1] ?? '⬜'}</Text>
              <View style={styles.headerText}>
                <Text style={styles.teamName}>{teamLabel(team)}</Text>
                <Text style={styles.count}>{teamCounts[team] ?? 0} players</Text>
              </View>
              {active ? <Text style={styles.youTag}>You</Text> : null}
            </View>
            {members.length > 0 ? (
              <Text style={styles.members} numberOfLines={2}>
                {members.join(' · ')}
              </Text>
            ) : (
              <Text style={styles.membersMuted}>No players yet</Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: 10 },
  help: { color: theme.textSecondary, fontSize: 15, marginBottom: 4 },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  cardActive: { borderWidth: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 24 },
  headerText: { flex: 1 },
  teamName: { color: theme.text, fontSize: 17, fontWeight: '800' },
  count: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  youTag: { color: theme.primaryMuted, fontSize: 12, fontWeight: '800' },
  members: { color: theme.textSecondary, fontSize: 13, lineHeight: 18 },
  membersMuted: { color: theme.textFaint, fontSize: 13, fontStyle: 'italic' },
})
