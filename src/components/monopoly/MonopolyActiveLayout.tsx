'use client'

import { useEffect, useState } from 'react'
import {
  MonopolyClassicBoard,
  MonopolyCurrentSpace,
  MonopolyDiceRoll,
  MonopolyPlayerList,
} from '@/components/monopoly/MonopolyBoard'
import { MonopolyBoardCenter } from '@/components/monopoly/MonopolyBoardCenter'
import { MonopolyGameTimerBar } from '@/components/monopoly/MonopolyGameTimerBar'
import { MonopolyManagePanel, MonopolyTurnModals, MonopolyCardAlertModal } from '@/components/monopoly/MonopolyGamePanels'
import { getMonopolyBuildActionCount } from '@/components/monopoly/monopoly-manage-utils'
import {
  MonopolyCashBadge,
  MonopolyStatusBanner,
  MonopolyTurnStrip,
} from '@/components/monopoly/MonopolyChrome'
import { formatRentMessageForPlayer } from '@/lib/monopoly-rent-messages'
import { formatCashMessageForPlayer } from '@/lib/monopoly-cash-messages'
import { formatTradeMessageForPlayer } from '@/lib/monopoly-trade-messages'
import { currentPlayerId, parsePropertyOwners, effectivePropertyOwners, type MonopolyColorGroup } from '@/lib/monopoly'
import { useMonopolyTurnTimer } from '@/hooks/useMonopolyTurnTimer'
import type { Game, MonopolyBoard, MonopolyPlayerState, Player } from '@/types'

type SidePanel = 'build' | 'players'

type PostAction = (url: string, body?: Record<string, unknown>) => Promise<void>

