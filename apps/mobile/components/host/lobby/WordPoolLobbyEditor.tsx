import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game, GameType } from '@fateround/shared'
import { CustomContentPanel } from '@/components/create/CustomContentPanel'
import {
  customContentPayload,
  customContentStateFromGame,
  supportsCustomContent,
  validateCustomContent,
  type CustomContentState,
} from '@/lib/create-settings/custom-content'
import { postDescribeItWords, postLobbyPool, postQuickDrawWords } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

/** Every game with a host-editable word/question pool (platform / library / your own). */
export function supportsLobbyWordPool(gameType: GameType): boolean {
  return supportsCustomContent(gameType)
}

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  onSaved: () => void
}

export function WordPoolLobbyEditor({ gameCode, hostToken, game, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles)
  const gameType = game.game_type
  const [custom, setCustom] = useState<CustomContentState>(() => customContentStateFromGame(game))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const roundsCount = game.rounds_count ?? 1

  const save = async () => {
    if (saving) return
    const validationError = validateCustomContent(gameType, custom, roundsCount)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      const payload = customContentPayload(gameType, custom)
      if (gameType === 'describe_it' || gameType === 'quick_draw') {
        // These persist their word pool via a dedicated /settings route (newline words).
        const words = Array.isArray(payload.custom_questions)
          ? (payload.custom_questions as string[]).join('\n')
          : ''
        if (gameType === 'describe_it') await postDescribeItWords(gameCode, hostToken, words)
        else await postQuickDrawWords(gameCode, hostToken, words)
      } else {
        await postLobbyPool(gameCode, hostToken, payload)
      }
      setSavedMsg('Saved')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the pool')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <CustomContentPanel
        gameType={gameType}
        custom={custom}
        roundsCount={roundsCount}
        onChange={(patch) => {
          setCustom((prev) => ({ ...prev, ...patch }))
          setSavedMsg(null)
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>{savedMsg ?? 'Save pool'}</Text>
        )}
      </Pressable>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.sm },
  error: { color: theme.error, fontSize: 13 },
  save: {
    backgroundColor: theme.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.5 },
})
