import { useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { GameType } from '@fateround/shared'
import { GameTypePicker } from '@/components/create/GameTypePicker'
import { AmbientBackground } from '@/components/ui/AmbientBackground'
import { AppButton } from '@/components/ui/AppButton'
import { FormField } from '@/components/ui/FormField'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import { theme } from '@/constants/theme'
import { createGame } from '@/lib/game-api'
import { WEB_BASE_URL } from '@/lib/config'
import { NATIVE_CREATABLE_GAMES } from '@/lib/native-create'
import { setHostToken } from '@/lib/secure-session'

export default function CreateScreen() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [gameType, setGameType] = useState<GameType>(NATIVE_CREATABLE_GAMES[0] ?? 'trivia')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCreate = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Enter a game title')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const { gameCode, hostToken } = await createGame({ title: trimmed, gameType })
      await setHostToken(gameCode, hostToken)
      router.replace(`/host/${gameCode}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create game')
    } finally {
      setCreating(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AmbientBackground />
      <KeyboardFormScreen contentContainerStyle={styles.container}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Text style={styles.backText}>← Home</Text>
        </Pressable>

        <View style={styles.hero}>
          <Text style={styles.kicker}>Host a room</Text>
          <Text style={styles.heading}>Create a game</Text>
          <Text style={styles.subtitle}>Pick a game, share the code, and start when everyone's in.</Text>
        </View>

        <SurfaceCard>
          <FormField
            label="Game title"
            hint="Shown in the lobby — e.g. Friday night trivia"
            value={title}
            onChangeText={setTitle}
            placeholder="Friday game night"
            maxLength={100}
            autoCapitalize="sentences"
            autoCorrect={false}
          />
        </SurfaceCard>

        <View style={styles.typeSection}>
          <Text style={styles.typeHeading}>Game type</Text>
          <GameTypePicker options={NATIVE_CREATABLE_GAMES} value={gameType} onChange={setGameType} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton
          label="Create & host"
          onPress={() => void onCreate()}
          loading={creating}
          disabled={!title.trim()}
        />

        <Pressable style={styles.webLink} onPress={() => void Linking.openURL(`${WEB_BASE_URL}/create`)}>
          <Text style={styles.webLinkText}>Need custom questions or participant lists?</Text>
          <Text style={styles.webLinkAction}>Open full setup on web →</Text>
        </Pressable>
      </KeyboardFormScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: {
    paddingHorizontal: theme.space.lg,
    paddingBottom: 40,
    gap: theme.space.lg,
  },
  back: { alignSelf: 'flex-start', marginTop: theme.space.xs },
  backText: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
  hero: {
    gap: theme.space.xs,
    paddingBottom: theme.space.xs,
  },
  kicker: {
    color: theme.primaryMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heading: {
    color: theme.text,
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 340,
  },
  typeSection: { gap: theme.space.sm },
  typeHeading: {
    color: theme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  error: {
    color: theme.error,
    fontSize: 14,
    textAlign: 'center',
  },
  webLink: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: theme.space.sm,
  },
  webLinkText: {
    color: theme.textFaint,
    fontSize: 13,
    textAlign: 'center',
  },
  webLinkAction: {
    color: theme.primaryMuted,
    fontSize: 14,
    fontWeight: '700',
  },
})
