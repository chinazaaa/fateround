'use client'

import { useEffect, useState } from 'react'
import { HostModePanel } from '@/components/host/HostModePanel'
import { HostPlayManageTabs } from '@/components/host/HostPlayManageTabs'
import { PollGamePlayerExperience } from '@/components/poll-game/PollGamePlayerExperience'
import { getPollHostMode, setPollHostMode, type PollHostMode } from '@/lib/poll-host-mode'
import { getPlayerSession } from '@/lib/utils'
import type { Game } from '@/types'

export function PollHostPlayShell({
  gameCode,
  game,
  playerCount,
  onHostPlayerId,
  children,
}: {
  gameCode: string
  game: Game
  playerCount: number
  onHostPlayerId?: (id: string | null) => void
  children: React.ReactNode
}) {
  const [hostMode, setHostModeState] = useState<PollHostMode>('spectator')
  const [tab, setTab] = useState<'play' | 'manage'>('manage')

  useEffect(() => {
    setHostModeState(getPollHostMode(gameCode))
  }, [gameCode])

  useEffect(() => {
    const session = getPlayerSession(gameCode)
    onHostPlayerId?.(session?.playerId ?? null)
  }, [gameCode, playerCount, onHostPlayerId])

  useEffect(() => {
    if (game.status === 'finished') setTab('manage')
  }, [game.status])

  useEffect(() => {
    if (hostMode === 'player' && getPlayerSession(gameCode) && game.status === 'active') {
      setTab('play')
    }
  }, [game.status, hostMode, gameCode])

  const changeHostMode = (mode: PollHostMode) => {
    if (game.status !== 'waiting') return
    setHostModeState(mode)
    setPollHostMode(gameCode, mode)
    if (mode === 'spectator') setTab('manage')
  }

  const showPlayTab = hostMode === 'player' && game.status !== 'finished'

  return (
    <>
      {game.status === 'waiting' && (
        <HostModePanel
          hostMode={hostMode}
          onModeChange={changeHostMode}
          joinedHint={
            hostMode === 'player' ? (
              <p className="text-sm text-muted">
                Open the <strong>Play</strong> tab to join and claim your spot before starting. After you join, use{' '}
                <strong>Share</strong> in the header to manage and play on another device.
              </p>
            ) : undefined
          }
        />
      )}
      {showPlayTab && <HostPlayManageTabs tab={tab} onTabChange={setTab} />}
      {tab === 'play' && showPlayTab ? (
        <PollGamePlayerExperience gameCode={gameCode} embedded />
      ) : (
        children
      )}
    </>
  )
}
