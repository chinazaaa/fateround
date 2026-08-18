import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import type { GameType } from '@fateround/shared'
import { SurfaceCard } from '@/components/ui/SurfaceCard'
import type { Theme } from '@/constants/theme'
import { useTheme, useThemedStyles } from '@/constants/theme-context'
import {
  CUSTOM_SLOT_COLORS,
  CUSTOM_SLOT_EMOJI,
  CUSTOM_SLOT_MAX,
  CUSTOM_SLOT_MIN,
  CUSTOM_SLOT_TEMPLATES,
  deriveSlotsTitle,
  isCustomGame,
  makeCustomSlots,
  type CustomSlotDraft,
  type CustomSlotTemplate,
  type PeopleSettings,
} from '@/lib/create-settings/people'

type Props = {
  gameType: GameType
  people: PeopleSettings
  onChange: (patch: Partial<PeopleSettings>) => void
}

const COUNT_OPTIONS = [2, 3, 4, 5]

export function CustomSlotBuilderPanel({ gameType, people, onChange }: Props) {
  const theme = useTheme()
  const styles = useThemedStyles(makeStyles)
  const slots = people.slots
  const [showTemplates, setShowTemplates] = useState(() => slots.every((s) => !s.label.trim()))
  const [editingEmoji, setEditingEmoji] = useState<number | null>(null)
  const [editingColor, setEditingColor] = useState<number | null>(null)

  if (!isCustomGame(gameType)) return null

  const applySlots = (nextSlots: CustomSlotDraft[]) => {
    const allLabeled = nextSlots.every((s) => s.label.trim())
    onChange({
      slots: nextSlots,
      slotsTitle: allLabeled ? deriveSlotsTitle(nextSlots, people.slotsTitle) : people.slotsTitle,
    })
  }

  const updateSlot = (index: number, patch: Partial<CustomSlotDraft>) =>
    applySlots(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)))

  const setSlotCount = (count: number) => {
    let next: CustomSlotDraft[]
    if (count > slots.length) {
      next = [
        ...slots,
        ...makeCustomSlots(count - slots.length).map((s, i) => ({
          ...s,
          key: `slot_${slots.length + i}`,
        })),
      ]
    } else {
      next = slots.slice(0, count)
    }
    applySlots(next)
  }

  const selectTemplate = (template: CustomSlotTemplate) => {
    onChange({ slots: template.slots.map((s) => ({ ...s })), slotsTitle: template.title })
    setShowTemplates(false)
  }

  return (
    <SurfaceCard>
      <View style={styles.wrap}>
        <Text style={styles.heading}>Custom slots</Text>

        {showTemplates ? (
          <View style={styles.templates}>
            <Text style={styles.hint}>Pick a template or start from scratch</Text>
            {CUSTOM_SLOT_TEMPLATES.map((t) => (
              <Pressable key={t.title} style={styles.templateRow} onPress={() => selectTemplate(t)}>
                <Text style={styles.templateEmoji}>{t.slots.map((s) => s.emoji).join('')}</Text>
                <Text style={styles.templateTitle}>{t.title}</Text>
                <Text style={styles.templateMeta}>{t.slots.length} slots</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.templateRow}
              onPress={() => {
                onChange({ slots: makeCustomSlots(2), slotsTitle: '' })
                setShowTemplates(false)
              }}
            >
              <Text style={styles.templateEmoji}>✏️</Text>
              <Text style={styles.templateTitle}>Start from scratch</Text>
              <Text style={styles.templateMeta}>2 slots</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.headerRow}>
              <Text style={styles.hint}>Two to five outcomes players get sorted into.</Text>
              <Pressable onPress={() => setShowTemplates(true)}>
                <Text style={styles.changeTemplate}>Templates</Text>
              </Pressable>
            </View>

            <View style={styles.countRow}>
              {COUNT_OPTIONS.map((n) => {
                const selected = slots.length === n
                return (
                  <Pressable
                    key={n}
                    style={[styles.countChip, selected && styles.countChipOn]}
                    onPress={() => setSlotCount(n)}
                  >
                    <Text style={[styles.countText, selected && styles.countTextOn]}>{n}</Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.slotList}>
              {slots.map((slot, i) => (
                <View key={slot.key} style={styles.slotCard}>
                  <View style={styles.slotRow}>
                    <Pressable
                      style={styles.emojiButton}
                      onPress={() => setEditingEmoji(editingEmoji === i ? null : i)}
                    >
                      <Text style={styles.emojiText}>{slot.emoji}</Text>
                    </Pressable>
                    <TextInput
                      style={styles.labelInput}
                      value={slot.label}
                      onChangeText={(t) => updateSlot(i, { label: t.slice(0, 20) })}
                      placeholder={`Slot ${i + 1} label`}
                      placeholderTextColor={theme.textFaint}
                      maxLength={20}
                    />
                    <Pressable
                      style={[styles.colorButton, { backgroundColor: slot.color }]}
                      onPress={() => setEditingColor(editingColor === i ? null : i)}
                    />
                  </View>

                  {editingEmoji === i ? (
                    <View style={styles.pickerGrid}>
                      {CUSTOM_SLOT_EMOJI.map((e) => (
                        <Pressable
                          key={e}
                          style={[styles.emojiOption, slot.emoji === e && styles.emojiOptionOn]}
                          onPress={() => {
                            updateSlot(i, { emoji: e })
                            setEditingEmoji(null)
                          }}
                        >
                          <Text style={styles.emojiOptionText}>{e}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {editingColor === i ? (
                    <View style={styles.colorGrid}>
                      {CUSTOM_SLOT_COLORS.map((c) => (
                        <Pressable
                          key={c}
                          style={[styles.colorOption, { backgroundColor: c }, slot.color === c && styles.colorOptionOn]}
                          onPress={() => {
                            updateSlot(i, { color: c })
                            setEditingColor(null)
                          }}
                        />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>

            {slots.some((s) => s.label.trim()) ? (
              <View style={styles.preview}>
                <Text style={styles.hint}>Preview</Text>
                <View style={styles.previewRow}>
                  {slots.map((slot) => (
                    <View
                      key={slot.key}
                      style={[
                        styles.previewChip,
                        { backgroundColor: `${slot.color}22`, borderColor: `${slot.color}88` },
                      ]}
                    >
                      <Text style={[styles.previewText, { color: slot.color }]} numberOfLines={1}>
                        {slot.emoji} {slot.label || '…'}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <Text style={styles.footHint}>
              {slots.length < CUSTOM_SLOT_MIN || slots.length > CUSTOM_SLOT_MAX
                ? `Use between ${CUSTOM_SLOT_MIN} and ${CUSTOM_SLOT_MAX} slots.`
                : 'You’ll add the people to sort on the next step.'}
            </Text>
          </>
        )}
      </View>
    </SurfaceCard>
  )
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: theme.space.md },
    heading: { color: theme.text, fontSize: 18, fontWeight: '800' },
    hint: { color: theme.textFaint, fontSize: 13, lineHeight: 18 },
    footHint: { color: theme.textFaint, fontSize: theme.type.caption.size, lineHeight: 17 },
    templates: { gap: theme.space.sm },
    templateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.sm,
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      paddingHorizontal: theme.space.md,
      paddingVertical: 12,
    },
    templateEmoji: { fontSize: 18 },
    templateTitle: { color: theme.text, fontSize: theme.type.label.size, fontWeight: '700', flex: 1 },
    templateMeta: { color: theme.textFaint, fontSize: theme.type.caption.size },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.space.sm },
    changeTemplate: { color: theme.primaryMuted, fontSize: 13, fontWeight: '700' },
    countRow: { flexDirection: 'row', gap: theme.space.xs },
    countChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
    },
    countChipOn: { borderColor: theme.primary, backgroundColor: theme.primarySoft },
    countText: { color: theme.textMuted, fontSize: theme.type.body.size, fontWeight: '800' },
    countTextOn: { color: theme.primaryMuted },
    slotList: { gap: theme.space.sm },
    slotCard: {
      backgroundColor: theme.bgElevated,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: theme.radius.md,
      padding: theme.space.sm,
      gap: theme.space.sm,
    },
    slotRow: { flexDirection: 'row', alignItems: 'center', gap: theme.space.sm },
    emojiButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.sm,
      backgroundColor: theme.surface,
    },
    emojiText: { fontSize: 20 },
    labelInput: {
      flex: 1,
      color: theme.text,
      fontSize: theme.type.body.size,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingVertical: 8,
    },
    colorButton: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#ffffff33' },
    pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    emojiOption: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.sm,
      backgroundColor: theme.surface,
    },
    emojiOptionOn: { backgroundColor: theme.primarySoft, borderWidth: 1, borderColor: theme.primary },
    emojiOptionText: { fontSize: 18 },
    colorGrid: { flexDirection: 'row', gap: theme.space.sm },
    colorOption: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: '#ffffff33' },
    colorOptionOn: { borderColor: '#fff' },
    preview: { gap: theme.space.xs },
    previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.xs },
    previewChip: {
      paddingHorizontal: theme.space.sm,
      paddingVertical: 10,
      borderRadius: theme.radius.md,
      borderWidth: 1,
    },
    previewText: { fontSize: theme.type.caption.size, fontWeight: '800' },
  })
