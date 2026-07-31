import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { apiUrl } from '@/lib/config'
import { authHeaders, signOutIdentity } from '@/lib/identity'
import { requestEmailCode, verifyEmailCode, type EmailCodeFlow } from '@/lib/identity-auth'

type Profile = {
  handle: string | null
  is_anonymous: boolean
  current_streak: number
  trophy_points: number
}

/**
 * Mobile mirror of `src/components/profile/ProfileChip.tsx` — the "you" button on the home
 * screen (`docs/trophies-and-streaks.md` §2.5).
 *
 * Status label and way in, in one control: "Guest" tells a player their streak lives only on
 * this device, and tapping it is both the save door for a new player and the login door for a
 * returning one on a new phone.
 *
 * Never a gate — play stays instant and this never appears at lobby join. And nothing here
 * sells anything: mobile is read-only for entitlements, with no purchase UI and no link out to
 * a paywall.
 */
export function ProfileChip() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)

  // Never calls ensureServerIdentity(): rendering the home screen must not *create* an
  // identity, because anonymous sign-ins are rate-limited per IP and that budget belongs to
  // players who actually finish a game.
  const refresh = useCallback(async () => {
    try {
      const headers = await authHeaders()
      if (!headers) {
        setProfile(null)
        return
      }
      const res = await fetch(apiUrl('/api/profile/me'), { headers })
      if (!res.ok) return
      const data = await res.json()
      setProfile(data.profile ?? null)
    } catch {
      // Offline — fall back to the guest state.
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const signedIn = Boolean(profile && !profile.is_anonymous)
  // A guest reads "Guest", never their remembered name — the word is how they learn their
  // streak isn't saved anywhere.
  const label = signedIn ? profile?.handle || 'You' : 'Guest'
  const streak = profile?.current_streak ?? 0
  const trophies = profile?.trophy_points ?? 0

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={signedIn ? 'Your profile' : 'Save your progress'}
      >
        {/* Counters stay hidden until they mean something — "🔥 0 · 🏆 0" advertises
            emptiness. They appear on their own once the trophies batch ships. */}
        {streak > 0 ? <Text style={styles.chipMeta}>🔥 {streak}</Text> : null}
        {trophies > 0 ? <Text style={styles.chipMeta}>🏆 {trophies}</Text> : null}
        <Text style={styles.chipText}>{label}</Text>
      </Pressable>

      <SaveToProfileSheet
        visible={open}
        onClose={() => setOpen(false)}
        signedIn={signedIn}
        handle={profile?.handle ?? null}
        onChanged={() => void refresh()}
        theme={theme}
      />
    </>
  )
}

function SaveToProfileSheet({
  visible,
  onClose,
  signedIn,
  handle,
  onChanged,
  theme,
}: {
  visible: boolean
  onClose: () => void
  signedIn: boolean
  handle: string | null
  onChanged: () => void
  theme: Theme
}) {
  const styles = useThemedStyles(makeStyles)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [flow, setFlow] = useState<EmailCodeFlow>('signin')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Reset on close so reopening never shows a stale code step or error.
  useEffect(() => {
    if (visible) return
    setEmail('')
    setCode('')
    setStep('email')
    setBusy(false)
    setMessage(null)
  }, [visible])

  const sendCode = async () => {
    setBusy(true)
    setMessage(null)
    const result = await requestEmailCode(email)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error ?? 'Could not send the code. Try again.')
      return
    }
    // `flow` decides how the code is verified, so it has to survive to the next step.
    setFlow(result.flow)
    setStep('code')
  }

  const submitCode = async () => {
    setBusy(true)
    setMessage(null)
    const result = await verifyEmailCode(email, code, flow)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error ?? 'That code was not right. Try again.')
      return
    }
    onChanged()
    onClose()
  }

  const switchUser = async () => {
    await signOutIdentity()
    onChanged()
    onClose()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop taps inside the sheet from dismissing it. */}
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={styles.title}>{signedIn ? 'Your profile' : 'Save your progress'}</Text>
              <Pressable hitSlop={12} onPress={onClose}>
                <Text style={styles.close}>Done</Text>
              </Pressable>
            </View>

            <View style={styles.body}>
              {signedIn ? (
                <>
                  <Text style={styles.hint}>
                    Signed in as {handle || 'you'}. Your streak and trophies follow this account onto any device.
                  </Text>
                  <Pressable style={styles.secondaryBtn} onPress={() => void switchUser()}>
                    <Text style={styles.secondaryBtnText}>Not you? Switch</Text>
                  </Pressable>
                </>
              ) : step === 'email' ? (
                <>
                  <Text style={styles.hint}>
                    New here? We&apos;ll create your profile. Been here before? We&apos;ll load your trophies.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.textFaint}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                  />
                  {message ? <Text style={styles.error}>{message}</Text> : null}
                  <Pressable
                    style={[styles.primaryBtn, (busy || !email.trim()) && styles.btnDisabled]}
                    disabled={busy || !email.trim()}
                    onPress={() => void sendCode()}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Save to profile</Text>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.hint}>We emailed a 6-digit code to {email}.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="123456"
                    placeholderTextColor={theme.textFaint}
                    value={code}
                    onChangeText={setCode}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    maxLength={8}
                  />
                  {message ? <Text style={styles.error}>{message}</Text> : null}
                  <Pressable
                    style={[styles.primaryBtn, (busy || !code.trim()) && styles.btnDisabled]}
                    disabled={busy || !code.trim()}
                    onPress={() => void submitCode()}
                  >
                    {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirm</Text>}
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => setStep('email')}>
                    <Text style={styles.link}>Use a different email</Text>
                  </Pressable>
                </>
              )}
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 36,
      paddingHorizontal: 12,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
    },
    pressed: { opacity: 0.7 },
    chipText: { color: theme.text, fontSize: 14, fontWeight: '700' },
    chipMeta: { color: theme.textSecondary, fontSize: 13, fontWeight: '600' },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheetWrap: { width: '100%' },
    sheet: {
      backgroundColor: theme.bg,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderTopWidth: 1,
      borderColor: theme.border,
      paddingTop: theme.space.sm,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.space.lg,
      paddingVertical: theme.space.md,
    },
    title: { color: theme.text, fontSize: 20, fontWeight: '800' },
    close: { color: theme.primaryMuted, fontSize: 16, fontWeight: '700' },
    body: {
      paddingHorizontal: theme.space.lg,
      paddingBottom: theme.space.lg,
      gap: theme.space.md,
    },
    hint: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
    input: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      color: theme.text,
      fontSize: 17,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    error: { color: theme.error, fontSize: 14 },
    primaryBtn: {
      backgroundColor: theme.primary,
      borderRadius: theme.radius.md,
      paddingVertical: 15,
      alignItems: 'center',
    },
    // White on the solid rose button — correct in both schemes.
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    btnDisabled: { opacity: 0.6 },
    secondaryBtn: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryBtnText: { color: theme.text, fontSize: 15, fontWeight: '700' },
    link: { color: theme.primaryMuted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  })
