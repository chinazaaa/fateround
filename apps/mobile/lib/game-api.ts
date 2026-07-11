import { apiUrl } from '@/lib/config'
import type { GameType } from '@fateround/shared'
import type { GamePlayerLimitsMap } from '@fateround/shared/lobby-limits'
import { getCodeDefaultLimits } from '@fateround/shared/lobby-limits'
import type { MafiaStateResponse } from '@fateround/shared/mafia'
import type { MahjongStateResponse } from '@fateround/shared/mahjong'

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export function postTicTacToeMove(gameId: string, resumeToken: string, cellIndex: number) {
  return postJson<{ success: boolean }>('/api/tic-tac-toe/move', { gameId, resumeToken, cellIndex })
}

export function postCheckersMove(gameId: string, resumeToken: string, from: string, to: string) {
  return postJson<{ success: boolean }>('/api/checkers/move', { gameId, resumeToken, from, to })
}

export function postAyoMove(gameId: string, resumeToken: string, pitIndex: number) {
  return postJson<{ success: boolean }>('/api/ayo/move', { gameId, resumeToken, pitIndex })
}

export function expireAyoTurn(gameId: string) {
  return postJson<{ success: boolean }>('/api/ayo/expire-turn', { gameId })
}

export function postBingoMark(gameId: string, resumeToken: string, cellIndex: number) {
  return postJson<{ success: boolean; marked_indices?: number[] }>('/api/bingo/mark', {
    gameId,
    resumeToken,
    cellIndex,
  })
}

export function postBingoClaim(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean; claim?: { player_id: string } }>('/api/bingo/claim', {
    gameId,
    resumeToken,
  })
}

export function postTriviaAnswer(gameId: string, resumeToken: string, roundId: string, choiceIndex: number) {
  return postJson<{ success: boolean; isCorrect: boolean; points: number }>('/api/trivia/answer', {
    gameId,
    resumeToken,
    roundId,
    choiceIndex,
  })
}

export function postPlayerReady(gameId: string, resumeToken: string, ready: boolean) {
  return postJson<{ success: boolean }>('/api/players/ready', { gameId, resumeToken, ready })
}

export function postPlayAgain(
  gameCode: string,
  hostToken: string,
  sameSettings = true,
  hostPlayerId?: string | null
) {
  return postJson<{ success: boolean }>(`/api/games/${gameCode.toUpperCase()}/play-again`, {
    hostToken,
    same_settings: sameSettings,
    // Preserve the host's own seat across the replay so they don't re-enter their name.
    ...(hostPlayerId ? { hostPlayerId } : {}),
  })
}

export function postPlayerPromote(gameCode: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/players/promote', { gameCode: gameCode.toUpperCase(), resumeToken })
}

export function postVote(gameId: string, resumeToken: string, roundId: string, body: Record<string, unknown>) {
  return postJson<{ success: boolean; revealedQuestion?: string; pickedNumber?: number }>('/api/votes', {
    gameId,
    resumeToken,
    roundId,
    ...body,
  })
}

export function postMatchingPairsFlip(
  gameId: string,
  resumeToken: string,
  pairIndex: number,
  isMatch: boolean
) {
  return postJson<{ success: boolean; pointsAfter: number; finished?: boolean }>('/api/matching-pairs/flip', {
    gameId,
    resumeToken,
    pairIndex,
    isMatch,
  })
}

export function postSudokuSubmit(
  gameId: string,
  resumeToken: string,
  row: number,
  col: number,
  value: number
) {
  return postJson<{ success: boolean; isCorrect: boolean; pointsAwarded: number }>('/api/sudoku/submit', {
    gameId,
    resumeToken,
    row,
    col,
    value,
  })
}

export function postYahtzeeRoll(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/yahtzee/roll', { gameId, resumeToken })
}

export function postYahtzeeHold(gameId: string, resumeToken: string, held: boolean[]) {
  return postJson<{ success: boolean }>('/api/yahtzee/hold', { gameId, resumeToken, held })
}

export function postYahtzeeScore(gameId: string, resumeToken: string, category: string) {
  return postJson<{ success: boolean }>('/api/yahtzee/score', { gameId, resumeToken, category })
}

export function postSnakeLadderRoll(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean; roll?: number }>('/api/snake-and-ladder/roll', { gameId, resumeToken })
}

