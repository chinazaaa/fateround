import { z } from 'zod'
import { sanitizedString, markdownBody, optionalUrlOrPath } from './shared'

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Slug is required')
  .max(80, 'Slug must be at most 80 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers and single hyphens')

const statusSchema = z.enum(['draft', 'published'])

// Up to 8 short tags, each already HTML-stripped. Empty entries are dropped.
const tagsSchema = z
  .array(sanitizedString(1, 30))
  .max(8, 'At most 8 tags')
  .optional()
  .transform((tags) => tags ?? [])

export const createBlogPostSchema = z.object({
  slug: slugSchema,
  title: sanitizedString(1, 140),
  excerpt: sanitizedString(1, 300),
  body: markdownBody(1, 50000),
  coverImageUrl: optionalUrlOrPath(),
  author: sanitizedString(1, 80).optional(),
  tags: tagsSchema,
  status: statusSchema.optional(),
  pinned: z.boolean().optional(),
  // ISO string; omitted means "use now when publishing". Validated as a date.
  publishedAt: z.string().datetime({ offset: true }).nullish(),
})

export const updateBlogPostSchema = createBlogPostSchema.partial()

export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>
