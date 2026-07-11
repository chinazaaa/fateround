import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ScrollView } from 'react-native'
import {
  type NpatAnswer,
  type NpatCategory,
  type NpatMark,
  type NpatMetadata,
  type Player,
} from '@fateround/shared'

type NpatDispute = NonNullable<NpatMetadata['disputes']>[number]
import {
  NPAT_CATEGORIES,
  NPAT_CATEGORY_LABELS,
  NPAT_CATEGORY_POINTS,
  NPAT_DUPLICATE_POINTS,
  answerStartsWithLetter,
  answerTotal,
  playerDisplayName,
} from '@fateround/shared/npat'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'
import { isInCatalogue } from './npat-catalogue'

// ---- scoring helpers (ported from web src/lib/npat.ts) ----------------------

type NpatScoreReason = 'empty' | 'duplicate' | 'invalid' | 'wrong_letter' | 'single_letter' | 'valid'

function normalizeAnswer(text: string): string {
  return (text ?? '').trim().toLowerCase()
}

function isSingleLetterAnswer(answer: string): boolean {
  return normalizeAnswer(answer).length <= 1
}

function isForcedInvalidAnswer(answer: string, letter: string | null, isDuplicate: boolean): boolean {
  const normalized = normalizeAnswer(answer)
  if (!normalized) return true
  if (isSingleLetterAnswer(answer)) return true
  if (letter && !answerStartsWithLetter(answer, letter)) return true
  if (isDuplicate) return true
  return false
}

function duplicateKeysByCategory(
  answers: Pick<NpatAnswer, 'name' | 'animal' | 'place' | 'thing' | 'food'>[]
): Record<NpatCategory, Set<string>> {
  const result: Record<NpatCategory, Set<string>> = {
    name: new Set(),
    animal: new Set(),
    place: new Set(),
    thing: new Set(),
    food: new Set(),
  }
  for (const category of NPAT_CATEGORIES) {
    const counts = new Map<string, number>()
    for (const row of answers) {
      const normalized = normalizeAnswer(row[category])
      if (!normalized) continue
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }
    for (const [key, count] of counts) {
      if (count > 1) result[category].add(key)
    }
  }
  return result
}

function computeCategoryScore(opts: {
  answer: string
  letter: string | null
  markedValid: boolean
  isDuplicate: boolean
}): { points: number; reason: NpatScoreReason } {
  if (!normalizeAnswer(opts.answer)) return { points: 0, reason: 'empty' }
  if (isSingleLetterAnswer(opts.answer)) return { points: 0, reason: 'single_letter' }
  if (opts.letter && !answerStartsWithLetter(opts.answer, opts.letter)) {
    return { points: 0, reason: 'wrong_letter' }
  }
  if (opts.isDuplicate) return { points: NPAT_DUPLICATE_POINTS, reason: 'duplicate' }
  if (!opts.markedValid) return { points: 0, reason: 'invalid' }
  return { points: NPAT_CATEGORY_POINTS, reason: 'valid' }
}

function scoreReasonLabel(reason: NpatScoreReason): string {
  if (reason === 'duplicate') return 'Duplicate'
  if (reason === 'wrong_letter') return 'Wrong letter'
  if (reason === 'single_letter') return 'Single letter'
  if (reason === 'invalid') return 'Marked invalid'
  if (reason === 'empty') return 'Empty'
  return 'Valid'
}

// ---- component --------------------------------------------------------------

const AMBER = '#d97706'
const RED = '#ef4444'
const ORANGE = '#f97316'
const EMERALD = '#059669'

