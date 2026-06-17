import type { Metadata } from 'next'
import { HomePage } from '@/components/HomePage'
import { homeMetadata, organizationJsonLd, webApplicationJsonLd, websiteJsonLd } from '@/lib/seo'

export const metadata: Metadata = homeMetadata()

function HomeSeoContent() {
  return (
    <section className="relative z-10 px-4 pb-16 pt-6 border-t border-theme">
      <div className="mx-auto max-w-2xl space-y-8 text-muted text-sm sm:text-base leading-relaxed">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-body">What is Fate Round?</h2>
          <p>
            Fate Round is a free online party game platform where friend groups vote, laugh, and reveal together —
            no sign-up, no download, and no app store required. Create a room in seconds, share a short code or link,
            and everyone joins from their phone or laptop in real time.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-body">Who is it for?</h2>
          <p>
            Fate Round is built for friend groups, Discord calls, birthday parties, icebreakers, and late-night group
            chats. Whether you want Smash Marry Kill chaos, anonymous Would You Rather votes, or a live bingo night,
            every mode runs in the browser so nobody needs to install anything.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-body">How does it work?</h2>
          <p>
            Pick a game mode, create a room, and share the code with your group. Players join with a display name,
            vote or play each round, and the host reveals results live. Games like Smash Marry Kill, Red Flag Green
            Flag, Most Likely To, and Would You Rather are free forever — browse all modes or jump straight into a
            room from the homepage.
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
    </>
  )
}
