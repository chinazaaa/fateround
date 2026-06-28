'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession } from '@/lib/utils'
import { dedupeWstPool, mergeWstPoolEntry } from '@/lib/who-said-this'
import { useToast } from '@/components/ui/Toast'
import type { WstQuotePoolEntry } from '@/types'

export function useWstQuotePool({ gameCode, myPlayerId }: { gameCode: string; myPlayerId: string | null }) {
  const toast = useToast()
  const [wstPool, setWstPool] = useState<WstQuotePoolEntry[]>([])
  const [quoteInput, setQuoteInput] = useState('')
  const [quoteAuthorParticipantId, setQuoteAuthorParticipantId] = useState<string | null>(null)
  const [quoteSubmitting, setQuoteSubmitting] = useState(false)
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)

  async function fetchWstPool() {
    const { data } = await supabase.from('wst_quote_pool').select('*').eq('game_id', gameCode).order('created_at')
    const pool = dedupeWstPool(data ?? [])
    setWstPool(pool)
    return pool
  }

  const handleSubmitPoolQuote = async () => {
    if (!myPlayerId || quoteSubmitting) return
    const text = quoteInput.trim()
    if (!text || !quoteAuthorParticipantId) return
    const authorId = quoteAuthorParticipantId
    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toast.error('Your player session expired — rejoin to continue')
      return
    }
    setQuoteSubmitting(true)
    try {
      const res = await fetch('/api/wst-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeToken,
          gameId: gameCode,
          quoteText: text,
          authorParticipantId: authorId,
          ...(editingQuoteId ? { quoteId: editingQuoteId } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to submit quote')
        return
      }
      if (data.entry) {
        setWstPool((prev) => mergeWstPoolEntry(prev, data.entry as WstQuotePoolEntry))
      }
      setQuoteInput('')
      setQuoteAuthorParticipantId(null)
      setEditingQuoteId(null)
      await fetchWstPool()
    } catch {
      toast.error('Could not submit quote — try again')
    } finally {
      setQuoteSubmitting(false)
    }
  }

  const handleDeletePoolQuote = async (quoteId: string) => {
    if (!myPlayerId || quoteSubmitting) return
    const resumeToken = getPlayerSession(gameCode)?.resumeToken
    if (!resumeToken) {
      toast.error('Your player session expired — rejoin to continue')
      return
    }
    setQuoteSubmitting(true)
    try {
      const res = await fetch('/api/wst-quotes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeToken, gameId: gameCode, quoteId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to remove quote')
        return
      }
      setWstPool((prev) => prev.filter((e) => e.id !== quoteId))
      if (editingQuoteId === quoteId) {
        setQuoteInput('')
        setQuoteAuthorParticipantId(null)
        setEditingQuoteId(null)
      }
    } catch {
      toast.error('Could not remove quote — try again')
    } finally {
      setQuoteSubmitting(false)
    }
  }

  function resetWstQuoteState() {
    setWstPool([])
    setQuoteInput('')
    setQuoteAuthorParticipantId(null)
    setEditingQuoteId(null)
  }

  return {
    wstPool,
    quoteInput,
    quoteAuthorParticipantId,
    quoteSubmitting,
    editingQuoteId,
    setWstPool,
    setQuoteInput,
    setQuoteAuthorParticipantId,
    setEditingQuoteId,
    handleSubmitPoolQuote,
    handleDeletePoolQuote,
    fetchWstPool,
    resetWstQuoteState,
  }
}

export type WstQuotePoolState = ReturnType<typeof useWstQuotePool>
