'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { roundGenderLabel } from '@/lib/participants'
import { isGenderFreeVoting } from '@/lib/gender-based'
import {
  assignmentEmojiFor,
  tallyRoundVotes,
  getVoteCategories,
  flagForParticipant,
  tallyWyrVotes,
  tallyMltVotes,
} from '@/lib/vote-stats'
import {
  parseGameType,
  slotMeta,
  voteSlots,
  isPairGame,
  isBinaryChoiceGame,
  isThisOrThat,
  isMostLikelyTo,
  isWhoSaidThis,
} from '@/lib/game-types'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import {
  wstVoteTargets,
  wstCorrectNameFromRound,
  wstCorrectParticipantIdFromRound,
  tallyWstVotes,
} from '@/lib/who-said-this'
import { ParticipantRoundResults, WyrRoundResults, MltRoundResults, WstRoundResults } from '@/components/VoteResults'
import type { Confession, Game, Participant, Player, Round, Vote } from '@/types'

type LoadState = 'loading' | 'not_found' | 'ready'

function participantName(participants: Participant[], id: string | null): string {
  if (!id) return '—'
  return participants.find((p) => p.id === id)?.name ?? '—'
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function statusLabel(status: Game['status']): string {
  if (status === 'waiting') return 'Waiting to start'
  if (status === 'active') return 'In progress'
  return 'Finished'
}

export default function GameHistoryPage() {
  const params = useParams()
  const router = useRouter()
  const gameCode = String(params.code ?? '').toUpperCase()

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [game, setGame] = useState<Game | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [votes, setVotes] = useState<Vote[]>([])
  const [confessions, setConfessions] = useState<Confession[]>([])

  useEffect(() => {
    if (!gameCode || gameCode.length < 4) {
      setLoadState('not_found')
      return
    }

    async function load() {
      setLoadState('loading')
      const { data: gameData } = await supabase.from('games').select('*').eq('id', gameCode).maybeSingle()

      if (!gameData) {
        setLoadState('not_found')
        return
      }

      const [{ data: parts }, { data: plrs }, { data: rds }, { data: vts }, { data: confs }] = await Promise.all([
        supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
        supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
        supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
        supabase.from('votes').select('*').eq('game_id', gameCode),
        supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
      ])

      setGame(gameData)
      setParticipants(parts ?? [])
      setPlayers(plrs ?? [])
      setRounds(rds ?? [])
      setVotes(vts ?? [])
      setConfessions(confs ?? [])
      setLoadState('ready')
    }

    load()
  }, [gameCode])

  if (loadState === 'loading') {
    return (
      <div className="page-wrap flex items-center justify-center">
        <div className="w-11 h-11 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadState === 'not_found' || !game) {
    return (
      <div className="page-wrap flex items-center justify-center px-4 py-12">
        <div className="text-center space-y-4 max-w-sm">
          <p className="text-5xl">🤷</p>
          <h1 className="text-2xl font-black gradient-title-subtle">Game not found</h1>
          <p className="text-muted text-sm">
            No game with ID <span className="font-mono">{gameCode}</span>
          </p>
          <button onClick={() => router.push('/history')} className="btn-secondary px-6 py-3">
            Search again
          </button>
        </div>
      </div>
    )
  }

  const playerNameById = new Map(players.map((p) => [p.id, p.name]))
  const gameType = parseGameType(game.game_type)
  const voteColumns = voteSlots(gameType).map((slot) => ({
    slot,
    meta: slotMeta(gameType, slot),
    field:
      slot === 'kiss'
        ? ('kiss_participant_id' as const)
        : slot === 'marry'
          ? ('marry_participant_id' as const)
          : ('kill_participant_id' as const),
  }))
  const tallyCategories = getVoteCategories(gameType)
  const roundsWithVotes = rounds.filter((r) => votes.some((v) => v.round_id === r.id))

  return (
    <div className="page-wrap px-4 py-8 max-w-4xl mx-auto w-full space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="label-caps">Game history</p>
          <h1 className="text-3xl font-black tracking-tight gradient-title-subtle">{game.title}</h1>
          <p className="text-muted text-sm font-mono tracking-wider">{game.id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/history" className="btn-secondary text-sm py-2 px-4">
            Search
          </Link>
          {game.status !== 'finished' && (
            <Link href={`/game/${game.id}`} className="btn-primary text-sm py-2 px-4">
              Open game
            </Link>
          )}
        </div>
      </div>

      <div className="glass-card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Status</p>
          <p className="font-medium mt-0.5">{statusLabel(game.status)}</p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Created</p>
          <p className="mt-0.5">{formatDate(game.created_at)}</p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Players</p>
          <p className="font-medium mt-0.5">{players.length}</p>
        </div>
        <div>
          <p className="text-faint text-[10px] uppercase tracking-wider">Votes recorded</p>
          <p className="font-medium mt-0.5">{votes.length}</p>
        </div>
      </div>

      {game.anonymous && (
        <p className="callout-warning text-sm">
          This game was anonymous — individual voters are hidden. Totals per round are shown below.
        </p>
      )}

      {rounds.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">No rounds yet — the host hasn't started this game.</div>
      ) : roundsWithVotes.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">
          {rounds.length} round{rounds.length === 1 ? '' : 's'} set up, but no votes recorded yet.
        </div>
      ) : (
        <div className="space-y-8">
          {rounds.map((round) => {
            const roundVotes = votes.filter((v) => v.round_id === round.id)
            if (roundVotes.length === 0) return null

            const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))
            const roundGender = isGenderFreeVoting(game)
              ? null
              : roundGenderLabel(roundParts.map((p) => p.gender))
            const tallies = tallyRoundVotes(round.participant_ids, roundVotes)

            return (
              <section key={round.id} className="space-y-3">
                <div>
                  <h2 className="text-lg font-bold text-body">
                    Round {round.round_number}
                    {roundGender ? ` · ${roundGender}` : ''}
                  </h2>
                  <p className="text-faint text-xs mt-0.5">
                    {roundParts.map((p) => p.name).join(' · ')}
                    {round.ended_at ? ` · ended ${formatDate(round.ended_at)}` : ''}
                  </p>
                </div>

                {isBinaryChoiceGame(gameType) ? (
                  (() => {
                    const wyrTally = tallyWyrVotes(roundVotes)
                    return (
                      <WyrRoundResults
                        optionA={round.wyr_option_a ?? ''}
                        optionB={round.wyr_option_b ?? ''}
                        countA={wyrTally.countA}
                        countB={wyrTally.countB}
                        voterCount={wyrTally.voterCount}
                        mode={isThisOrThat(gameType) ? 'tot' : 'wyr'}
                      />
                    )
                  })()
                ) : isMostLikelyTo(gameType) ? (
                  (() => {
                    const mltKind = isMltImportGame(game) ? 'participant' : 'player'
                    const mltTargets = mltVoteTargets(game, participants, players)
                    const mltTally = tallyMltVotes(roundVotes, mltTargets, mltKind)
                    return (
                      <MltRoundResults
                        question={round.mlt_question ?? ''}
                        rows={mltTally.rows}
                        voterCount={mltTally.voterCount}
                        maxCount={mltTally.maxCount}
                        winnerNames={mltTally.winnerNames}
                      />
                    )
                  })()
                ) : isWhoSaidThis(gameType) ? (
                  (() => {
                    const targets = wstVoteTargets(participants)
                    const correctName = wstCorrectNameFromRound(round, players, participants)
                    const correctId = wstCorrectParticipantIdFromRound(round, players)
                    const wstTally = tallyWstVotes(roundVotes, targets, correctId)
                    return (
                      <WstRoundResults
                        quote={round.quote_text ?? '(no quote submitted)'}
                        rows={wstTally.rows}
                        voterCount={wstTally.voterCount}
                        maxCount={wstTally.maxCount}
                        topGuesses={wstTally.topGuesses}
                        correctName={correctName}
                        correctCount={wstTally.correctCount}
                      />
                    )
                  })()
                ) : isPairGame(gameType) ? (
                  <>
                    <ParticipantRoundResults
                      gameType={gameType}
                      tallies={tallies}
                      nameById={new Map(roundParts.map((p) => [p.id, p.name]))}
                      voterCount={roundVotes.length}
                      participantDetails={roundParts.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))}
                    />
                    {!game.anonymous && (
                      <details className="text-faint text-xs">
                        <summary className="cursor-pointer hover:text-muted transition-colors">Who voted what</summary>
                        <div className="mt-2 glass-card overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[24rem]">
                              <thead>
                                <tr className="border-b border-theme text-left">
                                  <th className="px-4 py-3 text-faint text-xs uppercase tracking-wider font-medium">
                                    Voter
                                  </th>
                                  {roundParts.map((p) => (
                                    <th key={p.id} className="px-4 py-3 text-center text-xs font-medium w-24">
                                      {p.name}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {roundVotes.map((vote) => (
                                  <tr key={vote.id} className="border-b border-[var(--border)] last:border-0">
                                    <td className="px-4 py-3 font-medium text-body">
                                      {playerNameById.get(vote.player_id) ?? 'Unknown'}
                                    </td>
                                    {roundParts.map((p) => {
                                      const flag = flagForParticipant(vote, p.id)
                                      const meta = flag ? slotMeta(gameType, flag) : null
                                      return (
                                        <td key={p.id} className="px-4 py-3 text-center">
                                          {meta ? (
                                            <span title={meta.label} style={{ color: meta.textColor }}>
                                              {meta.emoji} {meta.label}
                                            </span>
                                          ) : (
                                            '—'
                                          )}
                                        </td>
                                      )
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </details>
                    )}
                  </>
                ) : !game.anonymous ? (
                  <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table
                        className={`w-full text-sm ${voteColumns.length === 2 ? 'min-w-[24rem]' : 'min-w-[32rem]'}`}
                      >
                        <thead>
                          <tr className="border-b border-theme text-left">
                            <th className="px-4 py-3 text-faint text-xs uppercase tracking-wider font-medium">Voter</th>
                            {voteColumns.map(({ slot, meta }) => (
                              <th key={slot} className="px-4 py-3 text-center text-xs font-medium w-24">
                                {assignmentEmojiFor(gameType, slot)} {meta.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {roundVotes.map((vote) => (
                            <tr key={vote.id} className="border-b border-[var(--border)] last:border-0">
                              <td className="px-4 py-3 font-medium text-body">
                                {playerNameById.get(vote.player_id) ?? 'Unknown'}
                              </td>
                              {voteColumns.map(({ slot, meta, field }) => (
                                <td key={slot} className="px-4 py-3 text-center" style={{ color: meta.textColor }}>
                                  {participantName(participants, vote[field])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table
                        className={`w-full text-sm ${tallyCategories.length === 2 ? 'min-w-[16rem]' : 'min-w-[20rem]'}`}
                      >
                        <thead>
                          <tr className="border-b border-theme text-left">
                            <th className="px-4 py-3 text-faint text-xs uppercase tracking-wider font-medium">Name</th>
                            {tallyCategories.map((category) => (
                              <th key={category} className="px-4 py-3 text-center text-xs font-medium w-16">
                                {slotMeta(gameType, category === 'smash' ? 'kill' : category).emoji}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tallies.map((t) => (
                            <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                              <td className="px-4 py-3 font-medium text-body">{participantName(participants, t.id)}</td>
                              {tallyCategories.map((category) => (
                                <td key={category} className="px-4 py-3 text-center text-body-muted">
                                  {t[category]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!game.anonymous && !isPairGame(gameType) && (
                  <details className="text-faint text-xs">
                    <summary className="cursor-pointer hover:text-muted transition-colors">Round totals</summary>
                    <div className="mt-2 glass-card overflow-hidden">
                      <div className="overflow-x-auto">
                        <table
                          className={`w-full text-sm ${tallyCategories.length === 2 ? 'min-w-[16rem]' : 'min-w-[20rem]'}`}
                        >
                          <thead>
                            <tr className="border-b border-theme">
                              <th className="px-4 py-2 text-left text-xs uppercase tracking-wider">Name</th>
                              {tallyCategories.map((category) => (
                                <th key={category} className="px-4 py-2 text-center w-16">
                                  {slotMeta(gameType, category === 'smash' ? 'kill' : category).emoji}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tallies.map((t) => (
                              <tr key={t.id} className="border-b border-[var(--border)] last:border-0">
                                <td className="px-4 py-2 text-body-muted">{participantName(participants, t.id)}</td>
                                {tallyCategories.map((category) => (
                                  <td key={category} className="px-4 py-2 text-center text-body-muted">
                                    {t[category]}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </details>
                )}
              </section>
            )
          })}
        </div>
      )}

      {confessions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-muted text-xs uppercase tracking-wider">Hot takes</h2>
          <div className="space-y-2">
            {confessions.map((c) => {
              const round = rounds.find((r) => r.id === c.round_id)
              return (
                <div key={c.id} className="glass-card px-4 py-3">
                  <p className="text-body-muted text-sm italic">&ldquo;{c.text}&rdquo;</p>
                  {round && <p className="text-faint text-xs mt-1">Round {round.round_number}</p>}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <p className="text-center pb-4">
        <Link href="/" className="text-faint text-sm hover:text-body transition-colors">
          ← Back home
        </Link>
      </p>
    </div>
  )
}
