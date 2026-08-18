import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { YahtzeeCategory, YahtzeeCategoryPoints, YahtzeePlayerScore } from '@fateround/shared'
import {
  YAHTZEE_CATEGORY_LABELS,
  YAHTZEE_LOWER_CATEGORIES,
  YAHTZEE_UPPER_BONUS_THRESHOLD,
  YAHTZEE_UPPER_CATEGORIES,
  categoryScore,
  jokerApplies,
  totalScore,
  upperBonus,
  upperScore,
} from '@fateround/shared/yahtzee'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const COMPACT_LABELS: Partial<Record<YahtzeeCategory, string>> = {
  three_kind: '3 of a Kind',
  four_kind: '4 of a Kind',
  full_house: 'Full House',
  small_straight: 'Sm. Str.',
  large_straight: 'Lg. Str.',
  yahtzee: '5 of a Kind',
}

function categoryLabel(category: YahtzeeCategory) {
  return COMPACT_LABELS[category] ?? YAHTZEE_CATEGORY_LABELS[category]
}

const CATEGORY_COL = 96
const PLAYER_COL = 66

type PlayerLite = { id: string; name: string }

/**
 * Full multiplayer scorecard: one column per player, per-player running totals in
 * the header, active-player highlight, a "You" column, and an upper-section bonus
 * row (+35 at 63) with a progress bar. Mirrors web `YahtzeeScorecard`.
 */
