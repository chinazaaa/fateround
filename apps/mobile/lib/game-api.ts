import { apiUrl } from '@/lib/config'
import { authHeaders } from '@/lib/auth-headers'
import type { GameType, WhotPlayerHand } from '@fateround/shared'
import type { GamePlayerLimitsMap } from '@fateround/shared/lobby-limits'
import { getCodeDefaultLimits } from '@fateround/shared/lobby-limits'
import type { MafiaStateResponse } from '@fateround/shared/mafia'
import type { MahjongStateResponse } from '@fateround/shared/mahjong'
import type { WordSearchPlacement } from '@fateround/shared'

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return data
}

// Per-turn / per-phase expiry poke helpers. All take only `{ gameId }` (the routes
// upper-case it, re-check the deadline, and no-op unless the game is active), so
// any active client may fire them to advance a stalled/AFK turn.
export function postWhotExpireTurn(gameId: string) {
  return postJson<{ ok?: boolean; skipped?: boolean }>('/api/whot/expire-turn', { gameId })
}

export function postCrazyEightsExpireTurn(gameId: string) {
  return postJson<{ ok?: boolean; skipped?: boolean }>('/api/crazy-eights/expire-turn', { gameId })
}

export function postMahjongExpireTurn(gameId: string) {
  return postJson<{ success?: boolean; skipped?: boolean }>('/api/mahjong/expire-turn', { gameId })
}

export function postSnakeLadderExpireTurn(gameId: string) {
  return postJson<{ success?: boolean; skipped?: boolean }>('/api/snake-and-ladder/expire-turn', { gameId })
}

export function postMonopolyExpireTurn(gameId: string) {
  return postJson<{ success?: boolean; skipped?: boolean }>('/api/monopoly/expire-turn', { gameId })
}

export function postDescribeItExpireTurn(gameId: string) {
  return postJson<{ success?: boolean }>('/api/describe-it/expire-turn', { gameId })
}

export function postDescribeItAdvance(gameId: string) {
  return postJson<{ success?: boolean }>('/api/describe-it/advance', { gameId })
}

export function postWordRushExpireTurn(gameId: string) {
  return postJson<{ success?: boolean }>('/api/word-rush/expire-turn', { gameId })
}

export function postWordRushAdvance(gameId: string) {
  return postJson<{ success?: boolean }>('/api/word-rush/advance', { gameId })
}

/** Ends an Anonymous Messages room once its 15-minute session window elapses. */
export function postExpireSession(gameCode: string) {
  return postJson<{ expired?: boolean; finished?: boolean }>(`/api/games/${gameCode.toUpperCase()}/expire-session`, {})
}

export function postTicTacToeMove(gameId: string, resumeToken: string, cellIndex: number) {
  return postJson<{ success: boolean }>('/api/tic-tac-toe/move', { gameId, resumeToken, cellIndex })
}

export function postTicTacToeExpireTurn(gameId: string) {
  return postJson<{ success: boolean }>('/api/tic-tac-toe/expire-turn', { gameId })
}

export function postCheckersMove(gameId: string, resumeToken: string, from: string, to: string) {
  return postJson<{ success: boolean }>('/api/checkers/move', { gameId, resumeToken, from, to })
}

export function postCheckersResign(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/checkers/resign', { gameId, resumeToken })
}

export function postCheckersExpireTurn(gameId: string) {
  return postJson<{ success: boolean }>('/api/checkers/expire-turn', { gameId })
}

export function postCheckersInternationalMove(gameId: string, resumeToken: string, from: string, to: string) {
  return postJson<{ success: boolean }>('/api/checkers-international/move', { gameId, resumeToken, from, to })
}

export function postCheckersInternationalResign(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/checkers-international/resign', { gameId, resumeToken })
}

export function postCheckersInternationalExpireTurn(gameId: string) {
  return postJson<{ success: boolean }>('/api/checkers-international/expire-turn', { gameId })
}

export function postCheckersNigeriaMove(gameId: string, resumeToken: string, from: string, to: string) {
  return postJson<{ success: boolean }>('/api/checkers-nigeria/move', { gameId, resumeToken, from, to })
}

