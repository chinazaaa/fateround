/**
 * The shared rule for what a *request* may write into `question_packs.questions`.
 *
 * Two request-driven endpoints write that column and they used to disagree. `POST /api/library`
 * — the public, *unauthenticated* submit path — checked only `Array.isArray(questions)`: no
 * length cap and no element validation, then inserted the array verbatim as JSONB with
 * `question_count: questions.length`. `PATCH /api/admin/library/[id]` required a non-empty array
 * and capped it at 500, but also never looked at elements. So an anonymous caller could store an
 * array of unbounded *length*, and either path could store elements of any shape at all.
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
 * question-pack-preview.ts). Its unit pins are in question-pack-questions.test.ts; the two
 * callers' full request matrices are pinned at the handlers.
 *
 * ## What this rule does NOT cover
 *
 * Three things, named here so the "shared rule" claim is not read wider than it is:
 *
 *  - **A third writer.** `src/app/api/admin/collections/import-builtins/route.ts` also inserts
 *    `questions` / `question_count`, from the in-repo `collections-seed.ts` constants rather
 *    than from request input. It is admin-only compile-time data, so it is deliberately not
 *    routed through here — but a future seed entry would escape this rule silently.
 *  - **The admin reviewer UI.** `src/app/admin/library/page.tsx` hand-rolls its own weaker
 *    client-side check on the JSON textarea (array + non-empty, no cap, no element check), so a
 *    paste of `["a", 5]` passes the client and is refused by the server. Converging it is a
 *    follow-up; this module is the server-side authority either way.
 *  - **Byte size.** The cap below counts *elements*, not bytes, and nothing in the stack caps
 *    request body size (`src/lib/parse-body.ts` does not, nor next.config.ts). One 50 MB string
 *    is still one element and still passes. Closing that needs a body-size limit, which is a
 *    separate change with a separate blast radius.
 *
 * ## How strict this is, and why
 *
 * A read-only census of the live corpus (48 packs) found: lengths 10-50, nothing over 500, zero
 * packs with an element whose `jsonb_typeof` is outside ('string','object'), and zero packs with
 * an empty string. The rule below — non-empty array, at most 500 elements, every element a
 * non-blank string or a plain object — is inside that budget and rejects zero existing packs.
 *
 * One precondition of that sits *just* outside what was measured: the census counted empty
 * strings, and this rule also rejects whitespace-only ones (`'   '`). Every consumer trims, so a
 * whitespace-only element is unusable and belongs on the reject side — but if a legacy pack
 * holds one, its admin edits would start 400ing, because the reviewer form resends `questions`
 * on every save (including a title- or price-only save). No in-repo client can produce one
 * (`src/lib/csv-parse.ts:12` trims every cell before `validatePrompts` sees it), so this is
 * about legacy rows only, and it is recoverable via the JSON textarea rather than bricking.
 *
 * It deliberately stops there. Two stricter rules were considered and declined:
 *
 *  - **Per-game-type shape validation.** src/lib/question-pack-preview.ts already encodes which
 *    fields each type uses and could drive it, but the corpus gives no evidence that today's
 *    stored objects all satisfy a per-type shape, and a submitter's legitimate future shape
 *    would start 400ing. A rule outside the measured safety budget needs its own census first.
 *  - **Requiring an object to carry a usable string field** (so `{}` is rejected). `{}` is
 *    genuinely unusable by every consumer, and on `POST /api/library` — where every submission
 *    is new and no stored pack is at risk — there is no argument for allowing it. The reason it
 *    is allowed anyway is the *other* caller: the census established element types only, not
 *    that every stored object carries a non-empty field, so rejecting `{}` could turn an
 *    existing pack's admin edit into a 400. Keeping one rule for both writers is worth more than
 *    tightening one of them, so POST inherits the concession.
 *
 *    The cost is explicit: `POST /api/library` with 50 `{}` elements still stores a pack
 *    advertising `question_count: 50` that plays zero, and so does a `codewords` pack of 50
 *    objects (that consumer takes strings only). This rule shrinks the overstatement, it does
 *    not eliminate it. Closing it properly is the per-type work above, gated on its own query.
 *
 * Arrays are excluded from "object" on purpose even though `typeof [] === 'object'`: an array
 * reaches `parseStoredMltQuestions`' object branch, where `item.question` is `undefined` and the
 * item is dropped — unusable, exactly like a number.
 */

/** Matches the cap `PATCH /api/admin/library/[id]` has always applied, and its message. */
export const MAX_PACK_QUESTIONS = 500

/**
 * A single element that at least one consumer could read. See the strictness note above.
 *
 * Exotica this accepts because it cannot distinguish them from a plain object, all unreachable
 * from `JSON.parse` and so from both callers: `new String('  ')` (`typeof` is 'object') and
 * `Object.create(null)`. Noted rather than guarded so the function stays cheap on the public
 * path.
 */
function isUsableQuestion(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `{ ok: true, questions }` when `value` may be written to `question_packs.questions`, otherwise
 * `{ ok: false, error }` carrying the 400 message to answer with. The messages are the ones the
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
  // `for...of` rather than `.every()`: `.every` skips array holes, so a sparse `[, 'a']` would
  // pass and then serialize into JSONB as `[null, "a"]` with `question_count: 2` — precisely the
  // shape this rule exists to forbid. `JSON.parse` never produces holes, so neither caller can
  // reach it today, but this is an exported rule and the iteration is the same cost either way.
  for (const item of value) {
    if (!isUsableQuestion(item)) return { ok: false, error: 'questions must contain only non-empty strings or objects' }
  }
  return { ok: true, questions: value }
}
