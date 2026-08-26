'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Game, GoFishCard, GoFishEvent, GoFishPlayerHand, GoFishRank, GoFishSession, Player } from '@/types'
import {
  askableRanks,
  currentPlayerId,
  describeGoFishEvent,
  gofishRankLabel,
  gofishRankPlural,
  GOFISH_RANKS,
} from '@/lib/gofish'
import { useToast } from '@/components/ui/Toast'
import { useGoFishTurnTimer } from '@/hooks/useGoFishTurnTimer'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'
import { GoFishCardBack, GoFishCardCountBadge, GoFishCardFace } from '@/components/gofish/GoFishCardFace'
import { GoFishFinalResultsShareBlock } from '@/components/gofish/GoFishFinalResultsShareBlock'

type Props = {
  gameCode: string
  game: Game
  players: Player[]
  session: GoFishSession | null
  hands: GoFishPlayerHand[]
  myPlayerId: string
  myResumeToken: string | null
  onReload: () => void | Promise<unknown>
  readOnly?: boolean
}

/**
 * Go Fish live surface — your hand, everyone else's card + book counts, the ask picker,
 * and the shared event log. All rules are enforced server-side (see gofish.ts); this UI
 * only surfaces the choices the ruleset allows (targets with cards, ranks you hold).
 */