export function postLudoRoll(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean; dice?: unknown }>('/api/ludo/roll', { gameId, resumeToken })
}

export function postLudoMove(gameId: string, resumeToken: string, pieceId: number, diceIndex: number) {
  return postJson<{ success: boolean }>('/api/ludo/move', { gameId, resumeToken, pieceId, diceIndex })
}

export function postCrazyEightsPlay(gameId: string, resumeToken: string, cardId: string) {
  return postJson<{ success: boolean }>('/api/crazy-eights/play', { gameId, resumeToken, cardId })
}

export function postCrazyEightsDraw(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/crazy-eights/draw', { gameId, resumeToken })
}

export function postCrazyEightsChoose(gameId: string, resumeToken: string, suit: string) {
  return postJson<{ success: boolean }>('/api/crazy-eights/choose', { gameId, resumeToken, suit })
}

export function postWhotPlay(gameId: string, resumeToken: string, cardId: string) {
  return postJson<{ success: boolean }>('/api/whot/play', { gameId, resumeToken, cardId })
}

export function postWhotDraw(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/whot/draw', { gameId, resumeToken })
}

export function postWhotChooseShape(gameId: string, resumeToken: string, shape: string) {
  return postJson<{ success: boolean }>('/api/whot/choose', { gameId, resumeToken, shape })
}

export function postWhotChooseNumber(gameId: string, resumeToken: string, number: number) {
  return postJson<{ success: boolean }>('/api/whot/choose', { gameId, resumeToken, number })
}

export function postTtlStatements(
  gameId: string,
  resumeToken: string,
  statementA: string,
  statementB: string,
  statementC: string,
  lieIndex: number
) {
  return postJson<{ success: boolean }>('/api/two-truths/statements', {
    gameId,
    resumeToken,
    statementA,
    statementB,
    statementC,
    lieIndex,
  })
}

export function postTtlGuess(gameId: string, resumeToken: string, roundId: string, guessedIndex: number) {
  return postJson<{ success: boolean }>('/api/two-truths/guess', {
    gameId,
    resumeToken,
    roundId,
    guessedIndex,
  })
}

export function postDescribeItTeam(gameId: string, resumeToken: string, team: number) {
  return postJson<{ success: boolean }>('/api/describe-it/team', { gameId, resumeToken, team })
}

// --- Player-submitted lobby questions (poll suite) --------------------------

export function postPlayerQuestionWyr(gameCode: string, resumeToken: string, optionA: string, optionB: string) {
  return postJson<{ success?: boolean }>('/api/player-questions', {
    gameId: gameCode.toUpperCase(),
    resumeToken,
    questionType: 'wyr',
    optionA,
    optionB,
  })
}

export function postPlayerQuestionMlt(gameCode: string, resumeToken: string, questionText: string) {
  return postJson<{ success?: boolean }>('/api/player-questions', {
    gameId: gameCode.toUpperCase(),
    resumeToken,
    questionType: 'mlt',
    questionText,
  })
}

export function deletePlayerQuestion(resumeToken: string, questionId: string) {
  return jsonRequest<{ success?: boolean }>('/api/player-questions', 'DELETE', { questionId, resumeToken })
}

/** Voters-mode name submission (players add candidates to be voted on). */
export function postPlayerParticipant(
  gameCode: string,
  resumeToken: string,
  name: string,
  gender?: 'male' | 'female'
) {
  return postJson<{ success?: boolean }>('/api/player-participants', {
    gameId: gameCode.toUpperCase(),
    resumeToken,
    name,
    ...(gender ? { gender } : {}),
  })
}

export function deletePlayerParticipant(resumeToken: string, participantId: string) {
  return jsonRequest<{ success?: boolean }>('/api/player-participants', 'DELETE', { participantId, resumeToken })
}

// --- Host lobby team management (host-auth: hostToken + playerId) -----------

export function postDescribeItTeamHost(gameCode: string, hostToken: string, playerId: string, team: number) {
  return postJson<{ success?: boolean }>('/api/describe-it/team', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    playerId,
    team,
  })
}

export function postDescribeItBalance(gameCode: string, hostToken: string) {
  return postJson<{ ok?: boolean }>('/api/describe-it/balance', { gameId: gameCode.toUpperCase(), hostToken })
}