export function YahtzeeScorecardGrid({
  players,
  scores,
  myPlayerId,
  activePlayerId,
  dice,
  scoringEnabled,
  onScore,
}: {
  players: PlayerLite[]
  scores: YahtzeePlayerScore[]
  myPlayerId?: string | null
  activePlayerId?: string | null
  dice?: number[]
  scoringEnabled?: boolean
  onScore?: (category: YahtzeeCategory) => void
}) {
  const styles = useThemedStyles(makeStyles)

  if (players.length === 0 || scores.length === 0) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    )
  }

  const ordered = players.map((p) => ({
    player: p,
    score: scores.find((s) => s.player_id === p.id)?.scores.categories ?? null,
    bonus: scores.find((s) => s.player_id === p.id)?.scores.bonusYahtzees ?? 0,
  }))

  const playerCellStyle = (playerId: string) => {
    const isActive = playerId === activePlayerId
    const isYou = playerId === myPlayerId
    return [styles.cell, isActive && styles.cellActive, isYou && !isActive && styles.cellYou]
  }

  const renderScoreCell = (category: YahtzeeCategory, player: PlayerLite, score: YahtzeeCategoryPoints | null) => {
    const isActive = player.id === activePlayerId
    const isYou = player.id === myPlayerId
    const val = score ? score[category] : null
    const joker = isActive && score ? jokerApplies(dice ?? [], score) : false
    const preview = isActive && val == null && dice ? categoryScore(dice, category, { joker }) : null

    if (val != null) {
      return <Text style={styles.cellFilled}>{val}</Text>
    }
    if (preview != null) {
      if (isYou && scoringEnabled && onScore) {
        return (
          <Pressable style={styles.pickBtn} onPress={() => onScore(category)}>
            <Text style={styles.pickText}>{preview}</Text>
          </Pressable>
        )
      }
      return <Text style={styles.cellPreview}>{preview}</Text>
    }
    return <Text style={styles.cellEmpty}>—</Text>
  }

  const renderCategoryRow = (category: YahtzeeCategory, isYahtzeeRow = false) => (
    <View style={styles.row} key={category}>
      <View style={styles.labelCell}>
        <Text style={[styles.labelText, isYahtzeeRow && styles.labelYahtzee]} numberOfLines={1}>
          {categoryLabel(category)}
        </Text>
      </View>
      {ordered.map(({ player, score }) => (
        <View key={player.id} style={playerCellStyle(player.id)}>
          {renderScoreCell(category, player, score)}
        </View>
      ))}
    </View>
  )

  return (
    <View style={styles.card}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Header */}
          <View style={[styles.row, styles.headerRow]}>
            <View style={styles.labelCell}>
              <Text style={styles.headerLabel}>Category</Text>
            </View>
            {ordered.map(({ player, score, bonus }) => {
              const isActive = player.id === activePlayerId
              const isYou = player.id === myPlayerId
              const total = score ? totalScore(score, bonus) : 0
              return (
                <View key={player.id} style={[styles.cell, isActive && styles.cellActive]}>
                  <View style={[styles.avatar, isActive && styles.avatarActive]}>
                    <Text style={[styles.avatarText, isActive && styles.avatarTextActive]}>
                      {player.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {isYou ? 'You' : player.name.split(' ')[0]}
                  </Text>
                  <Text style={[styles.headerTotal, isActive && styles.headerTotalActive]}>{total}</Text>
                </View>
              )
            })}
          </View>

          {/* Upper section */}
          <SectionHeader label="Upper Section" count={ordered.length} styles={styles} />
          {YAHTZEE_UPPER_CATEGORIES.map((cat) => renderCategoryRow(cat))}

          {/* Bonus row */}
          <View style={[styles.row, styles.subtotalRow]}>
            <View style={styles.labelCell}>
              <Text style={styles.bonusLabel}>Bonus</Text>
              <Text style={styles.bonusHint}>+35 at 63</Text>
            </View>
            {ordered.map(({ player, score }) => {
              const sub = score ? upperScore(score) : 0
              const bonus = score ? upperBonus(score) : 0
              const pct = Math.min(1, sub / YAHTZEE_UPPER_BONUS_THRESHOLD)
              return (
                <View key={player.id} style={playerCellStyle(player.id)}>
                  {bonus > 0 ? (
                    <Text style={styles.bonusEarned}>+35 ✓</Text>
                  ) : (
                    <View style={styles.bonusProgress}>
                      <Text style={styles.bonusFraction}>
                        {sub}/{YAHTZEE_UPPER_BONUS_THRESHOLD}
                      </Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
                      </View>
                    </View>
                  )}
                </View>
              )
            })}
          </View>

          {/* Lower section */}
          <SectionHeader label="Lower Section" count={ordered.length} styles={styles} />
          {YAHTZEE_LOWER_CATEGORIES.map((cat) => renderCategoryRow(cat, cat === 'yahtzee'))}

          {/* Total */}
          <View style={[styles.row, styles.totalRow]}>
            <View style={styles.labelCell}>
              <Text style={styles.totalLabel}>Total</Text>
            </View>
            {ordered.map(({ player, score, bonus }) => (
              <View key={player.id} style={playerCellStyle(player.id)}>
                <Text style={styles.totalValue}>{score ? totalScore(score, bonus) : 0}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      {players.length > 3 ? <Text style={styles.scrollHint}>← scroll to see all players →</Text> : null}
    </View>
  )
}

function SectionHeader({
  label,
  count,
  styles,
}: {
  label: string
  count: number
  styles: ReturnType<typeof makeStyles>
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={{ width: CATEGORY_COL + count * PLAYER_COL }}>
        <Text style={styles.sectionText}>{label}</Text>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    loading: {
      padding: 16,
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 14,
    },
    loadingText: { color: theme.textMuted, fontSize: 12 },
    row: { flexDirection: 'row', alignItems: 'stretch' },
    headerRow: { borderBottomWidth: 2, borderBottomColor: theme.border },
    labelCell: {
      width: CATEGORY_COL,
      paddingHorizontal: 8,
      paddingVertical: 6,
      justifyContent: 'center',
    },
    labelText: { color: theme.text, fontSize: 11, fontWeight: '600' },
    labelYahtzee: { color: theme.primary, fontWeight: '900', letterSpacing: 0.5 },
    headerLabel: {
      color: theme.textMuted,
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    cell: {
      width: PLAYER_COL,
      paddingVertical: 6,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellActive: { backgroundColor: theme.primarySoft },
    cellYou: { backgroundColor: theme.surfaceHover },
    avatar: {
      height: 26,
      width: 26,
      borderRadius: 13,
      backgroundColor: theme.surfaceHover,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    avatarActive: { backgroundColor: theme.primary, borderColor: theme.primary },
    avatarText: { color: theme.textMuted, fontSize: 11, fontWeight: '900' },
    // White on the solid primary avatar — intentional.
    avatarTextActive: { color: '#fff' },
    headerName: { color: theme.text, fontSize: 10, fontWeight: '700', maxWidth: PLAYER_COL - 6 },
    headerTotal: { color: theme.textMuted, fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
    headerTotalActive: { color: theme.primary },
    cellFilled: { color: theme.text, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
    cellPreview: {
      color: theme.primary,
      fontSize: 12,
      fontStyle: 'italic',
      fontWeight: '600',
      opacity: 0.6,
      fontVariant: ['tabular-nums'],
    },
    cellEmpty: { color: theme.textMuted, fontSize: 12, opacity: 0.4 },
    pickBtn: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: 'center',
    },
    // White on the solid primary pick button — intentional.
    pickText: { color: '#fff', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
    sectionRow: { backgroundColor: theme.surfaceHover },
    sectionText: {
      color: theme.primary,
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
      opacity: 0.75,
    },
    subtotalRow: { backgroundColor: theme.surfaceHover },
    bonusLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '700' },
    bonusHint: { color: theme.textMuted, fontSize: 8, opacity: 0.6 },
    bonusEarned: { color: '#22c55e', fontSize: 10, fontWeight: '800' },
    bonusProgress: { alignItems: 'center', gap: 2 },
    bonusFraction: { color: theme.textMuted, fontSize: 9, fontWeight: '600', fontVariant: ['tabular-nums'] },
    barTrack: {
      width: 30,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 2, backgroundColor: theme.primary },
    totalRow: { borderTopWidth: 2, borderTopColor: theme.border },
    totalLabel: { color: theme.text, fontSize: 11, fontWeight: '900' },
    totalValue: { color: theme.primary, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
    scrollHint: {
      textAlign: 'center',
      color: theme.textMuted,
      fontSize: 9,
      paddingVertical: 3,
      borderTopWidth: 1,
      borderTopColor: theme.border,
      opacity: 0.5,
    },
  })
