import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { ParticipantGender, PlayerGender } from '@fateround/shared'
import { KeyboardFormScreen } from '@/components/ui/KeyboardFormScreen'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { joinGenderHint, playerGenderFromJoin } from '@/components/games/poll/gender'

type Props = {
  gameCode: string
  joinName: string
  joining: boolean
  error: string | null
  onChangeName: (value: string) => void
  onJoin: (gender: PlayerGender, identityGender: ParticipantGender, pollGender: ParticipantGender) => void
}

/** Join screen for gender-based poll games: name + "I am" + vote-on-both toggle. */
export function PollGenderJoinScreen({ gameCode, joinName, joining, error, onChangeName, onJoin }: Props) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [identity, setIdentity] = useState<ParticipantGender>('female')
  const [voteBoth, setVoteBoth] = useState(false)

  const canJoin = joinName.trim().length > 0

  return (
    <KeyboardFormScreen contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>Join game</Text>
      <Text style={styles.code}>{gameCode}</Text>
      <Text style={styles.hint}>Enter a display name, then tell us how you vote.</Text>

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

      <Text style={styles.label}>I am</Text>
      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentBtn, identity === 'female' && styles.segmentBtnActive]}
          onPress={() => setIdentity('female')}
        >
          <Text style={[styles.segmentText, identity === 'female' && styles.segmentTextActive]}>Female</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, identity === 'male' && styles.segmentBtnActive]}
          onPress={() => setIdentity('male')}
        >
          <Text style={[styles.segmentText, identity === 'male' && styles.segmentTextActive]}>Male</Text>
        </Pressable>
      </View>

      <Pressable style={styles.checkRow} onPress={() => setVoteBoth((v) => !v)}>
        <View style={[styles.checkbox, voteBoth && styles.checkboxOn]}>
          {voteBoth ? <Text style={styles.checkboxMark}>✓</Text> : null}
        </View>
        <View style={styles.checkTextWrap}>
          <Text style={styles.checkTitle}>Vote on both genders</Text>
          <Text style={styles.checkSub}>You&apos;ll vote on men&apos;s and women&apos;s rounds</Text>
        </View>
      </Pressable>

      <Text style={styles.genderHint}>{joinGenderHint(identity, voteBoth)}</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, (joining || !canJoin) && styles.buttonDisabled]}
        onPress={() => onJoin(playerGenderFromJoin(identity, voteBoth), identity, voteBoth ? identity : identity)}
        disabled={joining || !canJoin}
      >
        {/* White spinner/label on the solid rose button — correct in both schemes. */}
        {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join game</Text>}
      </Pressable>
    </KeyboardFormScreen>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      // flexGrow (from KeyboardFormScreen) not flex:1 — flex:1 pins the scroll
      // content to the viewport, so it can't scroll and centered content collapses
      // when the keyboard opens.
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
      textAlign: 'center',
    },
    code: { color: theme.text, fontSize: 34, fontWeight: '900', textAlign: 'center', letterSpacing: 4 },
    hint: { color: theme.textMuted, fontSize: 15, textAlign: 'center', marginBottom: 4 },
    input: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: theme.text,
      fontSize: 16,
    },
    label: { color: theme.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4 },
    segment: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 4,
      borderWidth: 1,
      borderColor: theme.border,
    },
    segmentBtn: { flex: 1, paddingVertical: 12, borderRadius: 9, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: theme.primary },
    segmentText: { color: theme.text, fontWeight: '700', fontSize: 15 },
    // white on the solid rose active segment — intentional
    segmentTextActive: { color: '#fff' },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxOn: { backgroundColor: theme.primary, borderColor: theme.primary },
    // white check on the solid rose box — intentional
    checkboxMark: { color: '#fff', fontWeight: '900', fontSize: 14 },
    checkTextWrap: { flex: 1, gap: 2 },
    checkTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
    checkSub: { color: theme.textMuted, fontSize: 12 },
    genderHint: { color: theme.textFaint, fontSize: 12, textAlign: 'center' },
    error: { color: '#fca5a5', textAlign: 'center' },
    button: {
      marginTop: 4,
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.5 },
    // white on the solid rose button — intentional
    buttonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  })
