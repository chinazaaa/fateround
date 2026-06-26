'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { roomMemberCodeFromSearch } from '@/lib/room-member-join'

export function useRoomMemberJoin(gameCode: string) {
  const memberCode = useMemo(
    () => (typeof window !== 'undefined' ? roomMemberCodeFromSearch(window.location.search) : undefined),
    []
  )
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [resolving, setResolving] = useState(!!memberCode)

  useEffect(() => {
    if (!memberCode) {
      setResolving(false)
      return
    }

    let cancelled = false
    setResolving(true)
    fetch(`/api/games/${encodeURIComponent(gameCode)}/room-member?member=${encodeURIComponent(memberCode)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.displayName) {
          setDisplayName(String(data.displayName).trim())
        }
      })
      .finally(() => {
        if (!cancelled) setResolving(false)
      })

    return () => {
      cancelled = true
    }
  }, [gameCode, memberCode])

  const joinExtras = useMemo(() => (memberCode ? { roomMemberCode: memberCode } : {}), [memberCode])

  return { memberCode, displayName, resolving, joinExtras, fromRoom: !!memberCode }
}

type AutoJoinOptions = {
  enabled?: boolean
  displayName?: string | null
  /** Join without a display name once the room member link is resolved (e.g. anonymous chat). */
  autoJoinWithoutName?: boolean
  resolving: boolean
  screen: string
  gameStatus?: string | null
  hasPlayerSession: boolean
  joining: boolean
  onJoin: (displayName: string) => void | Promise<void>
  /** Defaults to join screen while the lobby is waiting. */
  autoJoinScreens?: string[]
}

/** Join automatically with the room display name when opened from a game room link. */
export function useRoomMemberAutoJoin({
  enabled = true,
  displayName = null,
  autoJoinWithoutName = false,
  resolving,
  screen,
  gameStatus,
  hasPlayerSession,
  joining,
  onJoin,
  autoJoinScreens = ['join'],
}: AutoJoinOptions) {
  const attemptedRef = useRef(false)
  const canAutoJoin = !!displayName || autoJoinWithoutName

  useEffect(() => {
    if (!enabled || resolving || !canAutoJoin || hasPlayerSession || joining) return
    if (!autoJoinScreens.includes(screen) || gameStatus !== 'waiting') return
    if (attemptedRef.current) return
    attemptedRef.current = true
    void onJoin(displayName ?? '')
  }, [
    enabled,
    resolving,
    canAutoJoin,
    displayName,
    autoJoinWithoutName,
    hasPlayerSession,
    joining,
    screen,
    gameStatus,
    onJoin,
    autoJoinScreens,
  ])

  useEffect(() => {
    if (!autoJoinScreens.includes(screen)) {
      attemptedRef.current = false
    }
  }, [screen, autoJoinScreens])
}

/** Prefill a name field when the room member profile loads. */
export function useRoomMemberNamePrefill(displayName: string | null, name: string, setName: (value: string) => void) {
  useEffect(() => {
    if (displayName && !name.trim()) {
      setName(displayName)
    }
  }, [displayName, name, setName])
}
