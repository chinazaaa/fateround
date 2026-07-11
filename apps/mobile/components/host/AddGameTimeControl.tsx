import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { postExtendMonopolyTime, postExtendScrabbleTime } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

// Mirrors web src/lib/monopoly.ts / scrabble.ts — both games share the same
// options (+10 / +15 / +30 min) and 4-hour cap. Server clamps to these values.
const EXTENSION_OPTIONS = [600, 900, 1800] as const
const MAX_GAME_DURATION_SECONDS = 14_400

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return 'No limit'
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 === 1 ? '' : 's'}`
  return `${Math.round(seconds / 60)} min`
}

/**
 * Host control to add time to a timed Monopoly or Scrabble game (mirrors web
 * MonopolyHostTimeExtension / ScrabbleHostTimeExtension). Renders nothing unless
 * the game is active and has a game-duration cap set.
 */
export function AddGameTimeControl({
  gameCode,
  hostToken,
  game,
  onExtended,
}: {
  gameCode: string
  hostToken: string
  game: Pick<Game, 'status' | 'game_type' | 'game_duration_seconds'>
  onExtended: () => void | Promise<unknown>
}) {
  const styles = useThemedStyles(makeStyles)
  const [extending, setExtending] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const duration = game.game_duration_seconds ?? 0
  const isScrabble = game.game_type === 'scrabble'
  const supported = game.game_type === 'monopoly' || isScrabble
  if (!supported || game.status !== 'active' || duration <= 0) return null

  const remainingCapacity = MAX_GAME_DURATION_SECONDS - duration
  const atMax = remainingCapacity <= 0

  const addTime = async (extensionSeconds: number) => {
    if (extending != null) return
    setExtending(extensionSeconds)
    setError(null)
    try {
      if (isScrabble) await postExtendScrabbleTime(gameCode, hostToken, extensionSeconds)
      else await postExtendMonopolyTime(gameCode, hostToken, extensionSeconds)
      await onExtended()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add time')
    } finally {
      setExtending(null)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Add game time</Text>
      <View style={styles.row}>
        {EXTENSION_OPTIONS.map((seconds) => {
          const disabled = extending != null || seconds > remainingCapacity
          return (
            <Pressable
              key={seconds}
              disabled={disabled}
              onPress={() => void addTime(seconds)}
              style={[styles.btn, disabled && styles.btnDisabled]}
            >
              <Text style={styles.btnText}>
                {extending === seconds ? 'Adding…' : `+${formatDuration(seconds)}`}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {atMax ? <Text style={styles.note}>Maximum game length reached.</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    label: {
      color: theme.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    btn: {
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: theme.bg,
    },
    btnDisabled: { opacity: 0.4 },
    btnText: { color: theme.text, fontSize: 13, fontWeight: '700' },
    note: { color: theme.textMuted, fontSize: 11 },
    error: { color: '#ef4444', fontSize: 12 },
  })