export function MonopolyActiveLayout({
  gameCode,
  game,
  board,
  states,
  players,
  myPlayerId,
  myState,
  myName,
  acting,
  postAction,
  colorBarClass,
  spectator = false,
}: {
  gameCode: string
  game: Pick<Game, 'status' | 'session_started_at' | 'game_duration_seconds'> | null
  board: MonopolyBoard
  states: MonopolyPlayerState[]
  players: Player[]
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  myName?: string | null
  acting: boolean
  postAction: PostAction
  colorBarClass: (color?: MonopolyColorGroup) => string
  spectator?: boolean
}) {
  const [panel, setPanel] = useState<SidePanel>(spectator ? 'players' : 'build')

  const incomingTrade =
    board.pending_trade && board.pending_trade.to_player_id === myPlayerId
      ? board.pending_trade
      : null

  useEffect(() => {
    if (incomingTrade) setPanel('build')
  }, [incomingTrade?.from_player_id, incomingTrade?.to_player_id])

  const owners = effectivePropertyOwners(parsePropertyOwners(board.property_owners), states)
  const turnPlayerId = currentPlayerId(board)
  const turnPlayer = players.find((p) => p.id === turnPlayerId)
  const isMyTurn = turnPlayerId === myPlayerId && !myState?.bankrupt
  const auctionBidderId =
    board.phase === 'auction' ? board.auction_state?.current_bidder_id ?? null : null
  const isMyAuctionTurn = auctionBidderId === myPlayerId
  const amActor = isMyTurn || isMyAuctionTurn || (board.phase === 'raise_funds' && board.pending_debt?.player_id === myPlayerId)
  const currentOwner =
    myState != null
      ? players.find((p) => p.id === owners[String(myState.position)])?.name ?? null
      : null
  const ownershipKey = Object.entries(owners)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([index, playerId]) => `${index}:${playerId}`)
    .join('|')

  const buildActions =
    board && myPlayerId ? getMonopolyBuildActionCount(board, myPlayerId) : 0

  const { secondsLeft, hasTimer, urgent } = useMonopolyTurnTimer(gameCode, board, true)

  const personalCashMessage =
    board.last_cash_event && board.last_cash_event.player_id === myPlayerId
      ? formatCashMessageForPlayer(board.last_cash_event)
      : null

  const personalTradeMessage =
    board.last_trade_event &&
    (board.last_trade_event.outcome === 'declined' ||
      board.last_trade_event.outcome === 'accepted') &&
    (board.last_trade_event.from_player_id === myPlayerId ||
      board.last_trade_event.to_player_id === myPlayerId)
      ? formatTradeMessageForPlayer(board.last_trade_event, myPlayerId, players)
      : null

  const bannerMessage = personalCashMessage
    ? personalCashMessage
    : personalTradeMessage
      ? personalTradeMessage
      : board.last_rent_event
        ? formatRentMessageForPlayer(board.last_rent_event, myPlayerId, players)
        : board.status_message

  const showStatusBanner =
    bannerMessage &&
    (personalCashMessage ||
      personalTradeMessage ||
      (board.phase !== 'buy' &&
        board.phase !== 'pay_rent' &&
        board.phase !== 'auction' &&
        board.phase !== 'raise_funds')) &&
    !board.last_card_event

  const panelTabs = spectator ? null : (
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
      <div className="space-y-2 sm:space-y-3">
      <MonopolyGameTimerBar gameCode={gameCode} game={game} />

      <div className={`grid gap-2 sm:gap-3 items-stretch ${spectator ? 'grid-cols-1' : 'grid-cols-3'}`}>
        <MonopolyTurnStrip
          compact
          turnName={turnPlayer?.name ?? '—'}
          isMyTurn={spectator ? false : isMyTurn}
          isMyAuctionTurn={spectator ? false : isMyAuctionTurn}
          phase={board.phase}
          secondsLeft={secondsLeft}
          hasTimer={hasTimer && !spectator && amActor}
          urgent={urgent}
        />
        {!spectator && myState ? (
          <MonopolyCurrentSpace
            compact
            index={myState.position}
            ownerName={currentOwner}
            propertyOwners={board.property_owners}
            propertyBuildings={board.property_buildings}
            mortgagedProperties={board.mortgaged_properties}
            lastDiceTotal={board.last_dice?.total ?? 2}
          />
        ) : !spectator ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-inset-bg)]/50 min-h-[3.25rem]" />
        ) : null}
        {!spectator && myState ? (
          <MonopolyCashBadge compact amount={myState.cash} label="Cash" bankrupt={myState.bankrupt} />
        ) : !spectator ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-inset-bg)]/50 min-h-[3.25rem]" />
        ) : null}
      </div>

      {!spectator && incomingTrade && panel !== 'build' && (
        <button
          type="button"
          onClick={() => setPanel('build')}
          className="w-full rounded-xl border border-[color-mix(in_srgb,var(--marry)_35%,var(--border-strong))] bg-[color-mix(in_srgb,var(--marry)_10%,transparent)] px-4 py-2.5 text-sm font-semibold text-[var(--marry)] text-left"
        >
          🤝 Trade offer waiting — open Build &amp; trade to review
        </button>
      )}

      {!spectator && buildActions > 0 && panel !== 'build' && (
        <button
          type="button"
          onClick={() => setPanel('build')}
          className="w-full rounded-xl border border-[color-mix(in_srgb,var(--primary)_35%,var(--border-strong))] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)] px-4 py-2.5 text-sm font-semibold text-[var(--primary)] text-left"
        >
          🏠 You can build on your properties — open Build &amp; trade
        </button>
      )}

      {!spectator && board.phase === 'raise_funds' && board.pending_debt?.player_id === myPlayerId && panel !== 'build' && (
        <button
          type="button"
          onClick={() => setPanel('build')}
          className="w-full rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 text-left"
        >
          ⚠️ Raise cash — mortgage or sell buildings in Build &amp; trade
        </button>
      )}

      {showStatusBanner && (
        <MonopolyStatusBanner message={bannerMessage!} isMyTurn={isMyTurn} />
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(280px,22rem)] lg:gap-5 lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-4">
          <MonopolyClassicBoard
            key={ownershipKey}
            states={states}
            players={players}
            propertyOwners={board.property_owners}
            propertyBuildings={board.property_buildings}
            mortgagedProperties={board.mortgaged_properties}
            lastDiceTotal={board.last_dice?.total ?? 2}
            highlightIndex={myState != null ? Number(myState.position) : null}
            myPlayerId={myPlayerId}
            center={
              spectator ? (
                <div className="flex flex-col items-center justify-center h-full gap-2 px-2 text-center">
                  <MonopolyDiceRoll dice={board.last_dice} />
                  <p className="text-[10px] uppercase tracking-widest text-faint">Watching live</p>
                  {board.status_message ? (
                    <p className="text-[11px] text-muted leading-snug line-clamp-4">{board.status_message}</p>
                  ) : null}
                </div>
              ) : (
                <MonopolyBoardCenter
                  board={board}
                  myPlayerId={myPlayerId}
                  myState={myState}
                  players={players}
                  acting={acting}
                  postAction={postAction}
                  colorBarClass={colorBarClass}
                />
              )
            }
          />
        </div>

        <div className="mt-4 lg:mt-0 space-y-3">
          {panelTabs}

          <div
            role="tabpanel"
            className="max-h-[min(52vh,28rem)] overflow-y-auto rounded-2xl"
          >
            {spectator && <p className="label-caps mb-3 px-1">Players</p>}
            {panel === 'build' && !spectator ? (
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
      </div>

      {!spectator && (
        <MonopolyCardAlertModal board={board} myPlayerId={myPlayerId} players={players} />
      )}

      {!spectator && (
      <MonopolyTurnModals
        board={board}
        myPlayerId={myPlayerId}
        myState={myState}
        players={players}
        acting={acting}
        postAction={postAction}
        colorBarClass={colorBarClass}
      />
      )}
    </>
  )
}
