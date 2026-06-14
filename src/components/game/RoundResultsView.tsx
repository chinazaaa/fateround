'use client'

import { Avatar } from '@/components/Avatar'
import {
  ParticipantRoundResults,
  VoteCountStat,
  WyrRoundResults,
  MltRoundResults,
  WstRoundResults,
  AnimeWstRoundResults,
} from '@/components/VoteResults'
import { CustomRoundResults } from '@/components/CustomRoundResults'
import { ShareRoundResults } from '@/components/ShareRoundResults'
import { ConfessionsTicker } from '@/components/ConfessionsTicker'
import { GameTypeBadge } from '@/components/GameTypeBadge'
import ReactionBar from '@/components/ReactionBar'
import { roundResultsWaitMessage } from '@/lib/round-timing'
import {
  tallyRoundVotes,
  tallyWyrVotes,
  tallyMltVotes,
  getCategoryMeta,
  getVoteCategories,
  assignmentEmojiFor,
  myActionBorderClass,
  flagForParticipant,
} from '@/lib/vote-stats'
import {
  parseGameType,
  slotMeta,
  voteSlots,
  isPairGame,
  isWouldYouRather,
  isMostLikelyTo,
  isWhoSaidThis,
  isHotSeat,
  isCustomGame,
} from '@/lib/game-types'
import { isMltImportGame, mltTargetIdFromVote, mltVoteTargets } from '@/lib/mlt'
import {
  wstVoteTargets,
  wstCorrectNameFromRound,
  wstCorrectParticipantIdFromRound,
  tallyWstVotes,
  isAnimeRound,
  tallyAnimeWstVotes,
} from '@/lib/who-said-this'
import { getCustomSlots, tallyCustomVotes } from '@/lib/custom-game'
import { roundGenderLabel, getRoundParticipantGender, canPlayerVoteInRound } from '@/lib/participants'
import type { PlayerGender } from '@/types'
import type { Game, Participant, Player, Round, Vote, Confession } from '@/types'
interface HotSeatSubmissionItem {
  id: string
  text: string
  submission_type: string
}

interface RoundResultsViewProps {
  game: Game | null
  participants: Participant[]
  players: Player[]
  myPlayerId: string | null
  myPlayerName: string | null
  myPlayerGender: PlayerGender | null
  lastFinishedRound: Round
  lastRoundVotes: Vote[]
  allConfessions: Confession[]
  hotSeatSubmissions: HotSeatSubmissionItem[]
  nextRoundCountdown: number | null
  finalRevealCountdown: number | null
}

function PlayerNameBar({ name }: { name: string | null | undefined }) {
  if (!name) return null
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/8 mb-4">
      <Avatar name={name} size="sm" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-faint leading-none">Playing as</p>
        <p className="text-sm font-semibold truncate">{name}</p>
      </div>
    </div>
  )
}