export function GoFishActiveRound({
  gameCode,
  game,
  players,
  session,
  hands,
  myPlayerId,
  myResumeToken,
  onReload,
  readOnly,
}: Props) {
  const { error: toastError } = useToast()
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)
  const [selectedRank, setSelectedRank] = useState<GoFishRank | null>(null)
  const [asking, setAsking] = useState(false)
  const [refilling, setRefilling] = useState(false)

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])
  const nameOf = (id: string) => playersById.get(id)?.name ?? 'Player'

  const myHandRow = hands.find((h) => h.player_id === myPlayerId) ?? null
  const myCards: GoFishCard[] = (myHandRow?.cards ?? []) as GoFishCard[]
  const myBooks: GoFishRank[] = (myHandRow?.books ?? []) as GoFishRank[]

  const askable = useMemo(() => askableRanks(myCards), [myCards])
  const activeTurnPlayerId = session ? currentPlayerId(session) : null
  const isMyTurn = !readOnly && activeTurnPlayerId === myPlayerId
  const isFinished = game.status === 'finished' || session?.phase === 'finished'

  // Client countdown + auto-poke expire-turn when the deadline lands. Runs for every
  // watcher, not just the active player: if the browser tab of the active player is
  // asleep, any other client will nudge the server to auto-play.
  const { secondsLeft, hasTimer: hasTurnTimer } = useGoFishTurnTimer(gameCode, session, !isFinished)

  const eligibleTargets = useMemo(
    () =>
      players
        .filter((p) => p.id !== myPlayerId)
        .map((p) => ({ player: p, hand: hands.find((h) => h.player_id === p.id) ?? null }))
        .filter(({ hand }) => (hand?.card_count ?? (hand?.cards as unknown[] | null)?.length ?? 0) > 0),
    [players, hands, myPlayerId]
  )

  const needsRefill = isMyTurn && myCards.length === 0 && (session?.ocean_count ?? 0) > 0 && !!myResumeToken

  const submitRefill = useCallback(async () => {
    if (!myResumeToken || refilling) return
    setRefilling(true)
    try {
      const res = await fetch('/api/gofish/refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: gameCode, resumeToken: myResumeToken }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Refill failed')
      await onReload()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Refill failed')
    } finally {
      setRefilling(false)
    }
  }, [gameCode, myResumeToken, refilling, onReload, toastError])

  // Auto-refill the moment the turn opens with an empty hand and ocean cards. Physical Go Fish
  // draws automatically — the manual button was a friction moment ("why am I stuck?"). The
  // guard on `refilling` stops the effect from double-firing while the request is in flight;
  // once state updates the condition flips off.
  useEffect(() => {
    if (needsRefill && !refilling) void submitRefill()
  }, [needsRefill, refilling, submitRefill])

  const submitAsk = async () => {
    if (!isMyTurn || asking || !selectedTargetId || selectedRank == null || !myResumeToken) return
    setAsking(true)
    try {
      const res = await fetch('/api/gofish/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameCode,
          resumeToken: myResumeToken,
          targetPlayerId: selectedTargetId,
          rank: selectedRank,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Ask failed')
      setSelectedRank(null)
      setSelectedTargetId(null)
      await onReload()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Ask failed')
    } finally {
      setAsking(false)
    }
  }

  const events = session?.event_log ?? []
  const latestEvent = events.length > 0 ? events[events.length - 1] : null

  return (
    <div className="space-y-6">
      {latestEvent && !isFinished && <JustHappenedBanner event={latestEvent} myPlayerId={myPlayerId} nameOf={nameOf} />}
      <TurnStatusBanner
        activeName={activeTurnPlayerId ? nameOf(activeTurnPlayerId) : 'Nobody'}
        isMyTurn={isMyTurn}
        oceanCount={session?.ocean_count ?? 0}
        isFinished={isFinished}
        secondsLeft={hasTurnTimer ? secondsLeft : null}
      />

      {isFinished ? (
        <>
          <GoFishFinalResultsShareBlock
            game={game}
            players={players}
            hands={hands}
            session={session}
            winnerName={session?.winner_player_id ? nameOf(session.winner_player_id) : undefined}
            highlightPlayerId={myPlayerId || undefined}
          />
          {!readOnly && myPlayerId && session?.winner_player_id === myPlayerId && (
            <PostWinToCommunity
              gameType="gofish"
              gameCode={gameCode}
              winnerName={playersById.get(myPlayerId)?.name ?? ''}
              roundKey={game.session_started_at ?? session?.id}
            />
          )}
        </>
      ) : (
        <>
          {!readOnly && myHandRow && <MyHand cards={myCards} myBooks={myBooks} />}
          {!readOnly && needsRefill && <RefillPrompt oceanCount={session?.ocean_count ?? 0} />}
          {!readOnly && isMyTurn && !needsRefill && (
            <AskPicker
              askableRanks={askable}
              eligibleTargets={eligibleTargets.map(({ player, hand }) => ({
                id: player.id,
                name: player.name,
                cardCount: (hand?.card_count ?? (hand?.cards as unknown[] | null)?.length ?? 0) as number,
                books: (hand?.books ?? []) as GoFishRank[],
              }))}
              selectedTargetId={selectedTargetId}
              onSelectTarget={setSelectedTargetId}
              selectedRank={selectedRank}
              onSelectRank={setSelectedRank}
              onSubmit={submitAsk}
              asking={asking}
            />
          )}
          <OpponentsPanel
            players={players.filter((p) => p.id !== myPlayerId)}
            hands={hands}
            nameOf={nameOf}
            activeTurnPlayerId={activeTurnPlayerId}
          />
        </>
      )}

      <EventLog events={session?.event_log ?? []} nameOf={nameOf} />
    </div>
  )
}

function TurnStatusBanner({
  activeName,
  isMyTurn,
  oceanCount,
  isFinished,
  secondsLeft,
}: {
  activeName: string
  isMyTurn: boolean
  oceanCount: number
  isFinished: boolean
  secondsLeft: number | null
}) {
  const urgent = secondsLeft != null && secondsLeft > 0 && secondsLeft <= 10
  return (
    <div className="rounded-2xl border border-white/10 bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] px-4 py-3 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted">Turn</p>
        <p className="text-lg font-semibold truncate">
          {isFinished ? 'Game over' : isMyTurn ? 'Your turn — pick a target' : `${activeName} is asking…`}
        </p>
      </div>
      {!isFinished && secondsLeft != null && (
        <div className="text-right shrink-0">
          <p className="text-xs uppercase tracking-wide text-muted">Time</p>
          <p className={`font-mono text-lg font-bold tabular-nums ${urgent ? 'text-rose-400 animate-pulse' : ''}`}>
            {Math.max(0, secondsLeft)}s
          </p>
        </div>
      )}
      <div className="text-right shrink-0">
        <p className="text-xs uppercase tracking-wide text-muted">Ocean</p>
        <p className="text-lg font-semibold">🐟 {oceanCount}</p>
      </div>
    </div>
  )
}

