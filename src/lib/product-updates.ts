import { RocketIcon, SparklesIcon, Wrench01Icon } from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'

export type UpdateCategory = 'new' | 'changed' | 'upcoming'

export interface ProductUpdate {
  id: string
  type: UpdateCategory
  title: string
  description: string
  month: number | null
  year: number | null
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * Icons, not emoji: the rest of the marketing surface draws from Hugeicons so
 * the glyphs inherit `currentColor` and render identically on every platform,
 * rather than picking up whichever emoji font the OS happens to ship.
 */
export const UPDATE_CATEGORY_META: Record<
  UpdateCategory,
  { label: string; icon: IconSvgElement; description: string }
> = {
  new: {
    label: 'New',
    icon: SparklesIcon,
    description: 'Fresh features and game modes',
  },
  changed: {
    label: 'Changed',
    icon: Wrench01Icon,
    description: 'Improvements and fixes',
  },
  upcoming: {
    label: 'Upcoming',
    icon: RocketIcon,
    description: 'What we are working on next',
  },
}

export const UPDATE_CATEGORY_OPTIONS: UpdateCategory[] = ['new', 'changed', 'upcoming']

export const MONTH_OPTIONS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
] as const

export function updatesByCategory(updates: ProductUpdate[], category: UpdateCategory): ProductUpdate[] {
  return updates.filter((u) => u.type === category)
}

export function formatUpdateMonthYear(month: number | null, year: number | null): string | null {
  if (!month || !year) return null
  return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function sortProductUpdates(updates: ProductUpdate[]): ProductUpdate[] {
  return [...updates].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    const yearA = a.year ?? -1
    const yearB = b.year ?? -1
    if (yearA !== yearB) return yearB - yearA
    const monthA = a.month ?? -1
    const monthB = b.month ?? -1
    if (monthA !== monthB) return monthB - monthA
    if (a.sort_order !== b.sort_order) return b.sort_order - a.sort_order
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}