/** Describe It word pool (newline-joined words; empty resets to platform). */
export function postDescribeItWords(gameCode: string, hostToken: string, words: string) {
  return postJson<{ question_source?: string; custom_questions?: unknown[] }>('/api/describe-it/settings', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    words,
  })
}

/** Quick Draw word/prompt pool (newline-joined; empty resets to platform). */
export function postQuickDrawWords(gameCode: string, hostToken: string, words: string) {
  return postJson<{ question_source?: string; custom_questions?: unknown[] }>('/api/quick-draw/settings', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    words,
  })
}

export function postWordRushTeamHost(gameCode: string, hostToken: string, playerId: string, team: number) {
  return postJson<{ success?: boolean }>('/api/word-rush/team', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    playerId,
    team,
  })
}

export function postWordRushShuffle(gameCode: string, hostToken: string) {
  return postJson<{ ok?: boolean }>('/api/word-rush/shuffle', { gameId: gameCode.toUpperCase(), hostToken })
}

export function postQuickDrawGuessTeamHost(gameCode: string, hostToken: string, playerId: string, team: number) {
  return postJson<{ success?: boolean }>('/api/quick-draw/guess-team', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    playerId,
    team,
  })
}

export function postDescribeItClue(gameId: string, resumeToken: string, clue: string) {
  return postJson<{ success: boolean }>('/api/describe-it/clue', { gameId, resumeToken, clue })
}

export function postDescribeItGuess(gameId: string, resumeToken: string, text: string) {
  return postJson<{ success: boolean; correct?: boolean }>('/api/describe-it/guess', {
    gameId,
    resumeToken,
    text,
  })
}

export function postDescribeItSkip(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/describe-it/skip', { gameId, resumeToken })
}

export function postQuiplashAnswer(gameId: string, resumeToken: string, roundId: string, text: string) {
  return postJson<{ success: boolean }>('/api/quiplash/answer', { gameId, resumeToken, roundId, text })
}

export function postQuiplashVote(gameId: string, resumeToken: string, roundId: string, chosenAnswerId: string) {
  return postJson<{ success: boolean }>('/api/quiplash/vote', { gameId, resumeToken, roundId, chosenAnswerId })
}

export function postWordRushTeam(gameId: string, resumeToken: string, team: number) {
  return postJson<{ success: boolean }>('/api/word-rush/team', { gameId, resumeToken, team })
}

export function postWordRushSubmit(gameId: string, resumeToken: string, text: string) {
  return postJson<{ success: boolean; correct?: boolean; points?: number; message?: string }>(
    '/api/word-rush/submit',
    { gameId, resumeToken, text }
  )
}

export function postWordRushPrompt(
  gameId: string,
  resumeToken: string,
  startLetter: string,
  endLetter: string,
  minWordLength?: number
) {
  return postJson<{ success: boolean }>('/api/word-rush/prompt', {
    gameId,
    resumeToken,
    startLetter,
    endLetter,
    minWordLength,
  })
}

export function postWordHuntSubmit(gameId: string, resumeToken: string, word: string, path: number[]) {
  return postJson<{ success: boolean; pointsAwarded?: number }>('/api/word-hunt/submit', {
    gameId,
    resumeToken,
    word,
    path,
  })
}

export function postNpatLetter(gameId: string, resumeToken: string, roundId: string, letter: string) {
  return postJson<{ success: boolean }>('/api/npat/letter', { gameId, resumeToken, roundId, letter })
}

export function postNpatSubmit(
  gameId: string,
  resumeToken: string,
  roundId: string,
  answers: { name: string; animal: string; place: string; thing: string; food: string }
) {
  return postJson<{ success: boolean }>('/api/npat/submit', { gameId, resumeToken, roundId, ...answers })
}

export function postNpatMark(
  gameId: string,
  resumeToken: string,
  roundId: string,
  flags: {
    validName: boolean
    validAnimal: boolean
    validPlace: boolean
    validThing: boolean
    validFood: boolean
  }
) {
  return postJson<{ success: boolean }>('/api/npat/mark', { gameId, resumeToken, roundId, ...flags })
}

