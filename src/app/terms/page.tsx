import type { Metadata } from 'next'
import Link from 'next/link'
import { ContentPage, Section, MailLink } from '@/components/content/ContentPage'
import { SITE_NAME } from '@/lib/seo'
import { LEGAL_EMAIL, SUPPORT_EMAIL, TERMS_EMAIL } from '@/lib/contact'

const LAST_UPDATED = 'August 23, 2026'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: `The rules for using ${SITE_NAME} — who can play, what content is allowed, and the limits of the service.`,
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <ContentPage
      eyebrow="Legal"
      title="Terms of Service"
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          These terms cover your use of {SITE_NAME}
          {' — '}
          the website, our apps, and the games you host or join through them (together, the &ldquo;Service&rdquo;). By
          using the Service you agree to them. If you do not agree, please do not use {SITE_NAME}.
        </p>
      }
    >
      <Section title="Who can use FateRound">
        <p>
          You must be at least 13 years old to use the Service. Some games are intended for adults only and are labelled{' '}
          <strong>18+</strong> in the games directory and on their game pages — you must be 18 or older to play those.
          Where you are under the age of majority in your country, you may only use the Service with the involvement of
          a parent, guardian, or teacher.
        </p>
        <p>
          {SITE_NAME} is used in classrooms and school competitions. If you are running games for students, you are
          responsible for choosing age-appropriate games and for any custom questions you add. The 18+ games are not
          suitable for school use.
        </p>
      </Section>

      <Section title="Accounts, profiles, and rooms">
        <p>
          Most of the Service works without an account: you join a game with a display name and a room code. You are
          responsible for what happens in rooms you host, including who you share the room code with. Room codes are
          effectively passwords — anyone who has one can join.
        </p>
        <p>
          When you finish your first game, {SITE_NAME} creates a profile for you. Your profile has a unique username and
          tracks your trophies, game statistics, and play streaks. Your profile page is publicly visible — anyone with
          the link can see your username, trophies, and stats. You can change your username at any time. You may
          optionally add an email address to secure your profile across devices.
        </p>
        <p>
          If you create an account, you are responsible for keeping access to it secure and for activity that takes
          place under it. You may not impersonate another person through your username or profile.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>harass, bully, threaten, defame, or sexualise any person, including other players;</li>
          <li>upload or submit content that is illegal, hateful, or sexually explicit involving minors;</li>
          <li>impersonate another person, or misrepresent your affiliation with anyone;</li>
          <li>share content you do not have the rights to share;</li>
          <li>
            disrupt the Service — including scraping, automated play, attempting to overload our infrastructure, or
            circumventing rate limits and room controls;
          </li>
          <li>reverse engineer or attempt to gain unauthorised access to any part of the Service.</li>
        </ul>
        <p>
          Some of our games involve rating or making judgements about other players. Consent matters: only play those
          games with people who have agreed to take part, and stop if anyone asks to.
        </p>
      </Section>

      <Section title="Content you create">
        <p>
          You keep ownership of the questions, answers, drawings, names, and other content you submit. By submitting
          content you grant {SITE_NAME} a non-exclusive, worldwide, royalty-free licence to host, display, and transmit
          it for the purpose of operating the Service — for example, showing your answer to the other players in your
          room.
        </p>
        <p>
          If you submit content to our shared question{' '}
          <Link href="/library" className="font-semibold text-[var(--primary)] underline">
            Library
          </Link>
          , you additionally allow other hosts to use it in their games. We may edit, tag, reject, or remove Library
          submissions at our discretion.
        </p>
      </Section>

      <Section title="Coins">
        <p>
          {SITE_NAME} has an in-app virtual currency called &ldquo;Coins.&rdquo; You may earn Coins by playing games and
          may spend them on in-app cosmetics, editions, themes, question packs, and other digital items we make
          available from time to time. Coins have <strong>no cash value</strong> and cannot be exchanged for money,
          cryptocurrency, or any other currency, in-app or outside the app.
        </p>
        <p>
          Coins are a limited, personal, non-transferable, revocable licence to use them within {SITE_NAME}. You have no
          ownership rights in Coins or in the amount reflected in your balance. We may adjust, add, remove, expire, or
          reset Coins in our sole discretion where required to correct errors, prevent or respond to abuse, comply with
          law, or shut down the service.
        </p>
        <p>
          You may not sell, trade, gift, or otherwise transfer Coins between accounts. The one exception is the
          automatic guest-to-account migration: Coins earned as a guest before you create your account may be granted to
          your new account subject to the migration rules and caps described in the app.
        </p>
        <p>
          Digital items you unlock with Coins are licensed to your account for as long as we operate the service. They
          are non-transferable, non-refundable in Coin form except at our discretion, and may be modified, replaced, or
          discontinued if we retire or rework the underlying feature. If we do retire an item you paid Coins for, we
          will make a reasonable effort to grant an equivalent replacement or Coin credit. Because Coins are earned
          in-app and have no cash value, we do not offer cash refunds for Coin balances or Coin purchases; if a purchase
          was made in error or through a bug, contact <MailLink address={SUPPORT_EMAIL} /> and we may — at our
          discretion — credit Coins back to your account.
        </p>
        <p>
          <strong>Fair play.</strong> You may not manipulate the Coin system, including by creating multiple accounts to
          farm rewards, colluding with other players to inflate earnings, exploiting bugs to earn or duplicate Coins, or
          purchasing, selling, or advertising Coins outside the app. We may adjust balances, remove items, or suspend
          accounts that violate this section. If your account is terminated for any reason, any unspent Coins and any
          digital items unlocked with Coins are forfeited without compensation.
        </p>
        <p>
          We may change how Coins are earned, spent, priced, or displayed, including retiring items from the shop,
          changing prices, adding new items, or discontinuing the Coin system entirely. We will provide reasonable
          notice for material changes.
        </p>
      </Section>

      <Section title="Moderation and reporting">
        <p>
          We may remove content, end a room, or block access to the Service where we believe these terms have been
          broken. We do not pre-screen the content players create in private rooms.
        </p>
        <p>
          To report content or behaviour, email <MailLink address={LEGAL_EMAIL} /> with the room code and, if you can, a
          screenshot. We aim to respond to reports within a few working days.
        </p>
      </Section>

      <Section title="Service availability">
        <p>
          The Service is provided free of charge and &ldquo;as is&rdquo;. We do not guarantee that it will be
          uninterrupted, that games will always finish, or that data such as scores, trophies, streaks, and game history
          will be retained. We may change, suspend, or discontinue any part of the Service — including trophy criteria,
          streak rules, or leaderboard calculations — at any time.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          To the fullest extent permitted by law, {SITE_NAME} is not liable for any indirect, incidental, or
          consequential losses arising from your use of the Service, or for the conduct of other players. Nothing in
          these terms limits liability that cannot be limited by law — including for death or personal injury caused by
          negligence, or for fraud.
        </p>
      </Section>

      <Section title="Trademarks">
        <p>
          Some games on {SITE_NAME} are digital versions inspired by well-known party, board, or card games — for
          example Yahtzee®, Monopoly®, Scrabble®, UNO®, Whot®, Codenames®, and Quiplash®. {SITE_NAME} is an independent
          platform and is not affiliated with, endorsed by, or sponsored by the owners of these or any other game. All
          trademarks, logos, and brand names are the property of their respective owners and are used here only to
          describe the game being played.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          We may update these terms as the Service changes. When we do, we will update the date at the top of this page.
          Continuing to use {SITE_NAME} after a change means you accept the updated terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms: <MailLink address={TERMS_EMAIL} />. General support:{' '}
          <MailLink address={SUPPORT_EMAIL} />, or see our{' '}
          <Link href="/contact" className="font-semibold text-[var(--primary)] underline">
            contact page
          </Link>
          . See also our{' '}
          <Link href="/privacy" className="font-semibold text-[var(--primary)] underline">
            Privacy Policy
          </Link>
          .
        </p>
      </Section>
    </ContentPage>
  )
}
