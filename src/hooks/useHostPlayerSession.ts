'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPlayerSession } from '@/lib/utils'

const SESSION_EVENT = 'kmk-player-session'

export function useHostPlayerSession(gameCode: string | null) {
  const [resumeToken, setResumeToken] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!gameCode) {
      setResumeToken(null)
      setPlayerName(null)
      return
    }

    const session = getPlayerSession(gameCode)
    if (!session?.playerId) {
      setResumeToken(null)
      setPlayerName(null)
      return
    }

    setPlayerName(session.playerName)
    // The resume_token is the player's secret credential and is no longer readable from
    // the DB by the client (migration 0122). It's persisted in the local session at join;
    // if it's absent (e.g. a legacy session), the player must rejoin to get a fresh one.
    setResumeToken(session.resumeToken ?? null)
  }, [gameCode])

  useEffect(() => {
    setTimeout(() => void refresh(), 0)
    const onSession = (event: Event) => {
      const detail = (event as CustomEvent<{ gameCode?: string }>).detail
      if (!detail?.gameCode || detail.gameCode === gameCode?.toUpperCase()) {
        void refresh()
      }
    }
    window.addEventListener(SESSION_EVENT, onSession)
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener(SESSION_EVENT, onSession)
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [gameCode, refresh])

  return { resumeToken, playerName }
}