export function postNpatCallerApprove(gameId: string, resumeToken: string, roundId: string) {
  return postJson<{ success: boolean }>('/api/npat/caller-approve', {
    gameId,
    resumeToken,
    roundId,
    overrides: [],
  })
}

export function postChessMove(
  gameId: string,
  resumeToken: string,
  from: string,
  to: string,
  promotion?: 'q' | 'r' | 'b' | 'n'
) {
  return postJson<{ success: boolean }>('/api/chess/move', { gameId, resumeToken, from, to, promotion })
}

export function postChessResign(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/chess/resign', { gameId, resumeToken })
}

export function postChessExpireTurn(gameId: string) {
  return postJson<{ success: boolean }>('/api/chess/expire-turn', { gameId })
}

export function postScrabblePlay(
  gameId: string,
  resumeToken: string,
  tiles: { row: number; col: number; letter: string; isBlank: boolean }[]
) {
  return postJson<{ success: boolean }>('/api/scrabble/play', { gameId, resumeToken, tiles })
}

export function postScrabbleExchange(gameId: string, resumeToken: string, tileIndices: number[]) {
  return postJson<{ success: boolean }>('/api/scrabble/exchange', { gameId, resumeToken, tileIndices })
}

export function postScrabblePass(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/scrabble/pass', { gameId, resumeToken })
}

export function postScrabbleExpireTurn(gameId: string) {
  return postJson<{ success: boolean }>('/api/scrabble/expire-turn', { gameId })
}

export function postMafiaState(gameCode: string, resumeToken?: string | null) {
  return postJson<MafiaStateResponse>(`/api/mafia/${gameCode}/state`, {
    resumeToken: resumeToken ?? undefined,
  })
}

export function postMafiaNightAction(gameCode: string, resumeToken: string, targetPlayerId: string) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/night-action`, {
    resumeToken,
    targetPlayerId,
  })
}

export function postMafiaVote(gameCode: string, resumeToken: string, targetPlayerId: string | null) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/vote`, { resumeToken, targetPlayerId })
}

export function postMafiaChat(
  gameCode: string,
  resumeToken: string,
  message: string,
  scope: 'night' | 'day' | 'ghost'
) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/chat`, { resumeToken, message, scope })
}

export function postMafiaAdvance(gameCode: string) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/advance`, { isAuto: true })
}

export function postCodewordsRole(
  gameId: string,
  resumeToken: string,
  team: 'red' | 'blue',
  role: 'spymaster' | 'operative'
) {
  return postJson<{ success: boolean; role?: unknown }>('/api/codewords/role', {
    gameId,
    resumeToken,
    team,
    role,
  })
}

export function postCodewordsClue(gameId: string, resumeToken: string, clueWord: string, clueNumber: number) {
  return postJson<{ success: boolean; board: unknown }>('/api/codewords/clue', {
    gameId,
    resumeToken,
    clueWord,
    clueNumber,
  })
}

export function postCodewordsGuess(gameId: string, resumeToken: string, cellIndex: number) {
  return postJson<{ success: boolean; board: unknown; cellType?: string }>('/api/codewords/guess', {
    gameId,
    resumeToken,
    cellIndex,
  })
}

export function postCodewordsEndTurn(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean; board: unknown }>('/api/codewords/end-turn', { gameId, resumeToken })
}

export function postCodewordsChat(gameId: string, resumeToken: string, text: string) {
  return postJson<{ success: boolean }>('/api/codewords/chat', { gameId, resumeToken, text })
}

export function postCodewordsExpireTurn(gameId: string) {
  return postJson<{ success: boolean; board?: unknown; skipped?: boolean }>('/api/codewords/expire-turn', {
    gameId,
  })
}

export function postMonopolyRoll(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/monopoly/roll', { gameId, resumeToken })
}

export function postMonopolyBuy(
  gameId: string,
  resumeToken: string,
  decision: 'buy' | 'auction' | 'pass'
) {
  return postJson<{ success: boolean }>('/api/monopoly/buy', { gameId, resumeToken, decision })
}

export function postMonopolyRent(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/monopoly/rent', { gameId, resumeToken })
}

export function postMonopolyJail(gameId: string, resumeToken: string, method: 'pay' | 'card') {
  return postJson<{ success: boolean }>('/api/monopoly/jail', { gameId, resumeToken, method })
}

