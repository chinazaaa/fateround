import { useMemo, useRef } from 'react'
import { Platform, Share, StyleSheet, Text, View } from 'react-native'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { type DescribeItPlayerScore, type DescribeItTeamScore, teamLabel } from '@fateround/shared/describe-it'
import { AppButton } from '@/components/ui/AppButton'
import { useToast } from '@/components/ui/Toast'
import { TeamBadge } from '@/components/party/TeamBadge'
import { TEAM_CHIP_COLORS } from '@/components/party/team-colors'
import { shareDomain } from '@/lib/config'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const MEDALS = ['👑', '🥈', '🥉']

type TeamModeProps = {
  mode: 'team'
  /** Ranked team scores from computeDescribeItScores. */
  teamScores: DescribeItTeamScore[]
  /** Winning team numbers (empty when nothing guessed / tie handled inline). */
  winners: number[]
  /** Fun end-of-match stat: who guessed the most words. */
  topGuessers: { name: string; count: number }[]
  /** Hide the winner hero/title on the visible card (when a parent already shows it). */
  hideHeader?: boolean
}

type IndividualModeProps = {
  mode: 'individual'
  /** Ranked players from describeItIndividualLeaderboard. */
  board: DescribeItPlayerScore[]
  highlightPlayerId?: string | null
  /** Hide the winner hero/title on the visible card (when a parent already shows it). */
  hideHeader?: boolean
}

type Props = TeamModeProps | IndividualModeProps

/**
 * Bespoke Describe It final-results card — the mobile counterpart of the web
 * `DescribeItFinalResultsShareBlock`. Renders a theme-aware winner hero plus
 * ranked standings (team scores with team badges + word counts, or an
 * individual points leaderboard), and a dedicated Share button that snapshots a
 * fixed light-themed copy to a PNG for image sharing (text fallback if capture
 * or share fails). Mirrors the web capture card so shared results look the same
 * across platforms.
 */
export function DescribeItShareCard(props: Props) {
  const styles = useThemedStyles(makeStyles)
  const { error: toastError } = useToast()
  const captureCardRef = useRef<View>(null)

  const model = useMemo(() => buildModel(props), [props])
  const shareText = useMemo(() => buildShareText(model), [model])

  const onShare = async () => {
    try {
      const uri = await captureRef(captureCardRef, { format: 'png', quality: 1 })
      if (Platform.OS === 'ios') {
        await Share.share({ url: uri, message: shareText })
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share results' })
      } else {
        await Share.share({ message: shareText })
      }
    } catch {
      try {
        await Share.share({ message: shareText })
      } catch {
        toastError('Could not share results')
      }
    }
  }

  return (
    <View style={styles.wrap}>
      {/* Visible, theme-aware tailored card. */}
      <View style={styles.card}>
        {props.hideHeader ? null : (
          <>
            <Text style={styles.hero}>{model.emoji}</Text>
            <Text style={styles.heroTitle}>{model.headline}</Text>
          </>
        )}
        <View style={styles.standings}>
          {model.rows.map((row) => (
            <View key={row.key} style={[styles.row, row.winner && styles.rowWinner]}>
              <Text style={styles.rank}>{row.rank}</Text>
              <View style={styles.rowText}>
                {row.team != null ? (
                  <TeamBadge team={row.team} />
                ) : (
                  <Text style={[styles.name, row.winner && styles.nameWinner]} numberOfLines={1}>
                    {row.name}
                    {row.you ? <Text style={styles.you}> (you)</Text> : null}
                  </Text>
                )}
              </View>
              <Text style={[styles.value, row.winner && styles.valueWinner]}>{row.value}</Text>
            </View>
          ))}
        </View>
        {model.topGuessers ? <Text style={styles.topGuessers}>{model.topGuessers}</Text> : null}
      </View>

      <AppButton label="Share results card" variant="secondary" onPress={() => void onShare()} />

      {/* Off-screen light-themed copy captured to a shareable image. */}
      <View style={styles.offscreen} pointerEvents="none">
        <View ref={captureCardRef} collapsable={false} style={styles.captureCard}>
          <Text style={styles.captureEmoji}>💬</Text>
          <Text style={styles.captureGame}>Describe It</Text>
          <View style={styles.captureDivider} />
          <Text style={styles.captureHero}>{model.emoji}</Text>
          <Text style={styles.captureTitle}>{model.headline}</Text>
          <View style={styles.captureStandings}>
            {model.rows.slice(0, 6).map((row) => {
              const chip = row.team != null ? TEAM_CHIP_COLORS[(row.team - 1) % TEAM_CHIP_COLORS.length]! : null
              return (
                <View key={row.key} style={[styles.captureRow, row.winner && styles.captureRowWinner]}>
                  <Text style={styles.captureRank}>{row.rank}</Text>
                  <View style={styles.rowText}>
                    {chip ? (
                      <View style={[styles.captureBadge, { backgroundColor: chip.badge }]}>
                        <Text style={styles.captureBadgeText}>{teamLabel(row.team!)}</Text>
                      </View>
                    ) : (
                      <Text style={[styles.captureName, row.winner && styles.captureNameWinner]} numberOfLines={1}>
                        {row.name}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.captureValue, row.winner && styles.captureValueWinner]}>{row.value}</Text>
                </View>
              )
            })}
          </View>
          {model.topGuessers ? <Text style={styles.captureTopGuessers}>{model.topGuessers}</Text> : null}
          <Text style={styles.captureBrand}>{shareDomain()}</Text>
        </View>
      </View>
    </View>
  )
}

