'use client'
import { useState } from 'react'
import { formatTemplateSavedAt, summarizeTemplate, type GameTemplate, type TemplateSlots } from '@/lib/game-templates'

interface TemplateQuickStartProps {
  slots: TemplateSlots
  onUse: (tpl: GameTemplate) => void
  onPrefill: (tpl: GameTemplate) => void
  onOverride: (slot: number) => void
  onDelete: (slot: number) => void
}

/**
 * "You've done this before" section shown right under the game-mode picker — only
 * when saved templates exist, so first-time hosts never see it. Both actions are
 * labeled buttons (not hidden behind an icon) since "Use & create" vs "Prefill" isn't
 * a click a new host should have to guess at. ⋯ only holds the less-common actions
 * (override this slot, delete).
 */
export function TemplateQuickStart({ slots, onUse, onPrefill, onOverride, onDelete }: TemplateQuickStartProps) {
  const [menuSlot, setMenuSlot] = useState<number | null>(null)
  const filled = slots.map((tpl, i) => ({ tpl, i })).filter((s): s is { tpl: GameTemplate; i: number } => !!s.tpl)
  if (filled.length === 0) return null

  return (
    <div className="glass-card p-4 space-y-2">
      <p className="label-caps">Quick start — use a saved template</p>
      <div className="space-y-2">
        {filled.map(({ tpl, i }) => (
          <div key={i} className="surface-inset p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{tpl.name}</p>
                <p className="text-faint text-xs mt-0.5">
                  {summarizeTemplate(tpl.values)} · saved {formatTemplateSavedAt(tpl.savedAt)}
                </p>
              </div>
              <div className="relative shrink-0">
                <button
                  type="button"
                  aria-label={`More options for ${tpl.name}`}
                  aria-expanded={menuSlot === i}
                  onClick={() => setMenuSlot(menuSlot === i ? null : i)}
                  className="px-2 py-1 rounded hover:bg-[var(--surface-inset-bg)] text-sm"
                >
                  ⋯
                </button>
                {menuSlot === i && (
                  <div className="absolute right-0 top-full mt-1 z-10 min-w-[9rem] rounded-lg border border-[var(--border)] bg-[var(--card-strong)] shadow-lg py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuSlot(null)
                        onOverride(i)
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-inset-bg)]"
                    >
                      Override this slot
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuSlot(null)
                        onDelete(i)
                      }}
                      className="block w-full text-left px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--surface-inset-bg)]"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onUse(tpl)}
                title="Apply these settings and create the game immediately"
                className="btn-primary text-xs flex-1 py-2"
              >
                Use &amp; create
              </button>
              <button
                type="button"
                onClick={() => onPrefill(tpl)}
                title="Fill in these settings below, but don't create the game yet"
                className="btn-secondary text-xs flex-1 py-2"
              >
                Prefill only
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
