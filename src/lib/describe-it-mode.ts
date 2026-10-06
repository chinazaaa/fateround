/**
 * Leaf helper for Describe It's mode field. Extracted from `@/lib/describe-it` so the
 * trophies layer does not have to import the whole game module — see `@/lib/ludo-pieces`
 * for why that cycle crashed production. Keep this a LEAF: types only.
 */
import type { DescribeItMode } from '@/types'

export function clampDescribeItMode(value: unknown): DescribeItMode {
  return value === 'individual' ? 'individual' : 'team'
}
