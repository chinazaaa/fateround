import { StyleSheet, Text, View } from 'react-native'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type MonopolyBannerInfo = { message: string; personal: boolean } | null

/**
 * Cohesive above-board status group (mirrors web MonopolyChrome "Current turn"
 * card + MonopolyBoard "You landed on" card + the event banner). Replaces the
 * old loose stack (TurnBanner + owner line + plain banner) with a designed set:
 *
 *  - CURRENT TURN card: whose turn it is, the per-turn countdown, and a phase pill.
 *  - YOU LANDED ON card: the current space name + owner/rent context.
 *  - Event banner: the resolved status banner as its own accent block.
 *
 * The two cards sit in a 2-column row that collapses to a stack on very narrow
 * phones (flexWrap + minWidth). Cash is intentionally NOT shown here — it lives
 * in the board centre.
 */
export function MonopolyStatusCards({
  isMyTurn,
  turnName,
  secondsLeft,
  phaseLabel,
  spaceName,
  spaceOwnerLabel,
  banner,
}: {
  isMyTurn: boolean
  turnName: string
  secondsLeft: number
  phaseLabel: string
  /** Themed current-space name, or null (viewers / no seat). */
  spaceName: string | null
  /** "You own this" / "Owned by X" / "Unowned", or null when not ownable. */
  spaceOwnerLabel: string | null
  banner: MonopolyBannerInfo
}) {
  const styles = useThemedStyles(makeStyles)

  return (
    <View style={styles.group}>
      <View style={styles.cardRow}>
        {/* Current turn */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current turn</Text>
          <View style={styles.turnRow}>
            <Text style={styles.turnValue}>{isMyTurn ? 'Your turn' : `${turnName}'s turn`}</Text>
            {secondsLeft > 0 ? (
              <View style={styles.timerPill}>
                <Text style={styles.timerPillText}>{secondsLeft}s</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.phasePill}>
            <Text style={styles.phasePillText}>{phaseLabel}</Text>
          </View>
        </View>

        {/* You landed on */}
        {spaceName ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>You landed on</Text>
            <Text style={styles.spaceValue} numberOfLines={2}>
              {spaceName}
            </Text>
            {spaceOwnerLabel ? (
              <Text style={styles.spaceOwner} numberOfLines={1}>
                {spaceOwnerLabel}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {banner ? (
        <View style={[styles.banner, banner.personal ? styles.bannerPersonal : styles.bannerNeutral]}>
          {isMyTurn ? <Text style={styles.bannerTag}>Your turn</Text> : null}
          <Text style={styles.bannerText}>{banner.message}</Text>
        </View>
      ) : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    group: { gap: 8 },
    cardRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    card: {
      flex: 1,
      minWidth: 150,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 5,
    },
    cardLabel: {
      color: theme.textFaint,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    turnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    turnValue: { color: theme.text, fontSize: 16, fontWeight: '900', flex: 1 },
    timerPill: {
      backgroundColor: theme.bg,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    timerPillText: { color: theme.text, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
    phasePill: {
      alignSelf: 'flex-start',
      backgroundColor: theme.primarySoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    phasePillText: {
      color: theme.primaryMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    spaceValue: { color: theme.text, fontSize: 15, fontWeight: '800', lineHeight: 19 },
    spaceOwner: { color: theme.textMuted, fontSize: 12, fontWeight: '600' },
    banner: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    bannerPersonal: { backgroundColor: theme.primarySoft, borderColor: theme.borderAccent },
    bannerNeutral: { backgroundColor: theme.surface, borderColor: theme.border },
    bannerTag: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 3,
    },
    bannerText: { color: theme.text, fontSize: 14, lineHeight: 20 },
  })
