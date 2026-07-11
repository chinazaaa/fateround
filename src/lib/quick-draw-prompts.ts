/** Weird scene prompts for Quick Draw Lie mode (Drawful-style). */

import { pickLeastUsed } from '@/lib/question-picker'

export interface QuickDrawPrompt {
  prompt: string
}

export function quickDrawPromptKey(prompt: string): string {
  return prompt.trim().toLowerCase()
}

export const QUICK_DRAW_PROMPTS: QuickDrawPrompt[] = [
  { prompt: 'Two bees making out' },
  { prompt: 'A sad potato at a party' },
  { prompt: 'A cat wearing a tuxedo' },
  { prompt: 'A dinosaur on a skateboard' },
  { prompt: 'A haunted toaster' },
  { prompt: 'A fish driving a car' },
  { prompt: 'A wizard doing taxes' },
  { prompt: 'A penguin in a hot tub' },
  { prompt: 'A taco having an existential crisis' },
  { prompt: 'A robot learning to love' },
  { prompt: 'A giraffe stuck in an elevator' },
  { prompt: 'A pirate at a dentist appointment' },
  { prompt: 'A UFO abducting a lawn gnome' },
  { prompt: 'A cactus hugging a balloon' },
  { prompt: 'A chicken crossing a finish line' },
  { prompt: 'A ghost trying to use a vending machine' },
  { prompt: 'A sloth winning a race' },
  { prompt: 'A sandwich judging a talent show' },
  { prompt: 'A llama in a spacesuit' },
  { prompt: 'A bear stealing picnic baskets' },
  { prompt: 'A snail with a rocket pack' },
  { prompt: 'A frog playing the violin' },
  { prompt: 'A muffin with sunglasses' },
  { prompt: 'A dragon doing yoga' },
  { prompt: 'A sock puppet giving a speech' },
  { prompt: 'A moose in a bathtub' },
  { prompt: 'A banana slipping on a human' },
  { prompt: 'A squirrel with a jetpack' },
  { prompt: 'A vampire at a blood drive' },
  { prompt: 'A whale in a swimming pool' },
  { prompt: 'A knight fighting a sandwich' },
  { prompt: 'A flamingo on roller skates' },
  { prompt: 'A cloud raining meatballs' },
  { prompt: 'A dog walking a human' },
  { prompt: 'A unicorn stuck in traffic' },
  { prompt: 'A lobster playing chess' },
  { prompt: 'A tree hugging a lumberjack' },
  { prompt: 'A pizza delivering itself' },
  { prompt: 'A koala DJing at a club' },
  { prompt: 'A snowman in the desert' },
]

export function pickQuickDrawPrompts(count: number, usageCounts: Map<string, number> = new Map()): QuickDrawPrompt[] {
  return pickLeastUsed(QUICK_DRAW_PROMPTS, (p) => quickDrawPromptKey(p.prompt), usageCounts, count)
}

export function pickCustomQuickDrawPrompts(
  pool: string[],
  count: number,
  usageCounts: Map<string, number> = new Map()
): QuickDrawPrompt[] {
  const candidates = pool.map((prompt) => ({ prompt: prompt.trim() })).filter((p) => p.prompt)
  return pickLeastUsed(candidates, (p) => quickDrawPromptKey(p.prompt), usageCounts, count)
}

export function quickDrawUsageFromPrompts(prompts: QuickDrawPrompt[]): Record<string, number> {
  const usage: Record<string, number> = {}
  for (const p of prompts) {
    const key = quickDrawPromptKey(p.prompt)
    usage[key] = (usage[key] ?? 0) + 1
  }
  return usage
}

/** Pick a fresh drawing prompt, preferring words not yet used this match. */
export function pickQuickDrawWord(primary: readonly string[], usedWords: readonly string[]): string {
  const used = new Set(usedWords.map((w) => w.toLowerCase()))
  const avail = primary.filter((w) => !used.has(w.toLowerCase()))
  if (avail.length > 0) return avail[Math.floor(Math.random() * avail.length)] ?? primary[0] ?? 'mystery'
  if (primary.length > 0) return primary[Math.floor(Math.random() * primary.length)] ?? primary[0]!
  return 'mystery'
}
