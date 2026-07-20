import { SITE_NAME } from '@/lib/seo'

export type SiteFaq = { question: string; answer: string }
export type SiteFaqGroup = { id: string; title: string; faqs: SiteFaq[] }

/**
 * The site-wide help content behind /faq. Kept as data (not JSX) so the same array feeds
 * both the rendered page and the FAQPage JSON-LD, which keeps them from drifting apart.
 *
 * Per-game questions live on the individual landing pages (`extraFaqs` in game-landing.ts) —
 * this file is only for questions that apply across the whole platform.
 */
export const SITE_FAQ_GROUPS: SiteFaqGroup[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    faqs: [
      {
        question: `Do I need an account to play ${SITE_NAME}?`,
        answer:
          'No. Hosts create a room and get a code; players join with that code and a display name. There is no sign-up, no email, and no download required to play.',
      },
      {
        question: 'How do I start a game?',
        answer:
          'Open the games directory, pick a game, and hit “Play free”. You choose the settings, then share the room code or link with your friends. As soon as they join, you can start the first round.',
      },
      {
        question: 'How do my friends join?',
        answer:
          'Send them the room link, or have them enter the room code on the home page. Everything runs in the browser — they do not need to install anything.',
      },
      {
        question: `Is ${SITE_NAME} free?`,
        answer:
          'Yes, every game is free to play with no limits on rounds or rooms. There is no paid tier and no ads interrupting a game.',
      },
      {
        question: 'What do I need to play?',
        answer:
          'A phone, tablet, or laptop with a modern browser and an internet connection. Games are designed to work on a phone in one hand, so everyone can play from their own device.',
      },
    ],
  },
  {
    id: 'during-a-game',
    title: 'During a game',
    faqs: [
      {
        question: 'How many people can play?',
        answer:
          'It depends on the game. Party and voting games comfortably handle large groups, while board and card games such as Chess, Ayo, or Whot have fixed seat counts. The player range is shown on every game card and on the game’s page.',
      },
      {
        question: 'Can people watch without playing?',
        answer:
          'Yes. Most games support spectators — anyone who joins after the seats are full, or who opens a “Watch live” link, can follow along without taking a seat. Hosts can turn spectators off in the room settings.',
      },
      {
        question: 'What happens if someone loses connection?',
        answer:
          'They can rejoin the same room with the same link and pick up where they left off — we do not forfeit players for dropping out mid-game. If someone leaves for good, the host can remove them so the game can continue.',
      },
      {
        question: 'Can players join after the game has started?',
        answer:
          'For most games, yes — the host controls whether late players can take a seat, join as spectators only, or not at all.',
      },
      {
        question: 'Is there voice chat?',
        answer:
          'Yes. Rooms have optional built-in voice chat, so you can play with people who are not in the room with you. Voice is live only — it is never recorded or stored.',
      },
    ],
  },
  {
    id: 'content',
    title: 'Questions and content',
    faqs: [
      {
        question: 'Can I use my own questions?',
        answer:
          'Yes. Most question-based games let the host paste in a custom list, or upload one, instead of using the built-in bank. This is how people run themed rounds for a class, a team, or a birthday.',
      },
      {
        question: 'What is the Library?',
        answer:
          'The Library is a shared pool of question packs submitted by other hosts and reviewed by us. You can browse it, filter by tag, and pull a pack straight into your game — or submit your own.',
      },
      {
        question: 'Which games are suitable for children or classrooms?',
        answer:
          'Most of them. Trivia, the word and puzzle games, and the board and card games are all family-friendly. A small number of party games are aimed at adults and are marked 18+ in the games directory, on their game pages, and with a warning before you play — those are not suitable for school use.',
      },
      {
        question: 'Why are some games marked 18+?',
        answer:
          'Either their built-in questions reference adult themes, or the game asks players to make suggestive judgements about real people. They are labelled everywhere they appear and show a content warning before the first round, so nobody walks into one by accident.',
      },
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting and tournaments',
    faqs: [
      {
        question: 'Can I host without playing?',
        answer:
          'Yes. When you create a game you can choose to host only — running the room and reading questions out — or to host and play along with everyone else.',
      },
      {
        question: 'Can I run a tournament?',
        answer:
          'Yes. Tournaments let you run a bracket across multiple rounds of a game, with players carried between matches and a hub page showing standings. Schools use this for end-of-term championships.',
      },
      {
        question: 'How long does a game take?',
        answer:
          'Most party rounds run a few minutes, and a full game is typically ten to twenty minutes. Hosts set the number of rounds and the per-round timer, so you can make it as short or as long as you want.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy and data',
    faqs: [
      {
        question: 'What data do you collect?',
        answer:
          'Very little — a display name, the content you create during a game, and basic technical data needed to run the room. Because there are no accounts, we do not collect an email address to play. The Privacy Policy covers this in full.',
      },
      {
        question: 'How do I report a problem or another player?',
        answer:
          'Email us from the contact page with the room code and, if you can, a screenshot. We look at every report.',
      },
    ],
  },
]

/** Flattened list, used for the FAQPage structured data. */
export const ALL_SITE_FAQS: SiteFaq[] = SITE_FAQ_GROUPS.flatMap((group) => group.faqs)
