import { SiteChrome } from '@/components/SiteChrome'
import { Glyph } from '@/components/icons/Glyph'
import { UI_ICONS } from '@/lib/game-glyphs'
import {
  UPDATE_CATEGORY_META,
  updatesByCategory,
  formatUpdateMonthYear,
  type ProductUpdate,
  type UpdateCategory,
} from '@/lib/product-updates'

const CATEGORY_ORDER: UpdateCategory[] = ['new', 'changed', 'upcoming']

const CATEGORY_ACCENTS: Record<UpdateCategory, string> = {
  new: '#f43f5e',
  changed: '#0ea5e9',
  upcoming: '#8b5cf6',
}

function UpdateCard({
  title,
  description,
  month,
  year,
  accent,
}: {
  title: string
  description: string
  month: number | null
  year: number | null
  accent: string
}) {
  const dateLabel = formatUpdateMonthYear(month, year)

  return (
    <article className="fr-gamecard cursor-default" style={{ '--accent': accent } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="fr-gamecard__title text-sm">{title}</h3>
        {dateLabel ? (
          <span className="fr-gamecard__vibe font-semibold text-xs shrink-0" style={{ color: 'var(--accent)' }}>
            {dateLabel}
          </span>
        ) : null}
      </div>
      <p className="fr-gamecard__tagline text-sm leading-relaxed">{description}</p>
    </article>
  )
}

export function UpdatesPage({ updates }: { updates: ProductUpdate[] }) {
  return (
    <SiteChrome>
      <div className="fr-band fr-band--tight">
        <div className="mk-wrap">
          {/* ── Hero section ── */}
          <div className="mb-8 space-y-2 text-center">
            <span className="fr-glyph">
              <Glyph icon={UI_ICONS.whatsNew} size={26} />
            </span>
            <h1
              className="fr-display m-0 text-[2.5rem] leading-[0.975] tracking-[-0.045em] sm:text-5xl"
              style={{ color: 'var(--text)' }}
            >
              What&apos;s new
            </h1>
            <p className="mx-auto max-w-sm text-sm" style={{ color: 'var(--text-muted)' }}>
              New features, recent changes, and what&apos;s coming next on FateRound.
            </p>
          </div>

          <div className="mx-auto max-w-2xl space-y-8">
            {updates.length === 0 ? (
              <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                Nothing to show yet. Check back soon.
              </p>
            ) : (
              CATEGORY_ORDER.map((category) => {
                const meta = UPDATE_CATEGORY_META[category]
                const accent = CATEGORY_ACCENTS[category]
                const items = updatesByCategory(updates, category)
                if (items.length === 0) return null

                return (
                  <section key={category} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="fr-glyph">
                        <Glyph icon={meta.icon} size={20} />
                      </span>
                      <div>
                        <h2 className="text-lg font-bold tracking-tight" style={{ color: accent }}>
                          {meta.label}
                        </h2>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {meta.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {items.map((item) => (
                        <UpdateCard
                          key={item.id}
                          title={item.title}
                          description={item.description}
                          month={item.month}
                          year={item.year}
                          accent={accent}
                        />
                      ))}
                    </div>
                  </section>
                )
              })
            )}
          </div>
        </div>
      </div>
    </SiteChrome>
  )
}
