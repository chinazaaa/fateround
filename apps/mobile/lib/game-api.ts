import { apiUrl } from '@/lib/config'
import type { GameType } from '@fateround/shared'
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

export function postPlayAgain(gameCode: string, hostToken: string, sameSettings = true) {
  return postJson<{ success: boolean }>(`/api/games/${gameCode.toUpperCase()}/play-again`, {
    hostToken,
    same_settings: sameSettings,
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

/**
 * Start the game. The server generates rounds and flips status to active. It
 * enforces per-game minimum-player rules and throws (via postJson) with the
 * server's message when they aren't met — the caller surfaces that verbatim.
 */
export function startGame(gameId: string, hostToken: string) {
  return postJson<{ ok?: boolean }>(`/api/games/${gameId.toUpperCase()}/start`, { hostToken })
}

export type CreateGameResponse = { gameCode: string; hostToken: string }

/**
 * Create a game and receive its code + host token. Only `title` is required by
 * the server; everything else (rounds, timers, max players) defaults per game
 * type. Native create is limited to lobby games that need no participant list
 * or custom questions — see app/create.tsx.
 */
export function createGame(input: { title: string; gameType: GameType }) {
  return postJson<CreateGameResponse>('/api/games', {
    title: input.title,
    game_type: input.gameType,
  })
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
