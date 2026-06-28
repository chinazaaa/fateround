'use client'

import { useEffect, useRef, useState } from 'react'
import { CodewordsTeamBadge } from '@/components/codewords/CodewordsBoardGrid'
import { useCodewordsChat } from '@/hooks/useCodewordsChat'
import type { CodewordsTeam, Player } from '@/types'
import { useToast } from '@/components/ui/Toast'

export function CodewordsTeamChat({
  gameCode,
  playerId,
  myResumeToken,
  team,
  players,
  enabled,
}: {
  gameCode: string
  playerId: string
  myResumeToken: string | null
  team: CodewordsTeam
  players: Player[]
  enabled: boolean
}) {
  const { error: toastError } = useToast()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)
  const { messages, loading } = useCodewordsChat(gameCode, team, enabled, players)

  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    feed.scrollTop = feed.scrollHeight
  }, [messages])

  const sendMessage = async () => {
    const text = draft.trim()
    if (!text || sending) return
    if (!myResumeToken) {
      toastError('Your player session expired — rejoin to continue')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/codewords/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken, text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send message')
      setDraft('')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="label-caps">Team chat</p>
        <CodewordsTeamBadge team={team} />
      </div>
      <p className="text-faint text-xs leading-relaxed">Only your team&apos;s operatives can see this chat.</p>

      <div
        ref={feedRef}
        dir="ltr"
        className="max-h-48 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface-inset-bg)] p-3 space-y-2"
      >
        {loading ? (
          <p className="text-faint text-xs text-center py-4">Loading chat…</p>
        ) : messages.length === 0 ? (
          <p className="text-faint text-xs text-center py-4">Coordinate with your operatives here.</p>
        ) : (
          messages.map((message) => {
            const isMe = message.player_id === playerId
            return (
              <div
                key={message.id}
                dir="ltr"
                className={`rounded-lg px-2.5 py-2 text-sm leading-snug [unicode-bidi:isolate] ${
                  isMe ? 'bg-[var(--card-strong)]' : 'bg-transparent'
                }`}
              >
                <p className="font-semibold text-[var(--foreground)] text-xs mb-0.5">{message.player_name}</p>
                <p className="text-body-muted break-words">{message.text}</p>
              </div>
            )
          })
        )}
      </div>

      <form
        className="flex items-center gap-2 min-w-0"
        onSubmit={(e) => {
          e.preventDefault()
          void sendMessage()
        }}
      >
        <input
          type="text"
          dir="ltr"
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message your team…"
          maxLength={200}
          className="input-field flex-1 min-w-0 w-0 py-2.5 text-sm text-left"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="btn-primary btn-fit shrink-0 px-4 py-2.5 text-sm whitespace-nowrap"
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
