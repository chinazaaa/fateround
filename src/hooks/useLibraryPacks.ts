'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Loads community/library packs for a game type and resolves a selected pack's
 * question payload on demand. Same shape as the ad-hoc state the normal create
 * page maintains inline (`libraryPacks`, `libraryPacksLoading`,
 * `libraryPackSearch`, `selectedPackId`, `libraryPackQuestions`), pulled into
 * a hook so the tournament flow (create-page playlist + detail-page "Start
 * Next Game" panel) doesn't have to re-implement it four times.
 *
 * Pass `enabled=false` to skip the initial list fetch — the tournament
 * surfaces only mount the library picker while the host has picked the
 * "Library" source chip, so we don't want a background load when they never
 * open that tab.
 *
 * Returns:
 *   packs / loading / search — for feeding LibraryPackPicker
 *   selectedPackId / selectPack — for picking a pack; selectPack fetches its
 *     questions payload and stores it on `questions`
 *   questions — the currently-loaded pack's question payload (or [])
 *   reset — clear the selection + questions (used when switching source chips)
 */
export type LibraryPack = {
  id: string
  title: string
  author_name: string
  question_count: number
  collections?: { slug: string; name: string }[]
}

export function useLibraryPacks(
  /** Library game_type key (see LIBRARY_GAME_TYPE_MAP in src/app/create/constants). */
  gameType: string | null,
  enabled: boolean = true
) {
  const [packs, setPacks] = useState<LibraryPack[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<unknown[]>([])

  // List fetch — reruns when the target game_type changes or the picker turns
  // on. A stale response from a previous gameType is discarded via the
  // `cancelled` guard so quickly toggling source chips can't leak old packs.
  useEffect(() => {
    if (!enabled || !gameType) {
      setPacks([])
      return
    }
    let cancelled = false
    setLoading(true)
    fetch(`/api/library?game_type=${encodeURIComponent(gameType)}&page_size=100`)
      .then((r) => r.json())
      .then((data: { packs?: LibraryPack[] }) => {
        if (cancelled) return
        setPacks(data.packs ?? [])
      })
      .catch(() => {
        if (!cancelled) setPacks([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [gameType, enabled])

  const selectPack = useCallback(async (id: string) => {
    setSelectedPackId(id)
    try {
      const res = await fetch(`/api/library/${id}`)
      const data = await res.json()
      const qs: unknown[] = Array.isArray(data?.pack?.questions) ? data.pack.questions : []
      setQuestions(qs)
    } catch {
      setQuestions([])
    }
  }, [])

  const reset = useCallback(() => {
    setSelectedPackId(null)
    setQuestions([])
    setSearch('')
  }, [])

  return {
    packs,
    loading,
    search,
    setSearch,
    selectedPackId,
    selectPack,
    questions,
    reset,
  }
}
