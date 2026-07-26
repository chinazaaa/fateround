import { StyleSheet, Text, View } from 'react-native'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from '@fateround/shared/mafia'
import type { MafiaMyState } from '@fateround/shared/mafia'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/**
 * Dynamic private results only (investigation/tracking results, lover status,
 * bodyguard/vigilante/framer/cupid outcomes). Mafia teammates are shown via the shared mafia
 * symbol on their tiles in MafiaPlayersGrid instead of a name list here. Mobile port of web's
 * MafiaIdentityPanel.
 */
export function MafiaIdentityPanel({ myState }: { myState: MafiaMyState | null }) {
  const styles = useThemedStyles(makeStyles)
  const myRole = myState?.role

  const hasDynamicInfo =
    !!myState &&
    (myState.isLover ||
      !!myState.auraSeerResult ||
      !!myState.detectiveTeamCheckResult ||
      !!myState.seerResult ||
      !!myState.mafiaSeerResult ||
      !!myState.trackerResult ||
      (myRole === 'doctor' && !!myState.doctorLastOutcome && myState.doctorLastOutcome !== 'no_attack') ||
      myRole === 'vigilante' ||
      (myRole === 'framer' && !!myState.framerLastTargetName) ||
      (myRole === 'cupid' && !!myState.cupidLinkedNames))

  if (!hasDynamicInfo) return null

  return (
    <View style={styles.stack}>
      {myState?.isLover ? (
        <View style={[styles.card, styles.pinkCard]}>
          <Text style={styles.pinkLabel}>💘 In Love</Text>
          <Text style={styles.body}>
            You are linked with <Text style={styles.bold}>{myState.loverPartnerName ?? 'someone'}</Text>. You win
            together if you both survive.
          </Text>
        </View>
      ) : null}

      {myState?.auraSeerResult ? (
        <View style={styles.card}>
          <Text style={styles.label}>Investigation</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>{myState.auraSeerResult.targetName}</Text> is{' '}
            <Text
              style={[
                styles.bold,
                myState.auraSeerResult.alignment === 'evil'
                  ? styles.evilText
                  : myState.auraSeerResult.alignment === 'unknown'
                    ? styles.unknownText
                    : styles.goodText,
              ]}
            >
              {myState.auraSeerResult.alignment === 'evil'
                ? 'EVIL 🔪'
                : myState.auraSeerResult.alignment === 'unknown'
                  ? 'UNKNOWN ❓'
                  : 'GOOD 🏘️'}
            </Text>
          </Text>
        </View>
      ) : null}

      {myState?.detectiveTeamCheckResult ? (
        <View style={styles.card}>
          <Text style={styles.label}>🕵️ Detective Check</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>{myState.detectiveTeamCheckResult.targetAName}</Text> &{' '}
            <Text style={styles.bold}>{myState.detectiveTeamCheckResult.targetBName}</Text> are{' '}
            <Text
              style={[styles.bold, myState.detectiveTeamCheckResult.sameTeam ? styles.unknownText : styles.goodText]}
            >
              {myState.detectiveTeamCheckResult.sameTeam ? 'on the SAME team' : 'NOT on the same team'}
            </Text>
          </Text>
        </View>
      ) : null}

      {myState?.seerResult ? (
        <View style={styles.card}>
          <Text style={styles.label}>👁️ Role Revealed</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>{myState.seerResult.targetName}</Text> is{' '}
            <Text style={styles.bold}>
              {mafiaRoleEmoji(myState.seerResult.role)} {MAFIA_ROLE_INFO[myState.seerResult.role]?.name}
            </Text>
          </Text>
        </View>
      ) : null}

      {myState?.mafiaSeerResult ? (
        <View style={styles.card}>
          <Text style={styles.label}>👁️‍🗨️ Role Revealed</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>{myState.mafiaSeerResult.targetName}</Text> is{' '}
            <Text style={styles.bold}>
              {mafiaRoleEmoji(myState.mafiaSeerResult.role)} {MAFIA_ROLE_INFO[myState.mafiaSeerResult.role]?.name}
            </Text>
          </Text>
        </View>
      ) : null}

      {myState?.trackerResult ? (
        <View style={styles.card}>
          <Text style={styles.label}>Tracking Result</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>{myState.trackerResult.targetName}</Text>{' '}
            {myState.trackerResult.visitedName
              ? `visited ${myState.trackerResult.visitedName} last night.`
              : 'visited no one last night.'}
          </Text>
        </View>
      ) : null}

      {myRole === 'doctor' && myState?.doctorLastOutcome && myState.doctorLastOutcome !== 'no_attack' ? (
        <View style={styles.card}>
          <Text style={styles.body}>Your target was attacked and you saved them last night.</Text>
        </View>
      ) : null}

      {myRole === 'vigilante' ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            Shots remaining: <Text style={styles.bold}>{myState?.vigilanteShotsRemaining ?? 1}</Text>
            {'  ·  '}
            Reveals remaining: <Text style={styles.bold}>{myState?.vigilanteRevealRemaining ?? 1}</Text>
          </Text>
        </View>
      ) : null}

      {myState?.vigilanteRevealResult ? (
        <View style={styles.card}>
          <Text style={styles.label}>🔍 Role Revealed</Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>{myState.vigilanteRevealResult.targetName}</Text> is{' '}
            <Text style={styles.bold}>
              {mafiaRoleEmoji(myState.vigilanteRevealResult.role)}{' '}
              {MAFIA_ROLE_INFO[myState.vigilanteRevealResult.role]?.name}
            </Text>
          </Text>
        </View>
      ) : null}

      {myRole === 'framer' && myState?.framerLastTargetName ? (
        <View style={styles.card}>
          <Text style={styles.body}>
            You framed <Text style={styles.bold}>{myState.framerLastTargetName}</Text> last night.
          </Text>
        </View>
      ) : null}

      {myRole === 'cupid' && myState?.cupidLinkedNames ? (
        <View style={[styles.card, styles.pinkCard]}>
          <Text style={styles.pinkLabel}>💘 Lovers Linked</Text>
          <Text style={styles.body}>
            {myState.cupidLinkedNames[0]} & {myState.cupidLinkedNames[1]}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    stack: { gap: 8 },
    card: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
      padding: 12,
      gap: 3,
    },
    pinkCard: { borderColor: '#ec489933', backgroundColor: '#ec48990d' },
    label: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    pinkLabel: { color: '#f472b6', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
    body: { color: theme.text, fontSize: 13 },
    bold: { fontWeight: '800' },
    evilText: { color: '#f87171' },
    unknownText: { color: '#fbbf24' },
    goodText: { color: '#34d399' },
  })
