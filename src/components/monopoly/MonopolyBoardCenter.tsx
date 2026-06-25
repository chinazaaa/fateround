'use client'

import { useCallback, useRef, useState } from 'react'
import { MonopolyDiceRoll, MonopolyYourTokenChip } from '@/components/monopoly/MonopolyBoard'
import { MonopolyJailCardInventory } from '@/components/monopoly/MonopolyChrome'
import { useMonopolyDeadlineTimer } from '@/hooks/useMonopolyModalTimer'
import { computeRent, parseBuildings, parseMortgaged } from '@/lib/monopoly-rent'
import {
  currentPlayerId,
  formatMonopolyMoney,
  MONOPOLY_JAIL_FINE,
  parsePropertyOwners,
  spaceAt,
  type MonopolyColorGroup,
} from '@/lib/monopoly'
import type { MonopolyBoard, MonopolyPlayerState, Player } from '@/types'

type PostAction = (url: string, body?: Record<string, unknown>) => Promise<void>

function BoardTimer({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null
  const urgent = seconds <= 5
  return (
    <span
      className={[
        'rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums',
        urgent ? 'bg-red-500/30 text-red-100 animate-pulse' : 'bg-emerald-950/50 text-emerald-100',
      ].join(' ')}
    >
      {seconds}s
    </span>
  )
}

function BoardPrimaryButton({
  children,
  onClick,
  disabled,
  loading,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-emerald-950 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold transition-colors w-full"
    >
      {loading ? '…' : children}
    </button>
  )
}

function BoardSecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-emerald-300/40 bg-emerald-900/70 hover:bg-emerald-800/80 disabled:opacity-40 text-emerald-50 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold transition-colors w-full"
    >
      {children}
    </button>
  )
}

