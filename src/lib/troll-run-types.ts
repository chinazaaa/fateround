/**
 * Troll Run — shared types, constants and physics definitions.
 *
 * The definitions themselves live in `packages/shared/src/troll-run-types.ts` so the Expo app
 * runs the same numbers; this file is the `@/lib/…` door onto them. Imported by relative path
 * because the web app does not wire up the `@fateround/shared` alias (see `src/lib/word-grouping.ts`
 * for the same pattern).
 */

export * from '../../packages/shared/src/troll-run-types'
