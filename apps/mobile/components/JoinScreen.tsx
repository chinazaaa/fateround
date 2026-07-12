import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native'
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
  /** Overrides the "Join game" kicker (e.g. "Watch game" for viewer joins). */
  kicker?: string
  /** Overrides the sub-code hint line. */
  hint?: string
  /** Overrides the submit button label (e.g. "Join as viewer"). */
  submitLabel?: string
  /** Optional extra content under the form (e.g. a "How to play" rules link). */
  footer?: ReactNode
  /** Optional settings chips (theme / difficulty / time) shown under the hint. */
  infoChips?: ReactNode
}

export function JoinScreen({
  gameCode,
  joinName,
  joining,
  error,
  onChangeName,
  onJoin,
  kicker = 'Join game',
  hint = 'No account needed — enter a display name and play.',
  submitLabel = 'Join game',
  footer,
  infoChips,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  return (
    <KeyboardFormScreen contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.code}>{gameCode}</Text>
      <Text style={styles.hint}>{hint}</Text>

      {infoChips}

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
        {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
      </Pressable>

      {footer}
    </KeyboardFormScreen>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      // Not flex:1 — that sets flexBasis:0 on the scroll's content container,
      // pinning it to the scroll height so it can't scroll and the centered form
      // collapses when the keyboard shrinks the area. flexGrow:1 (from
      // KeyboardFormScreen) + justifyContent centers when it fits, scrolls when not.
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
