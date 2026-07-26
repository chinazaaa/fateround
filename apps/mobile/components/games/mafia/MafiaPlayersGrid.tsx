import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { MafiaPhase, MafiaPublicPlayer, MafiaRole } from '@fateround/shared/mafia'
import { MAFIA_ROLE_INFO, mafiaRoleEmoji } from '@fateround/shared/mafia'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

const MAFIA_TEAM_ROLES: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer', 'mafia_seer']

const TEAM_TEXT: Record<string, string> = {
  village: '#34d399',
  mafia: '#f87171',
  solo: '#fbbf24',
  special: '#f472b6',
}

// What each role's night tap actually does — "tap to select" alone doesn't say whether
// you're killing, protecting, or investigating someone.
const NIGHT_ACTION_VERB: Partial<Record<MafiaRole, string>> = {
  doctor: 'the player to protect',
  bodyguard: 'the player to protect',
  aura_seer: 'the player to reveal the alignment of',
  detective: 'two players to compare teams',
  tracker: 'the player to watch',
  vigilante: 'the player to kill',
  mafia: 'the player to kill',
  alpha_wolf: 'the player to kill',
  wolf_cub: 'the player to kill',
  framer: 'the player to frame',
  serial_killer: 'the player to kill',
  arsonist: 'two players to douse',
  medium: 'a dead player to revive',
  cupid: 'two players to link as Lovers',
  seer: 'the player to reveal the exact role of',
  mafia_seer: 'the player to reveal the exact role of',
}

interface MafiaPlayersGridProps {
  players: MafiaPublicPlayer[]
  myPlayerId: string | null
  myRole?: MafiaRole | null
  mafiaTeammateIds?: string[]
  mafiaTeammateRoles?: Record<string, MafiaRole>
  mafiaTeammateNightTargets?: Record<string, string | null>
  /** The local player's own night target (for kill-voter roles) — shown on their tile like
   *  teammate targets so the player sees the 🎯 badge on themselves too. */
  myNightTarget?: string | null
  mafiaSeerRevealedRoles?: Record<string, MafiaRole>
  loverIds?: string[]
  phase: MafiaPhase
  voteTallies: Record<string, number>
  voteChoices?: Record<string, string>
  votedPlayerIds?: string[]
  anonymousVotes?: boolean
  onSelect?: (id: string) => void
  selectedIds?: string[]
  allowSelfSelect?: boolean
  allowDeadSelect?: boolean
  disabled?: boolean
}

/**
 * Numbered player roster tiles, styled after Wolvesville's grid: seat numbers, a tombstone
 * for eliminated players (with their revealed role), a "(you)" tag + highlighted border on
 * the local player's own tile, vote-count badges during voting, and — when `onSelect` is
 * provided — tap-to-act/vote selection with a highlighted border on the current pick.
 */
