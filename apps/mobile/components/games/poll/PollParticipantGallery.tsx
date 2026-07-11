import { StyleSheet, Text, View } from 'react-native'
import type { Participant } from '@fateround/shared'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Read-only gallery of all participants' photo cards while waiting in the lobby.
 * Mirrors web `ParticipantGallery` (people-poll games only).
 */
export function PollParticipantGallery({ participants }: { participants: Participant[] }) {
  const styles = useThemedStyles(makeStyles)
  if (participants.length === 0) return null
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Who's playing ({participants.length})</Text>
      <View style={styles.grid}>
        {participants.map((p) => (
          <View key={p.id} style={styles.cell}>
            <ParticipantAvatar name={p.name} photoUrl={p.photo_url} size={54} />
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
            </Text>
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
      padding: 14,
      gap: 12,
    },
    title: { color: theme.text, fontSize: 15, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center' },
    cell: { alignItems: 'center', gap: 4, width: 72 },
    name: { color: theme.textMuted, fontSize: 12, fontWeight: '600', textAlign: 'center', maxWidth: 72 },
  })
