'use client'

import { useMemo, useState } from 'react'
import type { Game, GoFishCard, GoFishPlayerHand, GoFishRank, GoFishSession, Player } from '@/types'
import {
  askableRanks,
  buildGoFishStandings,
  currentPlayerId,
  describeGoFishEvent,
  gofishRankLabel,
  gofishRankPlural,
  GOFISH_RANKS,
} from '@/lib/gofish'
import { useToast } from '@/components/ui/Toast'
import { useGoFishTurnTimer } from '@/hooks/useGoFishTurnTimer'
import { PostWinToCommunity } from '@/components/community/PostWinToCommunity'

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

  const standings = useMemo(
    () => buildGoFishStandings(hands, players.map((p) => ({ id: p.id, name: p.name }))),
    [hands, players]
  )

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

  return (
    <div className="space-y-6">
      <TurnStatusBanner
        activeName={activeTurnPlayerId ? nameOf(activeTurnPlayerId) : 'Nobody'}
        isMyTurn={isMyTurn}
        oceanCount={session?.ocean_count ?? 0}
        isFinished={isFinished}
        secondsLeft={hasTurnTimer ? secondsLeft : null}
      />

      {isFinished ? (
        <>
          <FinishedResults standings={standings} winnerId={session?.winner_player_id ?? null} nameOf={nameOf} />
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
          {!readOnly && myHandRow && (
            <MyHand cards={myCards} myBooks={myBooks} />
          )}
          {!readOnly && isMyTurn && (
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
  const grouped = new Map<GoFishRank, GoFishCard[]>()
  for (const card of cards) {
    if (!grouped.has(card.rank)) grouped.set(card.rank, [])
    grouped.get(card.rank)!.push(card)
  }
  const sortedRanks = [...grouped.keys()].sort((a, b) => a - b)
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Your hand · {cards.length}</h2>
        {myBooks.length > 0 && <BooksRow books={myBooks} label="Your books" />}
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-muted">No cards — refill on your next turn if the ocean has any left.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sortedRanks.map((rank) => (
            <div key={rank} className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 font-mono text-lg">
              <span className="font-bold">{gofishRankLabel(rank)}</span>
              <span className="text-xs text-muted">× {grouped.get(rank)!.length}</span>
            </div>
          ))}
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
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Your turn — ask a player</h2>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">1. Pick a player</p>
        <div className="flex flex-wrap gap-2">
          {eligibleTargets.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTarget(t.id === selectedTargetId ? null : t.id)}
              className={`px-3 py-2 rounded-xl border text-sm transition-colors ${
                selectedTargetId === t.id
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              <span className="font-medium">{t.name}</span>{' '}
              <span className="text-muted text-xs">· {t.cardCount} cards · {t.books.length} books</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted">2. Pick a rank you already hold</p>
        <div className="flex flex-wrap gap-2">
          {ranks.map((rank) => (
            <button
              key={rank}
              type="button"
              onClick={() => onSelectRank(rank === selectedRank ? null : rank)}
              className={`px-3 py-2 rounded-xl border text-sm font-mono font-bold transition-colors ${
                selectedRank === rank
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                  : 'border-white/10 bg-white/5 hover:bg-white/10'
              }`}
            >
              {gofishRankLabel(rank)}
            </button>
          ))}
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

function OpponentsPanel({
  players,
  hands,
  nameOf,
}: {
  players: Player[]
  hands: GoFishPlayerHand[]
  nameOf: (id: string) => string
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Opponents</h2>
      <div className="space-y-2">
        {players.map((p) => {
          const hand = hands.find((h) => h.player_id === p.id) ?? null
          const cardCount = (hand?.card_count ?? (hand?.cards as unknown[] | null)?.length ?? 0) as number
          const books = (hand?.books ?? []) as GoFishRank[]
          return (
            <div key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
              <div>
                <p className="font-medium">{nameOf(p.id)}</p>
                <p className="text-xs text-muted">
                  {cardCount} card{cardCount === 1 ? '' : 's'} · {books.length} book{books.length === 1 ? '' : 's'}
                </p>
              </div>
              {books.length > 0 && (
                <div className="flex gap-1 flex-wrap justify-end max-w-[60%]">
                  {books.map((rank) => (
                    <span key={rank} className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-100 text-xs font-mono">
                      {gofishRankPlural(rank)}
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

function EventLog({
  events,
  nameOf,
}: {
  events: GoFishSession['event_log']
  nameOf: (id: string) => string
}) {
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

function FinishedResults({
  standings,
  winnerId,
  nameOf,
}: {
  standings: ReturnType<typeof buildGoFishStandings>
  winnerId: string | null
  nameOf: (id: string) => string
}) {
  const winnerName = winnerId ? nameOf(winnerId) : standings[0]?.name ?? 'No winner'
  return (
    <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-6 text-center space-y-4">
      <p className="text-xs uppercase tracking-wide text-amber-200">Winner</p>
      <h2 className="text-3xl font-black">🏆 {winnerName}</h2>
      <div className="mt-4 space-y-2">
        {standings.map((s) => (
          <div
            key={s.playerId}
            className={`flex justify-between rounded-xl px-3 py-2 ${
              s.playerId === winnerId ? 'bg-amber-500/20 border border-amber-400/40' : 'bg-white/5'
            }`}
          >
            <span className="font-medium">
              #{s.rank} · {s.name}
            </span>
            <span className="text-sm text-muted">
              {s.books} book{s.books === 1 ? '' : 's'} · {s.cardCount} left
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

export const GOFISH_ALL_RANKS = GOFISH_RANKS
