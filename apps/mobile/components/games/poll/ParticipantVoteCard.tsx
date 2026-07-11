import { Image, Pressable, StyleSheet, Text, View } from 'react-native'
import type { GameType, Participant, VoteSlot } from '@fateround/shared'
import { pollCategoryMeta, type PollVoteCategory } from '@/components/games/poll/vote-meta'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Maps a vote slot ('kill') to its metadata category ('smash'). */
function slotCategory(slot: VoteSlot): PollVoteCategory {
  return slot === 'kill' ? 'smash' : slot
}

/**
 * A person's photo card on the voting screen. Mirrors web ParticipantPhotoCard:
 * a large 3:4 photo (or labeled silhouette placeholder), the name, the chosen
 * action label, and one button per vote slot. Used by the people-poll voting
 * grids (Smash or Pass, Red/Green Flag, Parent Approval, Smash Marry Kill).
 */
export function ParticipantVoteCard({
  gameType,
  participant,
  slots,
  action,
  onAssign,
  disabled,
  disabledSlots = [],
}: {
  gameType: GameType
  participant: Participant
  slots: VoteSlot[]
  action: VoteSlot | null
  onAssign: (slot: VoteSlot) => void
  disabled: boolean
  disabledSlots?: VoteSlot[]
}) {
  const styles = useThemedStyles(makeStyles)
  const activeMeta = action ? pollCategoryMeta(gameType, slotCategory(action)) : null

  return (
    <View style={[styles.card, activeMeta ? { borderColor: activeMeta.color } : null]}>
      {participant.photo_url ? (
        <Image source={{ uri: participant.photo_url }} style={styles.photo} resizeMode="cover" />
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderInitial}>
            {participant.name.trim().charAt(0).toUpperCase() || '?'}
          </Text>
          <Text style={styles.placeholderName} numberOfLines={1}>
            {participant.name}
          </Text>
        </View>
      )}

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {participant.name}
        </Text>
        {activeMeta ? (
          <Text style={[styles.actionLabel, { color: activeMeta.color }]}>
            {activeMeta.emoji} {activeMeta.label}
          </Text>
        ) : null}

        <View style={styles.buttonRow}>
          {slots.map((slot) => {
            const meta = pollCategoryMeta(gameType, slotCategory(slot))
            const selected = action === slot
            const slotDisabled = disabled || disabledSlots.includes(slot)
            return (
              <Pressable
                key={slot}
                style={[
                  styles.button,
                  selected && { borderColor: meta.color, backgroundColor: meta.color + '22' },
                  slotDisabled && !selected && styles.buttonDisabled,
                ]}
                disabled={slotDisabled}
                onPress={() => onAssign(slot)}
              >
                <Text
                  style={[styles.buttonText, selected && { color: meta.color, fontWeight: '800' }]}
                  numberOfLines={1}
                >
                  {meta.emoji} {meta.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      flex: 1,
      minWidth: 150,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      overflow: 'hidden',
    },
    photo: { width: '100%', aspectRatio: 3 / 4 },
    placeholder: {
      width: '100%',
      aspectRatio: 3 / 4,
      backgroundColor: theme.bg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    placeholderInitial: { color: theme.textMuted, fontSize: 44, fontWeight: '900' },
    placeholderName: {
      color: theme.textFaint,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 1,
      paddingHorizontal: 8,
    },
    body: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 6 },
    name: { color: theme.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    actionLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
    buttonRow: { flexDirection: 'row', gap: 6 },
    button: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.4 },
    buttonText: { color: theme.textMuted, fontSize: 11, fontWeight: '700' },
  })
