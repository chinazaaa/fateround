// NPAT marking/review helpers ported from web src/lib/npat.ts.
// Kept local to the i_call_on directory to avoid touching shared files.
import type { NpatAnswer, NpatCategory, NpatMark, NpatMetadata } from '@fateround/shared'
import { NPAT_CATEGORIES, answerStartsWithLetter } from '@fateround/shared/npat'

export function normalizeAnswer(text: string): string {
  return (text ?? '').trim().toLowerCase()
}

export function isSingleLetterAnswer(answer: string): boolean {
  return normalizeAnswer(answer).length <= 1
}

export function isForcedInvalidAnswer(answer: string, letter: string | null, isDuplicate: boolean): boolean {
  const normalized = normalizeAnswer(answer)
  if (!normalized) return true
  if (isSingleLetterAnswer(answer)) return true
  if (letter && !answerStartsWithLetter(answer, letter)) return true
  if (isDuplicate) return true
  return false
}

export function duplicateKeysByCategory(
  answers: Pick<NpatAnswer, 'name' | 'animal' | 'place' | 'thing' | 'food'>[]
): Record<NpatCategory, Set<string>> {
  const result: Record<NpatCategory, Set<string>> = {
    name: new Set(),
    animal: new Set(),
    place: new Set(),
    thing: new Set(),
    food: new Set(),
  }
  for (const category of NPAT_CATEGORIES) {
    const counts = new Map<string, number>()
    for (const row of answers) {
      const normalized = normalizeAnswer(row[category])
      if (!normalized) continue
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }
    for (const [key, count] of counts) {
      if (count > 1) result[category].add(key)
    }
  }
  return result
}

export function defaultMarkValidityForAnswer(
  answer: Pick<NpatAnswer, 'name' | 'animal' | 'place' | 'thing' | 'food'>,
  letter: string | null,
  dupes: Record<NpatCategory, Set<string>>
): Record<NpatCategory, boolean> {
  return Object.fromEntries(
    NPAT_CATEGORIES.map((category) => {
      const text = answer[category]
      const normalized = normalizeAnswer(text)
      const isDuplicate = normalized ? dupes[category].has(normalized) : false
      return [category, !isForcedInvalidAnswer(text, letter, isDuplicate)]
    })
  ) as Record<NpatCategory, boolean>
}

export function markValidityFromRow(
  mark: Pick<NpatMark, 'valid_name' | 'valid_animal' | 'valid_place' | 'valid_thing' | 'valid_food'>,
  answer: Pick<NpatAnswer, 'name' | 'animal' | 'place' | 'thing' | 'food'>,
  letter: string | null,
  dupes: Record<NpatCategory, Set<string>>
): Record<NpatCategory, boolean> {
  const storedByCategory: Record<NpatCategory, boolean> = {
    name: mark.valid_name,
    animal: mark.valid_animal,
    place: mark.valid_place,
    thing: mark.valid_thing,
    food: mark.valid_food,
  }
  return Object.fromEntries(
    NPAT_CATEGORIES.map((category) => {
      const text = answer[category]
      const normalized = normalizeAnswer(text)
      const isDuplicate = normalized ? dupes[category].has(normalized) : false
      const stored = storedByCategory[category]
      return [category, isForcedInvalidAnswer(text, letter, isDuplicate) ? false : stored !== false]
    })
  ) as Record<NpatCategory, boolean>
}

function resolveCategoryValid(opts: {
  answer: string
  letter: string | null
  markedValid: boolean
  isDuplicate: boolean
  hostOverride?: boolean
}): boolean {
  if (isForcedInvalidAnswer(opts.answer, opts.letter, opts.isDuplicate)) return false
  if (typeof opts.hostOverride === 'boolean') return opts.hostOverride
  return opts.markedValid
}

/** Seeds the caller review board with the peer-mark suggested validity per answer. */
export function suggestedHostReviewValidity(
  answers: NpatAnswer[],
  marks: NpatMark[],
  letter: string | null
): NonNullable<NpatMetadata['host_overrides']> {
  const dupes = duplicateKeysByCategory(answers)
  const marksByTarget = new Map(marks.map((m) => [m.target_player_id, m]))
  const result: NonNullable<NpatMetadata['host_overrides']> = {}

  for (const answer of answers) {
    const mark = marksByTarget.get(answer.player_id)
    const entry: Partial<Record<NpatCategory, boolean>> = {}
    for (const category of NPAT_CATEGORIES) {
      const text = answer[category]
      const normalized = normalizeAnswer(text)
      const isDuplicate = normalized ? dupes[category].has(normalized) : false
      const markedValid = (mark?.[`valid_${category}` as keyof NpatMark] as boolean | undefined) ?? true
      entry[category] = resolveCategoryValid({
        answer: text,
        letter,
        markedValid: markedValid !== false,
        isDuplicate,
      })
    }
    result[answer.player_id] = entry
  }

  return result
}