export function postMonopolyAuction(
  gameId: string,
  resumeToken: string,
  action: 'pass' | 'bid',
  amount?: number
) {
  return postJson<{ success: boolean }>('/api/monopoly/auction', { gameId, resumeToken, action, amount })
}

export function postMonopolySettleDebt(gameId: string, resumeToken: string, action: 'pay') {
  return postJson<{ success: boolean }>('/api/monopoly/settle-debt', { gameId, resumeToken, action })
}

export function postMonopolyForfeit(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/monopoly/forfeit', { gameId, resumeToken })
}

export async function getMahjongState(
  gameId: string,
  playerId: string,
  resumeToken?: string | null
): Promise<MahjongStateResponse> {
  const params = new URLSearchParams({ gameId: gameId.toUpperCase(), playerId })
  if (resumeToken) params.set('resumeToken', resumeToken)
  const res = await fetch(apiUrl(`/api/mahjong/state?${params}`), { cache: 'no-store' })
  const data = (await res.json()) as MahjongStateResponse & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export function postMahjongDiscard(gameId: string, playerId: string, resumeToken: string, tile: string) {
  return postJson<{ success: boolean }>('/api/mahjong/discard', { gameId, playerId, resumeToken, tile })
}

export function postMahjongClaim(
  gameId: string,
  playerId: string,
  resumeToken: string,
  claimType: 'mahjong' | 'chow' | 'pung' | 'kong',
  tiles?: string[]
) {
  return postJson<{ success: boolean }>('/api/mahjong/claim', {
    gameId,
    playerId,
    resumeToken,
    claimType,
    tiles,
  })
}

export function postMahjongPass(gameId: string, playerId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/mahjong/pass', { gameId, playerId, resumeToken })
}

export function postMahjongRiichi(gameId: string, playerId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/mahjong/riichi', { gameId, playerId, resumeToken })
}

export function postQuickDrawGuess(gameId: string, resumeToken: string, text: string) {
  return postJson<{ success: boolean }>('/api/quick-draw/guess', { gameId, resumeToken, text })
}

export function postQuickDrawGuessSkip(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/quick-draw/guess-skip', { gameId, resumeToken })
}

export function postQuickDrawGuessTeam(gameId: string, resumeToken: string, team: number) {
  return postJson<{ success: boolean }>('/api/quick-draw/guess-team', { gameId, resumeToken, team })
}

export function postAnonymousMessage(
  gameId: string,
  playerId: string,
  text: string,
  replyToId?: string | null
) {
  return postJson<{ success: boolean }>('/api/anonymous-messages', {
    gameId,
    playerId,
    text,
    messageType: 'text',
    replyToId: replyToId ?? undefined,
  })
}

/** Send a GIF/sticker (message_type 'gif', media_url = the Klipy URL). */
export function postAnonymousGif(
  gameId: string,
  playerId: string,
  mediaUrl: string,
  replyToId?: string | null
) {
  return postJson<{ success: boolean }>('/api/anonymous-messages', {
    gameId,
    playerId,
    text: '',
    messageType: 'gif',
    mediaUrl,
    replyToId: replyToId ?? undefined,
  })
}

export function postHotSeat(
  gameId: string,
  roundId: string,
  resumeToken: string,
  text: string,
  submissionType: 'compliment' | 'roast' | 'observation'
) {
  return postJson<{ success: boolean }>('/api/hot-seat', {
    gameId,
    roundId,
    resumeToken,
    text,
    submissionType,
  })
}

export async function getHotSeatSubmissions(gameId: string, roundId: string) {
  const params = new URLSearchParams({ gameId: gameId.toUpperCase(), roundId })
  const res = await fetch(apiUrl(`/api/hot-seat?${params}`), { cache: 'no-store' })
  const data = (await res.json()) as { submissions?: unknown[]; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

// ---- Host actions ---------------------------------------------------------
// Host routes authorize by putting the host token in the POST body (the client
// can no longer read games.host_token — migration 0122). See
// src/app/api/games/[code]/{verify-host,start}/route.ts.

export type VerifyHostResponse = { ok: boolean; notFound?: boolean }

/** Early "are you the host?" gate. Returns 200 with { ok:false } on a bad token. */
export function verifyHost(gameId: string, hostToken: string) {
  return postJson<VerifyHostResponse>(`/api/games/${gameId.toUpperCase()}/verify-host`, { hostToken })
}

// --- Host transfer (nominee claim flow) — Batch 24 -------------------------

/** Host nominates a player to take over (or pass null to cancel). Auth: host token. */
export function postTransferHost(gameCode: string, hostToken: string, playerId: string | null) {
  return postJson<{ ok: boolean; pendingHostPlayerId: string | null }>(
    `/api/games/${gameCode.toUpperCase()}/transfer-host`,
    { hostToken, playerId }
  )
}

/** Nominee accepts — mints & returns a fresh host token. Auth: nominee's resume token. */
export function postClaimHost(gameCode: string, resumeToken: string) {
  return postJson<{ ok: boolean; hostToken: string }>(
    `/api/games/${gameCode.toUpperCase()}/claim-host`,
    { resumeToken }
  )
}

/** Nominee declines — clears the nomination without rotating the token. */
export function postDeclineHost(gameCode: string, resumeToken: string) {
  return postJson<{ ok: boolean; declined: boolean }>(
    `/api/games/${gameCode.toUpperCase()}/decline-host`,
    { resumeToken }
  )
}

/**
 * Start the game. The server generates rounds and flips status to active. It
 * enforces per-game minimum-player rules and throws (via postJson) with the
 * server's message when they aren't met — the caller surfaces that verbatim.
 */
export function startGame(gameId: string, hostToken: string) {
  return postJson<{ ok?: boolean }>(`/api/games/${gameId.toUpperCase()}/start`, { hostToken })
}

export type LobbySettingsPatch = {
  is_public?: boolean
  theme?: string
  rounds_count?: number
  timer_seconds?: number
  operative_timer_seconds?: number
  game_duration_seconds?: number
  late_join_policy?: 'lobby_only' | 'viewers_only' | 'viewers_and_players'
  scrabble_dictionary_id?: string
  scrabble_clock_mode?: 'standard' | 'chess'
  scrabble_clock_seconds?: number
  pair_vote_mode?: 'one_each' | 'any'
  player_questions_enabled?: boolean
  player_questions_order?: 'players_first' | 'uploaded_first' | 'mixed'
  ai_questions_enabled?: boolean
  ai_questions_config?: {
    ratio: 'all_ai' | 'mostly_ai' | 'half' | 'mostly_platform'
    theme?: string
    customPrompt?: string
  } | null
}

/** Update editable lobby settings while waiting. Server clamps/validates per game. */
export function patchGameSettings(gameCode: string, hostToken: string, patch: LobbySettingsPatch) {
  return jsonRequest<{ ok?: boolean }>(`/api/games/${gameCode.toUpperCase()}`, 'PATCH', {
    hostToken,
    ...patch,
  })
}

/**
 * Board/party game lobby settings via the shared `lobby-settings` route
 * (max players, house rules, per-game timers, etc.). Waiting-only server-side.
 * The server ignores fields that don't apply to the game type.
 */
export type BoardLobbyPatch = {
  is_public?: boolean
  max_players?: number
  timer_seconds?: number
  game_duration_seconds?: number
  rounds_count?: number
  whot_pick3_enabled?: boolean
  whot_cards_enabled?: boolean
  whot_number_calls_enabled?: boolean
  whot_pick2_stacking?: boolean
  crazy8_action_cards?: boolean
  crazy8_jokers?: boolean
  crazy8_pick2_stacking?: boolean
  ludo_variant?: 'modern' | 'traditional'
  ayo_variant?: 'traditional' | 'oware'
  mafia_doctor_enabled?: boolean
  mafia_detective_enabled?: boolean
  mafia_anonymous_votes?: boolean
  operative_timer_seconds?: number
  quick_draw_variant?: 'lie' | 'guess'
  quick_draw_play_mode?: 'team' | 'individual'
  quick_draw_num_teams?: number
  mahjong_ruleset?: string
  mahjong_rule_options?: Record<string, unknown>
}

export function postLobbySettings(gameCode: string, hostToken: string, patch: BoardLobbyPatch) {
  return postJson<{ ok?: boolean }>(`/api/games/${gameCode.toUpperCase()}/lobby-settings`, {
    hostToken,
    ...patch,
  })
}

/** Bingo call mode / interval (dedicated route, waiting-only). */
export function postBingoSettings(
  gameCode: string,
  hostToken: string,
  patch: { bingo_call_mode?: 'manual' | 'auto'; bingo_call_interval_seconds?: number; max_players?: number }
) {
  return postJson<{ ok?: boolean }>('/api/bingo/settings', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    ...patch,
  })
}

/** Describe It lobby settings (dedicated route, camelCase, waiting-only). */
export function postDescribeItSettings(
  gameCode: string,
  hostToken: string,
  patch: { mode?: 'team' | 'individual'; numTeams?: number; turnSeconds?: number; rounds?: number }
) {
  return postJson<{ ok?: boolean }>('/api/describe-it/settings', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    ...patch,
  })
}

/** Word Rush lobby settings (dedicated route, camelCase, waiting-only). */
export function postWordRushSettings(
  gameCode: string,
  hostToken: string,
  patch: {
    mode?: 'team' | 'individual'
    promptMode?: 'automatic' | 'manual'
    difficulty?: 'standard' | 'hard'
    numTeams?: number
    turnSeconds?: number
    rounds?: number
  }
) {
  return postJson<{ ok?: boolean }>('/api/word-rush/settings', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    ...patch,
  })
}

