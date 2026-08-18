import type { GameType } from '@fateround/shared'
import {
  isCodewordsGame,
  isCrosswordGame,
  isDescribeItGame,
  isQuickDrawGame,
  isTriviaGame,
  isWordScrambleGame,
  isWordSearchGame,
} from '@fateround/shared/game-type-checks'
import {
  isBinaryChoiceGame,
  isMostLikelyTo,
  isNeverHaveIEver,
  isPickANumber,
  isThisOrThat,
  isWhoSaidThis,
} from '@fateround/shared/poll-games'
import { WORDLE_ROOM_SAMPLE_CSV } from '@fateround/shared/wordle-room'

/**
 * Sample CSV templates surfaced under mobile "Your own" / import flows so hosts can start
 * from a known-good file. Mirrors the `public/*-sample.csv` set on web verbatim (with a small
 * WST + word_grouping addition since those don't have static files on web) — kept lean on
 * purpose so the eventual "which shape does this game want?" question always has a live
 * answer next to the upload button.
 *
 * When adding a new game type here, keep the shape in lockstep with the web sample if one
 * exists — the two flows share hosts, and inconsistent shapes are worse than no template.
 */

const TRIVIA_SAMPLE = [
  'question,option_a,option_b,option_c,option_d,correct',
  'What does CPU stand for?,Central Processing Unit,Computer Personal Unit,Core Program Utility,Central Power Unit,A',
  'What is the capital of Japan?,Seoul,Beijing,Tokyo,Bangkok,C',
  'Which planet is closest to the Sun?,Venus,Mercury,Earth,Mars,B',
  'Who wrote Romeo and Juliet?,Charles Dickens,William Shakespeare,Jane Austen,Mark Twain,B',
  'What year did the first iPhone launch?,2005,2007,2009,2010,B',
  '',
].join('\n')

const WYR_SAMPLE = [
  'option_a,option_b',
  'Never have pizza again,Never have tacos again',
  'Only date people taller than you,Only date people shorter than you',
  'Live without music,Live without movies',
  'Always be 10 minutes late,Always be 30 minutes early',
  '',
].join('\n')

const TOT_SAMPLE = [
  'Question',
  'Coffee or Tea?',
  'Beach vacation or Mountain getaway?',
  'Sweet or Savory?',
  'Morning person or Night owl?',
  'Netflix or Movie theater?',
  '',
].join('\n')

const NHIE_SAMPLE = [
  'question',
  'been skydiving',
  'kissed a stranger',
  'sung karaoke sober',
  'met a celebrity',
  '',
].join('\n')

const MLT_SAMPLE = [
  'question',
  'Who is most likely to become famous?',
  "Who is most likely to forget someone's birthday?",
  'Who is most likely to win a dance-off?',
  'Who is most likely to start a group chat at 2am?',
  '',
].join('\n')

const PAN_SAMPLE = [
  'question',
  "What's the most embarrassing thing that's ever happened to you?",
  'Who was your first crush?',
  "What's your go-to karaoke song?",
  "What's a secret you've never told anyone in this room?",
  "What's the worst date you've ever been on?",
  '',
].join('\n')

const CODEWORDS_SAMPLE = [
  'word',
  'Ocean',
  'Mountain',
  'Castle',
  'Dragon',
  'Pizza',
  'Guitar',
  'Rocket',
  'Forest',
  'Diamond',
  'Thunder',
  'Penguin',
  'Volcano',
  'Wizard',
  'Chocolate',
  'Rainbow',
  '',
].join('\n')

const DESCRIBE_IT_SAMPLE = [
  'word',
  'pizza',
  'rainbow',
  'astronaut',
  'volcano',
  'guitar',
  'penguin',
  'umbrella',
  'lighthouse',
  '',
].join('\n')

const CROSSWORD_SAMPLE = [
  'answer,clue',
  'PLANET,"A world orbiting a star"',
  'RIVER,"A large natural stream of water"',
  'GUITAR,"A six-stringed instrument"',
  'VOLCANO,"A mountain that can erupt"',
  'COMPASS,"It points north"',
  'HARVEST,"Gathering ripe crops"',
  '',
].join('\n')

const WORD_SEARCH_SAMPLE = ['word', 'PLANET', 'RIVER', 'GUITAR', 'VOLCANO', 'COMPASS', 'HARVEST', ''].join('\n')

const WORD_SCRAMBLE_SAMPLE = [
  'word,hint',
  'PLANET,A world orbiting a star',
  'RIVER,A large natural stream of water',
  'GUITAR,A six-stringed instrument',
  'VOLCANO,A mountain that can erupt',
  'COMPASS,It points north',
  '',
].join('\n')

const WST_SAMPLE = [
  'quote,option_a,option_b,option_c,option_d,correct',
  '"I never miss leg day",Sarah,James,Michael,Emma,B',
  '"I could eat pasta every day",Emma,Olivia,David,James,A',
  '"I once cried at a Pixar movie",Michael,Sarah,David,Olivia,C',
  '',
].join('\n')

export const PARTICIPANTS_SAMPLE = [
  'name,gender',
  'Sarah,female',
  'Emma,female',
  'Olivia,female',
  'James,male',
  'Michael,male',
  'David,male',
  '',
].join('\n')

/**
 * The CSV text + suggested filename for the "Your own" / import flow of `gameType`. Returns
 * null when the game has no host-uploadable CSV (or its shape is so trivial the sample would
 * duplicate the placeholder).
 */
export function sampleCsvForGameType(gameType: GameType): { filename: string; content: string } | null {
  if (isTriviaGame(gameType)) return { filename: 'trivia-questions-sample.csv', content: TRIVIA_SAMPLE }
  if (isBinaryChoiceGame(gameType)) {
    if (isThisOrThat(gameType)) return { filename: 'this-or-that-questions-sample.csv', content: TOT_SAMPLE }
    return { filename: 'wyr-questions-sample.csv', content: WYR_SAMPLE }
  }
  if (isMostLikelyTo(gameType)) return { filename: 'mlt-questions-sample.csv', content: MLT_SAMPLE }
  if (isNeverHaveIEver(gameType)) return { filename: 'nhie-questions-sample.csv', content: NHIE_SAMPLE }
  if (isPickANumber(gameType)) return { filename: 'pick-a-number-questions-sample.csv', content: PAN_SAMPLE }
  if (isCodewordsGame(gameType)) return { filename: 'codewords-words-sample.csv', content: CODEWORDS_SAMPLE }
  if (isDescribeItGame(gameType)) return { filename: 'text-charades-words-sample.csv', content: DESCRIBE_IT_SAMPLE }
  if (isQuickDrawGame(gameType)) return { filename: 'quick-draw-words-sample.csv', content: DESCRIBE_IT_SAMPLE }
  if (isCrosswordGame(gameType)) return { filename: 'crossword-answers-sample.csv', content: CROSSWORD_SAMPLE }
  if (isWordSearchGame(gameType)) return { filename: 'word-search-words-sample.csv', content: WORD_SEARCH_SAMPLE }
  if (isWordScrambleGame(gameType)) return { filename: 'word-scramble-words-sample.csv', content: WORD_SCRAMBLE_SAMPLE }
  if (isWhoSaidThis(gameType)) return { filename: 'wst-deck-sample.csv', content: WST_SAMPLE }
  if (gameType === 'wordle_room') return { filename: 'wordle-sample.csv', content: WORDLE_ROOM_SAMPLE_CSV }
  return null
}