export function ICallOnScoreboard({
  letter,
  players,
  answers,
  marks,
  metadata,
  showScores,
  maskAnswers = false,
  hostReview = false,
  hostOverrides,
  onSetValid,
  disputes,
  myPlayerId,
  showDisputeButtons = false,
  onDispute,
}: {
  letter: string | null
  players: Player[]
  answers: NpatAnswer[]
  marks: NpatMark[]
  metadata: NpatMetadata | null
  showScores: boolean
  maskAnswers?: boolean
  hostReview?: boolean
  hostOverrides?: NpatMetadata['host_overrides']
  onSetValid?: (playerId: string, category: NpatCategory, answerText: string, valid: boolean) => void
  disputes?: NpatDispute[]
  myPlayerId?: string | null
  showDisputeButtons?: boolean
  onDispute?: (targetPlayerId: string, category: NpatCategory) => void
}) {
  const styles = useThemedStyles(makeStyles)

  const activePlayers = players.filter((p) => p.spectator !== true)
  const answersByPlayer = new Map(answers.map((a) => [a.player_id, a]))
  const dupes = duplicateKeysByCategory(answers)
  const marksByTarget = new Map(marks.map((m) => [m.target_player_id, m]))
  const markerNameByTarget = new Map<string, string>()
  if (metadata) {
    for (const [markerId, targetId] of Object.entries(metadata.reviewer_assignments)) {
      markerNameByTarget.set(targetId, playerDisplayName(markerId, players))
    }
  }

  if (activePlayers.length === 0) return null

  const lockedInCount = activePlayers.filter((p) => answersByPlayer.get(p.id)?.submitted_at).length

  const emeraldColor = styles.emerald.color as string
  const mutedColor = styles.muted.color as string
  function reasonColor(reason: NpatScoreReason, points: number): string {
    if (reason === 'duplicate') return AMBER
    if (points > 0) return emeraldColor
    if (reason === 'wrong_letter' || reason === 'invalid') return AMBER
    return mutedColor
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.labelCaps}>
          {hostReview ? 'Review board' : maskAnswers ? 'Submission status' : 'Live scoreboard'}
        </Text>
        {letter ? (
          <View style={styles.letterBadge}>
            <Text style={styles.letterBadgeText}>{letter}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.subtext}>
        {hostReview
          ? 'Tap Valid or Invalid on anything you want to override. Empty, wrong-letter, single-letter, and duplicate answers are locked invalid.'
          : maskAnswers
            ? `${lockedInCount}/${activePlayers.length} locked in — answers stay hidden until marking starts.`
            : 'Duplicates score 5 automatically. Reviewers mark whether each answer fits its category.'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tableInner}>
        <View>
          {/* header */}
          <View style={styles.theadRow}>
            <Text style={[styles.th, styles.playerCol]}>Player</Text>
            {NPAT_CATEGORIES.map((category) => (
              <Text key={category} style={[styles.th, styles.catCol]}>
                {NPAT_CATEGORY_LABELS[category]}
              </Text>
            ))}
            {showScores ? <Text style={[styles.th, styles.roundCol, styles.right]}>Round</Text> : null}
          </View>

          {/* body */}
          {activePlayers.map((player) => {
            const answer = answersByPlayer.get(player.id)
            const mark = marksByTarget.get(player.id)
            const reviewer = markerNameByTarget.get(player.id)
            const isLockedIn = !!answer?.submitted_at
            const roundTotal = showScores && answer?.score_name != null ? answerTotal(answer) : null
            const isMe = myPlayerId != null && player.id === myPlayerId

            return (
              <View key={player.id} style={[styles.trow, isMe && styles.trowMe]}>
                {/* player cell */}
                <View style={[styles.cell, styles.playerCol]}>
                  <View style={styles.nameLine}>
                    <Text style={styles.nameText}>{player.name}</Text>
                    {isMe ? (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>You</Text>
                      </View>
                    ) : null}
                  </View>
                  {maskAnswers ? (
                    <Text style={[styles.statusText, isLockedIn ? styles.emerald : styles.muted]}>
                      {isLockedIn ? 'Locked in ✓' : 'Still writing…'}
                    </Text>
                  ) : null}
                  {reviewer && !maskAnswers ? (
                    <Text style={styles.reviewerText}>Marked by {reviewer}</Text>
                  ) : null}
                </View>

                {/* category cells */}
                {NPAT_CATEGORIES.map((category) => {
                  if (maskAnswers) {
                    return (
                      <View key={category} style={[styles.cell, styles.catCol]}>
                        <Text style={[styles.muted, styles.center]}>{isLockedIn ? '✓' : '…'}</Text>
                      </View>
                    )
                  }

                  const text = answer?.[category] ?? ''
                  const normalized = normalizeAnswer(text)
                  const isDuplicate = normalized ? dupes[category].has(normalized) : false
                  const markedValid = mark?.[`valid_${category}` as keyof NpatMark] as boolean | undefined
                  const hasMark = mark?.marked_at != null
                  const forcedInvalid = isForcedInvalidAnswer(text, letter, isDuplicate)
                  const hostOverride = metadata?.host_overrides?.[player.id]?.[category]
                  const hostValid = hostReview ? hostOverrides?.[player.id]?.[category] : undefined
                  const effectiveValid = hostReview
                    ? typeof hostValid === 'boolean'
                      ? hostValid
                      : typeof hostOverride === 'boolean'
                        ? hostOverride
                        : markedValid !== false
                    : typeof hostOverride === 'boolean'
                      ? hostOverride
                      : markedValid !== false

                  let reason: NpatScoreReason
                  let points: number
                  if (showScores && answer?.score_name != null) {
                    const scoreKey = `score_${category}` as keyof NpatAnswer
                    points = (answer[scoreKey] as number | null) ?? 0
                    if (!normalized) reason = 'empty'
                    else if (isSingleLetterAnswer(text)) reason = 'single_letter'
                    else if (letter && !answerStartsWithLetter(text, letter)) reason = 'wrong_letter'
                    else if (isDuplicate) reason = 'duplicate'
                    else if (points === 0) reason = 'invalid'
                    else reason = 'valid'
                  } else {
                    const preview = computeCategoryScore({
                      answer: text,
                      letter,
                      markedValid: effectiveValid,
                      isDuplicate,
                    })
                    points = preview.points
                    reason = preview.reason
                  }

                  return (
                    <View key={category} style={[styles.cell, styles.catCol]}>
                      <Text style={styles.answerText}>{text || '—'}</Text>
                      <View style={styles.flagStack}>
                        {!normalized ? <Text style={[styles.flag, styles.muted]}>Empty</Text> : null}
                        {normalized && letter && !answerStartsWithLetter(text, letter) ? (
                          <Text style={[styles.flag, { color: AMBER }]}>Must start with {letter}</Text>
                        ) : null}
                        {normalized && isSingleLetterAnswer(text) ? (
                          <Text style={[styles.flag, { color: AMBER }]}>Single letter</Text>
                        ) : null}
                        {isDuplicate && normalized ? (
                          <Text style={[styles.flag, { color: RED }]}>Duplicate</Text>
                        ) : null}
                        {normalized && !forcedInvalid && !isDuplicate ? (
                          isInCatalogue(category, text) ? (
                            <Text style={[styles.flag, styles.emerald]}>📚 Known</Text>
                          ) : (
                            <Text style={[styles.flag, { color: ORANGE }]}>⚠️ Not in catalogue</Text>
                          )
                        ) : null}
                        {hostReview && !forcedInvalid ? (
                          <View style={styles.overrideRow}>
                            <Pressable
                              style={[styles.overrideBtn, effectiveValid && styles.overrideBtnValid]}
                              onPress={() => onSetValid?.(player.id, category, text, true)}
                            >
                              <Text style={[styles.overrideBtnText, effectiveValid && styles.overrideBtnTextValid]}>
                                Valid
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[styles.overrideBtn, !effectiveValid && styles.overrideBtnInvalid]}
                              onPress={() => onSetValid?.(player.id, category, text, false)}
                            >
                              <Text style={[styles.overrideBtnText, !effectiveValid && styles.overrideBtnTextInvalid]}>
                                Invalid
                              </Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {!hostReview &&
                        (hasMark || typeof hostOverride === 'boolean') &&
                        !effectiveValid &&
                        !forcedInvalid ? (
                          <Text style={[styles.flag, { color: AMBER }]}>Invalid</Text>
                        ) : null}
                        {!hostReview &&
                        (hasMark || typeof hostOverride === 'boolean') &&
                        effectiveValid &&
                        normalized &&
                        !isDuplicate &&
                        !forcedInvalid ? (
                          <Text style={[styles.flag, styles.emerald]}>Valid</Text>
                        ) : null}
                        {!hostReview && !hasMark && metadata?.phase === 'marking' && normalized ? (
                          <Text style={[styles.flag, styles.faint]}>Awaiting mark…</Text>
                        ) : null}
                        {(() => {
                          if (!normalized || forcedInvalid) return null
                          const cellDisputes = (disputes ?? []).filter(
                            (d) => d.target_player_id === player.id && d.category === category
                          )
                          const disputeCount = cellDisputes.length
                          const iDisputedThis = cellDisputes.some((d) => d.challenger_id === myPlayerId)

                          if (hostReview && disputeCount > 0) {
                            return (
                              <Text style={[styles.flag, styles.bold, { color: ORANGE }]}>
                                ⚑ {disputeCount} dispute{disputeCount !== 1 ? 's' : ''}
                              </Text>
                            )
                          }

                          if (showDisputeButtons && player.id !== myPlayerId) {
                            return (
                              <Pressable
                                style={[styles.disputeBtn, iDisputedThis && styles.disputeBtnActive]}
                                onPress={() => onDispute?.(player.id, category)}
                              >
                                <Text
                                  style={[styles.disputeBtnText, iDisputedThis && styles.disputeBtnTextActive]}
                                >
                                  {iDisputedThis
                                    ? `⚑ Disputed${disputeCount > 1 ? ` (${disputeCount})` : ''}`
                                    : disputeCount > 0
                                      ? `⚑ Dispute (${disputeCount})`
                                      : '⚑ Dispute'}
                                </Text>
                              </Pressable>
                            )
                          }

                          if (!showDisputeButtons && !hostReview && disputeCount > 0) {
                            return (
                              <Text style={[styles.flag, styles.bold, { color: ORANGE }]}>
                                ⚑ {disputeCount} dispute{disputeCount !== 1 ? 's' : ''}
                              </Text>
                            )
                          }

                          return null
                        })()}
                        {showScores ? (
                          <Text
                            style={[
                              styles.flag,
                              styles.bold,
                              { color: reasonColor(reason, points) },
                            ]}
                          >
                            {points}/{NPAT_CATEGORY_POINTS} · {scoreReasonLabel(reason)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  )
                })}

                {showScores ? (
                  <View style={[styles.cell, styles.roundCol]}>
                    <Text style={[styles.roundTotal, styles.right]}>{roundTotal ?? '—'}</Text>
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      </ScrollView>
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
      padding: 14,
      gap: 10,
      marginTop: 16,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    labelCaps: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    letterBadge: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: '#0ea5e9',
      alignItems: 'center',
      justifyContent: 'center',
    },
    letterBadgeText: { color: '#fff', fontWeight: '900', fontSize: 16 },
    subtext: { color: theme.textFaint, fontSize: 12 },
    tableInner: { paddingBottom: 4 },
    theadRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingBottom: 6,
    },
    th: { color: theme.textFaint, fontSize: 12, fontWeight: '700' },
    right: { textAlign: 'right' },
    center: { textAlign: 'center' },
    playerCol: { width: 130, paddingRight: 8 },
    catCol: { width: 116, paddingHorizontal: 6 },
    roundCol: { width: 56, paddingLeft: 6 },
    trow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      alignItems: 'flex-start',
    },
    trowMe: { backgroundColor: 'rgba(14,165,233,0.08)' },
    cell: { paddingVertical: 10 },
    nameLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
    nameText: { color: theme.text, fontWeight: '700', fontSize: 14 },
    youBadge: {
      borderRadius: 999,
      backgroundColor: 'rgba(14,165,233,0.15)',
      borderWidth: 1,
      borderColor: 'rgba(14,165,233,0.35)',
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    youBadgeText: { fontSize: 10, fontWeight: '800', color: '#0284c7' },
    statusText: { fontSize: 11, fontWeight: '700', marginTop: 2 },
    reviewerText: { color: theme.textFaint, fontSize: 11, marginTop: 2 },
    answerText: { color: theme.text, fontWeight: '600', fontSize: 14 },
    flagStack: { marginTop: 3, gap: 2 },
    flag: { fontSize: 11, fontWeight: '600' },
    bold: { fontWeight: '800' },
    emerald: { color: theme.success },
    muted: { color: theme.textMuted },
    faint: { color: theme.textFaint },
    roundTotal: { color: theme.text, fontWeight: '900', fontSize: 15 },
    overrideRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
    overrideBtn: {
      flex: 1,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      paddingVertical: 4,
      alignItems: 'center',
    },
    overrideBtnValid: { borderColor: EMERALD, backgroundColor: 'rgba(5,150,105,0.15)' },
    overrideBtnInvalid: { borderColor: AMBER, backgroundColor: 'rgba(217,119,6,0.15)' },
    overrideBtnText: { fontSize: 11, fontWeight: '800', color: theme.textMuted },
    overrideBtnTextValid: { color: EMERALD },
    overrideBtnTextInvalid: { color: AMBER },
    disputeBtn: {
      alignSelf: 'flex-start',
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      marginTop: 2,
    },
    disputeBtnActive: { borderColor: ORANGE, backgroundColor: 'rgba(249,115,22,0.15)' },
    disputeBtnText: { fontSize: 11, fontWeight: '700', color: theme.textFaint },
    disputeBtnTextActive: { color: ORANGE },
  })
