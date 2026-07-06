import { SiteChrome } from '@/components/SiteChrome'
import {
  UPDATE_CATEGORY_META,
  updatesByCategory,
  formatUpdateMonthYear,
  type ProductUpdate,
  type UpdateCategory,
} from '@/lib/product-updates'

const CATEGORY_ORDER: UpdateCategory[] = ['new', 'changed', 'upcoming']

function UpdateCard({
  title,
  description,
  month,
  year,
}: {
  title: string
  description: string
  month: number | null
  year: number | null
}) {
  const dateLabel = formatUpdateMonthYear(month, year)

  return (
    <article className="glass-card p-4 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-sm leading-snug">{title}</h3>
        {dateLabel ? <time className="text-faint text-xs shrink-0">{dateLabel}</time> : null}
      </div>
      <p className="text-muted text-sm leading-relaxed">{description}</p>
    </article>
  )
}

export function UpdatesPage({ updates }: { updates: ProductUpdate[] }) {
  return (
    <SiteChrome>
      <div className="px-4 pt-10 pb-16">
        <div className="relative mx-auto max-w-lg space-y-10">
          <div
            className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[120%] h-64 opacity-30"
            style={{
              background: 'radial-gradient(ellipse 60% 80% at 50% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
            }}
            aria-hidden
          />

          <div className="relative text-center space-y-3">
            <span
              className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-2xl"
              style={{ background: 'var(--chip-active-bg)' }}
            >
              📋
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight gradient-title">What&apos;s new</h1>
            <p className="text-muted text-sm leading-relaxed max-w-sm mx-auto">
              New features, recent changes, and what&apos;s coming next on Fate Round.
            </p>
          </div>

          <div className="relative space-y-8">
            {updates.length === 0 ? (
              <p className="text-center text-muted text-sm">Nothing to show yet. Check back soon.</p>
            ) : (
              CATEGORY_ORDER.map((category) => {
                const meta = UPDATE_CATEGORY_META[category]
                const items = updatesByCategory(updates, category)
                if (items.length === 0) return null

                return (
                  <section key={category} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg" aria-hidden>
                        {meta.emoji}
                      </span>
                      <div>
                        <h2 className="font-bold text-sm">{meta.label}</h2>
                        <p className="text-faint text-xs">{meta.description}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <UpdateCard
                          key={item.id}
                          title={item.title}
                          description={item.description}
                          month={item.month}
                          year={item.year}
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