/** Update the word/question pool (platform / custom / library) in the lobby. */
export function postLobbyPool(
  gameCode: string,
  hostToken: string,
  patch: { question_source?: string; custom_questions?: unknown[] }
) {
  return postJson<{ ok?: boolean }>(`/api/games/${gameCode.toUpperCase()}/lobby-pool`, {
    hostToken,
    ...patch,
  })
}

/** Codewords spymaster/operative timers (dedicated route, waiting-only). */
export function postCodewordsTimers(
  gameCode: string,
  hostToken: string,
  patch: { max_players?: number; spymasterTimerSeconds?: number; operativeTimerSeconds?: number }
) {
  return postJson<{ ok?: boolean }>('/api/codewords/timers', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    ...patch,
  })
}

/** Codewords — reshuffle team/role assignments (requires randomize mode). */
export function postCodewordsRandomizeTeams(gameCode: string, hostToken: string) {
  return postJson<{ ok?: boolean }>('/api/codewords/randomize-teams', {
    gameId: gameCode.toUpperCase(),
    hostToken,
  })
}

/** Codewords — host assigns a player to a team + role (lobby team management). */
export function postCodewordsHostRole(
  gameCode: string,
  hostToken: string,
  playerId: string,
  team: 'red' | 'blue',
  role: 'spymaster' | 'operative'
) {
  return postJson<{ ok?: boolean }>('/api/codewords/host-role', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    playerId,
    team,
    role,
  })
}

