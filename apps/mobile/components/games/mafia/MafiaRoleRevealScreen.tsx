import { StyleSheet, Text, View } from 'react-native'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from '@fateround/shared/mafia'
import type { MafiaMyState } from '@fateround/shared/mafia'
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

/**
 * A full-screen "you are..." moment shown once per player before night 1, matching
 * Wolvesville's explicit role-reveal beat instead of jumping straight into the grid.
 */
export function MafiaRoleRevealScreen({ myState }: { myState: MafiaMyState | null }) {
  const styles = useThemedStyles(makeStyles)

  if (!myState) {
    return (
      <View style={styles.container}>
        <Text style={styles.bigEmoji}>👁️</Text>
        <Text style={styles.title}>You are spectating</Text>
        <Text style={styles.desc}>Roles have been assigned. Night begins shortly…</Text>
      </View>
    )
  }

  const info = MAFIA_ROLE_INFO[myState.role]
  const teamColor = TEAM_COLOR[info.team] ?? '#34d399'

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>You are…</Text>
      <Text style={styles.bigEmoji}>{mafiaRoleEmoji(myState.role)}</Text>
      <Text style={styles.title}>{info.name}</Text>
      <View style={[styles.teamPill, { borderColor: `${teamColor}55`, backgroundColor: `${teamColor}18` }]}>
        <Text style={[styles.teamPillText, { color: teamColor }]}>Team {TEAM_LABEL[info.team] ?? info.team}</Text>
      </View>
      <Text style={styles.desc}>{info.description}</Text>

      {myState.mafiaTeammates.length > 0 ? (
        <View style={styles.alliesCard}>
          <Text style={styles.alliesLabel}>Your allies</Text>
          <Text style={styles.alliesText}>{myState.mafiaTeammates.join(', ')}</Text>
        </View>
      ) : null}

      <View style={styles.hushPill}>
        <Text style={styles.hushText}>🤫 Do not show your screen to anyone!</Text>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16, gap: 12 },
    eyebrow: { color: theme.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    bigEmoji: { fontSize: 56 },
    title: { color: theme.text, fontSize: 26, fontWeight: '900' },
    teamPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
    teamPillText: { fontSize: 12, fontWeight: '700' },
    desc: { color: theme.textMuted, fontSize: 14, textAlign: 'center', maxWidth: 340, lineHeight: 20 },
    alliesCard: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: '#f43f5e0d',
      borderColor: '#f43f5e33',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      gap: 4,
    },
    alliesLabel: { color: '#f87171', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
    alliesText: { color: theme.text, fontSize: 14 },
    hushPill: {
      marginTop: 4,
      backgroundColor: theme.bgElevated,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    hushText: { color: theme.textMuted, fontSize: 12 },
  })