export function MonopolyBoardCenter({
  board,
  myPlayerId,
  myState,
  players,
  acting,
  postAction,
  colorBarClass,
  layout = 'board',
}: {
  board: MonopolyBoard
  myPlayerId: string | null
  myState: MonopolyPlayerState | undefined
  players: Player[]
  acting: boolean
  postAction: PostAction
  colorBarClass: (color?: MonopolyColorGroup) => string
  layout?: 'board' | 'dock'
}) {
  const turnPlayerId = currentPlayerId(board)
  const isMyTurn = turnPlayerId === myPlayerId && !myState?.bankrupt

  const owners = parsePropertyOwners(board.property_owners)
  const buildings = parseBuildings(board.property_buildings)
  const mortgaged = parseMortgaged(board.mortgaged_properties)
  const pendingSpace = board.pending_space != null ? spaceAt(board.pending_space) : null

  const rentOwnerId =
    board.phase === 'pay_rent' && board.pending_space != null ? owners[String(board.pending_space)] : null
  const rentOwner = rentOwnerId ? players.find((p) => p.id === rentOwnerId) : null
  const rentAmount =
    pendingSpace && rentOwnerId
      ? computeRent(pendingSpace, owners, rentOwnerId, board.last_dice?.total ?? 2, buildings, mortgaged)
      : 0

  const auction = board.auction_state
  const auctionSpace = auction ? spaceAt(auction.space_index) : null
  const isMyAuctionTurn = auction?.current_bidder_id === myPlayerId
  const [bidAmount, setBidAmount] = useState('')

  const debt = board.pending_debt
  const isMyDebt = debt?.player_id === myPlayerId
  const debtAmount = debt
    ? debt.debt_type === 'rent' && debt.space_index != null
      ? computeRent(
          spaceAt(debt.space_index),
          owners,
          debt.creditor_player_id ?? '',
          board.last_dice?.total ?? 2,
          buildings,
          mortgaged
        )
      : debt.amount
    : 0
  const debtCreditor = debt?.creditor_player_id ? players.find((p) => p.id === debt.creditor_player_id) : null

  const showRaiseFunds = !!(isMyDebt && board.phase === 'raise_funds' && debt)
  const showBuy = !!(isMyTurn && board.phase === 'buy' && pendingSpace)
  const showRent = !!(isMyTurn && board.phase === 'pay_rent' && pendingSpace)
  const showJail = !!(isMyTurn && board.phase === 'jail' && myState?.in_jail)
  const showAuction = !!(board.phase === 'auction' && auction && isMyAuctionTurn)
  const showRoll = !!(isMyTurn && board.phase === 'roll' && !myState?.in_jail)

  const actingRef = useRef(acting)
  actingRef.current = acting

  const autoBuyAuction = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/buy', { buy: false })
  }, [postAction])

  const autoPayRent = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/rent')
  }, [postAction])

  const autoAuctionPass = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/auction', { action: 'pass' })
  }, [postAction])

  const autoRoll = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/roll')
  }, [postAction])

  const autoForfeit = useCallback(() => {
    if (!actingRef.current) void postAction('/api/monopoly/forfeit')
  }, [postAction])

  const deadline = board.turn_deadline_at ?? null
  const buySeconds = useMonopolyDeadlineTimer(deadline, showBuy, autoBuyAuction)
  const rentSeconds = useMonopolyDeadlineTimer(deadline, showRent, autoPayRent)
  const raiseFundsSeconds = useMonopolyDeadlineTimer(deadline, showRaiseFunds, autoForfeit)
  const rollSeconds = useMonopolyDeadlineTimer(deadline, showRoll, autoRoll)
  const jailSeconds = useMonopolyDeadlineTimer(deadline, showJail, autoRoll)
  const auctionSeconds = useMonopolyDeadlineTimer(deadline, showAuction, autoAuctionPass)

  const actionSeconds = showBuy
    ? buySeconds
    : showRent
      ? rentSeconds
      : showRaiseFunds
        ? raiseFundsSeconds
        : showRoll
          ? rollSeconds
          : showJail
            ? jailSeconds
            : showAuction
              ? auctionSeconds
              : 0

  const phaseColorBar =
    (showBuy || showRent) && pendingSpace?.color
      ? colorBarClass(pendingSpace.color)
      : showRaiseFunds && debt?.space_index != null && spaceAt(debt.space_index).color
        ? colorBarClass(spaceAt(debt.space_index).color)
        : showAuction && auctionSpace?.color
          ? colorBarClass(auctionSpace.color)
          : null

  const isDock = layout === 'dock'
  const shellClass = isDock
    ? 'glass-card rounded-2xl p-4 space-y-3 text-center w-full'
    : 'flex flex-col items-center justify-center h-full w-full min-w-0 px-0.5 sm:px-2 py-0.5 sm:py-2 text-center overflow-y-auto overflow-x-hidden'
  const panelClass = isDock ? 'w-full space-y-2' : 'mt-1.5 w-full max-w-[11rem] sm:max-w-[12rem] space-y-1.5'
  const widePanelClass = isDock ? 'w-full space-y-2' : 'mt-1.5 w-full max-w-[12rem] sm:max-w-[13rem] space-y-1.5'
  const rollPanelClass = isDock ? 'w-full space-y-1.5' : 'mt-2 w-full max-w-[9rem] sm:max-w-[10rem] space-y-1'
  const labelClass = isDock
    ? 'text-[10px] uppercase tracking-wider text-muted'
    : 'text-[10px] uppercase tracking-wider text-emerald-200/80'
  const titleClass = isDock
    ? 'text-sm font-bold text-[var(--foreground)] leading-tight truncate'
    : 'text-xs sm:text-sm font-bold text-white leading-tight truncate'
  const subtleClass = isDock ? 'text-xs text-muted leading-snug' : 'text-[10px] text-emerald-200/70 leading-snug'
  const priceClass = isDock
    ? 'text-lg font-black text-[var(--primary)] tabular-nums'
    : 'text-lg sm:text-xl font-black text-amber-300 tabular-nums'
  const debtPriceClass = isDock
    ? 'text-lg font-black text-red-500 tabular-nums'
    : 'text-lg sm:text-xl font-black text-red-300 tabular-nums'

  return (
    <div className={shellClass}>
      {isDock && myState && (myState.get_out_of_jail_free ?? 0) > 0 && (
        <MonopolyJailCardInventory count={myState.get_out_of_jail_free} />
      )}

      {myPlayerId && myState && !myState.bankrupt && !isDock && (
        <div className="mb-1 sm:mb-2 shrink-0 space-y-1 max-w-full">
          <MonopolyYourTokenChip players={players} playerId={myPlayerId} playerOrder={myState.player_order} compact />
          <p className="hidden sm:block text-[10px] text-emerald-200/80 leading-snug">
            Currently on <span className="font-bold text-white">{spaceAt(Number(myState.position)).name}</span>
          </p>
        </div>
      )}

      {myState && !isDock && (
        <div className="mb-1 sm:mb-1.5 shrink-0 max-w-full">
          <p className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-widest text-emerald-200/70 leading-none">
            {myState.bankrupt ? 'Bankrupt' : 'Your cash'}
          </p>
          <p
            className={[
              'text-sm sm:text-xl font-black tabular-nums leading-tight mt-0.5',
              myState.bankrupt ? 'text-red-300' : 'text-amber-300',
            ].join(' ')}
          >
            {formatMonopolyMoney(myState.cash)}
          </p>
          {(myState.get_out_of_jail_free ?? 0) > 0 && (
            <div className="mt-1 flex justify-center">
              <MonopolyJailCardInventory count={myState.get_out_of_jail_free} compact />
            </div>
          )}
        </div>
      )}

      {phaseColorBar && !isDock && <div className={['h-1 w-10 sm:w-16 rounded-full mb-1', phaseColorBar].join(' ')} />}

      {!showBuy && !showRent && !showRaiseFunds && !showJail && !showAuction && (
        <MonopolyDiceRoll dice={board.last_dice} rolling={acting} compact={!isDock} />
      )}

      {actionSeconds > 0 && (
        <div className="mt-1">
          <BoardTimer seconds={actionSeconds} />
        </div>
      )}

      {showRoll && (
        <div className={rollPanelClass}>
          <BoardPrimaryButton onClick={() => postAction('/api/monopoly/roll')} loading={acting}>
            🎲 Roll
          </BoardPrimaryButton>
          {myState && !(myState.passed_go_once ?? false) && (
            <p
              className={[
                'text-emerald-200/65 leading-snug text-center',
                isDock ? 'text-xs text-muted' : 'text-[9px]',
              ].join(' ')}
            >
              Pass GO once before buying, paying tax, drawing cards, or collecting GO salary
            </p>
          )}
        </div>
      )}

      {showBuy && pendingSpace && (
        <div className={panelClass}>
          <p className={labelClass}>For sale</p>
          <p className={titleClass}>{pendingSpace.name}</p>
          <p className={priceClass}>{formatMonopolyMoney(pendingSpace.price ?? 0)}</p>
          {pendingSpace.rent != null && <p className={subtleClass}>Rent {formatMonopolyMoney(pendingSpace.rent)}</p>}
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <BoardPrimaryButton
              onClick={() => postAction('/api/monopoly/buy', { buy: true })}
              loading={acting}
              disabled={(myState?.cash ?? 0) < (pendingSpace.price ?? 0)}
            >
              Buy
            </BoardPrimaryButton>
            <BoardSecondaryButton onClick={() => postAction('/api/monopoly/buy', { buy: false })} disabled={acting}>
              Auction
            </BoardSecondaryButton>
          </div>
        </div>
      )}

      {showRaiseFunds && debt && (
        <div className={widePanelClass}>
          <p
            className={
              isDock
                ? 'text-[10px] uppercase tracking-wider text-red-500'
                : 'text-[10px] uppercase tracking-wider text-red-200/90'
            }
          >
            Need to pay
          </p>
          <p className={titleClass}>{debt.reason}</p>
          {debtCreditor && <p className={`${subtleClass} truncate`}>To {debtCreditor.name}</p>}
          <p className={debtPriceClass}>{formatMonopolyMoney(debtAmount)}</p>
          <p className={subtleClass}>Mortgage or sell houses in Build &amp; trade, then pay — or forfeit.</p>
          <BoardPrimaryButton
            onClick={() => postAction('/api/monopoly/settle-debt')}
            loading={acting}
            disabled={(myState?.cash ?? 0) < debtAmount}
          >
            Pay now
          </BoardPrimaryButton>
          <BoardSecondaryButton onClick={() => postAction('/api/monopoly/forfeit')} disabled={acting}>
            Forfeit
          </BoardSecondaryButton>
        </div>
      )}

      {showRent && pendingSpace && (
        <div className={panelClass}>
          <p className={labelClass}>Rent due</p>
          <p className={titleClass}>{pendingSpace.name}</p>
          <p className={`${subtleClass} truncate`}>To {rentOwner?.name ?? 'owner'}</p>
          <p className={debtPriceClass}>{formatMonopolyMoney(rentAmount)}</p>
          <BoardPrimaryButton
            onClick={() => postAction('/api/monopoly/rent')}
            loading={acting}
            disabled={(myState?.cash ?? 0) < rentAmount}
          >
            Pay rent
          </BoardPrimaryButton>
        </div>
      )}

      {showJail && (
        <div className={panelClass}>
          <p className="text-lg leading-none">🔒</p>
          <p className={isDock ? 'text-sm font-bold text-[var(--foreground)]' : 'text-xs font-bold text-white'}>
            In jail
          </p>
          <p className={subtleClass}>
            Attempt {(myState?.jail_turns ?? 0) + 1}/3 — roll once for doubles, or pay £50 before rolling.
          </p>
          <div className="space-y-1">
            <BoardPrimaryButton onClick={() => postAction('/api/monopoly/roll')} loading={acting}>
              Roll for doubles
            </BoardPrimaryButton>
            <BoardSecondaryButton
              onClick={() => postAction('/api/monopoly/jail', { method: 'pay' })}
              disabled={acting || (myState?.cash ?? 0) < MONOPOLY_JAIL_FINE}
            >
              Pay {formatMonopolyMoney(MONOPOLY_JAIL_FINE)}
            </BoardSecondaryButton>
            {(myState?.get_out_of_jail_free ?? 0) > 0 && (
              <BoardSecondaryButton
                onClick={() => postAction('/api/monopoly/jail', { method: 'card' })}
                disabled={acting}
              >
                Use jail card
              </BoardSecondaryButton>
            )}
          </div>
        </div>
      )}

      {showAuction && auction && auctionSpace && (
        <div className={panelClass}>
          <p className={labelClass}>Auction</p>
          <p className={titleClass}>{auctionSpace.name}</p>
          <p className={subtleClass}>High: {auction.high_bid > 0 ? formatMonopolyMoney(auction.high_bid) : 'None'}</p>
          <input
            type="number"
            min={auction.high_bid + 1}
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            placeholder={`Min ${auction.high_bid + 1}`}
            className="input-field w-full py-1 text-xs text-center"
          />
          <div className="grid grid-cols-2 gap-1.5">
            <BoardPrimaryButton
              onClick={() =>
                postAction('/api/monopoly/auction', { action: 'bid', amount: Number(bidAmount) || undefined })
              }
              loading={acting}
              disabled={!bidAmount || Number(bidAmount) <= auction.high_bid}
            >
              Bid
            </BoardPrimaryButton>
            <BoardSecondaryButton
              onClick={() => postAction('/api/monopoly/auction', { action: 'pass' })}
              disabled={acting}
            >
              Pass
            </BoardSecondaryButton>
          </div>
        </div>
      )}

      {board.phase === 'auction' && auction && !isMyAuctionTurn && (
        <div className={isDock ? 'space-y-1' : 'mt-1.5 space-y-0.5'}>
          <p className={labelClass}>Auction</p>
          <p className={isDock ? 'text-xs text-muted leading-snug' : 'text-[11px] text-emerald-100/90 leading-snug'}>
            {auctionSpace?.name}
            <br />
            {players.find((p) => p.id === auction.current_bidder_id)?.name ?? 'Someone'}&apos;s bid
          </p>
        </div>
      )}
    </div>
  )
}
