import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native'
import { ShareGameCard } from '@/components/session/ShareGameCard'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

type Props = {
  gameCode: string
  joinName: string
  joining: boolean
  error: string | null
  onChangeName: (value: string) => void
  onJoin: () => void
}

export function JoinScreen({ gameCode, joinName, joining, error, onChangeName, onJoin }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  return (
    <KeyboardFormScreen contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Join game</Text>
      <Text style={styles.code}>{gameCode}</Text>
      <Text style={styles.hint}>No account needed — enter a display name and play.</Text>

      <TextInput
        style={styles.input}
        placeholder="Your name"
        placeholderTextColor={theme.textFaint}
        value={joinName}
        onChangeText={onChangeName}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={50}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.button, joining && styles.buttonDisabled]} onPress={onJoin} disabled={joining}>
        {/* White spinner on the solid rose button — correct in both schemes. */}
        {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join game</Text>}
      </Pressable>

      <ShareGameCard gameCode={gameCode} />
    </KeyboardFormScreen>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.bg,
      padding: 24,
      justifyContent: 'center',
      gap: 12,
    },
    kicker: {
      color: theme.textMuted,
      fontSize: 14,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    code: {
      color: theme.text,
      fontSize: 36,
      fontWeight: '700',
      letterSpacing: 4,
    },
    hint: {
      color: theme.textMuted,
      fontSize: 15,
      marginBottom: 8,
    },
    input: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      color: theme.text,
      fontSize: 18,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    error: {
      color: theme.error,
      fontSize: 14,
    },
    button: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      // White on the solid rose button — correct in both schemes.
      color: '#fff',
      fontSize: 17,
      fontWeight: '600',
    },
  })
