'use client'
import { useState } from 'react'
import type { CustomSlot, CustomSlotsConfig } from '@/types'

const PRESET_EMOJI = [
  '🔥',
  '💀',
  '💍',
  '💚',
  '🚩',
  '⭐',
  '💼',
  '🏆',
  '💩',
  '👔',
  '📋',
  '🚪',
  '💕',
  '👋',
  '🎯',
  '👑',
  '🥇',
  '🥈',
  '🥉',
  '✨',
]

const PRESET_COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899', '#64748b', '#b45309']

interface Template {
  title: string
  slots: CustomSlot[]
}

const TEMPLATES: Template[] = [
  {
    title: 'Hire / Fire / Promote',
    slots: [
      { key: 'slot_0', label: 'Hire', emoji: '💼', color: '#22c55e' },
      { key: 'slot_1', label: 'Fire', emoji: '🔥', color: '#ef4444' },
      { key: 'slot_2', label: 'Promote', emoji: '⭐', color: '#eab308' },
    ],
  },
  {
    title: 'Date / Friendzone',
    slots: [
      { key: 'slot_0', label: 'Date', emoji: '💕', color: '#ec4899' },
      { key: 'slot_1', label: 'Friendzone', emoji: '👋', color: '#64748b' },
    ],
  },
  {
    title: 'Best / Worst',
    slots: [
      { key: 'slot_0', label: 'Best', emoji: '🏆', color: '#22c55e' },
      { key: 'slot_1', label: 'Worst', emoji: '💩', color: '#ef4444' },
    ],
  },
  {
    title: 'Gold / Silver / Bronze',
    slots: [
      { key: 'slot_0', label: 'Gold', emoji: '🥇', color: '#eab308' },
      { key: 'slot_1', label: 'Silver', emoji: '🥈', color: '#64748b' },
      { key: 'slot_2', label: 'Bronze', emoji: '🥉', color: '#b45309' },
    ],
  },
  {
    title: 'CEO / Intern / Fired',
    slots: [
      { key: 'slot_0', label: 'CEO', emoji: '👔', color: '#3b82f6' },
      { key: 'slot_1', label: 'Intern', emoji: '📋', color: '#a855f7' },
      { key: 'slot_2', label: 'Fired', emoji: '🚪', color: '#ef4444' },
    ],
  },
]

function makeSlots(count: number): CustomSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    key: `slot_${i}`,
    label: '',
    emoji: PRESET_EMOJI[i % PRESET_EMOJI.length],
    color: PRESET_COLORS[i % PRESET_COLORS.length],
  }))
}

interface CustomSlotBuilderProps {
  value: CustomSlotsConfig | null
  onChange: (config: CustomSlotsConfig) => void
}

