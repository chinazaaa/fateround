import { StyleSheet, Text, View } from 'react-native'
import type { Player } from '@fateround/shared'
import { playerDisplayName } from '@fateround/shared/two-truths'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  submitterId: string | null | undefined
  players: Player[]
  highlightPlayerId?: string | null
  size?: 'sm' | 'md'
}

/**
 * Rounded avatar-initial pill labeled "Submitted by {name} (you)" — mirrors the
 * web TwoTruthsSubmitterBadge shown above each round's statements.
 */
export function TwoTruthsSubmitterBadge({ submitterId, players, highlightPlayerId, size = 'md' }: Props) {
  const styles = useThemedStyles(makeStyles)
  const name = playerDisplayName(submitterId, players)
  const isYou = !!highlightPlayerId && submitterId === highlightPlayerId
  const initial = name.charAt(0).toUpperCase()
  const sm = size === 'sm'

  return (
    <View style={[styles.pill, sm && styles.pillSm]}>
      <View style={[styles.avatar, sm && styles.avatarSm]}>
        <Text style={[styles.avatarText, sm && styles.avatarTextSm]}>{initial}</Text>
      </View>
      <View style={styles.textCol}>
        <Text style={styles.caption}>Submitted by</Text>
        <Text style={[styles.name, sm && styles.nameSm]} numberOfLines={1}>
          {name}
          {isYou ? ' (you)' : ''}
        </Text>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    pillSm: { paddingHorizontal: 12, paddingVertical: 6 },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarSm: { width: 28, height: 28, borderRadius: 14 },
    avatarText: { color: theme.primaryMuted, fontWeight: '800', fontSize: 14 },
    avatarTextSm: { fontSize: 12 },
    textCol: { minWidth: 0 },
    caption: {
      color: theme.textFaint,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1,
      lineHeight: 12,
    },
    name: { color: theme.text, fontWeight: '700', fontSize: 15 },
    nameSm: { fontSize: 13 },
  })
