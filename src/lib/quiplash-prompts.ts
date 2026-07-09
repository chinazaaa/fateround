/** Built-in Quiplash-style fill-in-the-blank prompts */

import { pickLeastUsed } from '@/lib/question-picker'

export interface QuiplashPrompt {
  prompt: string
}

export function quiplashPromptKey(prompt: string): string {
  return prompt.trim().toLowerCase()
}

export const QUIPLASH_PROMPTS: QuiplashPrompt[] = [
  { prompt: 'The worst excuse for being late to work is…' },
  { prompt: 'A terrible name for a new restaurant is…' },
  { prompt: 'The worst thing to say at a wedding is…' },
  { prompt: 'A rejected title for a self-help book is…' },
  { prompt: 'The least useful superpower would be…' },
  { prompt: 'A bad thing to shout in a library is…' },
  { prompt: 'The worst thing to find in your lunchbox is…' },
  { prompt: 'A terrible slogan for a toothpaste brand is…' },
  { prompt: 'The worst pickup line of all time is…' },
  { prompt: 'Something you should never say to your boss is…' },
  { prompt: 'A horrible name for a pet goldfish is…' },
  { prompt: 'The worst thing to hear from your dentist is…' },
  { prompt: 'A bad theme for a birthday party is…' },
  { prompt: 'The most awkward thing to say on a first date is…' },
  { prompt: 'A terrible name for a boy band is…' },
  { prompt: 'The worst thing to bring to a potluck is…' },
  { prompt: 'Something you never want to hear from your Uber driver is…' },
  { prompt: 'A rejected flavour of ice cream is…' },
  { prompt: 'The worst thing to write in a yearbook is…' },
  { prompt: 'A bad name for a yoga studio is…' },
  { prompt: 'The worst thing to say during a job interview is…' },
  { prompt: 'A terrible name for a coffee shop is…' },
  { prompt: 'The worst thing to hear from your doctor is…' },
  { prompt: 'A bad thing to yell during a quiet movie is…' },
  { prompt: 'The worst gift to give your in-laws is…' },
  { prompt: 'A horrible name for a roller coaster is…' },
  { prompt: 'The worst thing to say at a funeral is…' },
  { prompt: 'A rejected name for a dating app is…' },
  { prompt: 'The worst thing to find under your bed is…' },
  { prompt: 'A terrible name for a hair salon is…' },
  { prompt: 'The worst thing to say to a crying baby is…' },
  { prompt: 'A bad name for a fitness class is…' },
  { prompt: 'The worst thing to hear from your roommate is…' },
  { prompt: 'A terrible name for a horror movie is…' },
  { prompt: 'The worst thing to say after winning an argument is…' },
  { prompt: 'A bad thing to write on a greeting card is…' },
  { prompt: 'The worst thing to say to a police officer is…' },
  { prompt: 'A rejected flavour of crisps is…' },
  { prompt: 'The worst thing to name your Wi-Fi network is…' },
  { prompt: 'A terrible name for a boat is…' },
]

export function pickQuiplashPrompts(count: number, usageCounts: Map<string, number> = new Map()): QuiplashPrompt[] {
  return pickLeastUsed(QUIPLASH_PROMPTS, (p) => quiplashPromptKey(p.prompt), usageCounts, count)
}

export function pickCustomQuiplashPrompts(
  pool: string[],
  count: number,
  usageCounts: Map<string, number> = new Map()
): QuiplashPrompt[] {
  const candidates = pool.map((prompt) => ({ prompt: prompt.trim() })).filter((p) => p.prompt)
  return pickLeastUsed(candidates, (p) => quiplashPromptKey(p.prompt), usageCounts, count)
}

export function quiplashUsageFromPrompts(prompts: QuiplashPrompt[]): Record<string, number> {
  const usage: Record<string, number> = {}
  for (const p of prompts) {
    const key = quiplashPromptKey(p.prompt)
    usage[key] = (usage[key] ?? 0) + 1
  }
  return usage
}