/** Codewords — host benches a player (removes their team/role assignment). */
export function deleteCodewordsHostRole(gameCode: string, hostToken: string, playerId: string) {
  return jsonRequest<{ ok?: boolean }>('/api/codewords/host-role', 'DELETE', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    playerId,
  })
}

export function postEndRound(gameId: string, hostToken: string) {
  return postJson<{ success?: boolean }>(`/api/games/${gameId.toUpperCase()}/end-round`, { hostToken })
}

export function postNextRound(gameId: string, hostToken: string) {
  return postJson<{ success?: boolean }>(`/api/games/${gameId.toUpperCase()}/next-round`, { hostToken })
}

export function postFinishGame(gameId: string, hostToken: string) {
  return postJson<{ success?: boolean }>(`/api/games/${gameId.toUpperCase()}/finish-game`, { hostToken })
}

export function postBingoCall(gameId: string, hostToken: string, opts?: { random?: boolean; number?: number }) {
  return postJson<{ success: boolean }>('/api/bingo/call', {
    gameId: gameId.toUpperCase(),
    hostToken,
    random: opts?.random ?? !opts?.number,
    number: opts?.number,
  })
}

export function postBingoSync(gameId: string) {
  return postJson<{ ok?: boolean; code?: string }>('/api/bingo/sync', { gameId: gameId.toUpperCase() })
}

export function postTriviaAdvance(gameId: string, opts?: { hostToken?: string; force?: boolean }) {
  return postJson<{ ok?: boolean; code?: string }>('/api/trivia/advance', {
    gameId: gameId.toUpperCase(),
    hostToken: opts?.hostToken,
    force: opts?.force ?? false,
  })
}