export function CustomSlotBuilder({ value, onChange }: CustomSlotBuilderProps) {
  const [showTemplates, setShowTemplates] = useState(!value)
  const [editingEmoji, setEditingEmoji] = useState<number | null>(null)
  const [editingColor, setEditingColor] = useState<number | null>(null)

  const slots = value?.slots ?? makeSlots(3)
  const title = value?.title ?? ''

  function updateConfig(updates: Partial<CustomSlotsConfig>) {
    onChange({ slots, title, ...updates })
  }

  function updateSlot(index: number, updates: Partial<CustomSlot>) {
    const newSlots = slots.map((s, i) => (i === index ? { ...s, ...updates } : s))
    const newTitle = newSlots.every((s) => s.label) ? newSlots.map((s) => s.label).join(' / ') : title
    updateConfig({ slots: newSlots, title: newTitle })
  }

  function setSlotCount(count: number) {
    let newSlots: CustomSlot[]
    if (count > slots.length) {
      newSlots = [
        ...slots,
        ...makeSlots(count - slots.length).map((s, i) => ({ ...s, key: `slot_${slots.length + i}` })),
      ]
    } else {
      newSlots = slots.slice(0, count)
    }
    const newTitle = newSlots.every((s) => s.label) ? newSlots.map((s) => s.label).join(' / ') : title
    updateConfig({ slots: newSlots, title: newTitle })
  }

  function selectTemplate(template: Template) {
    updateConfig({ slots: template.slots, title: template.title })
    setShowTemplates(false)
  }

  if (showTemplates) {
    return (
      <div className="space-y-3">
        <p className="text-muted text-xs uppercase tracking-wider">Pick a template or start from scratch</p>
        <div className="grid gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => selectTemplate(t)}
              className="w-full text-left glass-card px-4 py-3 hover:border-theme-strong transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{t.slots.map((s) => s.emoji).join('')}</span>
                <span className="text-body font-semibold text-sm">{t.title}</span>
                <span className="text-faint text-xs ml-auto">{t.slots.length} slots</span>
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              updateConfig({ slots: makeSlots(2), title: '' })
              setShowTemplates(false)
            }}
            className="w-full text-left glass-card px-4 py-3 hover:border-theme-strong transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">✏️</span>
              <span className="text-body font-semibold text-sm">Start from scratch</span>
              <span className="text-faint text-xs ml-auto">2 slots</span>
            </div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted text-xs uppercase tracking-wider">Custom slots</p>
        <button
          type="button"
          onClick={() => setShowTemplates(true)}
          className="text-xs text-[var(--primary)] hover:opacity-80"
        >
          Change template
        </button>
      </div>

      {/* Slot count */}
      <div className="flex gap-2">
        {[2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setSlotCount(n)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
              slots.length === n ? 'bg-[var(--primary)] text-white' : 'surface-inset text-muted hover:text-body'
            }`}
          >
            {n} slots
          </button>
        ))}
      </div>

      {/* Slot editor */}
      <div className="space-y-2">
        {slots.map((slot, i) => (
          <div key={slot.key} className="glass-card px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2">
              {/* Emoji picker trigger */}
              <button
                type="button"
                onClick={() => setEditingEmoji(editingEmoji === i ? null : i)}
                className="text-xl w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5"
              >
                {slot.emoji}
              </button>
              {/* Label input */}
              <input
                type="text"
                value={slot.label}
                onChange={(e) => updateSlot(i, { label: e.target.value.slice(0, 20) })}
                placeholder={`Slot ${i + 1} label`}
                className="flex-1 bg-transparent border-b border-theme text-body text-sm py-1 outline-none focus:border-[var(--primary)]"
              />
              {/* Color picker trigger */}
              <button
                type="button"
                onClick={() => setEditingColor(editingColor === i ? null : i)}
                className="w-6 h-6 rounded-full border-2 border-white/20 shrink-0"
                style={{ backgroundColor: slot.color }}
              />
            </div>

            {/* Emoji grid */}
            {editingEmoji === i && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PRESET_EMOJI.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      updateSlot(i, { emoji: e })
                      setEditingEmoji(null)
                    }}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-base hover:bg-white/10 ${
                      slot.emoji === e ? 'bg-white/15 ring-1 ring-white/30' : ''
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}

            {/* Color grid */}
            {editingColor === i && (
              <div className="flex gap-2 pt-1">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      updateSlot(i, { color: c })
                      setEditingColor(null)
                    }}
                    className={`w-7 h-7 rounded-full border-2 ${slot.color === c ? 'border-white' : 'border-white/20'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Live preview */}
      {slots.some((s) => s.label) && (
        <div>
          <p className="text-muted text-xs uppercase tracking-wider mb-2">Preview</p>
          <div className="flex gap-2">
            {slots.map((slot) => (
              <button
                key={slot.key}
                type="button"
                disabled
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border border-white/10 text-center"
                style={{ backgroundColor: `${slot.color}20`, borderColor: `${slot.color}60`, color: slot.color }}
              >
                {slot.emoji} {slot.label || '...'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