function MyHand({ cards, myBooks }: { cards: GoFishCard[]; myBooks: GoFishRank[] }) {
  // Sort by rank so like cards sit together — the human eye groups a Go Fish hand that way
  // and it makes "which ranks am I holding" scannable at a glance.
  const sorted = [...cards].sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank
    return a.suit.localeCompare(b.suit)
  })
  // Count each rank so we can badge stacks of 2/3 with a small "×2" chip on the top card.
  const perRank = new Map<GoFishRank, number>()
  for (const card of cards) perRank.set(card.rank, (perRank.get(card.rank) ?? 0) + 1)
  const seenRanks = new Set<GoFishRank>()

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your hand · {cards.length}</h2>
        {myBooks.length > 0 && <BooksRow books={myBooks} label="Your books" />}
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-muted">No cards — refill on your next turn if the ocean has any left.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sorted.map((card) => {
            // Only badge the first card of each rank — the second copy sits behind it
            // without duplicating the count.
            const showBadge = !seenRanks.has(card.rank)
            seenRanks.add(card.rank)
            return (
              <div key={card.id} className="relative">
                <GoFishCardFace card={card} className="w-14 sm:w-16" />
                {showBadge && <GoFishCardCountBadge count={perRank.get(card.rank) ?? 1} />}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function BooksRow({ books, label }: { books: GoFishRank[]; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted">{label}:</span>
      <div className="flex gap-1 flex-wrap">
        {books.map((rank) => (
          <span key={rank} className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-100 text-xs font-mono">
            📚 {gofishRankPlural(rank)}
          </span>
        ))}
      </div>
    </div>
  )
}

function AskPicker({
  askableRanks: ranks,
  eligibleTargets,
  selectedTargetId,
  onSelectTarget,
  selectedRank,
  onSelectRank,
  onSubmit,
  asking,
}: {
  askableRanks: GoFishRank[]
  eligibleTargets: { id: string; name: string; cardCount: number; books: GoFishRank[] }[]
  selectedTargetId: string | null
  onSelectTarget: (id: string | null) => void
  selectedRank: GoFishRank | null
  onSelectRank: (rank: GoFishRank | null) => void
  onSubmit: () => void
  asking: boolean
}) {
  if (ranks.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm text-muted">You have no cards in hand — waiting for refill on the next turn.</p>
      </section>
    )
  }
  if (eligibleTargets.length === 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm text-muted">Nobody else has cards to ask right now.</p>
      </section>
    )
  }
  const canSubmit = !asking && selectedTargetId != null && selectedRank != null
  return (
    <section
      className="rounded-2xl border p-4 space-y-4"
      style={{
        borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--primary) 6%, transparent)',
      }}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">Your turn — ask a player</h2>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">1. Pick a player</p>
        <div className="flex flex-wrap gap-2">
          {eligibleTargets.map((t) => {
            const selected = selectedTargetId === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTarget(t.id === selectedTargetId ? null : t.id)}
                className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
                  selected
                    ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-body'
                    : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                }`}
                aria-pressed={selected}
              >
                <span className="font-medium">{t.name}</span>{' '}
                <span className="text-muted text-xs">
                  · {t.cardCount} cards · {t.books.length} books
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">2. Pick a rank you already hold</p>
        <div className="flex flex-wrap gap-2">
          {ranks.map((rank) => {
            const selected = selectedRank === rank
            return (
              <button
                key={rank}
                type="button"
                onClick={() => onSelectRank(rank === selectedRank ? null : rank)}
                className={`px-3 py-2 rounded-xl border text-sm font-mono font-bold transition-colors ${
                  selected
                    ? 'border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_18%,transparent)] text-body'
                    : 'border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'
                }`}
                aria-pressed={selected}
                aria-label={`Ask for rank ${gofishRankLabel(rank)}`}
              >
                {gofishRankLabel(rank)}
              </button>
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit}
        className="btn-primary w-full py-3 text-base disabled:opacity-40"
      >
        {asking
          ? 'Asking…'
          : selectedTargetId && selectedRank
            ? `Ask ${eligibleTargets.find((t) => t.id === selectedTargetId)?.name ?? 'them'} for ${gofishRankPlural(selectedRank)}`
            : 'Pick a player and rank'}
      </button>
    </section>
  )
}

/**
 * Rendered when the active player starts their turn with 0 cards and the ocean still
 * has cards — the physical-game rule is that they draw a fresh hand (up to 5) to stay
 * in the game. Standalone action so the player doesn't get stranded when the picker is
 * gated on "hold at least one card of the rank you ask".
 */
function RefillPrompt({ oceanCount }: { oceanCount: number }) {
  // Auto-refill fires from the parent effect — this is a status card, not a button.
  // Just tell the player what's happening so the moment the round pauses makes sense.
  const drawing = Math.min(5, oceanCount)
  return (
    <section
      className="rounded-2xl border p-4 flex items-center gap-3"
      style={{
        borderColor: 'color-mix(in srgb, var(--primary) 30%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--primary) 6%, transparent)',
      }}
    >
      <span className="text-2xl animate-pulse" aria-hidden>
        🐟
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--primary)]">Drawing from the ocean…</h2>
        <p className="text-xs text-muted mt-0.5">
          Refilling your hand with {drawing} card{drawing === 1 ? '' : 's'}, then you ask.
        </p>
      </div>
    </section>
  )
}

function OpponentsPanel({
  players,
  hands,
  nameOf,
  activeTurnPlayerId,
}: {
  players: Player[]
  hands: GoFishPlayerHand[]
  nameOf: (id: string) => string
  activeTurnPlayerId: string | null
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Opponents</h2>
      <div className="space-y-3">
        {players.map((p) => {
          const hand = hands.find((h) => h.player_id === p.id) ?? null
          const cardCount = (hand?.card_count ?? (hand?.cards as unknown[] | null)?.length ?? 0) as number
          const books = (hand?.books ?? []) as GoFishRank[]
          const isTheirTurn = p.id === activeTurnPlayerId
          // Small fan of face-down backs so opponents "look like" a Go Fish hand rather
          // than a numeric row. Cap at 6 to keep the row bounded on narrow screens; the
          // count under the name is the source of truth.
          const shownBacks = Math.min(cardCount, 6)
          return (
            <div
              key={p.id}
              className={
                isTheirTurn
                  ? 'rounded-xl px-3 py-2 border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]'
                  : 'rounded-xl bg-white/5 px-3 py-2 border border-transparent'
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{nameOf(p.id)}</p>
                    {isTheirTurn && (
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[var(--primary)] text-white animate-pulse">
                        Asking…
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted">
                    {cardCount} card{cardCount === 1 ? '' : 's'} · {books.length} book{books.length === 1 ? '' : 's'}
                  </p>
                </div>
                {cardCount > 0 ? (
                  <div className="flex items-center -space-x-3">
                    {Array.from({ length: shownBacks }).map((_, i) => (
                      <GoFishCardBack key={i} className="w-6 sm:w-7 shrink-0 shadow-sm" />
                    ))}
                    {cardCount > shownBacks && (
                      <span className="ml-2 text-xs text-muted">+{cardCount - shownBacks}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted">out</span>
                )}
              </div>
              {books.length > 0 && (
                <div className="mt-2 flex gap-1 flex-wrap">
                  {books.map((rank) => (
                    <span
                      key={rank}
                      className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-100 text-xs font-mono"
                    >
                      📚 {gofishRankPlural(rank)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function EventLog({ events, nameOf }: { events: GoFishSession['event_log']; nameOf: (id: string) => string }) {
  const shown = events.slice(-20).reverse()
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recent activity</h2>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {shown.map((event, i) => (
            <li key={i} className="text-body">
              {describeGoFishEvent(event, nameOf)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Big transient callout above the round showing what just happened, phrased from the
 * viewer's perspective ("You got 2 sevens from Alice!" vs "Alice took 2 sevens from Bob").
 *
 * The event log is a running history — useful, but a wall of text. This surfaces only the
 * newest event and fades it after ~5s so the player never has to hunt for "wait, what
 * happened last turn?" The message swaps as new events arrive; the fade is tied to the
 * event's identity (kind + at) so consecutive identical events still restart the timer.
 */
function JustHappenedBanner({
  event,
  myPlayerId,
  nameOf,
}: {
  event: GoFishEvent
  myPlayerId: string
  nameOf: (id: string) => string
}) {
  const [visible, setVisible] = useState(true)
  // Key any client-scoped reset off the event's identity — the append-only log gives us `at`
  // for free, and pairing it with kind guards against a same-timestamp burst.
  const key = `${event.kind}:${event.at}`
  const lastKey = useRef<string | null>(null)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(t)
  }, [key])
  if (!visible) return null

  let emoji = '💬'
  let text = describeGoFishEvent(event, nameOf)

  switch (event.kind) {
    case 'ask_hit': {
      emoji = '🎯'
      const rank = gofishRankPlural(event.rank)
      const count = event.count
      if (event.from_id === myPlayerId) {
        text = `You got ${count} ${rank} from ${nameOf(event.target_id)}. Go again!`
      } else if (event.target_id === myPlayerId) {
        text = `${nameOf(event.from_id)} took ${count} of your ${rank}. They go again.`
      } else {
        text = `${nameOf(event.from_id)} took ${count} ${rank} from ${nameOf(event.target_id)}.`
      }
      break
    }
    case 'ask_miss': {
      emoji = '🐟'
      const rank = gofishRankPlural(event.rank)
      if (event.from_id === myPlayerId) {
        if (!event.drew) text = `You asked for ${rank}. Go Fish! (ocean's empty)`
        else if (event.lucky_draw) text = `Go Fish! Lucky — you drew a ${gofishRankLabel(event.rank)}. Go again!`
        else text = `Go Fish! You drew a card from the ocean.`
      } else if (event.target_id === myPlayerId) {
        text = `${nameOf(event.from_id)} asked you for ${rank}. Go Fish!`
      } else {
        text = `${nameOf(event.from_id)} asked ${nameOf(event.target_id)} for ${rank} — Go Fish!`
      }
      break
    }
    case 'book': {
      emoji = '📚'
      const rank = gofishRankPlural(event.rank)
      text =
        event.player_id === myPlayerId
          ? `Book of ${rank}! You collected all four.`
          : `${nameOf(event.player_id)} completed a book of ${rank}.`
      break
    }
    case 'refill': {
      emoji = '🃏'
      text =
        event.player_id === myPlayerId
          ? `You drew ${event.count} fresh card${event.count === 1 ? '' : 's'} from the ocean.`
          : `${nameOf(event.player_id)} drew ${event.count} fresh card${event.count === 1 ? '' : 's'}.`
      break
    }
    case 'out_of_cards': {
      emoji = '🏳️'
      text = event.player_id === myPlayerId ? `You're out of cards!` : `${nameOf(event.player_id)} is out.`
      break
    }
    case 'game_over': {
      emoji = '🏆'
      text = 'Game over — see the standings below.'
      break
    }
  }
  return (
    <div
      className="rounded-2xl border border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,var(--surface))] px-4 py-3 flex items-center gap-3 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <span className="text-2xl shrink-0" aria-hidden>
        {emoji}
      </span>
      <p className="text-sm sm:text-base font-semibold text-body">{text}</p>
    </div>
  )
}

export const GOFISH_ALL_RANKS = GOFISH_RANKS
