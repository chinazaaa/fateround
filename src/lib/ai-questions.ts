import Anthropic from '@anthropic-ai/sdk'
import type { AiGeneratedQuestions } from '@/types'

export interface GenerateAiQuestionsParams {
  gameType: 'would_you_rather' | 'most_likely_to' | 'never_have_i_ever'
  playerNames: string[]
  count: number
  theme?: string
  customPrompt?: string
  apiKey?: string
}

const SYSTEM_PROMPT = `You are a party game question generator. Generate fun, creative, and socially engaging questions for a group of friends playing a party game. Questions should be playful and entertaining — not offensive, not controversial, and safe for a mixed group. Return ONLY valid JSON, no markdown fences or extra text.`

function buildUserPrompt(params: GenerateAiQuestionsParams): string {
  const { gameType, playerNames, count, theme, customPrompt } = params
  const names = playerNames.join(', ')

  if (gameType === 'would_you_rather') {
    return [
      `Generate ${count} "Would You Rather" questions for a party game.`,
      ``,
      `Players: ${names}`,
      theme ? `Theme/setting: ${theme}` : '',
      customPrompt ? `Additional context: ${customPrompt}` : '',
      ``,
      `Rules:`,
      `- Each question has two options (optionA and optionB)`,
      `- Reference player names in at least half the questions`,
      `- Make questions fun, creative, and conversation-starting`,
      `- Avoid anything offensive, sexual, or controversial`,
      `- Vary the difficulty and absurdity levels`,
      ``,
      `Return a JSON array of objects with "optionA" and "optionB" string fields.`,
      `Example: [{"optionA": "Never eat pizza again", "optionB": "Never eat ice cream again"}]`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  if (gameType === 'most_likely_to') {
    return [
      `Generate ${count} "Most Likely To" prompts for a party game.`,
      ``,
      `Players: ${names}`,
      theme ? `Theme/setting: ${theme}` : '',
      customPrompt ? `Additional context: ${customPrompt}` : '',
      ``,
      `Rules:`,
      `- Each prompt completes "Who is most likely to..."`,
      `- Reference player names in at least half the prompts to make them personal`,
      `- Make prompts fun, creative, and conversation-starting`,
      `- Avoid anything offensive, sexual, or controversial`,
      `- Vary the seriousness and absurdity levels`,
      ``,
      `Return a JSON array of strings. Do NOT include "Who is most likely to" prefix.`,
      `Example: ["fall asleep during a movie", "become famous on social media"]`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    `Generate ${count} "Never Have I Ever" statements for a party game.`,
    ``,
    `Players: ${names}`,
    theme ? `Theme/setting: ${theme}` : '',
    customPrompt ? `Additional context: ${customPrompt}` : '',
    ``,
    `Rules:`,
    `- Each statement completes "Never have I ever..."`,
    `- Reference player names or group-specific scenarios in at least half`,
    `- Make statements fun, revealing, and conversation-starting`,
    `- Avoid anything offensive, sexual, or controversial`,
    `- Mix mundane and surprising statements`,
    ``,
    `Return a JSON array of strings. Do NOT include "Never have I ever" prefix.`,
    `Example: ["eaten an entire pizza by myself", "pretended to know a song everyone else knew"]`,
  ]
    .filter(Boolean)
    .join('\n')
}

function parseWyrResponse(raw: string): { optionA: string; optionB: string }[] {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array')
  return parsed.map((item: unknown, i: number) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).optionA !== 'string' ||
      typeof (item as Record<string, unknown>).optionB !== 'string'
    ) {
      throw new Error(`Invalid WYR question at index ${i}`)
    }
    return { optionA: (item as Record<string, string>).optionA, optionB: (item as Record<string, string>).optionB }
  })
}

function parseStringArrayResponse(raw: string): string[] {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('Expected JSON array')
  return parsed.map((item: unknown, i: number) => {
    if (typeof item !== 'string') throw new Error(`Expected string at index ${i}`)
    return item
  })
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  const bracketStart = text.indexOf('[')
  if (bracketStart !== -1) return text.slice(bracketStart)
  return text
}

export async function generateAiQuestions(params: GenerateAiQuestionsParams): Promise<AiGeneratedQuestions> {
  const apiKey = params.apiKey || process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('No Anthropic API key available')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(params) }],
  })

  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('No text response from Claude')

  const jsonStr = extractJson(textBlock.text)

  if (params.gameType === 'would_you_rather') {
    return { type: 'wyr', questions: parseWyrResponse(jsonStr) }
  }

  const type = params.gameType === 'most_likely_to' ? 'mlt' : 'nhie'
  return { type, questions: parseStringArrayResponse(jsonStr) }
}
