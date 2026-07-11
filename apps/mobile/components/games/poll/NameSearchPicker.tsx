import { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import type { Theme } from '@/constants/theme'
import { useThemedStyles } from '@/constants/theme-context'

export type NamePickerOption = { id: string; name: string; photoUrl?: string | null }

/**
 * Searchable, filterable name list for the vote target. Mirrors web
 * NameSearchPicker — shown for large rosters (MLT / Who Said This) so a player
 * can type to narrow the list instead of scrolling dozens of rows.
 */
export function NameSearchPicker({
  options,
  valueId,
  onChange,
  disabled,
  selfId,
  searchPlaceholder = 'Search names…',
  emptyMessage = 'No names match',
  showAvatars = true,
}: {
  options: NamePickerOption[]
  valueId: string | null
  onChange: (id: string) => void
  disabled?: boolean
  selfId?: string | null
  searchPlaceholder?: string
  emptyMessage?: string
  showAvatars?: boolean
}) {
  const styles = useThemedStyles(makeStyles)
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, query])

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder={searchPlaceholder}
        placeholderTextColor={styles.placeholder.color}
        editable={!disabled}
        autoCorrect={false}
      />
      {filtered.length === 0 ? (
        <Text style={styles.empty}>{emptyMessage}</Text>
      ) : (
        <View style={styles.list}>
          {filtered.map((o) => {
            const selected = valueId === o.id
            return (
              <Pressable
                key={o.id}
                style={[styles.row, selected && styles.rowSelected]}
                disabled={disabled}
                onPress={() => onChange(o.id)}
              >
                {showAvatars ? <ParticipantAvatar name={o.name} photoUrl={o.photoUrl} size={32} /> : null}
                <Text style={styles.name}>
                  {o.name}
                  {selfId && o.id === selfId ? ' (you)' : ''}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: 8 },
    search: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: theme.text,
      fontSize: 15,
    },
    placeholder: { color: theme.textFaint },
    empty: { color: theme.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
    list: { gap: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.border,
    },
    rowSelected: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    name: { color: theme.text, fontSize: 16, flex: 1 },
  })