export function MafiaPlayersGrid({
  players,
  myPlayerId,
  myRole,
  mafiaTeammateIds = [],
  mafiaTeammateRoles = {},
  mafiaTeammateNightTargets,
  myNightTarget,
  mafiaSeerRevealedRoles = {},
  loverIds = [],
  phase,
  voteTallies,
  voteChoices = {},
  votedPlayerIds = [],
  anonymousVotes = false,
  onSelect,
  selectedIds = [],
  allowSelfSelect = false,
  allowDeadSelect = false,
  disabled = false,
}: MafiaPlayersGridProps) {
  const styles = useThemedStyles(makeStyles)
  const seatNumberById = new Map(players.map((p) => [p.id, p.seatNumber]))
  const amIAlive = players.find((p) => p.id === myPlayerId)?.isAlive !== false

  const myHasVoted = myPlayerId ? votedPlayerIds.includes(myPlayerId) : false
  let headerSuffix = ''
  if (phase === 'voting') {
    headerSuffix = amIAlive ? (myHasVoted ? ' · tap to unvote' : ' · tap to vote') : ''
  } else if (onSelect && myRole) {
    const verb = NIGHT_ACTION_VERB[myRole]
    headerSuffix = verb ? ` · tap to select ${verb}` : ' · tap to select'
  }

  // Night target tally: how many mafia kill-voters are targeting each player (self + teammates).
  // Excludes mafia_seer whose night action is a reveal, not a kill.
  const MAFIA_KILL_VOTERS: MafiaRole[] = ['mafia', 'alpha_wolf', 'wolf_cub', 'framer']
  const nightTargetTally = new Map<string, number>()
  if (phase === 'night' && myRole && MAFIA_KILL_VOTERS.includes(myRole)) {
    if (myNightTarget) nightTargetTally.set(myNightTarget, (nightTargetTally.get(myNightTarget) ?? 0) + 1)
    if (mafiaTeammateNightTargets) {
      for (const targetId of Object.values(mafiaTeammateNightTargets)) {
        if (targetId) nightTargetTally.set(targetId, (nightTargetTally.get(targetId) ?? 0) + 1)
      }
    }
  }

  // Roster size varies 5-16 — a fixed 4-wide grid leaves a nearly-empty last row for small
  // games (e.g. 6 players: 4+2). Pick the tightest square-ish column count instead, so a
  // 6-player game reads as a clean 3x2/3x3 and a 16-player game still fills a full 4x4.
  const cols = Math.min(4, Math.max(3, Math.ceil(Math.sqrt(players.length))))
  const tileWidthPct = `${100 / cols}%` as const

  return (
    <View style={styles.card}>
      <Text style={styles.header}>Players{headerSuffix}</Text>
      <View style={styles.grid}>
        {players.map((p) => {
          const isMe = p.id === myPlayerId
          const voteCount = voteTallies?.[p.id] ?? 0
          const hasVoted = phase === 'voting' && p.isAlive && votedPlayerIds.includes(p.id)
          const votingForSeat =
            phase === 'voting' && p.isAlive && !anonymousVotes ? seatNumberById.get(voteChoices[p.id]) : undefined
          const isSelected = selectedIds.includes(p.id)
          const clickable =
            !disabled && !!onSelect && (allowDeadSelect ? !p.isAlive : p.isAlive) && (!isMe || allowSelfSelect)
          const isTeammate = !isMe && mafiaTeammateIds.includes(p.id)
          const isKnownLover = loverIds.includes(p.id)
          const teammateRole = isTeammate ? mafiaTeammateRoles[p.id] : undefined
          const teammateNightTarget =
            isTeammate && phase === 'night' && mafiaTeammateNightTargets ? mafiaTeammateNightTargets[p.id] : undefined
          const nightTargetSeat =
            isMe && myNightTarget
              ? seatNumberById.get(myNightTarget)
              : teammateNightTarget
                ? seatNumberById.get(teammateNightTarget)
                : undefined
          const nightTallyCount = nightTargetTally.get(p.id)
          const revealedRole = p.role ?? teammateRole ?? mafiaSeerRevealedRoles[p.id]
          const roleTeamColor = revealedRole
            ? MAFIA_TEAM_ROLES.includes(revealedRole)
              ? TEAM_TEXT.mafia
              : revealedRole === 'jester'
                ? TEAM_TEXT.solo
                : TEAM_TEXT.village
            : undefined

          const showVoteTargetBand = votingForSeat != null || (anonymousVotes && hasVoted)

          return (
            <View key={p.id} style={{ width: tileWidthPct, padding: 3 }}>
              <Pressable
                disabled={!clickable}
                onPress={clickable ? () => onSelect?.(p.id) : undefined}
                style={[
                  styles.tile,
                  !p.isAlive
                    ? styles.tileDead
                    : isSelected
                      ? styles.tileSelected
                      : isMe
                        ? styles.tileMe
                        : isTeammate
                          ? styles.tileTeammate
                          : styles.tileDefault,
                ]}
              >
                <View style={styles.seatBadge}>
                  <Text style={styles.seatBadgeText}>{p.seatNumber}</Text>
                </View>
                {p.isAlive && phase === 'voting' && voteCount > 0 ? (
                  <View style={styles.voteCountBadge}>
                    <Text style={styles.voteCountBadgeText}>{voteCount}</Text>
                  </View>
                ) : isKnownLover ? (
                  <Text style={styles.loverBadge}>💘</Text>
                ) : null}
                {isSelected ? <Text style={styles.selectedBadge}>✅</Text> : null}
                {isTeammate && p.isAlive ? <Text style={styles.teammateBadge}>🔪</Text> : null}
                <Text style={styles.avatar}>{p.isAlive ? '🧑' : '🪦'}</Text>
                <Text numberOfLines={1} style={[styles.name, !p.isAlive && styles.nameDead]}>
                  {p.name}
                  {isMe ? <Text style={styles.youTag}> (you)</Text> : null}
                  {p.revivedByMedium && p.isAlive ? <Text> 🔮</Text> : null}
                </Text>
                {isMe && myRole ? (
                  <Text style={[styles.roleLabel, { color: TEAM_TEXT[MAFIA_ROLE_INFO[myRole].team] }]}>
                    {mafiaRoleEmoji(myRole)} {MAFIA_ROLE_INFO[myRole].name}
                  </Text>
                ) : revealedRole ? (
                  <Text style={[styles.roleLabel, roleTeamColor ? { color: roleTeamColor } : null]}>
                    {mafiaRoleEmoji(revealedRole)} {MAFIA_ROLE_INFO[revealedRole]?.name ?? revealedRole}
                  </Text>
                ) : null}
                {nightTargetSeat != null ? (
                  <View style={styles.targetBand}>
                    <Text style={styles.targetBandText}>🎯 {nightTargetSeat}</Text>
                  </View>
                ) : nightTallyCount ? (
                  <View style={styles.targetBand}>
                    <Text style={styles.targetBandText}>🎯 {nightTallyCount}</Text>
                  </View>
                ) : showVoteTargetBand ? (
                  <View style={styles.voteBand}>
                    <Text style={styles.targetBandText}>{votingForSeat != null ? votingForSeat : '?'}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: { backgroundColor: theme.surface, borderRadius: theme.radius.lg, padding: 14, gap: 8 },
    header: {
      color: theme.primary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
    tile: {
      aspectRatio: 1,
      borderRadius: theme.radius.md,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 6,
      gap: 2,
      overflow: 'hidden',
    },
    tileDefault: { backgroundColor: theme.bgElevated, borderColor: theme.border },
    tileDead: { backgroundColor: theme.bgElevated, borderColor: theme.border, opacity: 0.6 },
    tileMe: { backgroundColor: theme.bgElevated, borderColor: theme.primary },
    tileTeammate: { backgroundColor: '#f43f5e18', borderColor: '#f43f5e66' },
    tileSelected: { backgroundColor: '#10b98118', borderColor: '#34d399' },
    seatBadge: {
      position: 'absolute',
      top: 4,
      left: 4,
      width: 18,
      height: 18,
      borderRadius: 999,
      backgroundColor: '#00000090',
      alignItems: 'center',
      justifyContent: 'center',
    },
    seatBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
    voteCountBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 999,
      backgroundColor: '#f43f5e',
      alignItems: 'center',
      justifyContent: 'center',
    },
    voteCountBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
    loverBadge: { position: 'absolute', top: 3, right: 4, fontSize: 12 },
    selectedBadge: { position: 'absolute', bottom: 3, right: 4, fontSize: 11 },
    teammateBadge: { position: 'absolute', bottom: 3, left: 4, fontSize: 11 },
    avatar: { fontSize: 26, lineHeight: 30 },
    name: { fontSize: 11, fontWeight: '700', color: theme.text, maxWidth: '100%' },
    nameDead: { color: theme.textMuted, textDecorationLine: 'line-through' },
    youTag: { fontWeight: '400', color: theme.primary },
    roleLabel: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
    targetBand: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '22%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#7f1d1de6',
      borderTopWidth: 2,
      borderTopColor: '#450a0a66',
    },
    voteBand: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: '22%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#78350fe6',
      borderTopWidth: 2,
      borderTopColor: '#451a0366',
    },
    targetBandText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  })
