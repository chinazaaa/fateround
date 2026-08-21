import { StyleSheet, Text, View } from 'react-native'
import { streakNote, streakStatus, type StreakReadState } from '@fateround/shared/streak'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * The at-risk state for a day streak — mobile mirror of web's `StreakStatusBanner`.
 *
 * WHY. The streak was write-only in the UI on both platforms: a number and a flame, with
 * nothing to say it was about to lapse. "🔥 30" read identically at 9am on a day the player
 * had played and at 11pm on a day they hadn't — the one moment it should be shouting.
 * Visibility is the whole payoff for coming back (`docs/trophies-and-streaks.md` §4.5), and
 * half of visibility is knowing when it's in danger.
 *
 * Renders nothing in the states with nothing to say: no streak, already played today, or
 * already lost. A nudge about a streak that's already gone reads as a reprimand.
 */
export function StreakStatusCard({ profile }: { profile: StreakReadState | null | undefined }) {
  const styles = useThemedStyles(makeStyles)
  if (!profile) return null

  const note = streakNote(profile)
  if (!note) return null

  const { standing } = streakStatus(profile)
  return (
    <SurfaceCard accent={standing === 'at_risk'}>
      <View style={styles.row}>
        <Text style={styles.emoji}>{standing === 'at_risk' ? '🔥' : '🧊'}</Text>
        <Text style={styles.note}>{note}</Text>
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    emoji: { fontSize: 22 },
    note: { flex: 1, color: theme.text, fontSize: theme.type.body.size, lineHeight: 20 },
  })
