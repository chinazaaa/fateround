import type { Metadata } from 'next'
import { HomePage } from '@/components/HomePage'
import { MarketingHeader } from '@/components/MarketingHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { homeMetadata, organizationJsonLd, webApplicationJsonLd, websiteJsonLd } from '@/lib/seo'

export const metadata: Metadata = homeMetadata()

function HomeSeoContent() {
  return (
    <section className="mk-seo">
      <div className="mk-wrap space-y-0">
        <div className="blk">
          <h2>What is FateRound?</h2>
          <p>
            FateRound is a web platform with 47+ free games for your squad. You can host quick party votes, play classic
            board games like Monopoly and Whot, or tackle daily word puzzles together in your browser.
          </p>
        </div>

        <div className="blk">
          <h2>Who is it for?</h2>
          <p>
            It is built for friend groups, Discord servers, game nights, and group chats. Whether you are playing
            Monopoly with friends across the world or running a fast Smash Marry Kill round over a call, everyone joins
            from their phone or laptop.
          </p>
        </div>

        <div className="blk">
          <h2>How does it work?</h2>
          <p>
            Pick any game mode, create a room, and share the 6-digit code or link. Players type in a nickname, join the
            room, and play live. You can also set up permanent Game Rooms to track stats and scores over time.
          </p>
        </div>
      </div>
    </section>
  )
}

export const dynamic = 'force-static'

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: websiteJsonLd() }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webApplicationJsonLd() }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd() }} />
      <div className="fr-site fr-site--textured flex min-h-dvh flex-col">
        <MarketingHeader />
        <main className="flex-1">
          <HomePage />
          <HomeSeoContent />
        </main>
        <SiteFooter />
      </div>
    </>
  )
}