type Row = {
  key: string
  rank: string
  /** Team number for a team-mode row (drives the badge); null for players. */
  team: number | null
  name: string
  you: boolean
  value: string
  winner: boolean
}

type Model = {
  emoji: string
  headline: string
  rows: Row[]
  topGuessers: string | null
}

function buildModel(props: Props): Model {
  if (props.mode === 'team') {
    const { teamScores, winners, topGuessers } = props
    const isTie = winners.length > 1
    const headline =
      winners.length === 0 ? 'No words guessed' : isTie ? "It's a tie!" : `${teamLabel(winners[0]!)} wins!`
    const rows: Row[] = teamScores.map((s, i) => {
      const isWinner = winners.includes(s.team)
      return {
        key: `team-${s.team}`,
        rank: isWinner ? '👑' : `${i + 1}.`,
        team: s.team,
        name: teamLabel(s.team),
        you: false,
        value: `${s.score} ${s.score === 1 ? 'word' : 'words'}`,
        winner: isWinner,
      }
    })
    const guessers =
      topGuessers.length > 0
        ? `Top guesser${topGuessers.length > 1 ? 's' : ''}: ${topGuessers
            .map((g) => `${g.name} (${g.count})`)
            .join(' · ')}`
        : null
    return { emoji: winners.length === 0 ? '🏁' : '🏆', headline, rows, topGuessers: guessers }
  }

  const { board, highlightPlayerId } = props
  const top = board[0]?.score ?? 0
  const winners = top > 0 ? board.filter((p) => p.score === top) : []
  const headline =
    winners.length === 0 ? 'No points scored' : winners.length > 1 ? "It's a tie!" : `${winners[0]!.name} wins!`
  const rows: Row[] = board.map((p, i) => ({
    key: `p-${p.id}`,
    rank: MEDALS[i] ?? `${i + 1}.`,
    team: null,
    name: p.name,
    you: p.id === highlightPlayerId,
    value: `${p.score} pt${p.score === 1 ? '' : 's'}`,
    winner: winners.some((w) => w.id === p.id),
  }))
  return { emoji: winners.length === 0 ? '🏁' : '🏆', headline, rows, topGuessers: null }
}

function buildShareText(model: Model): string {
  const lines: string[] = ['Text Charades', '']
  lines.push(`${model.emoji} ${model.headline}`)
  if (model.rows.length > 0) {
    lines.push('', 'Final standings:')
    model.rows.slice(0, 8).forEach((row, i) => {
      const name = row.you ? `${row.name} (you)` : row.name
      lines.push(`  ${i + 1}. ${name} — ${row.value}`)
    })
  }
  if (model.topGuessers) lines.push('', model.topGuessers)
  lines.push('', `Play at ${shareDomain()}`)
  return lines.join('\n')
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.sm },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.border,
      padding: theme.space.lg,
      alignItems: 'center',
      gap: 6,
    },
    hero: { fontSize: 40 },
    heroTitle: { color: theme.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 6 },
    standings: { width: '100%', gap: 8, marginTop: 6 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: theme.surfaceHover,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    rowWinner: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    rank: { width: 26, textAlign: 'center', fontSize: 15, fontWeight: '900', color: theme.textMuted },
    rowText: { flex: 1, gap: 1 },
    name: { color: theme.text, fontSize: 15, fontWeight: '700' },
    nameWinner: { fontSize: 16, fontWeight: '900' },
    you: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    value: { color: theme.primaryMuted, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
    valueWinner: { color: theme.primary },
    topGuessers: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 },
    // Off-screen light capture card — fixed light palette for a consistent
    // shareable image regardless of the viewer's theme.
    offscreen: { position: 'absolute', left: -10000, top: 0 },
    captureCard: {
      width: 340,
      backgroundColor: '#ffffff',
      borderRadius: 24,
      paddingVertical: 32,
      paddingHorizontal: 24,
      alignItems: 'center',
      gap: 6,
    },
    captureEmoji: { fontSize: 40 },
    captureGame: { color: '#e11d48', fontSize: 24, fontWeight: '900', textAlign: 'center' },
    captureDivider: { height: 1, width: '70%', backgroundColor: '#f1e0e4', marginVertical: 14 },
    captureHero: { fontSize: 48, marginBottom: 4 },
    captureTitle: { color: '#0b0b0f', fontSize: 26, fontWeight: '900', textAlign: 'center' },
    captureStandings: { width: '100%', gap: 8, marginTop: 18 },
    captureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#eee',
      backgroundColor: '#f7f7fa',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    captureRowWinner: { borderColor: '#f43f5e', backgroundColor: '#fdeef1' },
    captureRank: { width: 26, textAlign: 'center', fontSize: 15, fontWeight: '900', color: '#6b7280' },
    captureName: { color: '#1a1a1a', fontSize: 15, fontWeight: '700' },
    captureNameWinner: { color: '#0b0b0f', fontSize: 16, fontWeight: '900' },
    captureBadge: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      alignSelf: 'flex-start',
    },
    // white on the solid team-colored badge — intentional (matches TeamBadge)
    captureBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    captureValue: { color: '#e11d48', fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
    captureValueWinner: { color: '#be123c' },
    captureTopGuessers: { color: '#9ca3af', fontSize: 11, textAlign: 'center', marginTop: 12 },
    captureBrand: { color: '#d1d5db', fontSize: 12, fontWeight: '700', marginTop: 18 },
  })
