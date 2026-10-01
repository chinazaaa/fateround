'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getPlayerSession } from '@/lib/utils'
import { dedupeWstPool, mergeWstPoolEntry } from '@/lib/who-said-this'
import { useToast } from '@/components/ui/Toast'
import type { WstQuotePoolEntry } from '@/types'
import { WST_QUOTE_POOL_SELECT } from '@/lib/supabase-selects'

/** Blank answer-option inputs (A–D) for a new Who Said This question. */
export const emptyWstOptions = (): string[] => ['', '', '', '']

export function useWstQuotePool({ gameCode, myPlayerId }: { gameCode: string; myPlayerId: string | null }) {
  const toast = useToast()
  const [wstPool, setWstPool] = useState<WstQuotePoolEntry[]>([])
  const [quoteInput, setQuoteInput] = useState('')
  const [optionInputs, setOptionInputs] = useState<string[]>(emptyWstOptions)
  const [correctIndex, setCorrectIndex] = useState<number | null>(null)
  const [quoteSubmitting, setQuoteSubmitting] = useState(false)
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)

  async function fetchWstPool() {
    const { data } = await supabase
      .from('wst_quote_pool')
      .select(WST_QUOTE_POOL_SELECT)
      .eq('game_id', gameCode)
      .order('created_at')
    const pool = dedupeWstPool(data ?? [])
    setWstPool(pool)
    return pool
  }

  const resetQuoteForm = () => {
    setQuoteInput('')
    setOptionInputs(emptyWstOptions())
    setCorrectIndex(null)
    setEditingQuoteId(null)
  }

  const handleSubmitPoolQuote = async () => {
    if (!myPlayerId || quoteSubmitting) return
    const text = quoteInput.trim()
    const options = optionInputs.map((o) => o.trim()).filter(Boolean)
    // The correct answer must still be a non-empty option after trimming/blank-filtering.
    const correctText = correctIndex != null ? optionInputs[correctIndex]?.trim() : ''
    const resolvedCorrect = correctText ? options.indexOf(correctText) : -1
    if (!text || options.length < 2 || resolvedCorrect < 0) return
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
          options,
          correctIndex: resolvedCorrect,
          ...(editingQuoteId ? { quoteId: editingQuoteId } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to submit question')
        return
      }
      if (data.entry) {
        setWstPool((prev) => mergeWstPoolEntry(prev, data.entry as WstQuotePoolEntry))
      }
      resetQuoteForm()
      await fetchWstPool()
    } catch {
      toast.error('Could not submit question — try again')
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
      if (editingQuoteId === quoteId) resetQuoteForm()
    } catch {
      toast.error('Could not remove question — try again')
    } finally {
      setQuoteSubmitting(false)
    }
  }

  /** Load an existing pool entry into the form for editing. */
  const startEditingQuote = (entry: WstQuotePoolEntry) => {
    setEditingQuoteId(entry.id)
    setQuoteInput(entry.quote_text)
    const opts = entry.options ?? []
    setOptionInputs([opts[0] ?? '', opts[1] ?? '', opts[2] ?? '', opts[3] ?? ''])
    setCorrectIndex(entry.correct_index ?? null)
  }

  function resetWstQuoteState() {
    setWstPool([])
    resetQuoteForm()
  }

  return {
    wstPool,
    quoteInput,
    optionInputs,
    correctIndex,
    quoteSubmitting,
    editingQuoteId,
    setWstPool,
    setQuoteInput,
    setOptionInputs,
    setCorrectIndex,
    setEditingQuoteId,
    startEditingQuote,
    resetQuoteForm,
    handleSubmitPoolQuote,
    handleDeletePoolQuote,
    fetchWstPool,
    resetWstQuoteState,
  }
}

export type WstQuotePoolState = ReturnType<typeof useWstQuotePool>
