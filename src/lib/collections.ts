// Shared helpers for content collections (themed groupings of Library datasets).

export const COLLECTION_MAX_NAME = 80
export const COLLECTION_MAX_SLUG = 60
export const COLLECTION_MAX_DESCRIPTION = 500
export const COLLECTION_MAX_AUDIENCE = 60
export const COLLECTION_MAX_ICON = 16

/** Lowercase, hyphenated, url-safe slug. Returns '' when nothing usable remains. */
export function normalizeSlug(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, COLLECTION_MAX_SLUG)
}

export interface CollectionFields {
  name: string
  description: string | null
  audience: string | null
  icon: string | null
  is_active?: boolean
  sort_order?: number
}

/**
 * Validate + normalize collection create/update input. On PATCH, name may be absent
 * (requireName: false) so only supplied fields are validated. Returns {error} on failure.
 */
export function validateCollectionInput(
  body: unknown,
  opts: { requireName: boolean }
): CollectionFields | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>

  let name = ''
  if (b.name !== undefined || opts.requireName) {
    if (typeof b.name !== 'string' || !b.name.trim()) return { error: 'Name required' }
    if (b.name.trim().length > COLLECTION_MAX_NAME) return { error: 'Name too long' }
    name = b.name.trim()
  }

  const optionalText = (key: string, max: number): string | null | { error: string } => {
    if (b[key] === undefined || b[key] === null) return null
    if (typeof b[key] !== 'string') return { error: `Invalid ${key}` }
    const v = (b[key] as string).trim()
    if (v.length > max) return { error: `${key} too long` }
    return v || null
  }

  const description = optionalText('description', COLLECTION_MAX_DESCRIPTION)
  if (description && typeof description === 'object') return description
  const audience = optionalText('audience', COLLECTION_MAX_AUDIENCE)
  if (audience && typeof audience === 'object') return audience
  const icon = optionalText('icon', COLLECTION_MAX_ICON)
  if (icon && typeof icon === 'object') return icon

  const fields: CollectionFields = {
    name,
    description: description as string | null,
    audience: audience as string | null,
    icon: icon as string | null,
  }

  if (b.is_active !== undefined) {
    if (typeof b.is_active !== 'boolean') return { error: 'Invalid is_active' }
    fields.is_active = b.is_active
  }
  if (b.sort_order !== undefined) {
    if (typeof b.sort_order !== 'number' || !Number.isFinite(b.sort_order)) return { error: 'Invalid sort_order' }
    fields.sort_order = Math.trunc(b.sort_order)
  }

  return fields
}
