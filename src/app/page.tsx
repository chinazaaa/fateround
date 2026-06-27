import type { Metadata } from 'next'
import { HomePage } from '@/components/HomePage'
import { SiteFooter } from '@/components/SiteFooter'
import { homeMetadata, organizationJsonLd, webApplicationJsonLd, websiteJsonLd } from '@/lib/seo'

export const metadata: Metadata = homeMetadata()

function HomeSeoContent() {
  return (
    <section className="relative z-10 px-4 pb-16 pt-6 border-t border-theme">
      <div className="mx-auto max-w-2xl space-y-8 text-muted text-sm sm:text-base leading-relaxed">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-body">What is Fate Round?</h2>
          <p>
            Fate Round is a free online party game platform where friend groups vote, laugh, and reveal together — no
            sign-up, no download, and no app store required. Create a game in seconds, share a short code or link, and
            everyone joins the lobby from their phone or laptop in real time.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-body">Who is it for?</h2>
          <p>
            Fate Round is built for friend groups, Discord calls, birthday parties, icebreakers, and late-night group
            chats. Whether you want a Yahtzee dice night, a Whot or Monopoly showdown, Smash Marry Kill chaos, or
            anonymous Would You Rather votes, every mode runs in the browser so nobody needs to install anything.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-body">How does it work?</h2>
          <p>
            Pick a game mode, create your game, and share the code with your group. Players join with a display name,
            vote or play each round, and the host reveals results live. Classics like Yahtzee, Whot, Monopoly, and
            Codewords sit alongside party modes like Smash Marry Kill, Most Likely To, and Would You Rather — all free
            forever. Browse all modes or jump straight into a game from the homepage.
          </p>
        </div>
      </div>
    </section>
  )
}

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: websiteJsonLd() }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: webApplicationJsonLd() }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationJsonLd() }} />
      <HomePage />
      <HomeSeoContent />
      <SiteFooter />
    </>
  )
}
