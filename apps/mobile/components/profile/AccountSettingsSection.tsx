import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { signOutIdentity } from '@/lib/identity'
import { updateProfileHandle, updateProfileSettings, type ProfileMe } from '@/lib/profile-api'

/**
 * Account settings on the mobile profile screen — the mobile half of web's
 * `/profile` → Settings tab (`src/components/profile/SettingsTab.tsx`).
 *
 * WHY THIS EXISTS. Mobile had no account settings surface at all. `/profile` was a trophy
 * case, the ⚙ gear held only device preferences (Appearance / Sound / Notifications), and
 * the only identity control anywhere was "Not you? Switch" buried in the Home-screen
 * ProfileChip sheet. So a player could not change their display name (except from the
 * daily-challenge name prompt, and only when their name was auto-generated), could not set
 * the voice-chat default at all, and had to hunt for sign-out.
 *
 * ── What lives here vs in the ⚙ sheet ────────────────────────────────────
 * This section holds ACCOUNT settings — things stored on the `profiles` row that follow the
 * player onto another device: display name, voice-chat default, sign out. Appearance, sound
 * effects and notifications stay in `SettingsSheet` because they are per-install device
 * preferences (SecureStore), not account state. Web splits them the same way.
 */
export function AccountSettingsSection({
  profile,
  onChanged,
}: {
  profile: ProfileMe | null
  /** Refetch the profile after a change that the server now owns. */
  onChanged: () => void
}) {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()

  const [handle, setHandle] = useState(profile?.handle ?? '')
  const [savingHandle, setSavingHandle] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)
  const [handleSaved, setHandleSaved] = useState(false)

  const [voiceOn, setVoiceOn] = useState(profile?.default_voice_on ?? false)
  const [voiceError, setVoiceError] = useState<string | null>(null)

  // Re-sync when the profile reloads (pull-to-refresh, or a rename made elsewhere) — but
  // only when the field isn't mid-edit, so a refresh can't yank text out from under a typist.
  useEffect(() => {
    if (!savingHandle) setHandle(profile?.handle ?? '')
    setVoiceOn(profile?.default_voice_on ?? false)
  }, [profile?.handle, profile?.default_voice_on, savingHandle])

  const signedIn = !!profile && !profile.is_anonymous
  const trimmed = handle.trim()
  const handleDirty = trimmed.length > 0 && trimmed !== (profile?.handle ?? '')

  const saveHandle = useCallback(async () => {
    if (!handleDirty || savingHandle) return
    setSavingHandle(true)
    setHandleError(null)
    setHandleSaved(false)
    try {
      const result = await updateProfileHandle(trimmed)
      if ('error' in result) {
        setHandleError(result.error)
        return
      }
      setHandleSaved(true)
      setTimeout(() => setHandleSaved(false), 2000)
      onChanged()
    } finally {
      setSavingHandle(false)
    }
  }, [handleDirty, savingHandle, trimmed, onChanged])

  const toggleVoice = useCallback(async (next: boolean) => {
    // Optimistic: the switch should feel instant. Roll back only if the server refuses.
    setVoiceOn(next)
    setVoiceError(null)
    const result = await updateProfileSettings({ default_voice_on: next })
    if ('error' in result) {
      setVoiceOn(!next)
      setVoiceError(result.error)
    }
  }, [])

  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  const doSignOut = useCallback(async () => {
    setConfirmingSignOut(false)
    await signOutIdentity()
    onChanged()
  }, [onChanged])

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Settings</Text>

      {/* ── Display name ───────────────────────────────────────────────── */}
      <SurfaceCard>
        <Text style={styles.rowLabel}>Display name</Text>
        <View style={styles.nameRow}>
          <TextInput
            style={styles.input}
            value={handle}
            onChangeText={(v) => {
              setHandle(v)
              setHandleError(null)
            }}
            placeholder="Your name"
            placeholderTextColor={theme.textFaint}
            maxLength={50}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void saveHandle()}
            accessibilityLabel="Display name"
          />
          <Pressable
            style={[styles.saveBtn, !handleDirty || savingHandle ? styles.saveBtnDisabled : null]}
            disabled={!handleDirty || savingHandle}
            onPress={() => void saveHandle()}
            accessibilityRole="button"
            accessibilityLabel="Save display name"
          >
            {savingHandle ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </View>
        <Text style={styles.hint}>Used when you join or host a game.</Text>
        {handleError ? <Text style={styles.error}>{handleError}</Text> : null}
        {handleSaved ? <Text style={styles.success}>Name saved</Text> : null}
      </SurfaceCard>

      {/* ── Preferences that live on the account ───────────────────────── */}
      <SurfaceCard>
        <View style={styles.toggleRow}>
          <View style={styles.toggleBody}>
            <Text style={styles.rowLabel}>Voice chat</Text>
            <Text style={styles.hint}>Join voice chat by default when entering a game</Text>
          </View>
          <Switch
            value={voiceOn}
            onValueChange={(v) => void toggleVoice(v)}
            trackColor={{ false: theme.border, true: theme.primary }}
            accessibilityLabel="Join voice chat by default"
          />
        </View>
        {voiceError ? <Text style={styles.error}>{voiceError}</Text> : null}
        <Text style={styles.hintFaint}>
          Appearance, sound effects and notifications are per-device — find them under the ⚙ button.
        </Text>
      </SurfaceCard>

      {/* ── Account ────────────────────────────────────────────────────── */}
      <SurfaceCard>
        <Text style={styles.rowLabel}>{signedIn ? 'Signed in' : 'Guest'}</Text>
        <Text style={styles.hint}>
          {signedIn
            ? 'Your streak and trophies follow this account onto any device.'
            : 'Save your profile with an email from Home to keep your progress across devices.'}
        </Text>
        {confirmingSignOut ? (
          <View style={styles.confirmBlock}>
            <Text style={styles.confirmText}>
              {signedIn
                ? 'You can sign back in any time with your email.'
                : 'This profile is a guest — it has no email, so signing out loses it and its streak for good.'}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setConfirmingSignOut(false)}>
                <Text style={styles.secondaryBtnText}>Stay</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={() => void doSignOut()}>
                <Text style={styles.dangerBtnText}>{signedIn ? 'Sign out' : 'Switch'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.secondaryBtn}
            onPress={() => setConfirmingSignOut(true)}
            accessibilityRole="button"
            accessibilityLabel={signedIn ? 'Sign out' : 'Switch account'}
          >
            <Text style={styles.secondaryBtnText}>{signedIn ? 'Sign out' : 'Switch account'}</Text>
          </Pressable>
        )}
      </SurfaceCard>
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    section: { gap: theme.space.sm },
    sectionTitle: {
      color: theme.text,
      fontSize: theme.type.section.size,
      fontWeight: theme.type.section.weight,
      marginTop: theme.space.sm,
    },
    rowLabel: { color: theme.text, fontSize: theme.type.body.size, fontWeight: '700' },
    hint: { color: theme.textMuted, fontSize: theme.type.caption.size },
    hintFaint: { color: theme.textFaint, fontSize: theme.type.caption.size },
    error: { color: '#f87171', fontSize: theme.type.caption.size },
    success: { color: '#4ade80', fontSize: theme.type.caption.size },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    input: {
      flex: 1,
      color: theme.text,
      backgroundColor: theme.surfaceHover,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: theme.type.body.size,
    },
    saveBtn: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingHorizontal: 18,
      paddingVertical: 11,
      minWidth: 74,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtnDisabled: { opacity: 0.45 },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: theme.type.body.size },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    toggleBody: { flex: 1, gap: 2 },
    confirmBlock: { gap: theme.space.sm },
    confirmText: { color: theme.textMuted, fontSize: theme.type.caption.size },
    confirmActions: { flexDirection: 'row', gap: theme.space.sm },
    secondaryBtn: {
      borderColor: theme.border,
      borderWidth: 1,
      backgroundColor: theme.surfaceHover,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 18,
      alignItems: 'center',
      flex: 1,
    },
    secondaryBtnText: { color: theme.text, fontWeight: '700', fontSize: theme.type.body.size },
    dangerBtn: {
      borderColor: 'rgba(239,68,68,0.4)',
      borderWidth: 1,
      backgroundColor: 'rgba(239,68,68,0.12)',
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 18,
      alignItems: 'center',
      flex: 1,
    },
    dangerBtnText: { color: '#f87171', fontWeight: '800', fontSize: theme.type.body.size },
  })
