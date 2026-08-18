import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput } from 'react-native'
import { normalizeGameCode } from '@fateround/shared'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import { resumePlayerByCode } from '@/lib/api'
import { getRememberedName, rememberName } from '@/lib/identity-local'
import { setPlayerSession } from '@/lib/secure-session'
import { notifyPlayerSessionChanged } from '@/lib/session-events'
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
  /** When the lobby is full, pairs with `onJoinAsViewer` to offer a "Watch instead" button. */
  lobbyFull?: boolean
  onJoinAsViewer?: () => void
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
  lobbyFull = false,
  onJoinAsViewer,
}: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [resumeOpen, setResumeOpen] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)

  // Prefill the name this device used last time so a returning player doesn't retype it
  // in every game (see `docs/accounts-and-identity-plan.md` §5, Slice 1). This screen is
  // shared by every game view, so wiring it here covers all of them at once.
  // Weakest source by design: it never overwrites a name the parent already resolved
  // (an existing session, a room, a tournament link) — hence the re-check on the latest
  // value once the async read returns.
  const joinNameRef = useRef(joinName)
  joinNameRef.current = joinName
  const prefilledRef = useRef(false)
  useEffect(() => {
    if (prefilledRef.current) return
    prefilledRef.current = true
    let cancelled = false
    void getRememberedName().then((remembered) => {
      if (cancelled || !remembered || joinNameRef.current.trim()) return
      onChangeName(remembered)
    })
    return () => {
      cancelled = true
    }
    // Mount-only: a prefill that fired later would fight the player's own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Remember on submit rather than on success — the parent owns the result, and a name
  // rejected as "already taken" is still this player's name, so it's still worth keeping.
  const submitJoin = (join: () => void) => {
    void rememberName(joinName)
    join()
  }

  const resume = async () => {
    const trimmed = codeInput.trim()
    if (!trimmed) {
      setResumeError('Enter your player code')
      return
    }
    setResuming(true)
    setResumeError(null)
    try {
      const code = normalizeGameCode(gameCode)
      const data = await resumePlayerByCode(code, trimmed)
      await setPlayerSession(code, data.playerId, data.playerName, data.playerGender, data.resumeToken)
      // The view's bootstrap subscribes to session changes and reloads into the game.
      notifyPlayerSessionChanged(code)
    } catch (err) {
      setResumeError(err instanceof Error ? err.message : 'Could not find that player code')
    } finally {
      setResuming(false)
    }
  }
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

      <Pressable
        style={[styles.button, joining && styles.buttonDisabled]}
        onPress={() => submitJoin(onJoin)}
        disabled={joining}
      >
        {/* White spinner on the solid rose button — correct in both schemes. */}
        {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{submitLabel}</Text>}
      </Pressable>

      {lobbyFull && onJoinAsViewer ? (
        <>
          <Text style={styles.watchNote}>This game is full — all seats are taken. You can still watch.</Text>
          <Pressable
            style={[styles.watchButton, joining && styles.buttonDisabled]}
            onPress={() => submitJoin(onJoinAsViewer)}
            disabled={joining}
          >
            <Text style={styles.watchButtonText}>Watch instead</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable style={styles.resumeToggle} onPress={() => setResumeOpen((v) => !v)} hitSlop={8}>
        <Text style={styles.resumeToggleText}>
          {resumeOpen ? 'Hide player code' : 'Already joined? Enter your player code'}
        </Text>
      </Pressable>

      {resumeOpen ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="Your player code"
            placeholderTextColor={theme.textFaint}
            value={codeInput}
            onChangeText={setCodeInput}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={40}
          />
          {resumeError ? <Text style={styles.error}>{resumeError}</Text> : null}
          <Pressable
            style={[styles.watchButton, resuming && styles.buttonDisabled]}
            onPress={() => void resume()}
            disabled={resuming}
          >
            {resuming ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={styles.watchButtonText}>Continue as my player</Text>
            )}
          </Pressable>
        </>
      ) : null}

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
      fontSize: theme.type.label.size,
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
      fontSize: theme.type.body.size,
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
      fontSize: theme.type.label.size,
    },
    resumeToggle: {
      alignSelf: 'center',
      paddingVertical: 8,
      marginTop: 4,
    },
    resumeToggleText: {
      color: theme.primaryMuted,
      fontSize: theme.type.label.size,
      fontWeight: '600',
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
      fontSize: theme.type.section.size,
      fontWeight: '600',
    },
    watchNote: {
      color: theme.textMuted,
      fontSize: 13,
      textAlign: 'center',
      marginTop: 4,
    },
    watchButton: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
    },
    watchButtonText: {
      color: theme.text,
      fontSize: 16,
      fontWeight: '600',
    },
  })
