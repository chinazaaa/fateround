import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { theme } from '@/constants/theme'
import { WEB_BASE_URL } from '@/lib/config'

export function PeopleStepPlaceholder() {
  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.emoji}>👥</Text>
        <Text style={styles.title}>Participant list needed</Text>
        <Text style={styles.body}>
          Who Said This needs a name list before you create the room. On the app we use join-as-you-go for most
          games — this one still needs the full People step.
        </Text>
        <Text style={styles.body}>Participant import on mobile is planned for a later update.</Text>
        <Pressable style={styles.link} onPress={() => void Linking.openURL(`${WEB_BASE_URL}/create?game=who_said_this`)}>
          <Text style={styles.linkText}>Set up on web →</Text>
        </Pressable>
      </View>
    </SurfaceCard>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: theme.space.sm,
    paddingVertical: theme.space.sm,
  },
  emoji: { fontSize: 36 },
  title: {
    color: theme.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  body: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  link: { marginTop: theme.space.xs },
  linkText: {
    color: theme.primaryMuted,
    fontSize: 15,
    fontWeight: '700',
  },
})
