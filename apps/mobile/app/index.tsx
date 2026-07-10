import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { normalizeGameCode } from '@fateround/shared'

export default function HomeScreen() {
  const router = useRouter()
  const [gameCode, setGameCode] = useState('')

  const onJoin = () => {
    const code = normalizeGameCode(gameCode)
    if (code.length < 4) return
    router.push(`/game/${code}`)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>Fate Round</Text>
      <Text style={styles.subtitle}>Join a party game with a code — no sign-in required.</Text>

      <TextInput
        style={styles.input}
        placeholder="Game code"
        placeholderTextColor="#6b7280"
        value={gameCode}
        onChangeText={(value) => setGameCode(value.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
      />

      <Pressable
        style={[styles.button, gameCode.trim().length < 4 && styles.buttonDisabled]}
        onPress={onJoin}
        disabled={gameCode.trim().length < 4}
      >
        <Text style={styles.buttonText}>Join game</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    padding: 24,
    justifyContent: 'center',
    gap: 12,
  },
  brand: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
})
