import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { Game } from '@fateround/shared'
import { allowLatePlayers } from '@fateround/shared/viewers'
import type { LateJoinContext } from '@/lib/late-join-context'
import { gameLabel } from '@/lib/mobile-registry'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { GameRulesLink } from '@/components/ui/GameRulesLink'

type Props = {
  gameCode: string
  game: Pick<Game, 'title' | 'game_type' | 'allow_viewers' | 'allow_late_players' | 'codewords_late_join'>
  context?: LateJoinContext | null
  contextLoading?: boolean
  nameInput: string
  onNameChange: (name: string) => void
  joining: boolean
  error: string | null
  onJoinAsViewer: () => void
  onJoinAsPlayer: () => void
}

export function LateJoinChoiceScreen({
  gameCode,
  game,
  context = null,
  contextLoading = false,
  nameInput,
  onNameChange,
  joining,
  error,
  onJoinAsViewer,
  onJoinAsPlayer,
}: Props) {
  const playersAllowed = allowLatePlayers(game)
  const canJoin = nameInput.trim().length > 0
  const label = gameLabel(game.game_type)

  return (
    <KeyboardFormScreen contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🎮</Text>
        <Text style={styles.title}>{game.title}</Text>
        <Text style={styles.badge}>{label}</Text>
        <GameRulesLink gameType={game.game_type} variant="subtle" />

        <Text style={styles.heading}>Game in progress</Text>
        {contextLoading ? (
          <ActivityIndicator color="#f43f5e" style={styles.loader} />
        ) : context ? (
          <>
            <Text style={styles.statusLine}>{context.statusLine}</Text>
            <Text style={styles.body}>
              {playersAllowed
                ? 'This game has already started. Watch without playing, or join now as a player.'
                : 'This game allows late joiners to watch only — you can join the live session as a viewer.'}
            </Text>
          </>
        ) : (
          <Text style={styles.body}>
            {playersAllowed
              ? 'This game has already started. Watch without playing, or join now as a player.'
              : 'This game allows late joiners to watch only.'}
          </Text>
        )}

        <Text style={styles.fieldLabel}>Your name</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter your name"
          placeholderTextColor="#6b7280"
          value={nameInput}
          onChangeText={onNameChange}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={40}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {playersAllowed ? (
          <View style={styles.actions}>
            <View style={styles.actionCol}>
              <Pressable
                style={[styles.secondaryButton, (joining || !canJoin) && styles.buttonDisabled]}
                onPress={onJoinAsViewer}
                disabled={joining || !canJoin}
              >
                <Text style={styles.secondaryButtonText}>{joining ? 'Joining…' : 'Join as viewer'}</Text>
              </Pressable>
              {context ? <Text style={styles.detail}>{context.viewerDetail}</Text> : null}
            </View>
            <View style={styles.actionCol}>
              <Pressable
                style={[styles.primaryButton, (joining || !canJoin) && styles.buttonDisabled]}
                onPress={onJoinAsPlayer}
                disabled={joining || !canJoin}
              >
                <Text style={styles.primaryButtonText}>{joining ? 'Joining…' : 'Join as player'}</Text>
              </Pressable>
              {context ? <Text style={styles.detail}>{context.playerDetail}</Text> : null}
            </View>
          </View>
        ) : (
          <View style={styles.actionCol}>
            <Pressable
              style={[styles.primaryButton, (joining || !canJoin) && styles.buttonDisabled]}
              onPress={onJoinAsViewer}
              disabled={joining || !canJoin}
            >
              <Text style={styles.primaryButtonText}>{joining ? 'Joining…' : 'Join to watch'}</Text>
            </Pressable>
            {context ? <Text style={styles.detail}>{context.viewerDetail}</Text> : null}
          </View>
        )}

        <Text style={styles.codeLabel}>Game code</Text>
        <Text style={styles.code}>{gameCode.toUpperCase()}</Text>
      </View>
    </KeyboardFormScreen>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0b0f',
    padding: 24,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#17171d',
    borderRadius: 16,
    padding: 24,
    gap: 10,
    alignItems: 'stretch',
  },
  emoji: {
    fontSize: 40,
    textAlign: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  badge: {
    color: '#fda4af',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  heading: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  statusLine: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    color: '#9ca3af',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  loader: {
    marginVertical: 8,
  },
  fieldLabel: {
    color: '#9ca3af',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#0b0b0f',
    borderColor: '#2a2a35',
    borderWidth: 1,
    borderRadius: 12,
    color: '#fff',
    fontSize: 17,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: {
    color: '#fb7185',
    fontSize: 14,
    textAlign: 'center',
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  actionCol: {
    gap: 6,
  },
  primaryButton: {
    backgroundColor: '#f43f5e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#2a2a35',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  detail: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
  codeLabel: {
    color: '#6b7280',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 12,
  },
  code: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 3,
    textAlign: 'center',
  },
})
