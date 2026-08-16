import Link from 'next/link'

/**
 * SSR internal-link footer rendered below the solo-play game canvas.
 *
 * Sits under the client component (which fills the viewport), so it doesn't
 * interfere with gameplay but is crawlable by Google — passes link equity
 * from these high-traffic play surfaces to the marketing landers and blog
 * posts that rank on long-tail queries.
 */

export type SoloSeoLink = { href: string; label: string }

// Every solo footer ends with a link back to the /play-solo hub. Kept here
// (not in each page.tsx) so a new solo game inherits it automatically.
const HUB_LINK: SoloSeoLink = { href: '/play-solo', label: 'More solo games vs bot' }

export function SoloSeoFooter({ heading, links }: { heading: string; links: SoloSeoLink[] }) {
  const allLinks = links.some((l) => l.href === HUB_LINK.href) ? links : [...links, HUB_LINK]
  return (
    <footer
      className="mx-auto max-w-2xl px-4 py-10 text-sm"
      style={{ color: 'var(--text-muted)' }}
      aria-label="More about this game"
    >
      <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
        {heading}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {allLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="font-medium underline decoration-dotted underline-offset-2 hover:opacity-80"
              style={{ color: 'var(--primary)' }}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </footer>
  )
}
