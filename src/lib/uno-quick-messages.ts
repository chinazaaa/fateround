import type { UnoColor } from '@/types'

/**
 * UNO Team-Up quick messages — preset "emotes" a player can flick to their
 * teammate (partner-only) to hint a colour / value / play without a full chat.
 * Ephemeral: broadcast over realtime, never persisted. Shared by the picker
 * (chip) and the incoming bubble so both read the same label + swatch/glyph.
 */
export type UnoQuickMessage = {
  /** stable id sent over the wire */
  id: string
  /** short chip + bubble label */
  label: string
} & ({ kind: 'color'; color: UnoColor } | { kind: 'glyph'; glyph: string })

export const UNO_QUICK_MESSAGES: readonly UnoQuickMessage[] = [
  { id: 'red', label: 'Red', kind: 'color', color: 'red' },
  { id: 'yellow', label: 'Yellow', kind: 'color', color: 'yellow' },
  { id: 'green', label: 'Green', kind: 'color', color: 'green' },
  { id: 'blue', label: 'Blue', kind: 'color', color: 'blue' },
  { id: 'number', label: 'Number', kind: 'glyph', glyph: '#' },
  { id: 'reverse', label: 'Reverse', kind: 'glyph', glyph: '↺' },
  { id: 'skip', label: 'Skip', kind: 'glyph', glyph: '⊘' },
  { id: 'draw2', label: 'Draw 2', kind: 'glyph', glyph: '+2' },
  { id: 'wild', label: 'Wild', kind: 'glyph', glyph: '🌈' },
  { id: 'swap', label: 'Swap', kind: 'glyph', glyph: '🔄' },
  { id: 'uno', label: 'I have UNO!', kind: 'glyph', glyph: '🎉' },
  { id: 'go', label: 'Go for it', kind: 'glyph', glyph: '👍' },
  { id: 'ok', label: 'OK', kind: 'glyph', glyph: '👌' },
  { id: 'thanks', label: 'Thank you', kind: 'glyph', glyph: '🙏' },
  { id: 'save', label: 'Save me', kind: 'glyph', glyph: '🆘' },
]

const BY_ID = new Map(UNO_QUICK_MESSAGES.map((m) => [m.id, m]))

export function unoQuickMessage(id: string): UnoQuickMessage | undefined {
  return BY_ID.get(id)
}
