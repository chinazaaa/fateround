import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { WhoSaidThisCreatePanel } from '@/components/create/WhoSaidThisCreatePanel'
import {
  validateWstCreate,
  wstCreateStateFromGame,
  wstLobbySourcePayload,
  type WstCreateState,
} from '@/lib/create-settings/who-said-this'
import { postLobbyPool } from '@/lib/game-api'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  hostToken: string
  game: Game
  onSaved: () => void
}

/**
 * Lobby-side Who Said This question-source editor (mobile parallel of web's PlayAgainSetup WST
 * block). Reuses the create-flow source picker so the host can switch Players submit / Platform /
 * Library / your own CSV between plays, then persists via the shared lobby-pool route.
 */
export function WstSourceLobbyEditor({ gameCode, hostToken, game, onSaved }: Props) {
  const styles = useThemedStyles(makeStyles)
  const [wst, setWst] = useState<WstCreateState>(() => wstCreateStateFromGame(game))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)

  const save = async () => {
    if (saving) return
    const validationError = validateWstCreate(wst)
    if (validationError) {
      setError(validationError)
      return
    }
    setSaving(true)
    setError(null)
    setSavedMsg(null)
    try {
      await postLobbyPool(gameCode, hostToken, wstLobbySourcePayload(wst))
      setSavedMsg('Saved')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the question source')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.wrap}>
      <WhoSaidThisCreatePanel
        wst={wst}
        onChange={(patch) => {
          setWst((prev) => ({ ...prev, ...patch }))
          setSavedMsg(null)
          setError(null)
        }}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveText}>{savedMsg ?? 'Save questions'}</Text>
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
