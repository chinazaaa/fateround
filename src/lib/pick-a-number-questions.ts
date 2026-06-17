/** Built-in Pick a Number question pool — numbered 1…N in game order. */

import { pickLeastUsed } from '@/lib/question-picker'

export const PAN_QUESTIONS: string[] = [
  "What's the most embarrassing thing that's ever happened to you?",
  "What's a secret you've never told anyone in this room?",
  "Who was your first crush?",
  "What's the worst date you've ever been on?",
  "What's something you're glad your parents don't know about?",
  "What's the pettiest reason you've ever stopped talking to someone?",
  "What's the biggest lie you've ever told?",
  "Who in this room would you trust with a secret?",
  "What's your most controversial food opinion?",
  "What's the dumbest thing you've done for love?",
  "What's a habit you have that would surprise people?",
  "What's the most trouble you've ever gotten into?",
  "If you had to swap lives with someone here for a day, who would it be?",
  "What's something you pretend to like but secretly hate?",
  "What's the most money you've ever wasted on something stupid?",
  "What's your go-to karaoke song?",
  "What's the weirdest dream you remember having?",
  "What's a trend you never understood?",
  "What's the most awkward text you've ever sent?",
  "What's something you did as a kid that still haunts you?",
  "Who was your celebrity crush growing up?",
  "What's the longest you've gone without showering?",
  "What's the most impulsive decision you've ever made?",
  "What's a skill you wish you had?",
  "What's the nicest thing a stranger has ever done for you?",
  "What's your biggest irrational fear?",
  "What's the worst advice you've ever given someone?",
  "What's something you bought and immediately regretted?",
  "What's the most childish thing you still do?",
  "What's a song that always makes you cry?",
  "What's the most embarrassing thing in your search history?",
  "What's your most unpopular opinion?",
  "What's the worst haircut you've ever had?",
  "What's something you would do if you knew you wouldn't get caught?",
  "What's the most awkward family gathering you've been to?",
  "What's a friendship you miss?",
  "What's the weirdest compliment you've ever received?",
  "What's something you're weirdly competitive about?",
  "What's the most dramatic thing you've done over something small?",
  "What's a guilty pleasure you're not ashamed of?",
  "What's the worst gift you've ever received?",
  "What's something you believed way too long as a kid?",
  "What's the most spontaneous trip you've ever taken?",
  "What's a rule you break regularly?",
  "What's the funniest misunderstanding you've ever been part of?",
  "What's something you would never do again?",
  "What's your worst habit?",
  "What's the most awkward thing you've said to a crush?",
  "What's a movie everyone loves that you think is overrated?",
  "What's the bravest thing you've ever done?",
]

export const PAN_QUESTION_COUNT = PAN_QUESTIONS.length
export const PAN_MIN_POOL = 5
export const PAN_DEFAULT_POOL_SIZE = 20

export function pickPanQuestions(count: number, usageCounts: Map<string, number> = new Map()): string[] {
  return pickLeastUsed(PAN_QUESTIONS, (question) => question, usageCounts, count)
}
