'use client'

import { useState, type ReactNode } from 'react'
import {
  MonopolyClassicBoard,
  MonopolyCurrentSpace,
  MonopolyPlayerList,
} from '@/components/monopoly/MonopolyBoard'
import { MonopolyManagePanel, MonopolyTurnModals, MonopolyCardAlertModal } from '@/components/monopoly/MonopolyGamePanels'
import { getMonopolyBuildActionCount } from '@/components/monopoly/monopoly-manage-utils'
import {
  MonopolyCashBadge,
  MonopolyStatusBanner,
  MonopolyTurnStrip,
} from '@/components/monopoly/MonopolyChrome'
import { currentPlayerId, parsePropertyOwners, type MonopolyColorGroup } from '@/lib/monopoly'
import type { MonopolyBoard, MonopolyPlayerState, Player } from '@/types'

type SidePanel = 'build' | 'players'

type PostAction = (url: string, body?: Record<string, unknown>) => Promise<void>

export function MonopolyActiveLayout({
  board,
  states,
  players,
  myPlayerId,
  myState,
  myName,
  acting,
  postAction,
  colorBarClass,
  boardCenter,
}: {
  board: MonopolyBoard
  states: MonopolyPlayerState[]
  players: Player[]
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  myName?: string | null
  acting: boolean
  postAction: PostAction
  colorBarClass: (color?: MonopolyColorGroup) => string
  boardCenter: ReactNode
}) {
  const [panel, setPanel] = useState<SidePanel>('build')

  const owners = parsePropertyOwners(board.property_owners)
  const turnPlayerId = currentPlayerId(board)
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const isMyTurn = turnPlayerId === myPlayerId && !myState?.bankrupt
  const currentOwner =
    myState != null ? players.find((p) => p.id === owners[String(myState.position)])?.name : null

  const buildActions =
    board && myPlayerId ? getMonopolyBuildActionCount(board, myPlayerId) : 0

  const showStatusBanner =
    board.status_message &&
    board.phase !== 'buy' &&
    board.phase !== 'pay_rent' &&
    board.phase !== 'auction' &&
    !board.last_card_event

  const panelTabs = (
    <div
      className="flex gap-2 p-1 rounded-xl bg-[var(--surface-inset-bg)] border border-[var(--border-strong)]"
      role="tablist"
      aria-label="Game panels"
    >
      <button
        type="button"
        role="tab"
        aria-selected={panel === 'build'}
        onClick={() => setPanel('build')}
        className={[
          'flex-1 rounded-lg py-2.5 px-2 text-sm font-bold transition-colors flex items-center justify-center gap-1.5',
          panel === 'build' ? 'bg-[var(--card-strong)] shadow-sm text-[var(--foreground)]' : 'text-muted',
        ].join(' ')}
      >
        Build &amp; trade
        {buildActions > 0 && (
          <span className="rounded-full bg-[var(--primary)] px-1.5 py-0.5 text-[10px] font-black text-white">
            {buildActions}
          </span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={panel === 'players'}
        onClick={() => setPanel('players')}
        className={[
          'flex-1 rounded-lg py-2.5 text-sm font-bold transition-colors',
          panel === 'players' ? 'bg-[var(--card-strong)] shadow-sm text-[var(--foreground)]' : 'text-muted',
        ].join(' ')}
      >
        Players
      </button>
    </div>
  )

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <MonopolyTurnStrip
          turnName={turnPlayer?.name ?? '—'}
          isMyTurn={isMyTurn}
          phase={board.phase}
          myName={myName}
        />
        {myState && <MonopolyCashBadge amount={myState.cash} />}
      </div>

      {buildActions > 0 && panel !== 'build' && (
        <button
          type="button"
          onClick={() => setPanel('build')}
          className="w-full rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,var(--border-strong))] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-4 py-2.5 text-sm font-semibold text-[var(--primary)] text-left"
        >
          🏠 You can build on your properties — open Build &amp; trade
        </button>
      )}

      {showStatusBanner && (
        <MonopolyStatusBanner message={board.status_message!} isMyTurn={isMyTurn} />
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,22rem)] lg:gap-5 lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-4">
          <MonopolyClassicBoard
            states={states}
            players={players}
            propertyOwners={owners}
            highlightIndex={myState?.position}
            center={boardCenter}
          />
          {myState && <MonopolyCurrentSpace index={myState.position} ownerName={currentOwner} />}
        </div>

        <div className="mt-4 lg:mt-0 space-y-3">
          {panelTabs}

          <div
            role="tabpanel"
            className="max-h-[min(52vh,28rem)] overflow-y-auto rounded-2xl"
          >
            {panel === 'build' ? (
              <MonopolyManagePanel
                board={board}
                myPlayerId={myPlayerId}
                myState={myState}
                players={players}
                acting={acting}
                postAction={postAction}
              />
            ) : (
              <div className="glass-card p-4">
                <p className="label-caps mb-3">All players</p>
                <MonopolyPlayerList
                  states={states}
                  players={players}
                  currentPlayerId={turnPlayerId}
                  propertyOwners={owners}
                  myPlayerId={myPlayerId}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <MonopolyCardAlertModal board={board} myPlayerId={myPlayerId} players={players} />

      <MonopolyTurnModals
        board={board}
        myPlayerId={myPlayerId}
        myState={myState}
        players={players}
        acting={acting}
        postAction={postAction}
        colorBarClass={colorBarClass}
      />
    </>
  )
}
