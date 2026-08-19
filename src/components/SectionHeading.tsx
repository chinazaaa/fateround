import Link from 'next/link'

type Action = {
  href: string
  label: string
}

type Props = {
  title: string
  subtitle?: string
  /** Trailing link, rendered as a primary button. */
  action?: Action
}

/** Section title (with optional caption) plus a trailing action button. */
export function SectionHeading({ title, subtitle, action }: Props) {
  return (
    <div className="fr-section-head">
      <div className="fr-section-head__text">
        <h2 className="fr-section-head__title">{title}</h2>
        {subtitle && <p className="fr-section-head__sub">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href} className="fr-btn fr-btn--primary fr-btn--sm fr-section-head__action">
          {action.label}
        </Link>
      )}
    </div>
  )
}
