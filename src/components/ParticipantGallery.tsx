'use client'

import { useState } from 'react'
import type { Participant } from '@/types'

function PlaceholderSilhouette({ name }: { name: string }) {
  return (
    <div
      className="w-full aspect-square rounded-xl bg-[var(--surface-inset-bg)] flex items-center justify-center"
      role="img"
      aria-label={`No photo for ${name}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.2}
        className="w-10 h-10 text-[var(--border-strong)]"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
      </svg>
    </div>
  )
}

export function ParticipantGallery({ participants }: { participants: Participant[] }) {
  const [expanded, setExpanded] = useState(false)

  if (participants.length === 0) return null

  return (
    <div className="surface-inset border border-theme rounded-2xl p-4 space-y-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between"
      >
        <p className="text-muted text-xs uppercase tracking-wider">Meet the Players ({participants.length})</p>
        <span className="text-faint text-xs">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="grid grid-cols-3 gap-2">
          {participants.map((p) => (
            <div key={p.id} className="text-center space-y-1">
              {p.photo_url ? (
                <div className="w-full aspect-square rounded-xl overflow-hidden">
                  <img
                    src={p.photo_url}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <PlaceholderSilhouette name={p.name} />
              )}
              <p className="text-xs text-body-muted truncate">{p.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