export function postCheckersNigeriaResign(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/checkers-nigeria/resign', { gameId, resumeToken })
}

export function postCheckersNigeriaExpireTurn(gameId: string) {
  return postJson<{ success: boolean }>('/api/checkers-nigeria/expire-turn', { gameId })
}

/** Street Rules only: spend the turn huffing (removing) a declined-capture piece instead of moving. */
export function postCheckersNigeriaHuff(gameId: string, resumeToken: string, square: string) {
  return postJson<{ success: boolean }>('/api/checkers-nigeria/huff', { gameId, resumeToken, square })
}

export function postAyoMove(gameId: string, resumeToken: string, pitIndex: number) {
  return postJson<{ success: boolean }>('/api/ayo/move', { gameId, resumeToken, pitIndex })
}

export function postAyoResign(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/ayo/resign', { gameId, resumeToken })
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

export function postPlayAgain(gameCode: string, hostToken: string, sameSettings = true, hostPlayerId?: string | null) {
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

/** In-place sit-out (player → spectator) during active play — the inverse of promote. Sets
 *  spectator=true on the caller's own row without deleting it (keeps the seat id + score). Only
 *  valid for games where `gameSupportsInPlaceSpectate` is true (no turn_order coupling). */
export function postPlayerSpectate(gameCode: string, resumeToken: string) {
  return postJson<{ isViewer: boolean }>('/api/players/spectate', { gameCode: gameCode.toUpperCase(), resumeToken })
}

export function postVote(gameId: string, resumeToken: string, roundId: string, body: Record<string, unknown>) {
  return postJson<{ success: boolean; revealedQuestion?: string; pickedNumber?: number }>('/api/votes', {
    gameId,
    resumeToken,
    roundId,
    ...body,
  })
}

export function postMatchingPairsFlip(gameId: string, resumeToken: string, pairIndex: number, isMatch: boolean) {
  return postJson<{ success: boolean; pointsAfter: number; finished?: boolean }>('/api/matching-pairs/flip', {
    gameId,
    resumeToken,
    pairIndex,
    isMatch,
  })
}

export function postSudokuSubmit(gameId: string, resumeToken: string, row: number, col: number, value: number) {
  return postJson<{ success: boolean; isCorrect: boolean; pointsAwarded: number }>('/api/sudoku/submit', {
    gameId,
    resumeToken,
    row,
    col,
    value,
  })
}

export function postCrosswordSubmit(
  gameId: string,
  resumeToken: string,
  row: number,
  col: number,
  letter: string,
  hint?: boolean
) {
  return postJson<{ success: boolean; isCorrect: boolean; letter?: string; hint?: boolean; alreadySolved?: boolean }>(
    '/api/crossword/submit',
    {
      gameId,
      resumeToken,
      row,
      col,
      letter,
      hint,
    }
  )
}

export function postWordSearchFound(
  gameId: string,
  resumeToken: string,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  hint?: boolean
) {
  return postJson<{
    found: boolean
    word?: string
    alreadyFound?: boolean
    hint?: boolean
    complete?: boolean
    start?: [number, number]
    end?: [number, number]
  }>('/api/word-search/found', {
    gameId,
    resumeToken,
    startRow,
    startCol,
    endRow,
    endCol,
    hint,
  })
}

// Answer keys — only populated once the game is finished (the routes gate on status
// and read the RLS-protected solution tables with the service role). Return null
// while the game is still live or if the fetch fails, so callers just hide the panel.
export async function fetchCrosswordSolution(gameId: string): Promise<string[][] | null> {
  try {
    const res = await fetch(apiUrl(`/api/crossword/solution?gameId=${encodeURIComponent(gameId)}`), {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { solution?: string[][] | null }
    return Array.isArray(data.solution) ? data.solution : null
  } catch {
    return null
  }
}

export async function fetchWordSearchSolution(gameId: string): Promise<WordSearchPlacement[] | null> {
  try {
    const res = await fetch(apiUrl(`/api/word-search/solution?gameId=${encodeURIComponent(gameId)}`), {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { placements?: WordSearchPlacement[] | null }
    return Array.isArray(data.placements) ? data.placements : null
  } catch {
    return null
  }
}

export function postWordScrambleSubmit(
  gameId: string,
  resumeToken: string,
  scrambleIndex: number,
  guess: string,
  hint?: boolean
) {
  return postJson<{ correct: boolean; word?: string; alreadySolved?: boolean; hint?: boolean; finished?: boolean }>(
    '/api/word-scramble/submit',
    { gameId, resumeToken, scrambleIndex, guess, hint }
  )
}

export function postWordScrambleHint(gameId: string, resumeToken: string, scrambleIndex: number) {
  return postJson<{ available: boolean; clue: string; letters?: number }>('/api/word-scramble/hint', {
    gameId,
    resumeToken,
    scrambleIndex,
  })
}

export async function fetchWordScrambleSolution(gameId: string): Promise<string[] | null> {
  try {
    const res = await fetch(apiUrl(`/api/word-scramble/solution?gameId=${encodeURIComponent(gameId)}`), {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { answers?: string[] | null }
    return Array.isArray(data.answers) ? data.answers : null
  } catch {
    return null
  }
}

export function postWordGroupingSubmit(gameId: string, resumeToken: string, words: string[]) {
  return postJson<{
    success: boolean
    isCorrect: boolean
    oneAway?: boolean
    alreadySolved?: boolean
    group?: { category: string; words: string[]; difficulty: 1 | 2 | 3 | 4 }
  }>('/api/word-grouping/submit', { gameId, resumeToken, words })
}

export async function fetchWordGroupingSolution(
  gameId: string
): Promise<{ category: string; words: string[]; difficulty: 1 | 2 | 3 | 4 }[] | null> {
  try {
    const res = await fetch(apiUrl(`/api/word-grouping/solution?gameId=${encodeURIComponent(gameId)}`), {
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      solution?: { groups?: { category: string; words: string[]; difficulty: 1 | 2 | 3 | 4 }[] } | null
    }
    return Array.isArray(data.solution?.groups) ? data.solution!.groups! : null
  } catch {
    return null
  }
}

/** Finishes a Word Grouping game whose timer has run out. Server re-verifies the deadline. */
export function postExpireWordGrouping(gameCode: string) {
  return postJson<{ expired?: boolean; finished?: boolean }>(
    `/api/games/${gameCode.toUpperCase()}/expire-word-grouping`,
    {}
  )
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

export function postYahtzeeExpireTurn(gameId: string) {
  return postJson<{ ok: boolean; skipped?: boolean }>('/api/yahtzee/expire-turn', { gameId })
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

export function postUnoPlay(gameId: string, resumeToken: string, cardId: string, callUno = false) {
  return postJson<{ success: boolean }>('/api/uno/play', { gameId, resumeToken, cardId, callUno })
}

export function postUnoDraw(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/uno/draw', { gameId, resumeToken })
}

export function postUnoChooseColor(gameId: string, resumeToken: string, color: string) {
  return postJson<{ success: boolean }>('/api/uno/choose', { gameId, resumeToken, color })
}

export function postUnoPass(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/uno/pass', { gameId, resumeToken })
}

export function postUnoCallUno(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/uno/call-uno', { gameId, resumeToken })
}

export function postUnoChallenge(gameId: string, resumeToken: string, challenge: boolean) {
  return postJson<{ success: boolean }>('/api/uno/challenge', { gameId, resumeToken, challenge })
}

export function postUnoExpireTurn(gameId: string) {
  return postJson<{ ok?: boolean; skipped?: boolean }>('/api/uno/expire-turn', { gameId })
}

// 0/7 rule: swap hands with `targetId` (only valid while phase === 'swap_target').
export function postUnoSwap(gameId: string, resumeToken: string, targetId: string) {
  return postJson<{ success: boolean }>('/api/uno/swap', { gameId, resumeToken, targetId })
}

// Multi-Play: lay several matching cards in one turn, `cardIds` in play order (last stays on top).
export function postUnoPlayMulti(gameId: string, resumeToken: string, cardIds: string[], callUno = false) {
  return postJson<{ success: boolean }>('/api/uno/play-multi', { gameId, resumeToken, cardIds, callUno })
}

// Jump-In: play an exact-match card out of turn.
export function postUnoJumpIn(gameId: string, resumeToken: string, cardId: string, callUno = false) {
  return postJson<{ success: boolean }>('/api/uno/jump-in', { gameId, resumeToken, cardId, callUno })
}

// Team-Up: after a teammate leaves mid-round, continue solo or forfeit.
export function postUnoTeamLeaveDecision(gameId: string, resumeToken: string, decision: 'continue' | 'forfeit') {
  return postJson<{ success: boolean }>('/api/uno/team-leave', { gameId, resumeToken, decision })
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
export function postPlayerParticipant(gameCode: string, resumeToken: string, name: string, gender?: 'male' | 'female') {
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

/** Word Rush host: even out team sizes (waiting-only, team mode). */
export function postWordRushBalance(gameCode: string, hostToken: string) {
  return postJson<{ ok?: boolean }>('/api/word-rush/balance', { gameId: gameCode.toUpperCase(), hostToken })
}

/** Word Rush host: skip the rest of the current round for everyone (active only). */
export function postWordRushEndRound(gameCode: string, hostToken: string) {
  return postJson<{ success?: boolean }>('/api/word-rush/end-round', { gameId: gameCode.toUpperCase(), hostToken })
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
  return postJson<{ success: boolean; correct?: boolean; points?: number; message?: string }>('/api/word-rush/submit', {
    gameId,
    resumeToken,
    text,
  })
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

// Finishes a Word Hunt game whose timer has run out. Safe to call unauthenticated:
// the route re-verifies the deadline server-side before ending the game.
// Route: src/app/api/games/[code]/expire-word-hunt/route.ts
export function postExpireWordHunt(gameCode: string) {
  return postJson<{ expired: boolean; finished: boolean }>(`/api/games/${gameCode.toUpperCase()}/expire-word-hunt`, {})
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

// ── Landmine ──────────────────────────────────────────────────────────────────
export async function fetchLandmineCategories(): Promise<{
  categories: { id: string; name: string; entryCount: number }[]
}> {
  const res = await fetch(apiUrl('/api/landmine/categories'), { method: 'GET' })
  const data = (await res.json()) as { categories?: { id: string; name: string; entryCount: number }[]; error?: string }
  if (!res.ok) throw new Error(data.error ?? 'Request failed')
  return { categories: data.categories ?? [] }
}

export function postLandmineCategory(gameId: string, resumeToken: string, roundId: string, categoryId: string) {
  return postJson<{ success: boolean }>('/api/landmine/category', { gameId, resumeToken, roundId, categoryId })
}

export function postLandmineSubmit(gameId: string, resumeToken: string, roundId: string, answer: string) {
  return postJson<{ success: boolean }>('/api/landmine/submit', { gameId, resumeToken, roundId, answer })
}

// Manual mode: the setter submits the category + mine word(s) for their round.
export function postLandmineSetup(
  gameId: string,
  resumeToken: string,
  roundId: string,
  category: string,
  mines: string[]
) {
  return postJson<{ success: boolean }>('/api/landmine/setup', { gameId, resumeToken, roundId, category, mines })
}

export function postLandmineDraft(gameId: string, resumeToken: string, roundId: string, answer: string) {
  return postJson<{ success: boolean }>('/api/landmine/draft', { gameId, resumeToken, roundId, answer })
}

export function postLandmineMark(gameId: string, resumeToken: string, roundId: string, valid: boolean) {
  return postJson<{ success: boolean }>('/api/landmine/mark', { gameId, resumeToken, roundId, valid })
}

// MANUAL mode: the round's setter judges every answer at once.
export function postLandmineSetterMark(
  gameId: string,
  resumeToken: string,
  roundId: string,
  verdicts: { playerId: string; valid: boolean }[]
) {
  return postJson<{ success: boolean }>('/api/landmine/setter-mark', { gameId, resumeToken, roundId, verdicts })
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

export function postMafiaNightAction(
  gameCode: string,
  resumeToken: string,
  targetPlayerId: string,
  opts?: { secondTargetPlayerId?: string; potionType?: 'heal' | 'kill' }
) {
  return postJson<{ success: boolean; resigned?: boolean }>(`/api/mafia/${gameCode}/night-action`, {
    resumeToken,
    targetPlayerId,
    secondTargetPlayerId: opts?.secondTargetPlayerId,
    potionType: opts?.potionType,
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

export function postMafiaSkipPhase(gameCode: string, resumeToken: string) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/skip-phase`, { resumeToken })
}

export function postMafiaRevengeTarget(gameCode: string, resumeToken: string, targetPlayerId: string) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/revenge-target`, { resumeToken, targetPlayerId })
}

export function postMafiaPriestAction(gameCode: string, resumeToken: string, targetPlayerId: string) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/priest-action`, {
    resumeToken,
    targetPlayerId,
  })
}

export function postMafiaVigilanteAction(
  gameCode: string,
  resumeToken: string,
  targetPlayerId: string,
  action: 'shoot' | 'reveal'
) {
  return postJson<{ success: boolean }>(`/api/mafia/${gameCode}/vigilante-action`, {
    resumeToken,
    targetPlayerId,
    action,
  })
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

export function postMonopolyBuy(gameId: string, resumeToken: string, decision: 'buy' | 'auction' | 'pass') {
  return postJson<{ success: boolean }>('/api/monopoly/buy', { gameId, resumeToken, decision })
}

export function postMonopolyRent(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/monopoly/rent', { gameId, resumeToken })
}

export function postMonopolyJail(gameId: string, resumeToken: string, method: 'pay' | 'card') {
  return postJson<{ success: boolean }>('/api/monopoly/jail', { gameId, resumeToken, method })
}

export function postMonopolyAuction(gameId: string, resumeToken: string, action: 'pass' | 'bid', amount?: number) {
  return postJson<{ success: boolean }>('/api/monopoly/auction', { gameId, resumeToken, action, amount })
}

export function postMonopolySettleDebt(gameId: string, resumeToken: string, action: 'pay') {
  return postJson<{ success: boolean }>('/api/monopoly/settle-debt', { gameId, resumeToken, action })
}

export function postMonopolyForfeit(gameId: string, resumeToken: string) {
  return postJson<{ success: boolean }>('/api/monopoly/forfeit', { gameId, resumeToken })
}

export function postMonopolyBuild(
  gameId: string,
  resumeToken: string,
  spaceIndex: number,
  action: 'buy_house' | 'sell_house' | 'buy_hotel' | 'sell_hotel'
) {
  return postJson<{ success: boolean }>('/api/monopoly/build', { gameId, resumeToken, spaceIndex, action })
}

export function postMonopolyMortgage(
  gameId: string,
  resumeToken: string,
  spaceIndex: number,
  action: 'mortgage' | 'unmortgage'
) {
  return postJson<{ success: boolean }>('/api/monopoly/mortgage', { gameId, resumeToken, spaceIndex, action })
}

export function postMonopolyTrade(
  gameId: string,
  resumeToken: string,
  payload: {
    toPlayerId?: string
    offerCash?: number
    requestCash?: number
    offerProperties?: number[]
    requestProperties?: number[]
    offerGetOutCards?: number
    requestGetOutCards?: number
    accept?: boolean
    cancel?: boolean
    repair?: boolean
  }
) {
  return postJson<{ success: boolean }>('/api/monopoly/trade', { gameId, resumeToken, ...payload })
}

/** Host adds time to a timed Monopoly game (extensionSeconds ∈ {600,900,1800}). */
export function postExtendMonopolyTime(gameCode: string, hostToken: string, extensionSeconds: number) {
  return postJson<{ ok?: boolean; success?: boolean }>(`/api/games/${gameCode.toUpperCase()}/extend-monopoly-time`, {
    hostToken,
    extensionSeconds,
  })
}

/** Host adds time to a timed Scrabble game (extensionSeconds ∈ {600,900,1800}). */
export function postExtendScrabbleTime(gameCode: string, hostToken: string, extensionSeconds: number) {
  return postJson<{ ok?: boolean; success?: boolean }>(`/api/games/${gameCode.toUpperCase()}/extend-scrabble-time`, {
    hostToken,
    extensionSeconds,
  })
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

/**
 * Whot hands via the server route — own cards in full, everyone else's as a count.
 * Returns null on failure so callers can keep the previous hands rather than rendering an
 * empty one (which reads as "you are out"). See src/lib/hand-redaction.ts.
 */
export function postWhotHands(gameCode: string, auth: { resumeToken?: string | null }) {
  return postJson<{ hands: WhotPlayerHand[] }>('/api/whot/hands', {
    gameCode: gameCode.toUpperCase(),
    resumeToken: auth.resumeToken ?? undefined,
  })
}

export function postAnonymousMessage(gameId: string, resumeToken: string, text: string, replyToId?: string | null) {
  return postJson<{ success: boolean }>('/api/anonymous-messages', {
    gameId,
    resumeToken,
    text,
    messageType: 'text',
    replyToId: replyToId ?? undefined,
  })
}

/** Send a GIF/sticker (message_type 'gif', media_url = the Klipy URL). */
export function postAnonymousGif(gameId: string, resumeToken: string, mediaUrl: string, replyToId?: string | null) {
  return postJson<{ success: boolean }>('/api/anonymous-messages', {
    gameId,
    resumeToken,
    text: '',
    messageType: 'gif',
    mediaUrl,
    replyToId: replyToId ?? undefined,
  })
}

/** Host removes a single message from an anonymous room feed. */
export function deleteAnonymousMessage(gameId: string, messageId: string, hostToken: string) {
  return jsonRequest<{ success?: boolean }>('/api/anonymous-messages', 'DELETE', {
    gameId: gameId.toUpperCase(),
    messageId,
    hostToken,
  })
}

/** Host mutes a player in an anonymous room for the given number of minutes. */
export function muteAnonymousPlayer(gameId: string, playerId: string, hostToken: string, durationMinutes: number) {
  return postJson<{ success: boolean }>('/api/anonymous-room/bans', {
    gameId: gameId.toUpperCase(),
    playerId,
    hostToken,
    durationMinutes,
  })
}

/** Host unmutes a previously muted player in an anonymous room. */
export function unmuteAnonymousPlayer(gameId: string, playerId: string, hostToken: string) {
  return jsonRequest<{ success?: boolean }>('/api/anonymous-room/bans', 'DELETE', {
    gameId: gameId.toUpperCase(),
    playerId,
    hostToken,
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
  return postJson<{ ok: boolean; hostToken: string }>(`/api/games/${gameCode.toUpperCase()}/claim-host`, {
    resumeToken,
  })
}

/** Nominee declines — clears the nomination without rotating the token. */
export function postDeclineHost(gameCode: string, resumeToken: string) {
  return postJson<{ ok: boolean; declined: boolean }>(`/api/games/${gameCode.toUpperCase()}/decline-host`, {
    resumeToken,
  })
}

/**
 * Start the game. The server generates rounds and flips status to active. It
 * enforces per-game minimum-player rules and throws (via postJson) with the
 * server's message when they aren't met — the caller surfaces that verbatim.
 */
export function startGame(gameId: string, hostToken: string, firstTeam?: 'red' | 'blue') {
  // firstTeam is a Codewords "goes first" preference read by the start route
  // (omit for random). The route ignores it for non-Codewords games.
  return postJson<{ ok?: boolean }>(`/api/games/${gameId.toUpperCase()}/start`, {
    hostToken,
    ...(firstTeam ? { firstTeam } : {}),
  })
}

export type FreshnessResult = {
  fresh: boolean
  totalPool: number
  seenByMost: number
  seenPercent: number
  authenticatedPlayers: number
  totalPlayers: number
}

export function checkFreshness(gameCode: string, hostToken: string) {
  return postJson<FreshnessResult>(`/api/games/${gameCode.toUpperCase()}/freshness-check`, { hostToken })
}

export type LobbySettingsPatch = {
  is_public?: boolean
  content_label?: string
  theme?: string
  rounds_count?: number
  timer_seconds?: number
  operative_timer_seconds?: number
  game_duration_seconds?: number
  late_join_policy?: 'lobby_only' | 'viewers_only' | 'viewers_and_players'
  scrabble_dictionary_id?: string
  scrabble_clock_mode?: 'standard' | 'chess'
  scrabble_clock_seconds?: number
  codewords_player_picks?: boolean
  codewords_randomize_teams?: boolean
  pair_vote_mode?: 'one_each' | 'any'
  participant_filter?: 'all' | 'joined'
  player_questions_enabled?: boolean
  player_questions_order?: 'players_first' | 'uploaded_first' | 'mixed'
  ai_questions_enabled?: boolean
  ai_questions_config?: {
    ratio: 'all_ai' | 'mostly_ai' | 'half' | 'mostly_platform'
    theme?: string
    customPrompt?: string
  } | null
  /** Discovery Phase A — "Keep open" on the host T-13min banner. */
  keep_lobby_alive?: boolean
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
  uno_wd4_challenge?: boolean
  uno_uno_penalty?: number
  uno_wd4_challenge_penalty?: number
  uno_zero_seven?: boolean
  uno_stacking?: boolean
  uno_jump_in?: boolean
  uno_multi_play_mode?: string
  uno_team_mode?: boolean
  uno_mode?: string
  uno_no_mercy_win?: string
  uno_series_scoring?: boolean
  uno_series_target?: number
  uno_series_scores?: Record<string, number> | null
  uno_series_winner_id?: string | null
  ludo_variant?: 'modern' | 'traditional'
  ayo_variant?: 'traditional' | 'oware'
  checkers_nigeria_street_rules?: boolean
  mafia_doctor_enabled?: boolean
  mafia_detective_enabled?: boolean
  mafia_anonymous_votes?: boolean
  mafia_advanced_mode?: boolean
  mafia_day_seconds?: number
  mafia_voting_seconds?: number
  monopoly_double_go_salary?: boolean
  monopoly_forced_auctions?: boolean
  monopoly_auction_timer_seconds?: number
  monopoly_no_rent_in_jail?: boolean
  monopoly_estate_dividend?: boolean
  /** 40 (classic) or 48 (expanded). 48 requires max_players >= 6 (server enforces). */
  monopoly_board_size?: 40 | 48
  operative_timer_seconds?: number
  quick_draw_variant?: 'lie' | 'guess'
  quick_draw_play_mode?: 'team' | 'individual'
  quick_draw_num_teams?: number
  mahjong_ruleset?: string
  mahjong_rule_options?: Record<string, unknown>
  crossword_theme?: string
  crossword_difficulty?: 'easy' | 'medium' | 'hard'
  word_search_theme?: string
  word_search_difficulty?: 'easy' | 'medium' | 'hard'
  word_scramble_theme?: string
  word_scramble_difficulty?: 'easy' | 'medium' | 'hard'
  /** Admin-authored theme (puzzle_themes.id); server folds its word pool + locked difficulty. */
  puzzle_theme_id?: string
  /** Host-supplied puzzle pool (a Library pack or "Your own" upload); server re-validates + normalises. */
  puzzle_custom_questions?: unknown[]
  /** Wordle Room — built-in category (General English / Naija Slang / themed). */
  wordle_room_category?: string
  /** Wordle Room — 5/10/15/20 words per race. */
  wordle_room_word_count?: number
  /** Wordle Room — optional library-pack pool ({word, hint?}[]); clears when empty. */
  wordle_room_words?: { word: string; hint?: string }[] | null
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
    maxPlayers?: number
  }
) {
  return postJson<{ ok?: boolean }>('/api/word-rush/settings', {
    gameId: gameCode.toUpperCase(),
    hostToken,
    ...patch,
  })
}

/**
 * Trivia lobby settings — question source / category / custom-or-library pool /
 * timer / rounds through the shared lobby-pool route (web saveLobbySettings).
 */
export function postTriviaLobbySettings(
  gameCode: string,
  hostToken: string,
  payload: {
    question_source?: string
    trivia_category?: string
    timer_seconds?: number
    rounds_count?: number
    custom_questions?: unknown[]
  }
) {
  return postJson<{ ok?: boolean }>(`/api/games/${gameCode.toUpperCase()}/lobby-pool`, {
    hostToken,
    ...payload,
  })
}

/** Update the word/question pool (platform / custom / library) in the lobby. */
export function postLobbyPool(
  gameCode: string,
  hostToken: string,
  patch: { question_source?: string; custom_questions?: unknown[]; wst_quote_source?: 'player' | 'deck' }
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

export function postQuickDrawGuessAdvance(gameId: string, hostToken?: string) {
  // hostToken is only for the host "skip ahead" button; the auto-timer advance
  // (any active client) omits it — the route's break-deadline check gates it.
  return postJson<{ ok?: boolean }>('/api/quick-draw/guess-advance', {
    gameId: gameId.toUpperCase(),
    ...(hostToken ? { hostToken } : {}),
  })
}

export function postQuickDrawGuessExpireTurn(gameId: string) {
  return postJson<{ ok?: boolean; skipped?: boolean }>('/api/quick-draw/guess-expire-turn', {
    gameId: gameId.toUpperCase(),
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

export function postQuickDrawAdvance(gameId: string, hostToken?: string, force?: boolean) {
  return postJson<{ ok?: boolean }>('/api/quick-draw/advance', {
    gameId: gameId.toUpperCase(),
    ...(hostToken ? { hostToken } : {}),
    // Host "skip" must bypass the phase gates; the auto-advance loop omits this
    // so it only advances once the timer/submission conditions are actually met.
    ...(force ? { force: true } : {}),
  })
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

export function patchPlayerName(gameCode: string, playerId: string, playerName: string, resumeToken: string) {
  return jsonRequest<{ playerName: string }>('/api/players', 'PATCH', {
    gameCode: gameCode.toUpperCase(),
    playerId,
    playerName,
    resumeToken,
  })
}

/** Monopoly: swap your board token from the lobby (before the game starts). */
export function patchPlayerMonopolyToken(
  gameCode: string,
  playerId: string,
  monopolyToken: string,
  resumeToken: string
) {
  return jsonRequest<{ playerId: string }>('/api/players', 'PATCH', {
    gameCode: gameCode.toUpperCase(),
    playerId,
    monopolyToken,
    resumeToken,
  })
}

/** Issue a fresh player code, invalidating the old one and any link that carries it. */
export function rotatePlayerResumeToken(gameCode: string, resumeToken: string) {
  return postJson<{ newToken: string }>('/api/players/resume/rotate', {
    gameCode: gameCode.toUpperCase(),
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

// ── Wordle Room ──────────────────────────────────────────────────────────────

export interface WordleRoomStatusResponse {
  success?: boolean
  gameId?: string
  status?: string
  currentWord?: string
  wordLength?: number
  maxAttempts?: number
  word_index?: number
  word_count?: number
  words_solved?: number
  total_guesses?: number
  categoryLabel?: string
  finished?: boolean
  sequenceComplete?: boolean
  guesses?: { guess: string; state: ('correct' | 'present' | 'absent')[] }[]
  timeRemainingMs?: number
  hasProgressRow?: boolean
  hintAvailable?: boolean
  hintUsed?: boolean
  hint?: string | null
}

export function postWordleRoomStatus(gameId: string, resumeToken: string) {
  return postJson<WordleRoomStatusResponse>('/api/wordle-room/status', {
    gameId: gameId.toUpperCase(),
    resumeToken,
  })
}

export interface WordleRoomGuessResponse {
  success?: boolean
  solved?: boolean
  pointsAwarded?: number
  guessesUsed?: number
  maxAttempts?: number
  wordIndex?: number
  wordsSolved?: number
  finished?: boolean
  nextWord?: string | null
  guessId?: string | null
}

export function postWordleRoomGuess(gameId: string, resumeToken: string, word: string) {
  return postJson<WordleRoomGuessResponse>('/api/wordle-room/guess', {
    gameId: gameId.toUpperCase(),
    resumeToken,
    word,
  })
}

export function postWordleRoomRevealHint(gameId: string, resumeToken: string, wordIndex: number) {
  return postJson<{ success?: boolean; wordIndex?: number; hint?: string; cost?: number }>(
    '/api/wordle-room/reveal-hint',
    {
      gameId: gameId.toUpperCase(),
      resumeToken,
      wordIndex,
    }
  )
}
