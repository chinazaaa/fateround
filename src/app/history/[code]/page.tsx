'use client'
import { useEffect, useState, type ReactNode } from 'react'
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
  isBinaryPeoplePollGame,
  isBinaryChoiceGame,
  isThisOrThat,
  isMostLikelyTo,
  isNeverHaveIEver,
  isWhoSaidThis,
  isHotSeat,
  isAnonymousMessagesGame,
  isSecretMessageGame,
  isCodewordsGame,
  isTriviaGame,
  isBingoGame,
  isTwoTruthsGame,
  isMonopolyGame,
  isYahtzeeGame,
  isWhotGame,
  isLudoGame,
} from '@/lib/game-types'
import {
  BINGO_CALLED_NUMBER_SELECT,
  BINGO_CLAIM_SELECT,
  LUDO_PLAYER_STATE_SELECT,
  LUDO_SESSION_SELECT,
  MONOPOLY_BOARD_SELECT,
  MONOPOLY_PLAYER_STATE_SELECT,
  TTL_GUESS_SELECT,
  TTL_STATEMENT_SELECT,
  WHOT_PLAYER_HANDS_SELECT,
  WHOT_SESSION_SELECT,
  YAHTZEE_PLAYER_SCORES_SELECT,
  YAHTZEE_SESSION_SELECT,
} from '@/lib/supabase-selects'
import { AnonymousRoomSessionSummary } from '@/components/anonymous-messages/AnonymousRoomSessionSummary'
import { SecretMessageSessionSummary } from '@/components/secret-message/SecretMessageSessionSummary'
import { CodewordsSessionSummary } from '@/components/codewords/CodewordsSessionSummary'
import { TriviaSessionSummary } from '@/components/trivia/TriviaSessionSummary'
import { BingoSessionSummary } from '@/components/bingo/BingoSessionSummary'
import { TwoTruthsSessionSummary } from '@/components/two-truths/TwoTruthsSessionSummary'
import { MonopolySessionSummary } from '@/components/monopoly/MonopolySessionSummary'
import { YahtzeeSessionSummary } from '@/components/yahtzee/YahtzeeSessionSummary'
import { WhotSessionSummary } from '@/components/whot/WhotSessionSummary'
import { RematchHistory } from '@/components/RematchHistory'
import { LudoSessionSummary } from '@/components/ludo/LudoSessionSummary'
import { mergeCodewordsGuesses } from '@/lib/codewords'
import { hotSeatPlayerDisplayName } from '@/lib/hot-seat'
import { isMltImportGame, mltVoteTargets } from '@/lib/mlt'
import {
  wstVoteTargets,
  wstCorrectNameFromRound,
  wstCorrectParticipantIdFromRound,
  tallyWstVotes,
} from '@/lib/who-said-this'
import {
  ParticipantRoundResults,
  WyrRoundResults,
  MltRoundResults,
  WstRoundResults,
  HotSeatRoundResults,
} from '@/components/VoteResults'
import type {
  BingoClaim,
  Confession,
  CodewordsBoard,
  CodewordsGuess,
  CodewordsPlayerRole,
  Game,
  LudoPlayerState,
  LudoSession,
  MonopolyBoard,
  MonopolyPlayerState,
  Participant,
  Player,
  Round,
  TriviaAnswer,
  TtlGuess,
  TtlStatement,
  Vote,
  WhotPlayerHand,
  WhotSession,
  YahtzeePlayerScore,
  YahtzeeSession,
} from '@/types'

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

function historyOpenHref(game: Game, gameType: ReturnType<typeof parseGameType>): string {
  if (isTriviaGame(gameType)) return `/host/${game.id}`
  return `/game/${game.id}`
}