export function RoundResultsView({
  game,
  participants,
  players,
  myPlayerId,
  myPlayerName,
  myPlayerGender,
  lastFinishedRound,
  lastRoundVotes,
  allConfessions,
  hotSeatSubmissions,
  nextRoundCountdown,
  finalRevealCountdown,
}: RoundResultsViewProps) {
  const gameType = parseGameType(game?.game_type)

  if (isHotSeat(gameType)) {
    const hotSeatPlayerId = lastFinishedRound.submitter_player_id
    const hotSeatPlayerName = players.find((p) => p.id === hotSeatPlayerId)?.name ?? 'Someone'
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        <PlayerNameBar name={myPlayerName} />
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
          </p>
          <GameTypeBadge gameType={gameType} className="mt-2" />
          <h2 className="text-2xl font-black tracking-tight mt-2">Hot Seat Reveal! 🪑🔥</h2>
        </div>

        {/* Hot seat player spotlight */}
        <div className="glass-card border-2 border-amber-500/40 rounded-2xl p-4 text-center">
          <p className="text-amber-400 text-xs uppercase tracking-wider mb-1">In the hot seat</p>
          <p className="text-2xl font-black text-body">{hotSeatPlayerName}</p>
        </div>

        {/* Submissions reveal */}
        {hotSeatSubmissions.length === 0 ? (
          <div className="glass-card px-4 py-6 text-center">
            <p className="text-muted">No submissions this round</p>
          </div>
        ) : (
          <div className="space-y-3">
            {hotSeatSubmissions.map((sub, i) => {
              const typeConfig = {
                compliment: { emoji: '💛', border: 'border-amber-500/30', bg: 'bg-amber-500/10' },
                roast: { emoji: '🔥', border: 'border-red-500/30', bg: 'bg-red-500/10' },
                observation: { emoji: '👀', border: 'border-slate-500/30', bg: 'bg-slate-500/10' },
              }[sub.submission_type] ?? { emoji: '💬', border: 'border-slate-500/30', bg: 'bg-slate-500/10' }

              return (
                <div
                  key={sub.id}
                  className={`glass-card border ${typeConfig.border} ${typeConfig.bg} rounded-xl px-4 py-3`}
                  style={{
                    animation: 'fade-in 0.4s ease backwards',
                    animationDelay: `${i * 150}ms`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">{typeConfig.emoji}</span>
                    <p className="text-body text-sm leading-relaxed">{sub.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <ReactionBar className="pt-1" />
        <p className="text-faint text-sm text-center">
          {roundResultsWaitMessage({
            isLastRound,
            autoReveal: !!game?.auto_reveal,
            nextRoundSecondsLeft: nextRoundCountdown ?? 0,
            finalRevealSecondsLeft: finalRevealCountdown ?? 0,
          })}
        </p>
      </div>
    )
  }

  if (isWouldYouRather(gameType)) {
    const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
    const { countA, countB, voterCount } = tallyWyrVotes(lastRoundVotes)
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        <PlayerNameBar name={myPlayerName} />
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
          </p>
          <GameTypeBadge gameType={gameType} className="mt-2" />
          <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🗳️</h2>
        </div>
        <WyrRoundResults
          optionA={lastFinishedRound.wyr_option_a ?? ''}
          optionB={lastFinishedRound.wyr_option_b ?? ''}
          countA={countA}
          countB={countB}
          voterCount={voterCount}
          myChoice={myVote?.wyr_choice ?? null}
        />
        <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
        <ReactionBar className="pt-1" />
        <ShareRoundResults
          game={game!}
          round={lastFinishedRound}
          votes={lastRoundVotes}
          participants={participants}
          players={players}
        />
        <p className="text-faint text-sm text-center">
          {roundResultsWaitMessage({
            isLastRound,
            autoReveal: !!game?.auto_reveal,
            nextRoundSecondsLeft: nextRoundCountdown ?? 0,
            finalRevealSecondsLeft: finalRevealCountdown ?? 0,
          })}
        </p>
      </div>
    )
  }

  if (isWhoSaidThis(gameType) && game) {
    const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
    const myPickName = lastFinishedRound.anime_metadata
      ? (myVote?.anime_choice ?? null)
      : myVote?.target_participant_id
        ? (participants.find((p) => p.id === myVote.target_participant_id)?.name ?? null)
        : null
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

    if (isAnimeRound(lastFinishedRound)) {
      const meta = lastFinishedRound.anime_metadata as {
        anime_name: string
        correct_character: string
        choices: string[]
      }
      const animeTally = tallyAnimeWstVotes(lastRoundVotes, meta.choices, meta.correct_character)
      return (
        <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
          <PlayerNameBar name={myPlayerName} />
          <div className="text-center">
            <p className="text-muted text-xs uppercase tracking-wider">
              Round {lastFinishedRound.round_number} of {game?.rounds_count}
            </p>
            <GameTypeBadge gameType={gameType} className="mt-2" />
            <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🕵️</h2>
          </div>
          <AnimeWstRoundResults
            quote={lastFinishedRound.quote_text ?? '(no quote)'}
            animeName={meta.anime_name}
            rows={animeTally.rows}
            voterCount={animeTally.voterCount}
            maxCount={animeTally.maxCount}
            topGuesses={animeTally.topGuesses}
            correctCharacter={meta.correct_character}
            correctCount={animeTally.correctCount}
            myPickName={myPickName}
          />
          <ShareRoundResults
            game={game!}
            round={lastFinishedRound}
            votes={lastRoundVotes}
            participants={participants}
            players={players}
          />
          <p className="text-faint text-sm text-center">
            {roundResultsWaitMessage({
              isLastRound,
              autoReveal: !!game?.auto_reveal,
              nextRoundSecondsLeft: nextRoundCountdown ?? 0,
              finalRevealSecondsLeft: finalRevealCountdown ?? 0,
            })}
          </p>
        </div>
      )
    }

    const targets = wstVoteTargets(participants)
    const correctName = wstCorrectNameFromRound(lastFinishedRound, players, participants)
    const correctId = wstCorrectParticipantIdFromRound(lastFinishedRound, players)
    const { rows, voterCount, maxCount, topGuesses, correctCount } = tallyWstVotes(lastRoundVotes, targets, correctId)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        <PlayerNameBar name={myPlayerName} />
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
          </p>
          <GameTypeBadge gameType={gameType} className="mt-2" />
          <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🕵️</h2>
        </div>
        <WstRoundResults
          quote={lastFinishedRound.quote_text ?? '(no quote submitted)'}
          rows={rows}
          voterCount={voterCount}
          maxCount={maxCount}
          topGuesses={topGuesses}
          correctName={correctName}
          correctCount={correctCount}
          myPickName={myPickName}
        />
        <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
        <ReactionBar className="pt-1" />
        <ShareRoundResults
          game={game!}
          round={lastFinishedRound}
          votes={lastRoundVotes}
          participants={participants}
          players={players}
        />
        <p className="text-faint text-sm text-center">
          {roundResultsWaitMessage({
            isLastRound,
            autoReveal: !!game?.auto_reveal,
            nextRoundSecondsLeft: nextRoundCountdown ?? 0,
            finalRevealSecondsLeft: finalRevealCountdown ?? 0,
          })}
        </p>
      </div>
    )
  }

  if (isMostLikelyTo(gameType) && game) {
    const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
    const mltKind = isMltImportGame(game) ? 'participant' : 'player'
    const mltTargets = mltVoteTargets(game, participants, players)
    const { rows, voterCount, maxCount, winnerNames } = tallyMltVotes(lastRoundVotes, mltTargets, mltKind)
    const pickedId = myVote ? mltTargetIdFromVote(myVote, mltKind) : null
    const myPickName = pickedId ? (mltTargets.find((t) => t.id === pickedId)?.name ?? null) : null
    const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

    return (
      <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
        <PlayerNameBar name={myPlayerName} />
        <div className="text-center">
          <p className="text-muted text-xs uppercase tracking-wider">
            Round {lastFinishedRound.round_number} of {game?.rounds_count}
          </p>
          <GameTypeBadge gameType={gameType} className="mt-2" />
          <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🗳️</h2>
        </div>
        <MltRoundResults
          question={lastFinishedRound.mlt_question ?? ''}
          rows={rows}
          voterCount={voterCount}
          maxCount={maxCount}
          winnerNames={winnerNames}
          myPickName={myPickName}
        />
        <ConfessionsTicker confessions={allConfessions.filter((c) => c.round_id === lastFinishedRound.id)} />
        <ReactionBar className="pt-1" />
        <ShareRoundResults
          game={game!}
          round={lastFinishedRound}
          votes={lastRoundVotes}
          participants={participants}
          players={players}
        />
        <p className="text-faint text-sm text-center">
          {roundResultsWaitMessage({
            isLastRound,
            autoReveal: !!game?.auto_reveal,
            nextRoundSecondsLeft: nextRoundCountdown ?? 0,
            finalRevealSecondsLeft: finalRevealCountdown ?? 0,
          })}
        </p>
      </div>
    )
  }

  const roundParts = participants.filter((p) => lastFinishedRound.participant_ids.includes(p.id))
  const roundParticipantGender = getRoundParticipantGender(lastFinishedRound.participant_ids, participants)
  const roundGender = roundGenderLabel(roundParts.map((p) => p.gender))
  const myVote = lastRoundVotes.find((v) => v.player_id === myPlayerId)
  const watchedRound = !!(
    !myVote &&
    myPlayerGender &&
    roundParticipantGender &&
    !canPlayerVoteInRound(myPlayerGender, roundParticipantGender)
  )
  const roundConfessions = allConfessions.filter((c) => c.round_id === lastFinishedRound.id)
  const isLastRound = lastFinishedRound.round_number >= (game?.rounds_count ?? 0)

  return (
    <div className="page-wrap flex flex-col px-4 py-6 max-w-2xl mx-auto w-full space-y-5">
      <PlayerNameBar name={myPlayerName} />
      {/* Header */}
      <div className="text-center">
        <p className="text-muted text-xs uppercase tracking-wider">
          Round {lastFinishedRound.round_number} of {game?.rounds_count}
          {roundGender ? ` · ${roundGender}` : ''}
        </p>
        <GameTypeBadge gameType={gameType} className="mt-2" />
        <h2 className="text-2xl font-black tracking-tight mt-2">Results are in! 🗳️</h2>
        {watchedRound && (
          <p className="text-muted text-sm mt-2">You watched this round — everyone sees the same results</p>
        )}
      </div>

      {/* My vote recap */}
      {myVote && (
        <div className="glass-card border border-[var(--primary)]/30 p-4">
          <p className="text-[var(--primary)] text-xs uppercase tracking-wider mb-2">Your vote</p>
          <div className="flex gap-4 flex-wrap">
            {isPairGame(gameType)
              ? roundParts.map((p) => {
                  const flag = flagForParticipant(myVote, p.id)
                  if (!flag) return null
                  const meta = slotMeta(gameType, flag)
                  return (
                    <span key={p.id} className="text-sm font-medium" style={{ color: meta.textColor }}>
                      {p.name}: {meta.emoji} {meta.label}
                    </span>
                  )
                })
              : voteSlots(gameType).map((slot) => {
                  const participantId =
                    slot === 'kiss'
                      ? myVote.kiss_participant_id
                      : slot === 'marry'
                        ? myVote.marry_participant_id
                        : myVote.kill_participant_id
                  if (!participantId) return null
                  const meta = slotMeta(gameType, slot)
                  return (
                    <span key={slot} className="text-sm font-medium" style={{ color: meta.textColor }}>
                      {meta.emoji} {participants.find((p) => p.id === participantId)?.name}
                    </span>
                  )
                })}
          </div>
        </div>
      )}

      {/* Per-person vote counts */}
      {isCustomGame(gameType) && game
        ? (() => {
            const slots = getCustomSlots(game)
            const slotKeys = slots.map((s) => s.key)
            const roundPartsIds = lastFinishedRound.participant_ids
            const nameMap = new Map(participants.map((p) => [p.id, p.name]))
            const tally = tallyCustomVotes(lastRoundVotes, roundPartsIds, nameMap, slotKeys)
            const myAssignment = myVote?.pair_assignments as Record<string, string> | null
            return <CustomRoundResults tally={tally} slots={slots} myAssignment={myAssignment} />
          })()
        : (() => {
            const tallies = tallyRoundVotes(
              roundParts.map((p) => p.id),
              lastRoundVotes
            )
            const nameById = new Map(roundParts.map((p) => [p.id, p.name]))
            const voterCount = lastRoundVotes.length

            return (
              <ParticipantRoundResults
                gameType={gameType}
                tallies={tallies}
                nameById={nameById}
                voterCount={voterCount}
                participantDetails={roundParts.map((p) => ({ id: p.id, name: p.name, gender: p.gender }))}
                myFlagsByParticipantId={
                  myVote
                    ? Object.fromEntries(roundParts.map((p) => [p.id, flagForParticipant(myVote, p.id)]))
                    : undefined
                }
                renderCard={
                  isPairGame(gameType)
                    ? undefined
                    : ({ tally, name, maxes, isWinner }) => {
                        const myAction =
                          myVote?.kiss_participant_id === tally.id
                            ? 'kiss'
                            : myVote?.marry_participant_id === tally.id
                              ? 'marry'
                              : myVote?.kill_participant_id === tally.id
                                ? 'kill'
                                : null

                        const borderCls = myActionBorderClass(gameType, myAction)

                        return (
                          <div key={tally.id} className={`glass-card border-2 ${borderCls} rounded-2xl p-4`}>
                            <div className="flex items-center gap-3 mb-3">
                              <Avatar name={name} />
                              <p className="font-bold text-body text-lg">{name}</p>
                              {myAction && (
                                <span className="ml-auto text-xs text-muted italic">
                                  you: {assignmentEmojiFor(gameType, myAction)}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                              {getVoteCategories(gameType).map((category) => {
                                const meta = getCategoryMeta(gameType, category)
                                return (
                                  <VoteCountStat
                                    key={category}
                                    emoji={meta.emoji}
                                    label={meta.label}
                                    count={tally[category]}
                                    max={maxes[category]}
                                    color={meta.color}
                                    isWinner={isWinner(category)}
                                  />
                                )
                              })}
                            </div>
                          </div>
                        )
                      }
                }
              />
            )
          })()}

      {/* Hot takes for this round */}
      <ConfessionsTicker confessions={roundConfessions} />

      <ReactionBar className="pt-1" />

      <ShareRoundResults
        game={game!}
        round={lastFinishedRound}
        votes={lastRoundVotes}
        participants={participants}
        players={players}
      />

      <p className={`text-sm text-center animate-pulse ${isLastRound ? 'text-[var(--primary)]' : 'text-faint'}`}>
        {roundResultsWaitMessage({
          isLastRound,
          autoReveal: !!game?.auto_reveal,
          nextRoundSecondsLeft: nextRoundCountdown ?? 0,
          finalRevealSecondsLeft: finalRevealCountdown ?? 0,
          finalLabel: 'leaderboard',
        })}
      </p>
    </div>
  )
}
