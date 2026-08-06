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
          'No — you can join any game with just a display name and a room code. When you finish your first game, we automatically create a profile for you so we can track your trophies, streaks, and stats. No email or password is required, but you can optionally add an email to access your profile across devices.',
      },
      {
        question: 'How do I start a game?',
        answer:
          'Open the games directory, pick a game, and hit "Play free". You choose the settings, then share the room code or link with your friends. As soon as they join, you can start the first round.',
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
          "It depends on the game. Party and voting games comfortably handle large groups, while board and card games such as Chess, Ayo, or Whot have fixed seat counts. The player range is shown on every game card and on the game's page.",
      },
      {
        question: 'Can people watch without playing?',
        answer:
          'Yes. Most games support spectators — anyone who joins after the seats are full, or who opens a "Watch live" link, can follow along without taking a seat. Hosts can turn spectators off in the room settings.',
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
      {
        question: `Is ${SITE_NAME} affiliated with Yahtzee, Monopoly, UNO, Whot, or other game brands?`,
        answer: `No. ${SITE_NAME} is an independent platform. Some of our games are digital versions inspired by well-known party, board, or card games — including Yahtzee®, Monopoly®, Scrabble®, UNO®, and Whot® — but we are not affiliated with, endorsed by, or sponsored by the owners of those games. All trademarks are the property of their respective owners and are used only to describe the game being played.`,
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
    id: 'trophies',
    title: 'Trophies, streaks, and profiles',
    faqs: [
      {
        question: 'How do trophies work?',
        answer:
          "Trophies are earned automatically as you play — things like finishing your first game, racking up wins, or hitting a milestone. Each game has its own trophy list, shown on that game's page, with bronze, silver, gold, and platinum tiers. Some trophies are secret and only reveal themselves once you have earned them.",
      },
      {
        question: 'What are streaks?',
        answer:
          'A streak tracks how many days in a row you have played. Play at least one game each day to keep your streak alive. Streaks are shown on your profile and can unlock streak-related trophies.',
      },
      {
        question: 'Do I need an account to earn trophies?',
        answer:
          'You need a FateRound profile, which is created automatically the first time you finish a game — no email or password required. Trophies, streaks, and stats are tied to that profile, so play from the same device or sign in to keep them.',
      },
      {
        question: 'What is a public profile?',
        answer:
          'Every player gets a shareable profile page showing their username, trophies, stats, and streaks. You can share your profile link with anyone — they do not need an account to view it. You can change your username at any time.',
      },
      {
        question: 'Where can I see my trophies?',
        answer:
          "Your profile page lists everything you have earned across every game, plus your progress toward what is left. Each game's page also shows that game's full trophy list.",
      },
    ],
  },
  {
    id: 'daily-challenges',
    title: 'Daily challenges',
    faqs: [
      {
        question: 'What are daily challenges?',
        answer:
          'Every day we publish a fresh puzzle for several game types. Everyone gets the same puzzle, so you can compare your score with friends. A new challenge drops each day at midnight.',
      },
      {
        question: 'Do daily challenges count toward trophies and streaks?',
        answer:
          'Yes — completing a daily challenge counts as a game for your streak and can contribute toward trophy progress.',
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
          'Very little — a display name, the content you create during a game, and basic technical data needed to run the room. Your profile stores your username, trophies, streaks, and game stats. An email address is only collected if you choose to add one. The Privacy Policy covers this in full.',
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