function HistoryPageShell({
  game,
  gameType,
  children,
}: {
  game: Game
  gameType: ReturnType<typeof parseGameType>
  children: ReactNode
}) {
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
            <Link href={historyOpenHref(game, gameType)} className="btn-primary text-sm py-2 px-4">
              Open game
            </Link>
          )}
        </div>
      </div>
      {children}
      <p className="text-center pb-4">
        <Link href="/" className="text-faint text-sm hover:text-body transition-colors">
          ← Back home
        </Link>
      </p>
    </div>
  )
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
  const [hotSeatSubmissions, setHotSeatSubmissions] = useState<
    { id: string; round_id: string; text: string; submission_type: string }[]
  >([])
  const [codewordsBoard, setCodewordsBoard] = useState<CodewordsBoard | null>(null)
  const [codewordsRoles, setCodewordsRoles] = useState<CodewordsPlayerRole[]>([])
  const [codewordsGuesses, setCodewordsGuesses] = useState<CodewordsGuess[]>([])
  const [triviaAnswers, setTriviaAnswers] = useState<TriviaAnswer[]>([])
  const [bingoClaim, setBingoClaim] = useState<BingoClaim | null>(null)
  const [bingoCalledCount, setBingoCalledCount] = useState(0)
  const [ttlGuesses, setTtlGuesses] = useState<TtlGuess[]>([])
  const [ttlStatements, setTtlStatements] = useState<TtlStatement[]>([])
  const [monopolyBoard, setMonopolyBoard] = useState<MonopolyBoard | null>(null)
  const [monopolyStates, setMonopolyStates] = useState<MonopolyPlayerState[]>([])
  const [yahtzeeSession, setYahtzeeSession] = useState<YahtzeeSession | null>(null)
  const [yahtzeeScores, setYahtzeeScores] = useState<YahtzeePlayerScore[]>([])
  const [whotSession, setWhotSession] = useState<WhotSession | null>(null)
  const [whotHands, setWhotHands] = useState<WhotPlayerHand[]>([])
  const [ludoSession, setLudoSession] = useState<LudoSession | null>(null)
  const [ludoStates, setLudoStates] = useState<LudoPlayerState[]>([])

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

      const gameType = parseGameType(gameData.game_type)

      const resetSpecializedState = () => {
        setBingoClaim(null)
        setBingoCalledCount(0)
        setTtlGuesses([])
        setTtlStatements([])
        setMonopolyBoard(null)
        setMonopolyStates([])
        setYahtzeeSession(null)
        setYahtzeeScores([])
        setWhotSession(null)
        setWhotHands([])
        setLudoSession(null)
        setLudoStates([])
        setCodewordsBoard(null)
        setCodewordsRoles([])
        setCodewordsGuesses([])
        setTriviaAnswers([])
      }

      if (isSecretMessageGame(gameType)) {
        setGame(gameData)
        setPlayers([])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setLoadState('ready')
        return
      }

      if (isAnonymousMessagesGame(gameType)) {
        const { data: plrs } = await supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at')
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setLoadState('ready')
        return
      }

      if (isTriviaGame(gameType)) {
        const [{ data: plrs }, { data: rds }, { data: ans }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
          supabase.from('trivia_answers').select('*').eq('game_id', gameCode),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds(rds ?? [])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setTriviaAnswers(ans ?? [])
        setLoadState('ready')
        return
      }

      if (isCodewordsGame(gameType)) {
        const [{ data: plrs }, { data: roleRows }, { data: boardData }, { data: guessRows }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('codewords_player_roles').select('*').eq('game_id', gameCode),
          supabase.from('codewords_boards').select('*').eq('game_id', gameCode).maybeSingle(),
          supabase
            .from('codewords_guesses')
            .select('*')
            .eq('game_id', gameCode)
            .order('created_at', { ascending: true }),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setCodewordsBoard((boardData as CodewordsBoard | null) ?? null)
        setCodewordsRoles(roleRows ?? [])
        setCodewordsGuesses(mergeCodewordsGuesses([], (guessRows as CodewordsGuess[]) ?? []))
        setLoadState('ready')
        return
      }

      if (isMonopolyGame(gameType)) {
        const [{ data: plrs }, { data: boardData }, { data: stateRows }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('monopoly_boards').select(MONOPOLY_BOARD_SELECT).eq('game_id', gameCode).maybeSingle(),
          supabase
            .from('monopoly_player_state')
            .select(MONOPOLY_PLAYER_STATE_SELECT)
            .eq('game_id', gameCode)
            .order('player_order'),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setMonopolyBoard((boardData as MonopolyBoard | null) ?? null)
        setMonopolyStates((stateRows as MonopolyPlayerState[]) ?? [])
        setLoadState('ready')
        return
      }

      if (isYahtzeeGame(gameType)) {
        const [{ data: plrs }, { data: sessionData }, { data: scoreRows }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('yahtzee_sessions').select(YAHTZEE_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
          supabase
            .from('yahtzee_player_scores')
            .select(YAHTZEE_PLAYER_SCORES_SELECT)
            .eq('game_id', gameCode)
            .order('player_order'),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setYahtzeeSession((sessionData as YahtzeeSession | null) ?? null)
        setYahtzeeScores((scoreRows as YahtzeePlayerScore[]) ?? [])
        setLoadState('ready')
        return
      }

      if (isWhotGame(gameType)) {
        const [{ data: plrs }, { data: sessionData }, { data: handRows }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('whot_sessions').select(WHOT_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
          supabase
            .from('whot_player_hands')
            .select(WHOT_PLAYER_HANDS_SELECT)
            .eq('game_id', gameCode)
            .order('player_order'),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setWhotSession((sessionData as WhotSession | null) ?? null)
        setWhotHands((handRows as WhotPlayerHand[]) ?? [])
        setLoadState('ready')
        return
      }

      if (isLudoGame(gameType)) {
        const [{ data: plrs }, { data: sessionData }, { data: stateRows }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('ludo_sessions').select(LUDO_SESSION_SELECT).eq('game_id', gameCode).maybeSingle(),
          supabase
            .from('ludo_player_state')
            .select(LUDO_PLAYER_STATE_SELECT)
            .eq('game_id', gameCode)
            .order('player_order'),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setLudoSession((sessionData as LudoSession | null) ?? null)
        setLudoStates((stateRows as LudoPlayerState[]) ?? [])
        setLoadState('ready')
        return
      }

      if (isBingoGame(gameType)) {
        const [{ data: plrs }, { data: claimRows }, { data: calledRows }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase
            .from('bingo_claims')
            .select(BINGO_CLAIM_SELECT)
            .eq('game_id', gameCode)
            .eq('status', 'approved')
            .order('created_at', { ascending: true })
            .limit(1),
          supabase.from('bingo_called_numbers').select(BINGO_CALLED_NUMBER_SELECT).eq('game_id', gameCode),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds([])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setBingoClaim(((claimRows as BingoClaim[] | null) ?? [])[0] ?? null)
        setBingoCalledCount(calledRows?.length ?? 0)
        setLoadState('ready')
        return
      }

      if (isTwoTruthsGame(gameType)) {
        const [{ data: plrs }, { data: rds }, { data: guessRows }, { data: statementRows }] = await Promise.all([
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
          supabase.from('ttl_guesses').select(TTL_GUESS_SELECT).eq('game_id', gameCode),
          supabase.from('ttl_statements').select(TTL_STATEMENT_SELECT).eq('game_id', gameCode),
        ])
        setGame(gameData)
        setPlayers(plrs ?? [])
        setParticipants([])
        setRounds(rds ?? [])
        setVotes([])
        setConfessions([])
        setHotSeatSubmissions([])
        resetSpecializedState()
        setTtlGuesses((guessRows as TtlGuess[]) ?? [])
        setTtlStatements((statementRows as TtlStatement[]) ?? [])
        setLoadState('ready')
        return
      }

      const [{ data: parts }, { data: plrs }, { data: rds }, { data: vts }, { data: confs }, { data: subs }] =
        await Promise.all([
          supabase.from('participants').select('*').eq('game_id', gameCode).order('display_order'),
          supabase.from('players').select('*').eq('game_id', gameCode).order('joined_at'),
          supabase.from('rounds').select('*').eq('game_id', gameCode).order('round_number'),
          supabase.from('votes').select('*').eq('game_id', gameCode),
          supabase.from('confessions').select('*').eq('game_id', gameCode).order('created_at'),
          supabase.from('hot_seat_submissions').select('id, round_id, text, submission_type').eq('game_id', gameCode),
        ])

      setGame(gameData)
      setParticipants(parts ?? [])
      setPlayers(plrs ?? [])
      setRounds(rds ?? [])
      setVotes(vts ?? [])
      setConfessions(confs ?? [])
      setHotSeatSubmissions(subs ?? [])
      resetSpecializedState()
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

  if (isSecretMessageGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <SecretMessageSessionSummary game={game} />
      </HistoryPageShell>
    )
  }

  if (isAnonymousMessagesGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <AnonymousRoomSessionSummary game={game} playerCount={players.length} />
      </HistoryPageShell>
    )
  }

  if (isCodewordsGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <CodewordsSessionSummary
          game={game}
          players={players}
          roles={codewordsRoles}
          board={codewordsBoard}
          guesses={codewordsGuesses}
        />
      </HistoryPageShell>
    )
  }

  if (isTriviaGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <TriviaSessionSummary game={game} players={players} rounds={rounds} answers={triviaAnswers} />
      </HistoryPageShell>
    )
  }

  if (isMonopolyGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <MonopolySessionSummary game={game} players={players} states={monopolyStates} board={monopolyBoard} />
      </HistoryPageShell>
    )
  }

  if (isYahtzeeGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <YahtzeeSessionSummary game={game} players={players} scores={yahtzeeScores} session={yahtzeeSession} />
      </HistoryPageShell>
    )
  }

  if (isWhotGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <WhotSessionSummary game={game} players={players} hands={whotHands} session={whotSession} />
      </HistoryPageShell>
    )
  }

  if (isLudoGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <LudoSessionSummary game={game} players={players} states={ludoStates} session={ludoSession} />
      </HistoryPageShell>
    )
  }

  if (isBingoGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <BingoSessionSummary game={game} players={players} claim={bingoClaim} calledCount={bingoCalledCount} />
      </HistoryPageShell>
    )
  }

  if (isTwoTruthsGame(gameType)) {
    return (
      <HistoryPageShell game={game} gameType={gameType}>
        <TwoTruthsSessionSummary
          game={game}
          players={players}
          rounds={rounds}
          guesses={ttlGuesses}
          statements={ttlStatements}
        />
      </HistoryPageShell>
    )
  }

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
  const isHotSeatGame = isHotSeat(gameType)
  const roundsWithContent = isHotSeatGame
    ? rounds.filter((r) => hotSeatSubmissions.some((s) => s.round_id === r.id) || r.status === 'finished')
    : roundsWithVotes

  return (
    <HistoryPageShell game={game} gameType={gameType}>
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

      <RematchHistory
        gameId={game.id}
        currentParticipants={participants}
        currentVotes={votes}
        gameType={game.game_type}
        customSlots={game.custom_slots?.slots}
      />

      {game.anonymous && (
        <p className="callout-warning text-sm">
          This game was anonymous — individual voters are hidden. Totals per round are shown below.
        </p>
      )}

      {rounds.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">No rounds yet — the host hasn't started this game.</div>
      ) : roundsWithContent.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted">
          {isHotSeatGame
            ? `${rounds.length} round${rounds.length === 1 ? '' : 's'} played, but no submissions recorded yet.`
            : `${rounds.length} round${rounds.length === 1 ? '' : 's'} set up, but no votes recorded yet.`}
        </div>
      ) : (
        <div className="space-y-8">
          {rounds.map((round) => {
            if (isHotSeatGame) {
              const roundSubs = hotSeatSubmissions.filter((s) => s.round_id === round.id)
              if (round.status !== 'finished' && roundSubs.length === 0) return null
              const hotSeatPlayerName = hotSeatPlayerDisplayName(round.submitter_player_id, players, participants)
              return (
                <section key={round.id} className="space-y-3">
                  <h2 className="text-lg font-bold text-body">Round {round.round_number}</h2>
                  <HotSeatRoundResults
                    hotSeatPlayerName={hotSeatPlayerName ?? 'Unknown'}
                    submissions={roundSubs}
                    animate={false}
                  />
                </section>
              )
            }

            const roundVotes = votes.filter((v) => v.round_id === round.id)
            if (roundVotes.length === 0) return null

            const roundParts = participants.filter((p) => round.participant_ids.includes(p.id))
            const roundGender = isGenderFreeVoting(game) ? null : roundGenderLabel(roundParts.map((p) => p.gender))
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
                ) : isNeverHaveIEver(gameType) ? (
                  (() => {
                    const wyrTally = tallyWyrVotes(roundVotes)
                    return (
                      <WyrRoundResults
                        optionA={round.mlt_question ?? ''}
                        optionB=""
                        countA={wyrTally.countA}
                        countB={wyrTally.countB}
                        voterCount={wyrTally.voterCount}
                        mode="nhie"
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
                ) : isBinaryPeoplePollGame(gameType) ? (
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

                {!game.anonymous && !isBinaryPeoplePollGame(gameType) && (
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
    </HistoryPageShell>
  )
}
