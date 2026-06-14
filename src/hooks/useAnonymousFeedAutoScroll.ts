'use client'

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'kmk-anon-feed-auto-scroll'

/** Default off to match prior feed behavior for users who never set a preference. */
const DEFAULT_AUTO_SCROLL = false

export function useAnonymousFeedAutoScroll() {
  const [autoScroll, setAutoScrollState] = useState(DEFAULT_AUTO_SCROLL)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    setAutoScrollState(stored === null ? DEFAULT_AUTO_SCROLL : stored === 'true')
    setReady(true)
  }, [])

  const setAutoScroll = useCallback((value: boolean) => {
    setAutoScrollState(value)
    localStorage.setItem(STORAGE_KEY, String(value))
  }, [])

  const toggleAutoScroll = useCallback(() => {
    setAutoScroll(!autoScroll)
  }, [autoScroll, setAutoScroll])

  return { autoScroll, setAutoScroll, toggleAutoScroll, ready }
}