export function postTwoTruthsAdvance(gameId: string, opts?: { hostToken?: string; force?: boolean }) {
  return postJson<{ ok?: boolean; code?: string }>('/api/two-truths/advance', {
    gameId: gameId.toUpperCase(),
    hostToken: opts?.hostToken,
    force: opts?.force ?? false,
  })
}

export function postQuickDrawGuessAdvance(gameId: string, hostToken: string) {
  return postJson<{ ok?: boolean }>('/api/quick-draw/guess-advance', {
    gameId: gameId.toUpperCase(),
    hostToken,
  })
}

export function postQuickDrawGuessStrokes(gameId: string, resumeToken: string, strokeData: unknown) {
  return postJson<{ success?: boolean }>('/api/quick-draw/guess-strokes', {
    gameId: gameId.toUpperCase(),
    resumeToken,
    strokeData,
  })
}

export function postQuickDrawDraw(gameId: string, resumeToken: string, roundId: string, strokeData: unknown) {
  return postJson<{ success?: boolean }>('/api/quick-draw/draw', {
    gameId: gameId.toUpperCase(),
    resumeToken,
    roundId,
    strokeData,
  })
}

export function postQuickDrawTitle(gameId: string, resumeToken: string, drawingId: string, text: string) {
  return postJson<{ success?: boolean }>('/api/quick-draw/title', {
    gameId: gameId.toUpperCase(),
    resumeToken,
    drawingId,
    text,
  })
}

export function postQuickDrawVote(gameId: string, resumeToken: string, drawingId: string, chosenTitleId: string) {
  return postJson<{ success?: boolean }>('/api/quick-draw/vote', {
    gameId: gameId.toUpperCase(),
    resumeToken,
    drawingId,
    chosenTitleId,
  })
}

export function postQuickDrawAdvance(gameId: string) {
  return postJson<{ ok?: boolean }>('/api/quick-draw/advance', { gameId: gameId.toUpperCase() })
}

export function postMafiaAdvanceHost(gameId: string, hostToken: string, nextPhase?: string) {
  return postJson<{ success?: boolean }>(`/api/mafia/${gameId.toUpperCase()}/advance`, {
    hostToken,
    nextPhase,
  })
}

export function getMafiaHostState(gameId: string, hostToken: string) {
  return postJson<Record<string, unknown>>(`/api/mafia/${gameId.toUpperCase()}/host-state`, { hostToken })
}

export type CreateGameResponse = { gameCode: string; hostToken: string }

export type CreateGamePayload = Record<string, unknown>

export async function fetchGamePlayerLimits(): Promise<GamePlayerLimitsMap> {
  try {
    const res = await fetch(apiUrl('/api/game-limits'))
    if (!res.ok) return getCodeDefaultLimits()
    const data = (await res.json()) as { limits?: GamePlayerLimitsMap }
    return data.limits ?? getCodeDefaultLimits()
  } catch {
    return getCodeDefaultLimits()
  }
}

/**
 * Create a game and receive its code + host token. Pass a full create payload from
 * the create wizard (`buildCreatePayload`) or minimal `{ title, game_type }`.
 */
export function createGame(input: CreateGamePayload) {
  return postJson<CreateGameResponse>('/api/games', input)
}

async function jsonRequest<T>(path: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

export function patchPlayerName(
  gameCode: string,
  playerId: string,
  playerName: string,
  resumeToken: string
) {
  return jsonRequest<{ playerName: string }>('/api/players', 'PATCH', {
    gameCode: gameCode.toUpperCase(),
    playerId,
    playerName,
    resumeToken,
  })
}

export function leaveGame(gameCode: string, playerId: string, resumeToken: string) {
  return jsonRequest<{ success: boolean }>('/api/players', 'DELETE', {
    gameCode: gameCode.toUpperCase(),
    playerId,
    resumeToken,
  })
}

/** Host removes another player. Authorized by the host token (works mid-game). */
export function removePlayerAsHost(gameCode: string, playerId: string, hostToken: string) {
  return jsonRequest<{ success: boolean }>('/api/players', 'DELETE', {
    gameCode: gameCode.toUpperCase(),
    playerId,
    hostToken,
  })
}
