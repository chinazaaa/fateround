/**
 * Finish-screen name control (mobile mirror of
 * `src/components/daily/DailyNamePrompt.tsx`).
 *
 * Players with the auto-assigned name (Adjective+Animal+NN) see a clear
 * "make it yours" nudge; players who've already chosen a name see a
 * subtle "Playing as X · Edit" line. PATCHes /api/profile/me — no sign-in
 * required. Detection is by shape, not a DB flag, so the mobile version
 * uses a looser regex than web (there's no need to duplicate the 300+
 * word adjective/animal lists; the comment on `isAutoName` in
 * src/lib/random-name.ts already accepts a manually-typed "SwiftFalcon42"
 * as an acceptable false-positive).
 */

import { useEffect, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { AppButton } from '@/components/ui/AppButton'
import { rememberName } from '@/lib/identity-local'
import { fetchProfileGames, updateProfile, type ProfileMe } from '@/lib/profile-api'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'

// Same shape as the web AUTO_NAME_RE, minus the specific word lists — a
// two-CamelCase-tokens-plus-two-digits string is a strong-enough tell.
const AUTO_NAME_SHAPE = /^[A-Z][a-z]+[A-Z][a-z]+\d{2}$/

function isAutoName(handle: string | null | undefined): boolean {
  return !!handle && AUTO_NAME_SHAPE.test(handle)
}

export function DailyNamePrompt() {
  const styles = useThemedStyles(makeStyles)
  const theme = useTheme()
  const [profile, setProfile] = useState<ProfileMe | null>(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { profile: p } = await fetchProfileGames()
      if (cancelled) return
      setProfile(p)
      if (p?.handle) setName(p.handle)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!profile) return null
  const auto = isAutoName(profile.handle)

  const save = async () => {
    const next = name.trim()
    if (!next || next === profile.handle) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      const updated = await updateProfile({ handle: next })
      if (!updated) {
        Alert.alert('Could not save name', 'Please try again.')
        return
      }
      await rememberName(next)
      setProfile(updated)
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <View style={[styles.editWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={50}
          placeholder="What should we call you?"
          placeholderTextColor={theme.textFaint}
          autoFocus
          style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
          onSubmitEditing={() => void save()}
          returnKeyType="done"
        />
        <View style={styles.editActions}>
          <View style={{ flex: 1 }}>
            <AppButton
              label={busy ? 'Saving…' : 'Save'}
              fullWidth
              size="sm"
              onPress={() => void save()}
              disabled={busy || !name.trim()}
            />
          </View>
          <AppButton label="Cancel" tone="ghost" size="sm" onPress={() => setEditing(false)} />
        </View>
      </View>
    )
  }

  if (!auto) {
    return (
      <Pressable onPress={() => setEditing(true)}>
        <Text style={styles.subtleLine}>
          Playing as <Text style={{ color: theme.text, fontWeight: '700' }}>{profile.handle}</Text> ·{' '}
          <Text style={{ color: theme.primary, textDecorationLine: 'underline' }}>Edit</Text>
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={[styles.nudgeWrap, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <Text style={styles.nudgeBody}>
        You&apos;re on the board as <Text style={styles.nudgeName}>{profile.handle}</Text>
      </Text>
      <AppButton label="Make it yours" tone="secondary" size="sm" onPress={() => setEditing(true)} />
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    editWrap: { padding: 12, borderRadius: 12, borderWidth: 1, gap: 8 },
    input: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, fontSize: theme.type.body.size },
    editActions: { flexDirection: 'row', gap: 8 },
    subtleLine: { color: theme.textMuted, fontSize: theme.type.caption.size, textAlign: 'center' },
    nudgeWrap: { padding: 14, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 8 },
    nudgeBody: { color: theme.textMuted, fontSize: theme.type.body.size, textAlign: 'center' },
    nudgeName: { color: theme.text, fontWeight: '800' },
  })
