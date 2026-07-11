import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { joinGame } from '@/lib/api'
import { setPlayerSession } from '@/lib/secure-session'

type Props = {
  gameCode: string
}

/** Lets the host join the same room as a player while keeping their host token. */
export function HostPlayAlongCard({ gameCode }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onJoin = async () => {
    const trimmed = name.trim()
    if (!trimmed || joining) return
    setJoining(true)
    setError(null)
    try {
      const data = await joinGame({ gameCode, playerName: trimmed })
      await setPlayerSession(
        gameCode,
        data.playerId,
        data.playerName,
        data.playerGender ?? 'both',
        data.resumeToken ?? null
      )
      router.push(`/game/${gameCode}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join')
    } finally {
      setJoining(false)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Play along</Text>
      <Text style={styles.hint}>Join this room as a player. Your host controls stay on this device via the Host button in the game.</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor="#6b7280"
        autoCapitalize="words"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (!name.trim() || joining) && styles.buttonDisabled]}
        disabled={!name.trim() || joining}
        onPress={() => void onJoin()}
      >
        <Text style={styles.buttonText}>{joining ? 'Joining…' : 'Join as player'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#17171d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2a2a35',
    padding: 16,
    gap: 10,
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  hint: { color: '#9ca3af', fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: '#0b0b0f',
    borderWidth: 1,
    borderColor: '#2a2a35',
    borderRadius: 10,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: '#f87171', fontSize: 13 },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
