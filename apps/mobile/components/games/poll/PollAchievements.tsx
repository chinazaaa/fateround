import { StyleSheet, Text, View } from 'react-native'
import type { Achievement } from '@/components/games/poll/poll-achievements'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Shareable end-of-game achievements block. Mirrors web `AchievementsShareBlock`. */
export function PollAchievements({ achievements }: { achievements: Achievement[] }) {
  const styles = useThemedStyles(makeStyles)
  if (achievements.length === 0) return null
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🏆 Achievements</Text>
      <View style={styles.list}>
        {achievements.map((a) => (
          <View key={a.id} style={styles.row}>
            <Text style={styles.emoji}>{a.emoji}</Text>
            <View style={styles.body}>
              <Text style={styles.name}>
                {a.title}
                {a.participantName ? ` · ${a.participantName}` : ''}
              </Text>
              <Text style={styles.desc}>{a.description}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 16,
      gap: 12,
    },
    title: { color: theme.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
    list: { gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    emoji: { fontSize: 24, width: 30, textAlign: 'center' },
    body: { flex: 1, gap: 2 },
    name: { color: theme.text, fontSize: 14, fontWeight: '700' },
    desc: { color: theme.textMuted, fontSize: 12, lineHeight: 16 },
  })
