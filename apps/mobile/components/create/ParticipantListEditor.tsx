import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import { parseParticipantsCsv, pickCsvText } from '@/lib/file-import'
import {
  emptyParticipant,
  isCustomGame,
  minParticipants,
  validParticipants,
  type ParticipantDraft,
  type ParticipantGender,
  type PeopleSettings,
} from '@/lib/create-settings/people'

type Props = {
  gameType: GameType
  people: PeopleSettings
  onChange: (patch: Partial<PeopleSettings>) => void
}

const GENDER_OPTIONS: { value: ParticipantGender; label: string }[] = [
  { value: 'female', label: 'F' },
  { value: 'male', label: 'M' },
]

export function ParticipantListEditor({ gameType, people, onChange }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const rows = people.participants
  const count = validParticipants(people).length
  const min = minParticipants(gameType, people)
  const enough = count >= min

  const setRow = (idx: number, patch: Partial<ParticipantDraft>) =>
    onChange({ participants: rows.map((p, i) => (i === idx ? { ...p, ...patch } : p)) })
  const addRow = () => onChange({ participants: [...rows, emptyParticipant()] })
  const removeRow = (idx: number) => onChange({ participants: rows.filter((_, i) => i !== idx) })

  const onImport = async () => {
    if (importing) return
    setImporting(true)
    setImportError(null)
    try {
      const picked = await pickCsvText()
      if (!picked) return
      const parsed = parseParticipantsCsv(picked.text)
      if (parsed.length === 0) return setImportError('No names found in that file')
      const existing = rows.filter((p) => p.name.trim())
      onChange({ participants: [...existing, ...parsed] })
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read that file')
    } finally {
      setImporting(false)
    }
  }

  const subtitle = isCustomGame(gameType)
    ? 'Everyone who gets sorted into your slots. Add at least one per slot.'
    : 'The names for this game. Players claim their own when they join.'

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>Name list</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.list}>
          {rows.map((row, idx) => (
            <View key={idx} style={styles.row}>
              <TextInput
                style={styles.nameInput}
                value={row.name}
                onChangeText={(name) => setRow(idx, { name })}
                placeholder={`Name ${idx + 1}`}
                placeholderTextColor={theme.textFaint}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={80}
              />
              <View style={styles.genderToggle}>
                {GENDER_OPTIONS.map((g) => {
                  const selected = row.gender === g.value
                  return (
                    <Pressable
                      key={g.value}
                      style={[styles.genderPill, selected && styles.genderPillOn]}
                      onPress={() => setRow(idx, { gender: g.value })}
                      hitSlop={4}
                    >
                      <Text style={[styles.genderText, selected && styles.genderTextOn]}>{g.label}</Text>
                    </Pressable>
                  )
                })}
              </View>
              {rows.length > 1 ? (
                <Pressable style={styles.remove} onPress={() => removeRow(idx)} hitSlop={8}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <Pressable style={styles.addButton} onPress={addRow}>
            <Text style={styles.addButtonText}>＋ Add name</Text>
          </Pressable>
          <Pressable style={styles.importButton} onPress={() => void onImport()} disabled={importing}>
            <Text style={styles.importButtonText}>{importing ? 'Reading…' : '⭱ Import CSV'}</Text>
          </Pressable>
        </View>

        {importError ? <Text style={styles.importErr}>{importError}</Text> : null}

        <Text style={[styles.count, enough ? styles.countOk : styles.countLow]}>
          {count} / {min} names{enough ? ' ✓' : ' needed'}
        </Text>
        <Text style={styles.footHint}>Gender (F/M) is optional — used only for gender-based rounds.</Text>
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  wrap: { gap: theme.space.md },
  heading: { color: theme.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: theme.textMuted, fontSize: 14, lineHeight: 20 },
  list: { gap: theme.space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
  nameInput: {
    flex: 1,
    backgroundColor: theme.bgElevated,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    color: theme.text,
    fontSize: 16,
    paddingHorizontal: theme.space.md,
    paddingVertical: 12,
  },
  genderToggle: {
    flexDirection: 'row',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  genderPill: {
    width: 34,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: theme.bgElevated,
  },
  genderPillOn: { backgroundColor: theme.primarySoft },
  genderText: { color: theme.textMuted, fontSize: 13, fontWeight: '800' },
  genderTextOn: { color: theme.primaryMuted },
  remove: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  removeText: { color: theme.textMuted, fontSize: 15, fontWeight: '700' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.sm },
  addButton: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.primary,
    backgroundColor: theme.primarySoft,
  },
  addButtonText: { color: theme.primaryMuted, fontSize: 14, fontWeight: '800' },
  importButton: {
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.bgElevated,
  },
  importButtonText: { color: theme.textSecondary, fontSize: 14, fontWeight: '700' },
  importErr: { color: theme.error, fontSize: 13 },
  count: { fontSize: 13, fontWeight: '700' },
  countOk: { color: theme.success },
  countLow: { color: theme.textMuted },
  footHint: { color: theme.textFaint, fontSize: 12 },
})
