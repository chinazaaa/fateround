import { z } from 'zod'
import { sanitizedString, stripHtml, gameTypeEnum } from './shared'

// ---------------------------------------------------------------------------
// App feedback (POST /api/feedback)
// ---------------------------------------------------------------------------

// Derived from the canonical game-type list (+ 'general') so it can't drift as new
// games are added — previously this was a hand-copied list that had gone stale.
const feedbackGameTypeEnum = z.enum(['general', ...gameTypeEnum.options])

const feedbackCategoryEnum = z.enum(['bug', 'feature', 'improvement', 'other'])

export const createAppFeedbackSchema = z.object({
  gameType: feedbackGameTypeEnum,
  category: feedbackCategoryEnum,
  message: sanitizedString(10, 2000),
  pageUrl: z
    .string()
    .max(500)
    .optional()
    .nullable()
    .transform((s) => (s ? stripHtml(s.trim()) : null)),
})

export type CreateAppFeedbackInput = z.infer<typeof createAppFeedbackSchema>

// ---------------------------------------------------------------------------
// Product updates (admin)
// ---------------------------------------------------------------------------

const productUpdateTypeEnum = z.enum(['new', 'changed', 'upcoming'])

const optionalMonth = z
  .union([z.number().int().min(1).max(12), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value == null ? null : value))

const optionalYear = z
  .union([z.number().int().min(2000).max(2100), z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === '' || value == null ? null : value))

export const createProductUpdateSchema = z.object({
  type: productUpdateTypeEnum,
  title: sanitizedString(1, 120),
  description: sanitizedString(1, 2000),
  month: optionalMonth,
  year: optionalYear,
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export const updateProductUpdateSchema = createProductUpdateSchema.partial()

export type CreateProductUpdateInput = z.infer<typeof createProductUpdateSchema>
export type UpdateProductUpdateInput = z.infer<typeof updateProductUpdateSchema>
