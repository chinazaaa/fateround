import { StyleSheet, Text, View } from 'react-native'
import type { GameType, Participant, Round, Vote } from '@fateround/shared'
import { isBinaryPeoplePollGame } from '@fateround/shared/poll-games'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { genderLabel } from '@/components/games/poll/gender'
import {
  buildPollTally,
  countKey,
  participantsInAnyRound,
  participantsInGenderRounds,
  pollCategoryMeta,
  pollVoteCategories,
  topByCount,
  type PollTallyRow,
} from '@/components/games/poll/vote-meta'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Top-N winner card (one per vote category). */
function LeaderCard({
  emoji,
  label,
  name,
  count,
  accentColor,
}: {
  emoji: string
  label: string
  name?: string
  count?: number
  accentColor: string
}) {
  const styles = useThemedStyles(makeStyles)
  return (
    <View style={styles.leaderCard}>
      <Text style={styles.leaderEmoji}>{emoji}</Text>
      <Text style={[styles.leaderLabel, { color: accentColor }]}>{label}</Text>
      {name ? (
        <>
          <Text style={styles.leaderName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.leaderCount}>{count ?? 0} votes</Text>
        </>
      ) : (
        <Text style={styles.leaderEmpty}>—</Text>
      )}
    </View>
  )
}

function LeaderRow({ gameType, tally }: { gameType?: GameType | string; tally: PollTallyRow[] }) {
  const styles = useThemedStyles(makeStyles)
  const categories = pollVoteCategories(gameType)
  return (
    <View style={styles.cardGrid}>
      {categories.map((category) => {
        const meta = pollCategoryMeta(gameType, category)
        const top = topByCount(tally, countKey(category))
        return (
          <LeaderCard
            key={category}
            emoji={meta.emoji}
            label={meta.leaderboardLabel}
            name={top?.name}
            count={top ? top[countKey(category)] : undefined}
            accentColor={meta.color}
          />
        )
      })}
    </View>
  )
}

