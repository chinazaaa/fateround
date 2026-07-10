import { useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { GameType } from '@fateround/shared'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { createGame } from '@/lib/game-api'
import { WEB_BASE_URL } from '@/lib/config'
import { gameLabel, MOBILE_SUPPORTED_GAMES } from '@/lib/mobile-registry'
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

  const openWebCreate = () => {
    void Linking.openURL(`${WEB_BASE_URL}/create`)
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardFormScreen contentContainerStyle={styles.container}>
        <Pressable style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.heading}>Create a game</Text>
        <Text style={styles.subtitle}>Pick a game type and share the code — no sign-in required.</Text>

        <Text style={styles.label}>Game title</Text>
        <TextInput
          style={styles.input}
          placeholder="Friday game night"
          placeholderTextColor="#6b7280"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
          autoCapitalize="sentences"
          autoCorrect={false}
        />

        <Text style={styles.label}>Game type</Text>
        <View style={styles.typeList}>
          {NATIVE_CREATABLE_GAMES.map((type) => {
            const selected = type === gameType
            return (
              <Pressable
                key={type}
                style={[styles.typeChip, selected && styles.typeChipSelected]}
                onPress={() => setGameType(type)}
              >
                <Text style={[styles.typeChipText, selected && styles.typeChipTextSelected]}>
                  {gameLabel(type)}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.createBtn, (creating || !title.trim()) && styles.createBtnDisabled]}
          onPress={() => void onCreate()}
          disabled={creating || !title.trim()}
        >
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createBtnText}>Create & host</Text>
          )}
        </Pressable>

        <Pressable style={styles.webLink} onPress={openWebCreate}>
          <Text style={styles.webLinkText}>More setup options (participants, custom questions)</Text>
        </Pressable>

        {MOBILE_SUPPORTED_GAMES.length > NATIVE_CREATABLE_GAMES.length ? (
          <Text style={styles.hint}>
            Some game types need extra setup — use the web create flow for those.
          </Text>
        ) : null}
      </KeyboardFormScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0f' },
  container: { padding: 24, gap: 12, paddingBottom: 40 },
  back: { alignSelf: 'flex-start', marginBottom: 8 },
  backText: { color: '#fda4af', fontSize: 16, fontWeight: '600' },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800' },
  subtitle: { color: '#9ca3af', fontSize: 15, lineHeight: 22, marginBottom: 8 },
  label: { color: '#d1d5db', fontSize: 14, fontWeight: '600', marginTop: 4 },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  typeList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2a2a35',
    backgroundColor: '#17171d',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipSelected: { borderColor: '#f43f5e', backgroundColor: '#3f1d2b' },
  typeChipText: { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  typeChipTextSelected: { color: '#fff' },
  error: { color: '#f87171', fontSize: 14 },
  createBtn: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  webLink: { paddingVertical: 12, alignItems: 'center' },
  webLinkText: { color: '#9ca3af', fontSize: 13, textDecorationLine: 'underline', textAlign: 'center' },
  hint: { color: '#6b7280', fontSize: 12, lineHeight: 18, textAlign: 'center' },
})
