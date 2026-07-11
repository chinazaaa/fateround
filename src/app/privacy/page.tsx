import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteChrome } from '@/components/SiteChrome'
import { SITE_NAME } from '@/lib/seo'

const CONTACT_EMAIL = 'privacy@fateround.com'
const LAST_UPDATED = 'July 11, 2026'

export const metadata: Metadata = {
  title: `Privacy Policy — ${SITE_NAME}`,
  description: `How ${SITE_NAME} handles your data when you play our online multiplayer party games.`,
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPolicyPage() {
  return (
    <SiteChrome>
      <article className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">Last updated: {LAST_UPDATED}</p>

        <div className="prose-legal mt-8 space-y-6 text-[15px] leading-relaxed text-[var(--foreground)]">
          <p>
            {SITE_NAME} is a free, real-time multiplayer party-game platform: you create a room, share a link or code,
            and play with friends from your phone or browser. You do not need an account to play — you join with just a
            display name. This policy explains what information we collect, how we use it, and the choices you have.
          </p>

          <Section title="Information we collect">
            <p>
              <strong>Information you provide.</strong> When you join a game you choose a display name. Some
              &ldquo;people&rdquo; poll games ask for an optional gender so rounds can be matched. As you play, we
              process the content you create in a game — answers, votes, guesses, drawings, quotes, and any chat messages
              — and, for games that use profile pictures, a photo you choose to upload.
            </p>
            <p>
              <strong>Voice chat.</strong> If you turn on voice chat, your microphone audio is streamed in real time to
              the other players in your room. Voice is powered by LiveKit and is <strong>not recorded or stored</strong>{' '}
              by us.
            </p>
            <p>
              <strong>Push notifications.</strong> If you opt in, we store a push token (an Expo push token in the mobile
              app, or a Web Push subscription in the browser) so we can send game notifications, such as when the host
              starts the game or it&rsquo;s your turn. You can turn these off at any time in Settings, which removes your
              device&rsquo;s subscription.
            </p>
            <p>
              <strong>Usage and device data.</strong> In production we use Google Analytics to understand how the site is
              used — for example pages viewed, general device and browser type, and approximate region. We also keep
              standard server logs. We use cookies and local storage to keep you in your game session and to remember
              your preferences (theme, sound, notifications).
            </p>
          </Section>

          <Section title="How we use your information">
            <ul className="list-disc space-y-1 pl-5">
              <li>To run and synchronize live games between the players in a room.</li>
              <li>To deliver the notifications you opt into.</li>
              <li>To keep the service working, secure, and free from abuse, and to improve it over time.</li>
            </ul>
          </Section>

          <Section title="How your information is shared">
            <p>
              <strong>Other players.</strong> By design, your display name, your uploaded photo, and your in-game actions
              are visible to the other players in your room — that is the game.
            </p>
            <p>
              <strong>Service providers.</strong> We share data only with the providers that help us run the service:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Supabase</strong> — database, file storage (uploaded photos), and backend hosting for game data.
              </li>
              <li>
                <strong>LiveKit</strong> — real-time voice chat.
              </li>
              <li>
                <strong>Google Analytics</strong> — anonymous usage analytics.
              </li>
              <li>
                <strong>Apple, Google, Expo, and browser push services</strong> — to deliver notifications you opt into.
              </li>
            </ul>
            <p>
              We do <strong>not</strong> sell your personal information. We may disclose information if required by law or
              to protect the rights, safety, and security of our users and the service.
            </p>
          </Section>

          <Section title="Data retention">
            <p>
              Game rooms are temporary. The data created in a game is tied to its room and is cleaned up after the game
              ends as part of our routine housekeeping. Uploaded photos are stored for the room and are removed when
              replaced or when the room is cleaned up. Push tokens are kept until you turn notifications off or the token
              expires. You can ask us to delete data associated with you at any time using the contact below.
            </p>
          </Section>

          <Section title="Your choices">
            <ul className="list-disc space-y-1 pl-5">
              <li>You can play without uploading a photo and without enabling voice chat.</li>
              <li>You can turn notifications on or off in Settings; turning them off unsubscribes your device.</li>
              <li>You can request access to, or deletion of, your data by emailing us.</li>
            </ul>
          </Section>

          <Section title="Children">
            <p>
              {SITE_NAME} is not directed to children under 13 (or the minimum age of digital consent in your country),
              and we do not knowingly collect personal information from them. If you believe a child has provided us with
              personal information, please contact us and we will remove it.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use reasonable technical and organizational measures to protect your information. No method of
              transmission or storage is completely secure, so we cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="International users">
            <p>
              Your information may be processed and stored in countries other than your own, where data-protection laws
              may differ. By using {SITE_NAME} you consent to this processing.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. When we do, we will revise the &ldquo;Last updated&rdquo; date
              above. Continued use of {SITE_NAME} after a change means you accept the updated policy.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about this policy or your data? Email us at{' '}
              <a className="font-semibold text-[var(--primary)] underline" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>

          <p className="pt-2 text-sm text-[var(--muted)]">
            <Link href="/" className="underline">
              ← Back to {SITE_NAME}
            </Link>
          </p>
        </div>
      </article>
    </SiteChrome>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h2>
      {children}
    </section>
  )
}
