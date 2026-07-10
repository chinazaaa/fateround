import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native'
import { ShareGameCard } from '@/components/session/ShareGameCard'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'

type Props = {
  gameCode: string
  joinName: string
  joining: boolean
  error: string | null
  onChangeName: (value: string) => void
  onJoin: () => void
}

export function JoinScreen({ gameCode, joinName, joining, error, onChangeName, onJoin }: Props) {
  return (
    <KeyboardFormScreen contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Join game</Text>
      <Text style={styles.code}>{gameCode}</Text>
      <Text style={styles.hint}>No account needed — enter a display name and play.</Text>

      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor="#6b7280"
        value={joinName}
        onChangeText={onChangeName}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={50}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.button, joining && styles.buttonDisabled]} onPress={onJoin} disabled={joining}>
        {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join game</Text>}
      </Pressable>

      <ShareGameCard gameCode={gameCode} />
    </KeyboardFormScreen>
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
  kicker: {
    color: '#9ca3af',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  code: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
  },
  hint: {
    color: '#9ca3af',
    fontSize: 15,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: '#fb7185',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
})
