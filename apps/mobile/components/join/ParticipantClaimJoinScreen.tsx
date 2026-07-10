import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Game, Participant, Player } from '@fateround/shared'
import { claimedParticipantIds } from '@fateround/shared/participant-mode'
import { ShareGameCard } from '@/components/session/ShareGameCard'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'

type Props = {
  gameCode: string
  game: Game
  participants: Participant[]
  players: Player[]
  joining: boolean
  error: string | null
  hint?: string
  onJoin: (participantId: string, name: string) => void
}

export function ParticipantClaimJoinScreen({
  gameCode,
  game,
  participants,
  players,
  joining,
  error,
  hint = 'Select your name from the list',
  onJoin,
}: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const claimed = useMemo(() => claimedParticipantIds(players), [players])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return participants
      .filter((p) => !claimed.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
  }, [claimed, participants, query])

  const selected = selectedId ? participants.find((p) => p.id === selectedId) : undefined

  return (
    <KeyboardFormScreen contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Join game</Text>
      <Text style={styles.title}>{game.title || 'Game'}</Text>
      <Text style={styles.code}>{gameCode}</Text>
      <Text style={styles.hint}>{hint}</Text>

      <TextInput
        style={styles.input}
        placeholder="Search your name…"
        placeholderTextColor="#6b7280"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        autoCorrect={false}
      />

      <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
        {options.length === 0 ? (
          <Text style={styles.empty}>
            {participants.length === 0
              ? 'Waiting for the host to add names…'
              : claimed.size >= participants.length
                ? 'All names have been claimed'
                : 'No names match your search'}
          </Text>
        ) : (
          options.map((p) => {
            const active = selectedId === p.id
            return (
              <Pressable
                key={p.id}
                style={[styles.row, active && styles.rowActive]}
                onPress={() => setSelectedId(p.id)}
              >
                <Text style={styles.rowName}>{p.name}</Text>
                {active ? <Text style={styles.rowCheck}>✓</Text> : null}
              </Pressable>
            )
          })
        )}
      </ScrollView>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, (!selected || joining) && styles.buttonDisabled]}
        onPress={() => selected && onJoin(selected.id, selected.name)}
        disabled={!selected || joining}
      >
        {joining ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{selected ? `Join as ${selected.name}` : 'Select your name'}</Text>
        )}
      </Pressable>

      <ShareGameCard gameCode={gameCode} />
    </KeyboardFormScreen>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0b0b0f',
    padding: 24,
    gap: 10,
    paddingBottom: 32,
  },
  kicker: {
    color: '#9ca3af',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  code: {
    color: '#fda4af',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
  },
  hint: {
    color: '#9ca3af',
    fontSize: 15,
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#17171d',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listScroll: {
    maxHeight: 280,
    width: '100%',
  },
  listContent: {
    gap: 8,
    paddingVertical: 4,
  },
  empty: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#17171d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a35',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowActive: {
    borderColor: '#f43f5e',
    backgroundColor: '#3f1d2b',
  },
  rowName: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  rowCheck: {
    color: '#fda4af',
    fontSize: 18,
    fontWeight: '800',
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
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
})
