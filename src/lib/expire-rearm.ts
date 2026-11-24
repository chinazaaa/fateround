/**
 * Expire-endpoint re-arm schedule, shared with the Expo app (`useTurnExpiryTimer`). The definition lives in
 * `packages/shared/src/expire-rearm.ts`; imported by relative path because the web app does not wire up the
 * `@fateround/shared` alias (same pattern as `src/lib/troll-run-types.ts`).
 */
export * from '../../packages/shared/src/expire-rearm'