/** Per-person breakdown card (all categories with counts). */
function BreakdownList({
  gameType,
  tally,
  genderTag,
}: {
  gameType?: GameType | string
  tally: PollTallyRow[]
  genderTag?: string
}) {
  const styles = useThemedStyles(makeStyles)
  const pairGame = isBinaryPeoplePollGame(gameType)
  const categories = pollVoteCategories(gameType)
  const maxByCategory = categories.map((category) =>
    Math.max(1, ...tally.map((p) => p[countKey(category)]))
  )
  const sorted = [...tally].sort(
    (a, b) => b.kissCount + b.marryCount + b.killCount - (a.kissCount + a.marryCount + a.killCount)
  )
  return (
    <View style={styles.breakdownList}>
      {sorted.map((p) => (
        <View key={p.id} style={styles.breakdownCard}>
          <View style={styles.breakdownHeader}>
            <ParticipantAvatar name={p.name} photoUrl={p.photo_url} size={32} />
            <Text style={styles.breakdownName}>{p.name}</Text>
            {genderTag ? <Text style={styles.breakdownTag}>{genderTag}</Text> : null}
          </View>
          <View style={styles.cardGrid}>
            {categories.map((category, index) => {
              const meta = pollCategoryMeta(gameType, category)
              const count = p[countKey(category)]
              const max = maxByCategory[index]
              const isWinner = pairGame
                ? category === 'kiss'
                  ? p.kissCount > p.killCount
                  : p.killCount > p.kissCount
                : count === max && max > 0
              return (
                <View key={category} style={[styles.stat, isWinner && { borderColor: meta.color }]}>
                  <Text style={styles.statEmoji}>{meta.emoji}</Text>
                  <Text style={[styles.statCount, isWinner && { color: meta.color }]}>{count}</Text>
                  <Text style={styles.statLabel}>{meta.label}</Text>
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

export function FinalGenderLeaderboards({
  gameType,
  participants,
  rounds,
  votes,
}: {
  gameType?: GameType | string
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
}) {
  const styles = useThemedStyles(makeStyles)
  const sections = (
    [
      { gender: 'male' as const, title: "Men's leaderboard" },
      { gender: 'female' as const, title: "Women's leaderboard" },
    ]
  )
    .map(({ gender, title }) => {
      const group = participantsInGenderRounds(participants, rounds, gender)
      return { gender, title, tally: buildPollTally(group, votes, gameType), group }
    })
    .filter((s) => s.group.length > 0)

  if (sections.length === 0) return null

  return (
    <View style={styles.section}>
      {sections.map(({ gender, title, tally }) => (
        <View key={gender} style={styles.subsection}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <LeaderRow gameType={gameType} tally={tally} />
        </View>
      ))}
    </View>
  )
}

export function FinalOverallLeaderboards({
  gameType,
  participants,
  rounds,
  votes,
}: {
  gameType?: GameType | string
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
}) {
  const styles = useThemedStyles(makeStyles)
  const group = participantsInAnyRound(participants, rounds)
  if (group.length === 0) return null
  const tally = buildPollTally(group, votes, gameType)
  return (
    <View style={styles.subsection}>
      <Text style={styles.sectionTitle}>Final leaderboard</Text>
      <LeaderRow gameType={gameType} tally={tally} />
    </View>
  )
}

export function FinalGenderBreakdown({
  gameType,
  participants,
  rounds,
  votes,
}: {
  gameType?: GameType | string
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
}) {
  const styles = useThemedStyles(makeStyles)
  const sections = (
    [
      { gender: 'male' as const, title: 'Men' },
      { gender: 'female' as const, title: 'Women' },
    ]
  )
    .map(({ gender, title }) => {
      const group = participantsInGenderRounds(participants, rounds, gender)
      return { gender, title, tally: buildPollTally(group, votes, gameType) }
    })
    .filter((s) => s.tally.length > 0)

  if (sections.length === 0) return null

  return (
    <View style={styles.section}>
      {sections.map(({ gender, title, tally }) => (
        <View key={gender} style={styles.subsection}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <BreakdownList gameType={gameType} tally={tally} genderTag={genderLabel(gender)} />
        </View>
      ))}
    </View>
  )
}

export function FinalOverallBreakdown({
  gameType,
  participants,
  rounds,
  votes,
}: {
  gameType?: GameType | string
  participants: Participant[]
  rounds: Round[]
  votes: Vote[]
}) {
  const styles = useThemedStyles(makeStyles)
  const group = participantsInAnyRound(participants, rounds)
  if (group.length === 0) return null
  const tally = buildPollTally(group, votes, gameType)
  return (
    <View style={styles.subsection}>
      <Text style={styles.sectionTitle}>Everyone</Text>
      <BreakdownList gameType={gameType} tally={tally} />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { gap: 20 },
    subsection: { gap: 10 },
    sectionTitle: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    cardGrid: { flexDirection: 'row', gap: 8 },
    leaderCard: {
      flex: 1,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      alignItems: 'center',
      gap: 4,
    },
    leaderEmoji: { fontSize: 22 },
    leaderLabel: {
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
    },
    leaderName: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    leaderCount: { color: theme.textMuted, fontSize: 12 },
    leaderEmpty: { color: theme.textFaint, fontSize: 15 },
    breakdownList: { gap: 10 },
    breakdownCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 10,
    },
    breakdownHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    breakdownName: { color: theme.text, fontSize: 16, fontWeight: '700', flex: 1 },
    breakdownTag: {
      color: theme.textFaint,
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    stat: {
      flex: 1,
      backgroundColor: theme.bg,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 10,
      alignItems: 'center',
      gap: 2,
    },
    statEmoji: { fontSize: 18 },
    statCount: { color: theme.text, fontSize: 18, fontWeight: '800' },
    statLabel: { color: theme.textMuted, fontSize: 11 },
  })
