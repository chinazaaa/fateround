/**
 * The one rule for what may be written into `question_packs.questions`.
 *
 * Two endpoints write that column and they used to disagree. `POST /api/library` — the public,
 * *unauthenticated* submit path — checked only `Array.isArray(questions)`: no length cap and no
 * element validation, then inserted the array verbatim as JSONB with
 * `question_count: questions.length`. `PATCH /api/admin/library/[id]` required a non-empty array
 * and capped it at 500, but also never looked at elements. So an anonymous caller could store an
 * arbitrarily large array, and either path could store elements of any shape at all.
 *
 * Elements matter because play-time consumers *skip* what they cannot use rather than rejecting
 * it — `parseStoredCodewordsWords` (src/lib/codewords-pool.ts) and `parseStoredDescribeItWords`
 * (src/lib/describe-it-words.ts) `continue` on a non-string, and `parseStoredMltQuestions`
 * (src/lib/custom-questions.ts) keeps only strings and objects with a non-empty `question`. A
 * stored number, boolean, null, nested array or blank string is therefore invisible at play time
 * while still counting toward `question_count`: a pack can pass admin review advertising N
 * questions and play with far fewer, or none.
 *
 * This lives in src/lib rather than beside either handler for the reason spelled out in
 * src/lib/question-pack-game-types.ts: a Next.js route file may only export route fields, so
 * `export const` in a route.ts fails the build and a test cannot import the rule to pin it. It
 * sits with the other pack-concept modules (question-pack-game-types.ts,
 * question-pack-preview.ts) so the two writers and the reviewer UI read from one place.
 *
 * ## How strict this is, and why
 *
 * A read-only census of the live corpus (48 packs) found: lengths 10-50, nothing over 500, zero
 * packs with an element whose `jsonb_typeof` is outside ('string','object'), and zero packs with
 * an empty string. The rule below — non-empty array, at most 500 elements, every element a
 * non-blank string or a plain object — therefore rejects **zero** existing packs, and no
 * currently-valid submission changes outcome.
 *
 * It deliberately stops there. Two stricter rules were considered and declined:
 *
 *  - **Per-game-type shape validation.** src/lib/question-pack-preview.ts already encodes which
 *    fields each type uses and could drive it, but the corpus gives no evidence that today's
 *    stored objects all satisfy a per-type shape, and a submitter's legitimate future shape
 *    would start 400ing. A rule outside the measured safety budget needs its own census first.
 *  - **Requiring an object to carry a usable string field** (so `{}` is rejected). `{}` is
 *    genuinely unusable by every consumer, but the census only established element *types*, not
 *    that every stored object has a non-empty field — rejecting it could turn an existing pack's
 *    admin edit into a 400. Left as a follow-up gated on its own query.
 *
 * Arrays are excluded from "object" on purpose even though `typeof [] === 'object'`: an array
 * reaches `parseStoredMltQuestions`' object branch, where `item.question` is `undefined` and the
 * item is dropped — unusable, exactly like a number.
 */

/** Matches the cap `PATCH /api/admin/library/[id]` has always applied, and its message. */
export const MAX_PACK_QUESTIONS = 500

/** A single element that at least one consumer could read. See the strictness note above. */
function isUsableQuestion(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `{ ok: true, questions }` when `value` may be written to `question_packs.questions`,
 * otherwise `{ ok: false, error }` carrying the 400 message to answer with. The messages are the ones the
 * admin route already used, so nothing an admin sees changes wording.
 *
 * It hands the narrowed array back rather than only a verdict so a caller writes
 * `question_count` off the exact array it stores — the count and the stored value cannot drift
 * apart, and neither route needs a cast to get `.length` off a `z.unknown()` field.
 *
 * Callers that need a *different* message for a non-array — `POST /api/library` folds that case
 * into its shared `Missing required fields` gate — must run their own `Array.isArray` check
 * first; this function then only ever sees an array from them.
 */
export function validatePackQuestions(
  value: unknown
): { ok: false; error: string } | { ok: true; questions: unknown[] } {
  if (!Array.isArray(value) || value.length === 0) return { ok: false, error: 'questions must be a non-empty array' }
  if (value.length > MAX_PACK_QUESTIONS) return { ok: false, error: `Too many questions (max ${MAX_PACK_QUESTIONS})` }
  if (!value.every(isUsableQuestion))
    return { ok: false, error: 'questions must contain only non-empty strings or objects' }
  return { ok: true, questions: value }
}
