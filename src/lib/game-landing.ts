import type { GameType } from '@/types'
import { gameTypeConfig } from '@/lib/game-types'
import { GAME_LANDING_RULES, type GameLandingRuleSection } from '@/lib/game-landing-rules'

export type { GameLandingRuleSection } from '@/lib/game-landing-rules'

export type GameLandingFaq = {
  question: string
  answer: string
}

export type GameLandingContent = {
  gameType: GameType
  slug: string
  seoTitle: string
  seoDescription: string
  keywords: string[]
  heroTitle: string
  heroSubtitle: string
  bodyParagraph?: string
  highlights: string[]
  features: { title: string; description: string; emoji: string }[]
  steps: { title: string; description: string }[]
  rules: GameLandingRuleSection[]
  rulesNote?: string
  perfectFor: string[]
  extraFaqs?: GameLandingFaq[]
}

export const GAME_TYPE_TO_SLUG: Record<GameType, string> = {
  smash_marry_kill: 'smash-marry-kill',
  red_flag_green_flag: 'red-flag-green-flag',
  smash_or_pass: 'smash-or-pass',
  parent_approval: 'date-my-kid',
  would_you_rather: 'would-you-rather',
  never_have_i_ever: 'never-have-i-ever',
  pick_a_number: 'pick-a-number',
  this_or_that: 'this-or-that',
  most_likely_to: 'most-likely-to',
  who_said_this: 'who-said-this',
  hot_seat: 'hot-seat',
  custom: 'custom-game',
  anonymous_messages: 'anonymous-room',
  secret_message: 'secret-message',
  bingo: 'bingo',
  codewords: 'codewords',
  trivia: 'trivia',
  two_truths: 'two-truths-and-a-lie',
  monopoly: 'monopoly',
  yahtzee: 'yahtzee',
  whot: 'whot',
  crazy_eights: 'crazy-eights',
  ludo: 'ludo',
  mahjong: 'mahjong',
  i_call_on: 'i-call-on',
  sudoku: 'sudoku',
  tic_tac_toe: 'tic-tac-toe',
  word_hunt: 'word-hunt',
  chess: 'chess',
  checkers: 'checkers',
  ayo: 'ayo',
  describe_it: 'text-charades',
  word_rush: 'word-rush',
  scrabble: 'scrabble',
  snake_and_ladder: 'snakes-and-ladders',
  mafia: 'mafia',
  matching_pairs: 'matching-pairs',
  quiplash: 'quiplash',
  quick_draw: 'quick-draw',
  crossword: 'crossword',
  word_search: 'word-search',
  word_scramble: 'word-scramble',
  landmine: 'landmine',
}

const SLUG_TO_GAME_TYPE = Object.fromEntries(
  Object.entries(GAME_TYPE_TO_SLUG).map(([type, slug]) => [slug, type])
) as Record<string, GameType>

export function gameTypeFromSlug(slug: string): GameType | null {
  return SLUG_TO_GAME_TYPE[slug] ?? null
}

export function gameLandingSlug(gameType: GameType): string {
  return GAME_TYPE_TO_SLUG[gameType]
}

export function gameRulesHref(gameType: GameType): string {
  return `/games/${GAME_TYPE_TO_SLUG[gameType]}#rules`
}

export const ALL_GAME_LANDING_SLUGS = Object.values(GAME_TYPE_TO_SLUG)

const SHARED_FEATURES = {
  noSignup: { title: 'No sign-up', description: 'Create a game and play in seconds — no account needed.', emoji: '⚡' },
  realtime: {
    title: 'Live results',
    description: 'Votes sync in real time. Reveal round-by-round or all at once.',
    emoji: '📡',
  },
  mobile: {
    title: 'Phone & desktop',
    description: 'Everyone joins from any browser — perfect for group chats.',
    emoji: '📱',
  },
  code: { title: 'Share a code', description: 'One short room code. Send the link and you’re in.', emoji: '🔗' },
}

function landing(
  gameType: GameType,
  extra: Omit<GameLandingContent, 'gameType' | 'slug' | 'heroTitle' | 'rules'> & { heroTitle?: string }
): GameLandingContent {
  const cfg = gameTypeConfig(gameType)
  return {
    gameType,
    slug: GAME_TYPE_TO_SLUG[gameType],
    heroTitle: extra.heroTitle ?? cfg.label,
    rules: GAME_LANDING_RULES[gameType],
    ...extra,
  }
}

export const GAME_LANDING_CONTENT: Record<GameType, GameLandingContent> = {
  smash_marry_kill: landing('smash_marry_kill', {
    seoTitle: 'Smash Marry Kill Online — Free Party Game',
    seoDescription:
      'Play Smash Marry Kill online with friends for free. Three names each round — pick one to smash, one to marry, one to kill. No download, no sign-up.',
    keywords: [
      'smash marry kill online',
      'smash marry kill game',
      'kiss marry kill online',
      'free smash marry kill',
      'play smash marry kill online free',
      'kiss marry kill game online',
      'smash marry kill with friends',
      'smash marry kill celebrities',
      'smash marry kill party game',
      'kiss marry kill online free',
      'smash marry kill online no sign up',
    ],
    heroSubtitle:
      'The classic party game, upgraded. Three faces land each round — your group assigns smash, marry, and kill. Results get messy.',
    bodyParagraph:
      'Smash Marry Kill (also called Kiss Marry Kill) puts three names in front of your group every round — celebrities, friends from a custom list, or names players add live. Unlike shouting answers across the room, Fate Round collects everyone’s votes privately and reveals who got smashed, married, and killed together. Upload a celebrity list, enable gender-based rounds, or let joiners fill the poll on the fly.',
    highlights: ['3 picks per round', 'Gender-based or names-only', 'Import a list or join & play'],
    features: [
      {
        title: 'Three-way choices',
        description: 'Every round presents three names — one slot for each fate.',
        emoji: '🔥',
      },
      {
        title: 'List or lobby modes',
        description: 'Upload celebrities, claim from a roster, or let joiners enter the poll.',
        emoji: '📋',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Create your room',
        description: 'Pick rounds, timer, and whether rounds are gender-based or names-only.',
      },
      { title: 'Share the code', description: 'Friends join from their phones with a short link or room code.' },
      {
        title: 'Smash, marry, kill',
        description: 'Vote each round, then reveal who got what — and who won each category.',
      },
    ],
    perfectFor: ['Friend groups', 'Birthday parties', 'Discord calls', 'Icebreakers'],
    extraFaqs: [
      {
        question: 'What’s the difference between Smash Marry Kill and Smash or Pass?',
        answer:
          'Smash Marry Kill gives you three names each round and you must assign smash, marry, and kill to each one. Smash or Pass is simpler — two names per round and you only decide smash or pass on each person individually. Both are free on Fate Round.',
      },
      {
        question: 'How do you play Smash Marry Kill?',
        answer:
          'Each round drops three names — celebrities, friends from a list you upload, or names players add in the lobby. Everyone privately assigns one “smash,” one “marry,” and one “kill,” and the reveal shows how the group voted. It’s the classic Kiss Marry Kill, run so votes stay private until the big reveal.',
      },
      {
        question: 'Can I use celebrities or my own list of names?',
        answer:
          'Yes. Upload a list of celebrities, fictional characters, or your own friends, or let players add names live in the lobby. You control who ends up in the hot seat.',
      },
      {
        question: 'Are the votes anonymous?',
        answer:
          'Everyone votes privately, so the reveal shows the group’s picks without pinning each vote on a name. That’s what keeps it fun rather than personal.',
      },
    ],
  }),

  red_flag_green_flag: landing('red_flag_green_flag', {
    seoTitle: 'Red Flag Green Flag Game Online — Free',
    seoDescription:
      'Play Red Flag Green Flag online with friends. Two names per round — rate each person green flag or red flag. Free, instant, no sign-up.',
    keywords: [
      'red flag green flag game',
      'green flag red flag online',
      'red flag game with friends',
      'play red flag green flag online free',
      'red flag green flag party game',
      'red flag green flag with friends online',
      'dating red flags game',
      'green flag red flag game online free',
      'red flag green flag online no sign up',
    ],
    heroSubtitle:
      'Two names, two judgments. Each round your group decides who’s a green flag and who’s a red flag — separately, honestly, and out loud.',
    bodyParagraph:
      'Red Flag Green Flag works like the viral dating debate format, but online with your whole group voting at once. Upload celebrities, crushes, or friends from a custom list — each round shows two names and everyone rates them green flag or red flag independently. Unlike arguing in a group chat, Fate Round tallies every vote and reveals who got flagged together.',
    highlights: ['Two names per round', 'Rate each person individually', 'Spicy group debates'],
    features: [
      {
        title: 'Dual ratings',
        description: 'Both names get their own green or red flag — not a versus pick.',
        emoji: '🚩',
      },
      { title: 'Pair voting rules', description: 'One-each mode or any combo — host picks the vibe.', emoji: '⚖️' },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.mobile,
    ],
    steps: [
      { title: 'Set up the list', description: 'Add friends, celebrities, or let everyone join into the poll.' },
      { title: 'Send the link', description: 'Players join with a name and wait in the lobby.' },
      { title: 'Flag away', description: 'Reveal results round by round and see who’s collecting red flags.' },
    ],
    perfectFor: ['Date debates', 'Roommate nights', 'Twitch streams', 'Group chats'],
    extraFaqs: [
      {
        question: 'How is Red Flag Green Flag different from Smash or Pass?',
        answer:
          'Red Flag Green Flag rates two people separately on a green-or-red scale — both names get judged each round. Smash or Pass is a simple smash-or-pass binary on each person. Both are free on Fate Round.',
      },
      {
        question: 'How do you play Red Flag Green Flag?',
        answer:
          'Each round shows two names, and everyone privately rates each one a green flag (into it) or a red flag (hard no). The reveal shows how the group scored each person. It’s a fun way to debate what counts as a dealbreaker.',
      },
    ],
  }),

  smash_or_pass: landing('smash_or_pass', {
    seoTitle: 'Smash or Pass Game Online — Free with Friends',
    seoDescription:
      'Play Smash or Pass online for free. Two names each round — smash or pass on each person. Quick rounds, live results, no sign-up.',
    keywords: [
      'smash or pass game',
      'smash or pass online',
      'smash pass party game',
      'play smash or pass online free',
      'smash or pass with friends',
      'smash or pass celebrities',
      'smash or pass online free no download',
      'smash or pass game online',
      'smash or pass online no sign up',
    ],
    heroSubtitle:
      'Fast, bold, and brutally simple. Two names show up — your group smashes or passes on each one. No overthinking required.',
    bodyParagraph:
      'Smash or Pass is the quickest party game on Fate Round — two names per round, smash or pass on each, done. Import a celebrity list, add friends from your group, or let players join the poll live. Unlike playing verbally where loudest voice wins, everyone votes privately and results reveal together with a live smash leaderboard.',
    highlights: ['Quick binary votes', 'Two names per round', 'Perfect for rapid rounds'],
    features: [
      { title: 'Smash or pass', description: 'Clean A/B energy on every name — no third option needed.', emoji: '🔥' },
      { title: 'Timed rounds', description: 'Optional countdown keeps the pace up and the takes hot.', emoji: '⏱️' },
      SHARED_FEATURES.code,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Host a room', description: 'Upload names or use join-and-play mode with your friend group.' },
      { title: 'Everyone joins', description: 'Share the code — players pick a name and hop in the lobby.' },
      { title: 'Smash or pass', description: 'Vote, reveal, repeat. Leaderboards show who got the most smashes.' },
    ],
    perfectFor: ['Quick warm-ups', 'College hangs', 'After-parties', 'Bold friend groups'],
    extraFaqs: [
      {
        question: 'What’s the difference between Smash or Pass and Smash Marry Kill?',
        answer:
          'Smash or Pass shows two names per round and you pick smash or pass on each person. Smash Marry Kill gives you three names and you must assign smash, marry, and kill to all three. Smash or Pass is faster; Smash Marry Kill has more chaos.',
      },
      {
        question: 'How do you play Smash or Pass?',
        answer:
          'Two names show up each round and everyone privately picks “smash” or “pass” on each one. The reveal shows how the group voted. It’s fast, bold, and no overthinking — the quickest of the party voting games.',
      },
      {
        question: 'Can I use my own list of names or celebrities?',
        answer:
          'Yes. Upload a custom list, or let players add names live in the lobby. Celebrities, fictional characters, or your own friends — your call.',
      },
    ],
  }),

  parent_approval: landing('parent_approval', {
    seoTitle: 'Date My Kid Game Online — Free Party Game',
    seoDescription:
      'Play Date My Kid online for free. One name each round — would you let your son or daughter date or marry them? Yes or no votes, live results, no sign-up.',
    keywords: [
      'date my kid game',
      'parent approval game',
      'would you let your kid date them',
      'party game online',
      'play date my kid online free',
      'meet the parents game online',
      'date my kid party game',
      'parent approval game online free',
      'date my kid game with friends',
    ],
    heroSubtitle:
      'One name steps into the spotlight. Everyone votes yes or no — would you let your son or daughter date or marry this person?',
    bodyParagraph:
      'Date My Kid (Parent Approval) puts one name in the spotlight each round and asks the brutal question: would you let your son or daughter date or marry them? Load celebrities, exes, or friends from a custom list — everyone votes yes or no privately, then results reveal together. It’s funnier than shouting across the room because you see the actual split, not just the loudest opinion.',
    highlights: ['One name per round', 'Yes or no votes', 'Import a list or join & play'],
    features: [
      {
        title: 'Parental judgment',
        description: 'Celebrities, friends, exes — the room decides if they are good enough for your kid.',
        emoji: '👨‍👩‍👧',
      },
      {
        title: 'Flexible roster',
        description: 'Upload names, let players join the poll, or use vote-only import mode.',
        emoji: '📋',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Set up the poll', description: 'Add names on the next step or let players join the list.' },
      { title: 'Everyone joins', description: 'Share the code — players pick a name and hop in the lobby.' },
      { title: 'Yes or no', description: 'Each round reveals one person. Vote, reveal, repeat.' },
    ],
    perfectFor: ['Friend groups', 'Family game night', 'Podcast bits', 'Group chats'],
    extraFaqs: [
      {
        question: 'Can I use celebrities in Date My Kid?',
        answer:
          'Yes. Upload a custom name list with celebrities, fictional characters, or anyone your group wants to judge. You can also let players join the poll and add names live when creating the room.',
      },
      {
        question: 'How do you play Date My Kid?',
        answer:
          'One name steps into the spotlight each round, and everyone plays the overprotective parent — voting yes or no on whether you’d let your son or daughter date them. The reveal shows how the group ruled. It’s pure “meet the parents” comedy.',
      },
    ],
  }),

  would_you_rather: landing('would_you_rather', {
    seoTitle: 'Would You Rather Online — Free Party Game',
    seoDescription:
      'Play Would You Rather online with friends for free. Hundreds of prompts or bring your own — anonymous votes, instant reveals.',
    keywords: [
      'would you rather online',
      'would you rather game',
      'wyr with friends',
      'would you rather no signup',
      'play would you rather online free',
      'would you rather questions',
      'would you rather for groups',
      'would you rather online multiplayer',
      'would you rather party game',
      'would you rather with friends online',
      'anonymous would you rather',
      'would you rather game online free no download',
    ],
    heroSubtitle:
      'Impossible choices, anonymous votes. Every round pits two options against each other — see where your group actually stands.',
    bodyParagraph:
      'Would You Rather on Fate Round handles the classic “pick A or B” format with anonymous voting and instant reveals. Use hundreds of built-in prompts or upload your own questions — perfect for icebreakers, road trips, or Zoom calls. Unlike playing out loud where people follow the crowd, anonymous votes show where your group actually stands before the arguments start.',
    highlights: ['Anonymous voting', 'Platform or custom questions', '2+ players, zero setup'],
    features: [
      {
        title: 'Built-in question pool',
        description: 'Jump in with curated Would You Rather prompts — or upload your own.',
        emoji: '🤔',
      },
      {
        title: 'Fully anonymous',
        description: 'Nobody knows who picked what until you reveal — if you reveal.',
        emoji: '🎭',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Start a lobby', description: 'Choose round count and timer — no participant list needed.' },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name and waits.' },
      { title: 'Pick A or B', description: 'Vote each round, reveal the split, and argue about the minority.' },
    ],
    perfectFor: ['Road trips (passenger mode)', 'Zoom hangs', 'Icebreakers', 'Late-night nonsense'],
    extraFaqs: [
      {
        question: 'Can I add my own Would You Rather questions?',
        answer:
          'Yes. Fate Round includes a built-in question pool, and you can upload your own prompts when creating a room. Pick round count, set a timer, and share the link — no participant list required.',
      },
      {
        question: 'How do you play Would You Rather?',
        answer:
          'Each round puts two options on the screen — “would you rather A or B?” Everyone picks one privately on their phone, and the reveal shows how the group split. There’s no wrong answer; the fun is seeing where your friends land and arguing about it after.',
      },
      {
        question: 'Are the votes anonymous?',
        answer:
          'Yes — everyone votes privately and the reveal shows the split without naming who picked what (unless you want to fess up). That’s what makes the spicier questions actually fun.',
      },
    ],
  }),

  never_have_i_ever: landing('never_have_i_ever', {
    seoTitle: 'Never Have I Ever Online — Free Party Game',
    seoDescription:
      "Play Never Have I Ever online with friends for free. Anonymous I have / I haven't votes, instant reveals, built-in or custom prompts.",
    keywords: [
      'never have i ever online',
      'never have i ever game',
      'nhie party game',
      'never have i ever with friends',
      'play never have i ever online free',
      'never have i ever questions',
      'never have i ever online with friends',
      'never have i ever for groups',
      'never have i ever game online free no download',
      'anonymous never have i ever',
      'never have i ever party game online',
    ],
    heroSubtitle:
      "Classic confession game, online. Each prompt asks who's done it — anonymous votes reveal how spicy the group really is.",
    bodyParagraph:
      "Never Have I Ever on Fate Round reads each prompt aloud on every screen while players tap I have or I haven't anonymously. Use built-in prompts or upload your own — perfect for parties, pregames, or friend groups who want honest confessions without the awkward eye contact. Unlike playing in a circle where people hesitate, anonymous votes get real answers.",
    highlights: ['Anonymous voting', 'Platform or custom prompts', '2+ players, zero setup'],
    features: [
      {
        title: 'Built-in prompt pool',
        description: 'Jump in with curated Never Have I Ever statements — or upload your own.',
        emoji: '🙈',
      },
      {
        title: 'Fully anonymous',
        description: 'See how many have done it — not who raised their hand.',
        emoji: '🎭',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Start a lobby', description: 'Choose round count and timer — no participant list needed.' },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name and waits.' },
      { title: 'Confess & reveal', description: "Tap I have or I haven't each round and see the group split." },
    ],
    perfectFor: ['Pregames', 'Friend reunions', 'Icebreakers', 'Spicy confession nights'],
    extraFaqs: [
      {
        question: 'Can I add my own Never Have I Ever prompts?',
        answer:
          'Yes. Fate Round includes a built-in prompt pool, and you can upload your own statements when creating a room. The "Never have I ever" prefix is added automatically — just upload the action (e.g. "been skydiving").',
      },
      {
        question: 'How do you play Never Have I Ever online?',
        answer:
          'Each round shows a “Never have I ever…” statement. Everyone privately marks whether they have or haven’t, and the reveal shows how many in the group are guilty — without forcing anyone to drink or confess out loud unless they want to. It’s the classic game, just cleaner to run over a call.',
      },
      {
        question: 'Are answers anonymous?',
        answer:
          'Yes — votes are private and the reveal shows the count, not the names. That’s what lets the spicier prompts stay fun instead of awkward.',
      },
    ],
  }),

  pick_a_number: landing('pick_a_number', {
    seoTitle: 'Pick a Number Game Online — Free Party Question Game',
    seoDescription:
      'Play Pick a Number online with friends. Choose a number from a hidden list — answer the question it reveals. Built-in or custom questions, free, no sign-up.',
    keywords: [
      'pick a number game',
      'pick a number questions',
      'party question game',
      'number question game',
      'play pick a number online free',
      'pick a number game online',
      'pick a number party game',
      'pick a number question game online',
      'pick a number with friends online',
    ],
    heroSubtitle:
      "Pick a number between 1 and X — you won't know the question until after you choose. Then answer whatever gets revealed.",
    bodyParagraph:
      'Pick a Number is a classic party game: one person chooses a number from a hidden list, and that number maps to a question they have to answer out loud. Fate Round runs it online — upload your own numbered questions or use our built-in pool, rotate who picks each round, and reveal the question on every screen the moment they lock in their number.',
    highlights: ['Hidden numbered list', 'Platform or custom questions', '2+ players, zero setup'],
    features: [
      {
        title: 'Mystery until you pick',
        description: 'The question list stays hidden — pickers only see numbers until they commit.',
        emoji: '🔢',
      },
      {
        title: 'Your questions or ours',
        description: 'Upload a numbered CSV or use built-in party prompts.',
        emoji: '❓',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Start a lobby', description: 'Choose your question source and max picking rounds.' },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name.' },
      {
        title: 'Pick & answer',
        description: 'Each round one player picks a number — then answers the revealed question.',
      },
    ],
    perfectFor: ['Pregames', 'Road trips', 'Icebreakers', 'Spicy question nights'],
    extraFaqs: [
      {
        question: 'Can I use my own questions?',
        answer:
          'Yes. Upload one question per row in our CSV format — row 1 is question #1, row 2 is #2, and so on. Or use the built-in question pool.',
      },
      {
        question: 'How do you play Pick a Number?',
        answer:
          'Each round you pick a number before you know what it means — then the hidden question tied to that number is revealed, and you answer it. It’s the suspense of not knowing whether you just signed up for an easy one or a spicy one that makes it fun.',
      },
    ],
  }),

  this_or_that: landing('this_or_that', {
    seoTitle: 'This or That Game Online — Free with Custom Questions',
    seoDescription:
      'Play This or That online with friends. Upload your own “Coffee or Tea?” prompts — anonymous A/B votes, instant reveals, no sign-up.',
    keywords: [
      'this or that game',
      'this or that online',
      'this or that with friends',
      'coffee or tea game',
      'play this or that online free',
      'this or that questions',
      'this or that game online free',
      'this or that party game',
      'this or that with friends online',
      'would you rather alternative',
    ],
    heroSubtitle:
      'Your prompts, your vibe. Upload “Coffee or Tea?” style questions — everyone picks A or B and you see where the group lands.',
    bodyParagraph:
      'This or That is Would You Rather with your own personality — upload “Coffee or Tea?”, “Dogs or Cats?”, or inside-joke prompts from a CSV. Everyone votes anonymously and you see the split instantly. Unlike verbal rounds where one person picks first and influences everyone else, Fate Round collects private votes before revealing results.',
    highlights: ['Upload your own CSV', 'Anonymous voting', '2+ players, zero setup'],
    features: [
      {
        title: 'Your question list',
        description: 'Bring a CSV of “X or Y?” prompts — or type them in when creating a room.',
        emoji: '📋',
      },
      {
        title: 'Fully anonymous',
        description: 'Nobody knows who picked what until you reveal — if you reveal.',
        emoji: '🎭',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Upload prompts',
        description: 'Add your This or That questions when creating — one per row like “Coffee or Tea?”',
      },
      { title: 'Friends join', description: 'Share the link. Everyone enters a display name and waits.' },
      { title: 'Pick A or B', description: 'Vote each round, reveal the split, and argue about the minority.' },
    ],
    perfectFor: ['Icebreakers', 'Team meetings', 'Group chats', 'Custom themed nights'],
    extraFaqs: [
      {
        question: 'What’s the difference between This or That and Would You Rather?',
        answer:
          'Would You Rather uses Fate Round’s built-in impossible-choice prompts. This or That lets you upload your own “X or Y?” questions — ideal for themed nights, team meetings, or inside jokes. Both use anonymous A/B voting.',
      },
      {
        question: 'How do you play This or That?',
        answer:
          'Each round shows two options — “coffee or tea?”, “beach or mountains?” — and everyone privately picks A or B. The reveal shows how the group split. Simple, fast, and endlessly customisable with your own prompts.',
      },
      {
        question: 'Are the votes anonymous?',
        answer:
          'Yes — everyone votes from their own phone privately, and the reveal shows the split without naming who picked what.',
      },
    ],
  }),

  most_likely_to: landing('most_likely_to', {
    seoTitle: 'Most Likely To Game Online — Free with Friends',
    seoDescription:
      'Play Most Likely To online for free. Vote on who fits each prompt — anonymous, hilarious, built for friend groups.',
    keywords: [
      'most likely to game',
      'most likely to online',
      'mlt party game',
      'most likely to with friends',
      'play most likely to online free',
      'most likely to questions',
      'most likely to game online free no download',
      'most likely to with friends online',
      'who is most likely to game',
      'most likely to party game online',
      'anonymous most likely to',
    ],
    heroSubtitle:
      '“Most likely to…” prompts meet your actual friend group. Anonymous votes, savage reveals, zero mercy.',
    bodyParagraph:
      'Most Likely To on Fate Round lets your group vote on who fits each prompt — “most likely to ghost the group chat”, “most likely to become famous”, and more. Use your actual friend group as the roster or import names, with anonymous votes so nobody knows who picked whom until reveal. It beats playing verbally because shy friends vote honestly and the roast hits harder.',
    highlights: ['Anonymous votes', 'Friend group or imported list', 'Custom prompts supported'],
    features: [
      { title: 'Call out friends', description: 'Each prompt asks who fits best — the group decides.', emoji: '🎯' },
      {
        title: 'Vote on a list',
        description: 'Import names for celebrities or let joiners become the poll.',
        emoji: '👥',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Choose your mode', description: 'Join-and-vote with friends or upload a list for a voter-only game.' },
      { title: 'Share the room', description: 'Players join with a name — no accounts, no friction.' },
      { title: 'Vote & reveal', description: 'See who wins each “most likely to” and crown the chaos.' },
    ],
    perfectFor: ['Friend reunions', 'Team offsites', 'Birthday roasts', 'Group chat nights'],
    extraFaqs: [
      {
        question: 'Can I use custom Most Likely To prompts?',
        answer:
          'Yes. Fate Round includes built-in prompts and supports custom questions when you create a game. Vote on your friend group directly or import a name list — results reveal anonymously round by round.',
      },
      {
        question: 'How do you play Most Likely To?',
        answer:
          'Each round shows a “Most likely to…” prompt, and everyone secretly votes for the friend who fits best. The reveal shows who got the most votes — with no mercy. It works on your actual friend group, so the call-outs land.',
      },
      {
        question: 'Are the votes anonymous?',
        answer:
          'Yes — everyone votes privately and only the tally is revealed, so nobody knows exactly who threw them under the bus. That’s half the fun.',
      },
    ],
  }),

  who_said_this: landing('who_said_this', {
    seoTitle: 'Who Said This Game Online — Free Quote Guessing',
    seoDescription:
      'Play Who Said This online. Submit quotes in the lobby, then guess who said each one. Free party game for friend groups.',
    keywords: [
      'who said this game',
      'guess the quote game',
      'who said it party game',
      'play who said this online free',
      'who said this game online',
      'anonymous quote guessing game',
      'who said it game online',
      'who said this with friends online',
      'guess who said it game',
    ],
    heroSubtitle:
      'Your group writes the content. Quotes hit the pool, everyone guesses the author — and friendships get tested.',
    bodyParagraph:
      'Who Said This turns your group’s own messages into the game. Players submit quotes in the lobby — inside jokes, unhinged texts, or anime lines — then everyone guesses who wrote each one. Unlike reading quotes aloud and having one person guess, Fate Round scores every player and tracks who knows the group best.',
    highlights: ['Player-submitted quotes', 'Anime quote mode', 'Lobby quote pool'],
    features: [
      {
        title: 'Quote pool',
        description: 'Players submit quotes before start — only pooled quotes become rounds.',
        emoji: '💬',
      },
      {
        title: 'Guess the author',
        description: 'Read the quote, pick who said it, score points for correct guesses.',
        emoji: '🕵️',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.mobile,
    ],
    steps: [
      {
        title: 'Claim & submit',
        description: 'Players join, claim their name, and add quotes to the pool in the lobby.',
      },
      { title: 'Host starts', description: 'When enough quotes are in, the host kicks off the guessing rounds.' },
      { title: 'Reveal & score', description: 'See who guessed right and who wrote the most unhinged lines.' },
    ],
    perfectFor: ['Close friend groups', 'Work teams', 'Anime watch parties', 'Inside-joke nights'],
    extraFaqs: [
      {
        question: 'Do players need to submit quotes before the game starts?',
        answer:
          'Yes. Everyone joins the lobby, claims their name, and adds quotes to the pool before the host starts. Only pooled quotes become rounds — so the more your group submits, the better the game gets.',
      },
      {
        question: 'How do you play Who Said This?',
        answer:
          'Everyone secretly submits quotes to a shared pool in the lobby — real things they’ve said, hot takes, or made-up lines. Then each round shows one anonymous quote and the group guesses who wrote it. Half the fun is realising how well (or badly) you know your friends.',
      },
    ],
  }),

  hot_seat: landing('hot_seat', {
    seoTitle: 'Hot Seat Party Game Online — Free',
    seoDescription:
      'Play Hot Seat online with friends. Take turns in the spotlight while everyone submits a compliment, observation, or roast.',
    keywords: [
      'hot seat game',
      'hot seat party game online',
      'roast compliment game',
      'play hot seat online free',
      'hot seat questions game',
      'hot seat game with friends',
      'compliment and roast game',
      'hot seat game online free',
      'hot seat party game with friends',
    ],
    heroSubtitle:
      'One person in the hot seat. Everyone else drops a compliment, observation, or roast. Take turns until nobody’s safe.',
    bodyParagraph:
      'Hot Seat gives every player a turn in the spotlight while the rest of the group submits anonymously — a compliment, an honest observation, or a roast. Upload your friend group, claim names on join, and take turns until everyone has sat in the seat. Unlike verbal roast sessions where people hold back, anonymous submissions bring the real takes.',
    highlights: ['One spotlight per round', 'Compliment · observation · roast', 'Claim-from-list roster'],
    features: [
      {
        title: 'Three submission types',
        description: 'Mix love, truth, and chaos — one message per voter per round.',
        emoji: '🪑',
      },
      { title: 'Turn-based rounds', description: 'Each joined player gets their moment in the seat.', emoji: '🔥' },
      SHARED_FEATURES.code,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Upload names', description: 'Add your group list — each player claims their name when joining.' },
      { title: 'Fill the seat', description: 'When it’s your round, everyone submits anonymously.' },
      { title: 'Read the room', description: 'Reveal submissions one by one — compliments, observations, roasts.' },
    ],
    perfectFor: ['Birthday honorees', 'Send-offs', 'Team bonding', 'Roast sessions'],
    extraFaqs: [
      {
        question: 'Are Hot Seat submissions anonymous?',
        answer:
          'Yes. When someone is in the hot seat, every other player submits one compliment, observation, or roast anonymously. Submissions reveal one by one — the person in the seat sees what the room really thinks.',
      },
      {
        question: 'How do you play Hot Seat?',
        answer:
          'One person takes the hot seat, and everyone else anonymously submits one thing about them — a compliment, an observation, or a light roast. The submissions reveal one by one, then a new person takes the seat. It’s a warm, funny way to hype up (and gently tease) your friends.',
      },
    ],
  }),

  custom: landing('custom', {
    seoTitle: 'Custom Voting Party Game — Build Your Own Categories',
    seoDescription:
      'Create a custom online voting game with your own categories — Date, Friendzone, or anything you want. Free on Fate Round.',
    keywords: [
      'custom party game',
      'make your own voting game',
      'custom categories game online',
      'create your own party game online',
      'custom voting game free',
      'make your own game online free',
      'custom party game with friends',
      'build your own voting game',
    ],
    heroTitle: 'Custom Voting Game',
    heroSubtitle:
      'You name the slots. Date, Friendzone, CEO — whatever fits your group. Build categories, pick rules, run the poll.',
    bodyParagraph:
      'The Custom Voting Game lets you build your own Smash Marry Kill-style format with 2–5 named slots — Date, Friendzone, CEO, or whatever your group actually says. Upload a name list, set gender rules if you want, and run rounds where everyone assigns one person per slot. Perfect for inside jokes and themed nights that no off-the-shelf party game covers.',
    highlights: ['2–5 custom slots', 'Your labels & emojis', 'Gender-based or names-only'],
    features: [
      {
        title: 'Your categories',
        description: 'Define slot names, emojis, and colors — the game adapts to your vibe.',
        emoji: '✏️',
      },
      {
        title: 'Flexible roster',
        description: 'Import a voter list, claim names, or let joiners fill the poll.',
        emoji: '🎛️',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Design slots', description: 'Pick 2–5 categories and label them exactly how your group talks.' },
      { title: 'Add people', description: 'Upload a list or use join-and-play — set gender rules if you want.' },
      { title: 'Assign & reveal', description: 'Each round, assign one person per slot and reveal the group’s picks.' },
    ],
    perfectFor: ['Inside jokes', 'Themed nights', 'Streamer communities', 'Niche friend groups'],
    extraFaqs: [
      {
        question: 'How many custom categories can I create?',
        answer:
          'You can define 2–5 custom slots when creating a room — each with its own label, emoji, and color. Assign one person per slot each round, then reveal the group’s picks together.',
      },
      {
        question: 'How does the custom game work?',
        answer:
          'You invent the categories. Name your slots — Date, Friendzone, CEO, whatever fits your group — give each an emoji and colour, then run the poll. Each round your group assigns one person to each slot and the reveal shows where everyone landed. It’s Fate Round’s voting engine with your own rules.',
      },
    ],
  }),

  anonymous_messages: landing('anonymous_messages', {
    seoTitle: 'Anonymous Room — Free Live Anonymous Chat Game',
    seoDescription:
      'Create a free anonymous room for your group. Auto-assigned lobby names, fully anonymous messages, live for everyone — no sign-up.',
    keywords: [
      'anonymous chat game',
      'anonymous messages party',
      'anonymous room online',
      'free anonymous chat',
      'anonymous message board online',
      'anonymous group chat room',
      'anonymous wall for friends',
      'free anonymous chat room',
      'anonymous room with friends',
      'anonymous confessions online',
    ],
    heroSubtitle:
      'A live anonymous wall for your group. Join with one tap, get a random lobby name, and post messages everyone sees in real time — with no names attached.',
    bodyParagraph:
      'Anonymous Room is a live confession wall for your group — join with one tap, get a random lobby name, and post messages the whole room sees with no sender attached. Unlike separate anonymous apps, everyone shares one live feed in real time. Perfect for confession nights, team retros, or icebreakers where people need cover to be honest.',
    highlights: ['One-tap join', 'Auto-assigned names', 'Live anonymous feed'],
    features: [
      {
        title: 'No name needed',
        description: 'Players join instantly — the platform assigns a fun random lobby name.',
        emoji: '🎭',
      },
      {
        title: 'Truly anonymous posts',
        description: 'Messages never show who sent them — just the words.',
        emoji: '💬',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a game', description: 'Host sets a title and shares the game code.' },
      { title: 'Everyone joins', description: 'Players tap join — no typing a name.' },
      { title: 'Post live', description: 'Host starts the session and anonymous messages flow for the whole room.' },
    ],
    perfectFor: ['Confession nights', 'Team retros', 'Icebreakers', 'Group chats'],
    extraFaqs: [
      {
        question: 'Are Anonymous Room messages truly anonymous?',
        answer:
          'Yes. Players get auto-assigned random lobby names and messages never show who sent them. Everyone in the room sees the live feed — but no one can tell which message came from which person.',
      },
      {
        question: 'How does the Anonymous Room work?',
        answer:
          'The host creates a room and shares one link. Everyone joins with one tap, gets a random lobby name, and can post to a live wall that the whole group sees — with no names attached. It’s a shared anonymous feed for your group, in real time.',
      },
      {
        question: 'Is it safe and can the host moderate?',
        answer:
          'Anonymous doesn’t mean consequence-free — keep it fun and kind. The host can remove messages and ban a lobby name if someone crosses the line, so the room stays a good time for everyone.',
      },
    ],
  }),

  secret_message: landing('secret_message', {
    seoTitle: 'Secret Message Link — Free Anonymous Inbox',
    seoDescription:
      'Create a free secret message link and share it anywhere. Friends send anonymous messages — only you see your private inbox. No sign-up.',
    keywords: [
      'secret message link',
      'anonymous message inbox',
      'send me anonymous messages',
      'instagram anonymous messages',
      'anonymous message link',
      'get anonymous messages',
      'ngl alternative',
      'anonymous q and a link',
      'anonymous message link for instagram',
      'free anonymous message link',
    ],
    heroSubtitle:
      'Like a private suggestion box for your link. Share once — anyone can send you a message, and only you read them.',
    bodyParagraph:
      'Secret Message gives you a private anonymous inbox link — share it on Instagram, in your bio, or a group chat, and anyone can send you a message without signing up. Only you see the inbox; senders never see each other’s messages. Unlike public confession walls, this is a one-to-many suggestion box built for honest feedback, Q&A prompts, or fan messages.',
    highlights: ['Host-only inbox', 'Share anywhere', 'No sender sign-up'],
    features: [
      {
        title: 'Only you see messages',
        description: 'Senders never see each other’s messages — your inbox is private to you.',
        emoji: '🔒',
      },
      {
        title: 'Zero friction',
        description: 'Open the link, type, send. No account or app required.',
        emoji: '✉️',
      },
      SHARED_FEATURES.noSignup,
      SHARED_FEATURES.mobile,
    ],
    steps: [
      { title: 'Create your board', description: 'Pick a title and get your link instantly.' },
      { title: 'Share the link', description: 'Drop it in your story, bio, or group chat.' },
      { title: 'Read your inbox', description: 'Messages arrive on your host panel in real time.' },
    ],
    perfectFor: ['Instagram stories', 'Honest feedback', 'Q&A prompts', 'Fan messages'],
    extraFaqs: [
      {
        question: 'Can senders see each other’s Secret Messages?',
        answer:
          'No. Only the host sees the private inbox. Senders open your link, type a message, and send — they never see other submissions or who else wrote in.',
      },
      {
        question: 'How does Secret Message work?',
        answer:
          'You create one link and share it — in your bio, a story, or a group chat. Anyone with the link can send you an anonymous message, and only you see them in your private inbox. It’s a simple anonymous Q&A / message box, free and with no app.',
      },
      {
        question: 'Can I share my link on Instagram or WhatsApp?',
        answer:
          'Yes — that’s the point. Drop your link in your Instagram bio or story, or a WhatsApp group, and people tap through to send you anonymous messages. A free alternative to apps like NGL.',
      },
      {
        question: 'Is it really anonymous?',
        answer:
          'Senders aren’t shown to you, and they can’t see who else wrote in. As with anything anonymous, encourage people to keep it kind.',
      },
    ],
  }),

  bingo: landing('bingo', {
    seoTitle: 'Bingo — Free Online Number Bingo Game',
    seoDescription:
      'Host a free online bingo game for your group. Players get unique cards, you call numbers B1–O75, and the first line wins.',
    keywords: [
      'online bingo game',
      'bingo rules',
      'how to play bingo',
      'free bingo party',
      'number bingo multiplayer',
      'host bingo night',
      'play bingo online free',
      'virtual bingo',
      'bingo with friends online',
      '75 ball bingo online',
      'host bingo online free',
      'online bingo caller',
      'bingo for parties online',
    ],
    heroSubtitle:
      'Classic 75-ball bingo for parties and game nights. Everyone gets their own card on their phone — you call the numbers, they mark and shout BINGO.',
    bodyParagraph:
      'Online Bingo on Fate Round brings 75-ball bingo to your group without printing cards. Every player gets a unique 5×5 card on their phone with a free center square — you call numbers B1 through O75, they tap to mark, and the first completed line wins. Perfect for family nights, office parties, or classrooms where everyone already has a phone.',
    highlights: ['Unique cards', 'Host calls numbers', 'First line wins'],
    features: [
      {
        title: 'Real bingo cards',
        description: 'Each player gets a unique 5×5 card with a free center square.',
        emoji: '🎱',
      },
      {
        title: 'You’re the caller',
        description: 'Tap to call random numbers or pick them yourself — everyone sees what’s been called.',
        emoji: '📣',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a game', description: 'Set a title, share the code, and wait for players to join.' },
      { title: 'Deal cards', description: 'Start the game — every player gets a unique bingo card instantly.' },
      { title: 'Call & win', description: 'Call numbers until someone completes a line and claims BINGO.' },
    ],
    perfectFor: ['Family game night', 'Office parties', 'Classroom fun', 'Pub quizzes'],
    extraFaqs: [
      {
        question: 'How do you win at online Bingo?',
        answer:
          'Complete any full line on your card — a row, column, or diagonal of five marked cells, with the free center square counting toward it. Tap BINGO to claim, and the host confirms the win.',
      },
      {
        question: 'What numbers are called in 75-ball Bingo?',
        answer:
          'Numbers run B1–B15, I16–I30, N31–N45, G46–G60, and O61–O75 — one range per column. You can only mark a number once the host has actually called it.',
      },
      {
        question: 'Does the host pick the numbers or are they random?',
        answer:
          'Either. The host can call random numbers at the tap of a button, set an auto timer, or pick numbers manually. Every called number syncs in real time so all players see the same board.',
      },
      {
        question: 'Does each player get a different Bingo card?',
        answer:
          'Yes. When the host starts the game, every player receives a unique 5×5 bingo card automatically. Numbers called by the host sync in real time across all devices.',
      },
      {
        question: 'Can I host virtual Bingo for a group over a call?',
        answer:
          'Yes — that’s the sweet spot. You call the numbers (or let them auto-call) while everyone marks their own card from wherever they are, over Zoom, FaceTime, or Discord. Perfect for remote game nights and family bingo.',
      },
    ],
  }),

  codewords: landing('codewords', {
    seoTitle: 'Codewords — Free Online Word Spy Game',
    seoDescription:
      'Play Codewords online with friends. Two teams, spymasters give clues, operatives guess the secret words on a 5×5 grid.',
    keywords: [
      'codenames online',
      'codewords party game',
      'word spy game',
      'free codenames alternative',
      'play codenames online free',
      'codenames with friends online',
      'codewords online',
      'codewords rules',
      'how to play codewords',
      'word association spy game online',
      'spymaster game online',
      'free codenames online no account',
      'codenames online multiplayer',
      'codewords online free no download',
    ],
    heroSubtitle:
      'The classic word-association spy game online. Red vs Blue — spymasters know the secret key, operatives guess the right words. One wrong pick on the assassin ends it all.',
    bodyParagraph:
      'Codewords is the word-association spy game online — Red vs Blue teams, spymasters who see the secret key card, and operatives who guess words from one-word clues. Hit the assassin word and the game is over. Unlike passing a physical board around, everyone plays from their phone with roles assigned automatically.',
    highlights: ['Red vs Blue teams', 'Spymaster clues', '5×5 word grid'],
    features: [
      {
        title: 'Two teams, hidden roles',
        description: 'Pick spymaster or operative — spymasters see the full key card, operatives see only words.',
        emoji: '🕵️',
      },
      {
        title: 'One-word clues',
        description: 'Give a clue and a number — your team guesses which words match. Avoid the assassin!',
        emoji: '💬',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create & join', description: 'Host sets up a room — players join and pick Red or Blue plus a role.' },
      { title: 'Spymasters clue', description: 'Starting team spymaster gives a one-word clue and a number.' },
      { title: 'Guess to win', description: 'Operatives tap words — first team to find all their words wins.' },
    ],
    perfectFor: ['Game nights', 'Team building', 'Word nerds', 'Board game fans'],
    extraFaqs: [
      {
        question: 'How is Codewords different from Codenames?',
        answer:
          'Codewords follows the same word-association spy game format — two teams, spymaster clues, and a 5×5 word grid — playable free in your browser on Fate Round with no board or app required.',
      },
      {
        question: 'How do you play Codewords?',
        answer:
          'Two teams, Red and Blue, each with a spymaster who can see which words on the 5×5 grid belong to their team. Spymasters take turns giving a one-word clue plus a number, and their operatives guess which words it points to. Guess your own team’s words to win — but avoid the other team’s words and the single assassin word, which loses the game instantly.',
      },
      {
        question: 'What is the assassin word?',
        answer:
          'One hidden word on the grid is the assassin. If a team guesses it, they lose the game immediately — so spymasters have to give clues that steer their operatives well clear of it. It’s what makes every clue a gamble.',
      },
    ],
  }),

  trivia: landing('trivia', {
    seoTitle: 'Trivia — Free Online Quiz Game',
    seoDescription:
      'Host a fast-finger trivia game online. Tech or general knowledge — fastest correct answers climb the leaderboard.',
    keywords: [
      'online trivia game',
      'quiz party game',
      'tech trivia',
      'general knowledge quiz',
      'free trivia game online',
      'play trivia online with friends',
      'trivia for groups',
      'online quiz with friends',
      'virtual trivia game',
      'trivia night online',
      'custom trivia questions',
      'team trivia game',
      'trivia game no sign up',
      'free online quiz game',
      'host a trivia game online',
    ],
    heroSubtitle:
      'Speed-based trivia for groups. Pick Tech or General Knowledge, or upload your own questions. Fastest correct answers score the most.',
    bodyParagraph:
      'Trivia on Fate Round is built for fast-finger competition — multiple-choice questions, a live timer, and speed bonuses for the first correct answer. Use Tech or General Knowledge categories or upload your own CSV of questions. Unlike shouting answers in a pub quiz, every player taps their choice and the leaderboard updates automatically.',
    highlights: ['Tech & general categories', 'Speed scoring', 'Live leaderboard'],
    features: [
      {
        title: 'Fast-finger scoring',
        description: 'Correct answers earn base points plus a speed bonus — first correct gets an extra boost.',
        emoji: '⚡',
      },
      {
        title: 'Your questions or ours',
        description: 'Use the built-in question pool or upload a CSV with your own Q&A.',
        emoji: '📋',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create & join', description: 'Pick a category, set rounds and timer — players join with their name.' },
      {
        title: 'Answer fast',
        description: 'Each round shows a multiple-choice question — tap your answer before time runs out.',
      },
      { title: 'Climb the board', description: 'Points stack across rounds — fastest fingers win the leaderboard.' },
    ],
    perfectFor: ['Pub quizzes', 'Team meetings', 'Classroom reviews', 'Game nights'],
    extraFaqs: [
      {
        question: 'Can I upload my own trivia questions?',
        answer:
          'Yes. Pick Tech or General Knowledge from the built-in pool, or upload a CSV with your own multiple-choice questions when creating a room. Fastest correct answers earn speed bonus points.',
      },
      {
        question: 'How does scoring work?',
        answer:
          'Every correct answer earns base points plus a speed bonus, and the very first correct answer each round gets an extra boost — so fast, accurate players climb fastest. The leaderboard updates live after every question.',
      },
      {
        question: 'What trivia categories are there?',
        answer:
          'Built-in Tech and General Knowledge pools, or upload your own CSV of multiple-choice questions to run themed rounds — office trivia, a birthday quiz, a classroom review, whatever you need.',
      },
      {
        question: 'Is it good for classrooms, teams, and pub quizzes?',
        answer:
          'Yes. No login and room for up to 40 make it easy for a class, a remote team, or a pub-quiz crowd to jump in, and speed-based scoring keeps it competitive. Play it right in the browser over a call or on a big screen.',
      },
      {
        question: 'Can I run a trivia tournament online?',
        answer:
          'Yes. Fate Round can run a trivia tournament as a round-robin league or a knockout — great for a class, club, or team competition. Create one from the Tournaments page and share the join code — free, no app, no sign-up.',
      },
    ],
  }),

  two_truths: landing('two_truths', {
    seoTitle: 'Two Truths and a Lie — Free Online Party Game',
    seoDescription:
      'Play Two Truths and a Lie online with friends. Everyone submits statements — guess the lie each round and climb the leaderboard.',
    keywords: [
      'two truths and a lie online',
      'party game',
      'icebreaker game',
      'social deduction',
      'play two truths and a lie online free',
      'two truths and a lie game online',
      'two truths one lie online',
      'virtual icebreaker game',
      'two truths and a lie with friends online',
      'icebreaker game for work online',
    ],
    heroSubtitle:
      'Classic icebreaker, online. Write two truths and a lie, then take turns in the hot seat while everyone guesses the fib.',
    bodyParagraph:
      'Two Truths and a Lie on Fate Round handles the classic icebreaker end to end — everyone submits two truths and one lie in the lobby, then takes turns in the hot seat while the group guesses the fib. Statements shuffle each round and points track who spots lies best. Better than playing in person because scoring is automatic and shy players participate through their phone.',
    highlights: ['Lobby statement prep', 'One round per player', 'Lie spotting scores'],
    features: [
      {
        title: 'Everyone plays',
        description: 'Each player submits three statements in the lobby before the host starts.',
        emoji: '🎭',
      },
      {
        title: 'Spot the lie',
        description: 'Statements are shuffled each round — tap the one you think is false.',
        emoji: '🤥',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join & write', description: 'Enter your name and submit two truths plus one lie about yourself.' },
      { title: 'Take turns', description: 'Each round features one player — everyone else guesses the lie.' },
      { title: 'Score points', description: 'Correct guesses earn points; fool the most people for bonus points.' },
    ],
    perfectFor: ['Icebreakers', 'Team offsites', 'Classrooms', 'Friend groups'],
    extraFaqs: [
      {
        question: 'When do players write their Two Truths and a Lie?',
        answer:
          'In the lobby before the host starts. Each player submits two true statements and one lie about themselves. Once the game begins, one player’s statements are shown each round for the group to guess.',
      },
      {
        question: 'How do you play Two Truths and a Lie?',
        answer:
          'Everyone writes two true things and one lie about themselves. Each round, one person’s three statements are shown and the rest of the group guesses which one is the lie. It’s the classic icebreaker — great for getting to know a new group.',
      },
      {
        question: 'Is it good as a virtual icebreaker for work?',
        answer:
          'Yes — it’s one of the best remote-team icebreakers, and it runs in the browser over a video call with no download and no accounts. Just share a code and go.',
      },
    ],
  }),

  monopoly: landing('monopoly', {
    seoTitle: 'Monopoly — Free Online Board Game for Groups',
    seoDescription:
      'Play Monopoly online with friends. Roll dice, buy properties, pay rent, and bankrupt your opponents — all on your phones.',
    keywords: [
      'online monopoly game',
      'monopoly rules',
      'how to play monopoly',
      'free monopoly multiplayer',
      'board game night',
      'property game online',
      'play monopoly online free',
      'monopoly with friends online',
      'monopoly online multiplayer free',
      'monopoly online no download',
      'free monopoly online with friends',
      'play monopoly online with friends free no download',
    ],
    heroSubtitle:
      'Classic Monopoly on your phones. Join a room, roll the dice, buy properties, and be the last player standing.',
    bodyParagraph:
      'Monopoly on Fate Round features customizable themed editions — including classic London streets and Naija Edition — with full Chance and Community Chest decks, property auctions, houses, hotels, mortgages, and player trading. Join 2–6 players and play turn-by-turn in real time.',
    highlights: ['Full 40-space board', '2–6 players', 'Real-time turns'],
    features: [
      {
        title: 'Classic board',
        description:
          'All the familiar spaces across editions — famous properties, transport terminals, utilities, Chance, and Community Chest.',
        emoji: '🏠',
      },
      {
        title: 'Turn-based play',
        description:
          'Roll dice, buy or pass on properties, pay rent, draw cards, and manage Jail — core Monopoly rules on your phones.',
        emoji: '🎲',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Create a game',
        description: 'Set the player cap and share the link — everyone joins with their name.',
      },
      {
        title: 'Start the game',
        description: 'Everyone begins on GO with 1,500 starting cash. The host starts when ready.',
      },
      {
        title: 'Last one wins',
        description: 'Buy properties, collect rent, and bankrupt opponents until one player remains.',
      },
    ],
    perfectFor: ['Game nights', 'Family gatherings', 'Friend groups', 'Remote hangouts'],
    extraFaqs: [
      {
        question: 'How do you win at Monopoly?',
        answer:
          'Buy properties, charge rent, and manage your cash until every opponent goes bankrupt. The last solvent player left in the game wins — there’s no points total, just survival.',
      },
      {
        question: 'How much money do you start with in Monopoly?',
        answer:
          'Every player starts on GO with 1,500 starting cash in your selected edition’s currency (e.g., £1,500 or ₦1.5m), and collects 200 each time they pass GO (after their first lap around the board).',
      },
      {
        question: 'What happens when you land on an unowned property?',
        answer:
          'You can buy it from the Bank at its listed price. If you decline, it goes to auction and any player — including you — can bid. Note you can’t buy, pay tax, or draw cards until you’ve passed GO once on your first lap.',
      },
      {
        question: 'How do you get out of Jail in Monopoly?',
        answer:
          'Pay the 50 fine before your next roll, use a Get Out of Jail Free card, or roll doubles on any of your next three turns. After three turns without doubles, you pay 50 and move by your roll.',
      },
      {
        question: 'Can I set how long a Monopoly game lasts?',
        answer:
          'Yes. The host can set an optional game duration so a session doesn’t run forever — when time’s up, the richest player (cash plus property) wins. Leave it off for a classic last-player-standing game.',
      },
    ],
  }),

  yahtzee: landing('yahtzee', {
    seoTitle: 'Play Yahtzee Online Free with Friends — No Sign-Up',
    seoDescription:
      'Play Yahtzee online free with friends — no sign-up, no download. Roll five dice, hold what you want, and fill your scorecard. Solo or up to 6 players.',
    keywords: [
      'yahtzee game online',
      'yahtzee online multiplayer',
      'play yahtzee online free',
      'yahtzee with friends online',
      'yahtzee rules',
      'how to play yahtzee',
      'how many dice in yahtzee',
      'full house yahtzee',
      'yahtzee scoring',
      'yahtzee score sheet',
      'yahtzee categories',
      'small straight vs large straight',
      'yahtzee bonus rules',
      'yahtzee strategy',
      'dice game multiplayer',
      'online dice game with friends',
      'roll hold scorecard',
      'play yahtzee friends',
      'play yahtzee online with friends free',
      'yahtzee online multiplayer no download',
      'yahtzee printable scorecard',
      'yatzy online',
      'five dice game online',
      'yahtzee 2 player',
      'is yahtzee a game of luck or skill',
    ],
    heroSubtitle: 'The classic dice puzzle — score straights, full houses, and Yahtzees together.',
    bodyParagraph:
      'Yahtzee on Fate Round brings roll-and-hold dice scoring to your group online — often mistyped as Yatzee, Yahtzy, Yachtzee, Yathzee, or Tahtzee, it’s the same classic five-dice game. Roll five dice up to three times per turn, hold the ones you want, and fill your scorecard category by category — three of a kind, full house, small and large straights, chance, and the coveted Yahtzee (five of a kind). Play solo or with up to six friends — no physical scorecard or dice cup needed.',
    highlights: ['5 dice', '1–6 players', 'Turn-based scoring'],
    features: [
      {
        title: 'Roll & hold',
        description: 'Up to 3 rolls per turn. Hold dice to try for straights or a full house.',
        emoji: '🎲',
      },
      {
        title: 'Fill your card',
        description: 'Pick an unused category each turn and build the best total across all combos.',
        emoji: '🧾',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and wait for the host to start.' },
      { title: 'Take turns', description: 'Roll dice, hold the best ones, and score a category.' },
      { title: 'Win the board', description: 'Highest total score after the board fills wins.' },
    ],
    perfectFor: ['Game nights', 'Casual hangouts', 'Friend groups'],
    extraFaqs: [
      {
        question: 'How many dice do you play Yahtzee with?',
        answer:
          'Yahtzee is played with five dice. On Fate Round you roll all five on screen — no physical dice or cup needed — and hold the ones you want between rolls.',
      },
      {
        question: 'How many rolls do you get per turn in Yahtzee?',
        answer:
          'Up to three rolls per turn. After the first roll you can hold any dice you like and re-roll the rest, then do the same again. After your third roll (or sooner) you must score one unused category.',
      },
      {
        question: 'What is a full house in Yahtzee?',
        answer:
          'A full house is three dice showing one number plus two dice showing another — for example three 5s and two 2s. It scores a flat 25 points in the Full House category, no matter which numbers make it up.',
      },
      {
        question: 'How does scoring work in online Yahtzee?',
        answer:
          'Each turn you roll up to three times, holding dice between rolls, then fill one unused category. The upper section (Ones–Sixes) scores the total of those dice — reach 63+ there for a 35-point bonus. Lower-section combos pay fixed amounts: Full House 25, Small Straight 30, Large Straight 40, Yahtzee 50, with Three/Four of a Kind and Chance scoring the sum of all five dice. Highest total when every category is filled wins.',
      },
      {
        question: 'What are the odds of rolling a Yahtzee?',
        answer:
          'Getting five of a kind on a single roll of five dice is about 1 in 1,296 (roughly 0.08%). Across all three rolls in a turn, playing optimally to chase it, your odds rise to about 4.6%.',
      },
      {
        question: 'Is it spelled Yahtzee or Yatzee?',
        answer:
          'The correct spelling is Yahtzee, but it’s commonly mistyped as Yatzee, Yahtzy, Yatzy, Yachtzee, Yathzee, or Tahtzee. However you spell it, it’s the same five-dice scoring game — and you can play it free on Fate Round.',
      },
      {
        question: 'What are all the categories on a Yahtzee scorecard?',
        answer:
          'A Yahtzee scorecard has 13 categories in two sections. The upper section is Ones, Twos, Threes, Fours, Fives, and Sixes — each scores the sum of dice showing that number. The lower section is Three of a Kind, Four of a Kind, Full House (25), Small Straight (30), Large Straight (40), Yahtzee (50), and Chance. You fill exactly one category per turn, and Fate Round tracks the whole card for every player automatically.',
      },
      {
        question: 'What is the difference between a small straight and a large straight in Yahtzee?',
        answer:
          'A small straight is four dice in a run (like 3-4-5-6) and scores 30 points. A large straight is all five dice in a run (like 2-3-4-5-6) and scores 40 points. The large straight is harder to roll, which is why it pays more.',
      },
      {
        question: 'What is the Yahtzee bonus?',
        answer:
          'There are two bonuses. The upper-section bonus adds 35 points if your Ones-through-Sixes total reaches 63 or more. The Yahtzee bonus rewards extra Yahtzees: once you have already scored 50 in the Yahtzee box, every additional five-of-a-kind you roll is worth a 100-point bonus. Fate Round applies both automatically.',
      },
      {
        question: 'Is there any strategy to Yahtzee?',
        answer:
          'Yes. Prioritize the upper section early to chase the 63-point threshold for the 35-point bonus, keep Chance as a flexible fallback for a bad roll, and only zero out a category (like Yahtzee) when you have no better option. Deciding which dice to hold between rolls is where most of the skill lives.',
      },
      {
        question: 'Can you play Yahtzee solo?',
        answer:
          'Yes. Fate Round lets you start a Yahtzee room on your own and play through the full scorecard to chase a high score — no other players required. Add friends any time by sharing the room code.',
      },
      {
        question: 'Where can I find a Yahtzee scorecard?',
        answer:
          'You don’t need one — Fate Round keeps a full digital scorecard for every player automatically, tracking all 13 categories, both bonuses, and the running total. No printing, no maths, no smudged pencil columns.',
      },
      {
        question: 'Is Yahtzee luck or skill?',
        answer:
          'Both. The dice are luck, but which dice you hold, which category you fill, and when you chase the upper-section bonus are all skill — which is why a good player beats a lucky one over a full card. Fate Round handles the scoring so you can focus on the decisions.',
      },
    ],
  }),

  whot: landing('whot', {
    seoTitle: 'Play Whot Online Free with Friends — No Sign-Up',
    seoDescription:
      'Play Whot online free with friends — no sign-up, no download. Match shape or number, stack Pick 2 and Pick 3, and call WHOT. Classic Naija house rules, 2–6 players.',
    keywords: [
      'whot card game online',
      'whot rules',
      'how to play whot',
      'naija whot multiplayer',
      'nigerian whot game',
      'whot special cards',
      'play whot friends',
      'play whot online free',
      'whot online multiplayer',
      'whot game with friends',
      'whot card meanings',
      'what does whot mean',
      'whot general market',
      'whot hold on card',
      'whot pick 2 pick 3',
      'whot number cards',
      'whot vs uno',
      'whot card game how many players',
      'whot 54 card deck',
      'whot game strategy',
      'whot scoring points',
      'play whot with friends online',
    ],
    heroSubtitle: 'The Nigerian card classic — match, stack, and call WHOT on your crew.',
    bodyParagraph:
      'Whot on Fate Round runs on the Nigerian house rules everyone actually plays by — match the top card by shape or number, drop WHOT to call the next shape, and keep those Pick 2 and Pick 3 stacks separate. The special cards are where it gets loud: Hold On buys you another go, Suspension skips the next player, General Market makes everyone draw, and the WHOT card (20) bends the whole game to your will. No shuffling, no lost cards, no arguments about the rules — deal a room, share the code, and play from any phone. First to empty their hand wins. Two to six players, free forever.',
    highlights: ['54-card deck', '2–6 players', 'Naija house rules'],
    features: [
      {
        title: 'Match or WHOT',
        description: 'Play a card matching shape or number — or drop WHOT and call what comes next.',
        emoji: '🃏',
      },
      {
        title: 'Pick stacks',
        description: '2 stacks Pick 2, 5 stacks Pick 3 — separate penalties, defended only with the same number.',
        emoji: '2️⃣',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and wait for the host to deal.' },
      { title: 'Play your turn', description: 'Match the top card, defend pick stacks, or draw.' },
      { title: 'Empty your hand', description: 'First player out of cards wins the game.' },
    ],
    perfectFor: ['Game nights', 'Nigerian diaspora hangouts', 'Card game lovers'],
    extraFaqs: [
      {
        question: 'How do you win at Whot?',
        answer:
          'Be the first to play all the cards in your hand. If the game gets blocked or a game clock is running and time runs out, the player with the lowest total in hand wins instead — the WHOT card counts as 20 points.',
      },
      {
        question: 'How many cards do you start with in Whot?',
        answer:
          'Each player is dealt 5 cards (6 in a 2-player game), with one card turned face-up to start the discard pile. The host deals when everyone is ready.',
      },
      {
        question: 'What does it mean to call WHOT?',
        answer:
          'Playing the WHOT card (number 20) lets you call any shape or number the next player must match. You can override another player’s WHOT call with your own — but you can’t play WHOT to escape an active Pick 2 or Pick 3.',
      },
      {
        question: 'What are the special cards in Whot?',
        answer:
          '1 = Hold On (extra turn), 2 = Pick 2, 5 = Pick 3, 8 = Suspension (skip next player), 14 = General Market (others draw), 20 = WHOT (call shape or number). Pick 2 and Pick 3 stacks cannot be mixed.',
      },
      {
        question: 'What does WHOT mean / what is the WHOT card?',
        answer:
          'WHOT is the wild card, numbered 20. Play it on almost any card, then call the shape everyone must match next — circle, cross, triangle, square, or star. It’s your reset button when your hand doesn’t fit the pile. It’s worth 20 points if you’re caught holding it at the end, so don’t sit on it too long.',
      },
      {
        question: 'What is General Market in Whot?',
        answer:
          'General Market is the 14 card. Play it and every other player draws one card from the market while you go again — a fast way to punish the whole table at once. On Fate Round the draws happen automatically the moment you play it.',
      },
      {
        question: 'What does the Hold On card do in Whot?',
        answer:
          'Hold On is the 1 card. Play it and you take another turn immediately — everyone else is skipped for that beat. Chain a few and you can dump a big chunk of your hand before anyone else moves.',
      },
      {
        question: 'What is Suspension in Whot?',
        answer:
          'Suspension is the 8 card. It skips the next player’s turn entirely — brutal in a two-player game, where it just hands the turn straight back to you.',
      },
      {
        question: 'How do you defend against Pick 2 and Pick 3?',
        answer:
          'Play the same card back. A Pick 2 (the 2 card) can only be blocked with another 2, which passes the penalty — now stacked — to the next player; Pick 3 (the 5 card) works the same with 5s. The stacks never mix: you can’t answer a Pick 2 with a Pick 3, and you can’t escape either by playing WHOT.',
      },
      {
        question: 'How many cards are in a Whot deck?',
        answer:
          'A Whot deck has 54 cards across five shapes — circle, triangle, cross, square, and star — plus the special WHOT cards numbered 20. Fate Round handles the full deck and the market (draw pile) for you.',
      },
      {
        question: 'How is Whot scored if the game is blocked or timed?',
        answer:
          'If nobody can play or the round clock runs out, the player holding the fewest points wins. Cards score their face value and the WHOT card counts as 20 — so a light hand beats a heavy one. Empty your hand first and you win outright, no counting needed.',
      },
      {
        question: 'Is Whot like Uno?',
        answer:
          'They’re cousins. Both are shape/number-matching shedding games where you race to empty your hand, and Whot’s Pick 2, Pick 3, and WHOT card rhyme with Uno’s Draw 2, Draw 4, and Wild. Whot came first — invented in England in 1935 and popularized in Britain through the 1950s — uses shapes instead of colors, and adds Hold On and General Market. If you like Uno, Whot feels instantly familiar — and Fate Round has both.',
      },
      {
        question: 'Can I run a Whot tournament online?',
        answer:
          'Yes. Fate Round can run a Whot tournament as a head-to-head bracket, and there’s a class-based championship format for schools. Create one from the Tournaments page and share the join code — free, no app, no sign-up.',
      },
    ],
  }),
  crazy_eights: landing('crazy_eights', {
    seoTitle: 'Play Crazy Eights Online Free with Friends — No Sign-Up',
    seoDescription:
      'Play Crazy Eights online free with friends — no sign-up, no download. Match by rank or suit, play 8s as wild and name the suit, stack Pick Two, skip and reverse. 2–6 players.',
    keywords: [
      'crazy eights online',
      'crazy eights rules',
      'how to play crazy eights',
      'crazy eights card game',
      'play crazy eights friends',
      'crazy eights multiplayer',
      'crazy 8s online',
      'play crazy eights online free',
      'crazy eights with friends online',
      'crazy eights vs uno',
      'is crazy eights like uno',
      'crazy eights online free no download',
      'crazy 8s multiplayer online',
    ],
    heroSubtitle: 'The worldwide card classic — match, go wild on 8s, and empty your hand first.',
    bodyParagraph:
      'Crazy Eights on Fate Round plays by the popular action-card rules: match the top of the discard by rank or suit, play an 8 anytime to name the next suit, and use 2 (Pick Two), Jack and Ace (Skip), and Queen (Reverse) to control the table. Add Jokers for extra wildcards that make the next player draw five. First to get rid of all their cards wins.',
    highlights: ['Standard 52-card deck', '2–6 players', '8s are wild'],
    features: [
      {
        title: 'Match or go wild',
        description: 'Play a card matching rank or suit — or drop an 8 and name the suit that comes next.',
        emoji: '🎴',
      },
      {
        title: 'Action cards',
        description: '2 makes the next player draw two, Jack and Ace skip, Queen reverses the direction of play.',
        emoji: '8️⃣',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and wait for the host to deal.' },
      { title: 'Play your turn', description: 'Match by rank or suit, play an 8 to choose the suit, or draw.' },
      { title: 'Empty your hand', description: 'First player out of cards wins the game.' },
    ],
    perfectFor: ['Game nights', 'Family card games', 'Quick card breaks'],
    extraFaqs: [
      {
        question: 'How do you win at Crazy Eights?',
        answer:
          'Be the first to play all the cards in your hand. If a game clock is running and time runs out, the player with the lowest total in hand wins instead — each 8 and Joker counts as 50 points, face cards 10, aces 1.',
      },
      {
        question: 'How many cards do you start with in Crazy Eights?',
        answer:
          'Each player is dealt 5 cards (7 in a 2-player game), with one card turned face-up to start the discard pile. The host deals when everyone is ready.',
      },
      {
        question: 'Why are 8s wild?',
        answer:
          'You can play an 8 on any card, and when you do you name the suit the next player must follow — hearts, spades, clubs, or diamonds. That is the heart of the game, and why it is called "Crazy" Eights.',
      },
      {
        question: 'What are the special cards in Crazy Eights?',
        answer:
          '8 = Wild (name the suit), 2 = Pick Two (next player draws two or stacks their own 2), Jack = Skip, Queen = Reverse, Ace = Skip. With Jokers enabled, a Joker is wild and makes the next player draw five. Action cards are an optional host setting.',
      },
      {
        question: 'Is Crazy Eights like Uno?',
        answer:
          'Very much — Uno is a branded descendant of Crazy Eights. Both are match-by-rank-or-suit shedding games where you race to empty your hand, and Crazy Eights’ wild 8s and action cards mirror Uno’s Wilds and Draw/Skip/Reverse cards. If you like Uno, you already know how to play. Fate Round has both.',
      },
    ],
  }),
  ludo: landing('ludo', {
    seoTitle: 'Ludo Online — Play Classic Board Game with Friends',
    seoDescription:
      'Play Ludo online with friends. Roll two dice, race your pieces home, capture opponents, and block with pairs — classic rules.',
    keywords: [
      'ludo online',
      'ludo rules',
      'how to play ludo',
      'play ludo friends',
      'ludo board game multiplayer',
      'ludo game online free',
      'play ludo online free',
      'ludo with friends online',
      'ludo king alternative',
      'ludo 2 player',
      'ludo 4 player',
      'ludo rules for beginners',
      'ludo online no download',
      'ludo safe squares',
      'play ludo online with friends free no download',
      'naija ludo online',
    ],
    heroSubtitle: 'The classic board game — roll two dice, race, capture, and be first to get all four pieces home.',
    bodyParagraph:
      'Ludo on Fate Round follows classic rules: roll two dice and use each die separately — a 6 brings pieces onto the board, doubles (e.g. 6+6) let you play both sixes then roll again, send opponents back to their yard on capture, and form blockades with pairs. First player to finish all four pieces wins.',
    highlights: ['2–4 players', 'Classic rules', 'Real-time board'],
    features: [
      {
        title: 'Roll & move',
        description:
          'Roll two dice — use each die on its own. 6+3 brings one piece out then moves 3; 6+6 can bring out two pieces or one out then move 6. Doubles earn another roll after both dice are played.',
        emoji: '🎲',
      },
      {
        title: 'Captures & blockades',
        description: 'Land on an opponent to send them home. Stack two of your pieces to block the square.',
        emoji: '🎯',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and pick your color when the host starts.' },
      {
        title: 'Roll the dice',
        description:
          'Roll two dice — use each die separately. A 6 brings a piece out; doubles play both dice then roll again.',
      },
      { title: 'Race home', description: 'Get all four pieces into the center home triangle to win.' },
    ],
    perfectFor: ['Family game night', 'Friend groups', 'Board game fans'],
    extraFaqs: [
      {
        question: 'How do you get a piece out of your yard in Ludo?',
        answer:
          'You need to roll a 6 on one of your two dice to move a piece from your home yard onto its start square. Until at least one piece is in play, non-6 dice can’t be used — so on a 6+3 you use the 6 first, then the 3.',
      },
      {
        question: 'How do you win at Ludo?',
        answer:
          'Move all four of your pieces clockwise around the board, up your colored home column, and into the center home triangle. The first player to get all four pieces home wins; the others keep playing for runner-up places.',
      },
      {
        question: 'What happens when you land on an opponent in Ludo?',
        answer:
          'Landing on a single opponent piece on a normal square sends it back to its yard — they need a 6 to re-enter. Pieces on ★ start and safe squares can’t be captured, and stacking two of your own pieces forms a blockade opponents can’t pass.',
      },
      {
        question: 'What happens when I roll three doubles in a row?',
        answer: 'Your turn ends immediately — no move and no extra roll. Play passes to the next player.',
      },
      {
        question: 'Do I need an exact roll to finish?',
        answer: 'Yes. A piece can only enter the home triangle with an exact roll — overshooting is not allowed.',
      },
      {
        question: 'What are safe squares in Ludo?',
        answer:
          'Safe squares — the starred cells and each colour’s start square — protect your piece from capture: an opponent landing there can’t send you home. Fate Round marks the safe squares on the board and enforces them automatically.',
      },
    ],
  }),

  mahjong: landing('mahjong', {
    seoTitle: 'Mahjong Online — 4 Player Multiplayer Tile Game',
    seoDescription:
      'Play 4-player Mahjong online with friends. Draw from the wall, discard, call Chow, Pung, Kong, and Mahjong in a live multiplayer room.',
    keywords: ['mahjong online', '4 player mahjong', 'multiplayer mahjong', 'play mahjong with friends'],
    heroSubtitle:
      'A live 4-player Mahjong table — draw, discard, call melds, and complete a winning hand before the wall runs out.',
    bodyParagraph:
      'Mahjong on Fate Round is built for four players in one shared room. New players can start with Simple Mahjong, then move into Hong Kong, Riichi, or MCR rules when the table is ready. Each player gets a concealed hand, takes turns drawing from the wall and discarding, and can call Chow, Pung, Kong, or Mahjong from eligible discards.',
    highlights: ['Simple learner mode', 'Chow, Pung, Kong calls', 'Live turn timer'],
    features: [
      {
        title: 'Four seats',
        description: 'East, South, West, and North are assigned when the host starts the table.',
        emoji: '🀄',
      },
      {
        title: 'Live calls',
        description: 'React to discards with Mahjong, Pung, Kong, or left-player Chow when your hand allows it.',
        emoji: '📣',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Fill the table', description: 'Exactly four players join with names and ready up.' },
      { title: 'Draw and discard', description: 'Take turns drawing from the wall, then discard one tile.' },
      {
        title: 'Call Mahjong',
        description: 'Complete four melds and a pair, seven pairs, or thirteen orphans before the wall is empty.',
      },
    ],
    perfectFor: ['Board game nights', 'Remote friend groups', 'Tile game fans'],
    extraFaqs: [
      {
        question: 'Which Mahjong rules does this use?',
        answer:
          'The default is Simple Mahjong: 136 tiles, no flowers, draw/discard turns, Chow, Pung, Kong, concealed Kong, added Kong, Mahjong calls, standard hand validation, seven pairs, thirteen orphans, and a simple fan-based result summary. Hosts can also choose Hong Kong, Riichi, or MCR before starting.',
      },
      {
        question: 'Can I play with fewer than four people?',
        answer: 'No — this Mahjong table starts only when exactly four active players are ready.',
      },
    ],
  }),

  sudoku: landing('sudoku', {
    seoTitle: 'Sudoku — Multiplayer Puzzle Race Online',
    seoDescription:
      'Play multiplayer Sudoku online. Race your friends cell by cell — first correct answer claims the cell for +10 pts, wrong answers cost points.',
    keywords: [
      'multiplayer sudoku',
      'sudoku online',
      'puzzle race game',
      'party game sudoku',
      'play sudoku online free',
      'sudoku with friends online',
      'competitive sudoku online',
      'multiplayer sudoku online free',
      'sudoku race game',
      'online sudoku with friends',
      'sudoku online no sign up',
    ],
    heroSubtitle:
      'Everyone solves the same 9×9 puzzle. Claim cells before your friends — correct answers score +10 pts, mistakes cost −3.',
    highlights: ['Race to claim cells', 'Color-coded ownership', 'Live real-time puzzle'],
    features: [
      {
        title: 'Claim cells',
        description: 'Tap a cell and enter a number — the first correct answer locks it in your color.',
        emoji: '🔢',
      },
      {
        title: 'Risk vs reward',
        description: 'A wrong answer costs 3 points — but you can keep trying unclaimed cells.',
        emoji: '⚠️',
      },
      {
        title: 'Live scoring',
        description: "See who's claimed which cells in real time as the board fills up.",
        emoji: '⚡',
      },
      {
        title: 'No sign-up',
        description: 'Join with a name, start playing instantly.',
        emoji: '🚀',
      },
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to start the puzzle.' },
      {
        title: 'Solve the puzzle',
        description: 'Select any empty cell and tap a number to submit. Use Notes for pencil marks.',
      },
      {
        title: 'Race to the top',
        description: 'Each correct cell = +10 pts. Wrong answer = −3 pts. Most points when the puzzle is done wins.',
      },
    ],
    perfectFor: ['Puzzle fans', 'Game nights', 'Brain teasers', 'Classrooms'],
    extraFaqs: [
      {
        question: 'What happens if I submit a wrong answer?',
        answer: 'You lose 3 points, but you can try again on any cell that has not been claimed yet.',
      },
      {
        question: 'Can multiple players solve the same cell?',
        answer: 'No — the first player to submit the correct number claims that cell. Everyone else must move on.',
      },
      {
        question: 'How does multiplayer Sudoku work?',
        answer:
          'Everyone races on the same 9×9 puzzle at once. Instead of solving quietly, you compete to claim cells: submit the correct number for a cell before anyone else and it’s yours. It turns a solo puzzle into a fast, competitive race.',
      },
      {
        question: 'How does scoring work?',
        answer:
          'A correct answer scores +10 points and claims the cell; a wrong guess costs −3, so speed and accuracy both matter. Highest score when the grid is finished wins.',
      },
    ],
  }),
  i_call_on: landing('i_call_on', {
    seoTitle: 'I Call On — Free Online Party Game',
    seoDescription:
      'Play I Call On online. Call a letter, fill five categories, mark answers together — duplicates score 5, unique answers earn 10.',
    keywords: [
      'i call on',
      'stop game',
      'categories game',
      'party game online',
      'name place animal thing game',
      'scattergories online',
      'stop game online free',
      'categories game online free',
      'name place animal thing online',
      'npat game online',
      'play stop the bus game online',
    ],
    heroSubtitle:
      'The classic A–Z categories game. Someone calls a letter — everyone fills Name, Animal, Place, Thing, and Food before time runs out.',
    highlights: ['Rotating letter caller', 'Live transparent scoring', 'Duplicate detection'],
    features: [
      {
        title: 'Call the letter',
        description: 'Players take turns picking A–Z for the whole room.',
        emoji: '🔤',
      },
      {
        title: 'Mark together',
        description: 'Everyone sees who marked what — reviewers decide if answers fit the category.',
        emoji: '👀',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to start.' },
      {
        title: 'Play letters',
        description: 'While time lasts, callers pick unused A–Z letters and everyone fills all five categories.',
      },
      {
        title: 'Score together',
        description:
          "Mark the next player's sheet — duplicates score 5, unique answers score 10, everyone sees marks live.",
      },
    ],
    perfectFor: ['Classrooms', 'Road trips', 'Family game night', 'Friend groups'],
    extraFaqs: [
      {
        question: 'How does scoring work?',
        answer:
          'Each unique valid answer earns 10 points per category (50 max per round). If two or more players write the same answer in a category, everyone with that duplicate gets 5 for it. Reviewers mark whether an answer actually fits its category.',
      },
      {
        question: 'How do you play I Call On?',
        answer:
          'A letter is called, then everyone races to fill each category — Name, Animal, Place, Thing, Food — with a word starting with that letter before time runs out. It’s the classic Name-Place-Animal-Thing (Scattergories / “Stop the Bus”) game, scored so unique answers beat ones everyone else also wrote.',
      },
    ],
  }),

  word_hunt: landing('word_hunt', {
    seoTitle: 'Word Hunt — Multiplayer Boggle-Style Game Online',
    seoDescription:
      'Play Word Hunt online with friends. Race on a 4×4 letter grid — connect adjacent letters to spell words before time runs out.',
    keywords: [
      'word hunt',
      'boggle online',
      'word game multiplayer',
      'letter grid game',
      'play word hunt online free',
      'boggle with friends online',
      'boggle online multiplayer',
      'word search race game',
      'letter grid word game online',
      'word hunt with friends online',
      'boggle online free no download',
    ],
    heroSubtitle:
      'Everyone gets the same 4×4 grid — spell words from adjacent letters and rack up points before the clock hits zero.',
    highlights: ['4×4 letter grid', 'Timed race', 'Live leaderboard'],
    features: [
      {
        title: 'Connect letters',
        description: 'Drag across adjacent tiles (including diagonals) to build words of 3+ letters.',
        emoji: '🔤',
      },
      {
        title: 'Score big',
        description: '3 letters = 100 pts, 4 = 400, 5 = 800 — longer words earn even more.',
        emoji: '⭐',
      },
      {
        title: 'Live leaderboard',
        description: 'See who is finding the most words in real time.',
        emoji: '⚡',
      },
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to start the hunt.' },
      {
        title: 'Find words',
        description: 'Tap adjacent letters on the shared grid and submit valid dictionary words.',
      },
      {
        title: 'Beat the clock',
        description: 'Score as many points as you can before time runs out.',
      },
    ],
    perfectFor: ['Word game fans', 'Classrooms', 'Family game night', 'Quick party rounds'],
    extraFaqs: [
      {
        question: 'How do you play Word Hunt?',
        answer:
          'Everyone gets the same grid of letters. Spell words by tapping adjacent letters — up, down, sideways, or diagonally — and submit as many valid dictionary words as you can before the timer runs out. It’s the classic Boggle-style word race, online.',
      },
      {
        question: 'How is it scored?',
        answer:
          'Longer words are worth more points, so it pays to find the big ones, not just the easy three-letter words. Only valid dictionary words count. Highest score when the clock hits zero wins.',
      },
    ],
  }),

  tic_tac_toe: landing('tic_tac_toe', {
    seoTitle: 'Ultimate Tic-Tac-Toe Online — Play with a Friend',
    seoDescription:
      'Play Ultimate (Super) Tic-Tac-Toe online with a friend. Nine boards in one — your move sends your opponent to the next board. Win three boards in a row to win.',
    keywords: [
      'ultimate tic tac toe online',
      'super tic tac toe',
      'play tic tac toe with friends',
      'noughts and crosses online',
      'XO game online',
      'play tic tac toe online free',
      'ultimate tic tac toe rules',
      'tic tac toe 2 player online',
      'tic tac toe with friends online',
      'tic tac toe online no sign up',
      'ultimate tic tac toe online free',
    ],
    heroSubtitle: 'Ultimate Tic-Tac-Toe — nine boards in one, win three boards in a row to win it all.',
    bodyParagraph:
      'Ultimate Tic-Tac-Toe on Fate Round takes the classic game deeper: the board is nine small 3x3 boards arranged in one big 3x3 grid. Two players join a room, one is X and the other O, and the cell you play decides which board your opponent must play in next. Win a small board by lining up three of your marks inside it, and win the whole game by claiming three small boards in a row — across, down, or diagonally.',
    highlights: ['2 players', 'Nine boards in one', 'Real-time board'],
    features: [
      {
        title: 'Boards within boards',
        description: 'Nine mini Tic-Tac-Toe boards make up one giant board — strategy on two levels.',
        emoji: '🎯',
      },
      {
        title: 'Your move sends them',
        description: 'The cell you pick forces your opponent into the matching board next turn.',
        emoji: '➡️',
      },
      {
        title: 'Three boards in a row wins',
        description: 'Win three small boards across, down, or diagonally to take the whole game.',
        emoji: '🏆',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Two players join with their name — the host can join as a player too.' },
      {
        title: 'Play and send',
        description: 'Place your mark — the cell you choose sends your opponent to the matching board.',
      },
      {
        title: 'Win three boards in a row',
        description: 'Win small boards with three in a row, then line up three boards to win the game.',
      },
    ],
    perfectFor: ['Quick matches', 'Friend groups', 'Killing time'],
    extraFaqs: [
      {
        question: 'What happens if my turn timer runs out?',
        answer:
          'Your turn is skipped and play passes to the other player — you can still join back in on your next turn.',
      },
      {
        question: 'Can more than 2 people play?',
        answer:
          'No — Tic-Tac-Toe is strictly 2 players. The host can play as one of the two if they want in on the match.',
      },
      {
        question: 'How do you play Ultimate Tic-Tac-Toe?',
        answer:
          'It’s nine tic-tac-toe boards arranged in a big 3×3 grid. The square you play in decides which board your opponent must play in next. Win a small board by getting three in a row, and win the whole game by winning three small boards in a row. It turns a solved kids’ game into a real strategy battle.',
      },
      {
        question: 'How is it different from regular Tic-Tac-Toe?',
        answer:
          'Regular tic-tac-toe is easily drawn once you know it. Ultimate adds a layer — because each move sends your opponent to a specific board, you have to think several moves ahead about where you’re sending them. Far deeper, and much harder to force a draw.',
      },
    ],
  }),

  chess: landing('chess', {
    seoTitle: 'Chess Online — Play with a Friend',
    seoDescription:
      'Play chess online with a friend. Two players, full standard rules and move validation — checkmate your opponent to win. No sign-up.',
    keywords: [
      'chess online',
      'play chess online free',
      'play chess with friends',
      'chess with friends online',
      'online chess 2 player',
      'chess with a friend',
      'chess online no sign up',
      'chess rules',
      'how to play chess',
      'castling rules',
      'en passant',
      'checkmate',
      'stalemate',
      'chess clock online',
      'blitz chess online',
      'play chess online with friends free no download',
      'two player chess online',
      'chess online with link',
    ],
    heroSubtitle: 'Classic chess, head-to-head — outsmart your friend and checkmate to win.',
    bodyParagraph:
      'Chess on Fate Round is a clean two-player game of full standard chess. One player joins a room as White, the other as Black, and White moves first. Every move is validated by the rules — legal moves only, with castling, en passant, and pawn promotion all handled. Check, checkmate, stalemate, and draws are detected automatically. Add an optional chess clock — each player gets their own time bank (3, 5, or 10 minutes) that only ticks on their turn, just like online chess, and the first to flag loses.',
    highlights: ['2 players', 'Full rules', 'Real-time board'],
    features: [
      {
        title: 'Real chess rules',
        description: 'Legal moves only — castling, en passant, and promotion all handled for you.',
        emoji: '♟️',
      },
      {
        title: 'Checkmate to win',
        description: 'Check, checkmate, stalemate, and draws are detected automatically.',
        emoji: '♚',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Two players join with their name — the host can join as a player too.' },
      {
        title: 'White moves first',
        description: 'One player is White, the other Black. Tap a piece, then its destination.',
      },
      {
        title: 'Checkmate to win',
        description: 'Trap the enemy king with no legal escape. Stalemate or insufficient material is a draw.',
      },
    ],
    perfectFor: ['Quick matches', 'Friend rivalries', 'Chess fans'],
    extraFaqs: [
      {
        question: 'How does the clock work?',
        answer:
          'Each player has their own time bank that only counts down while it is their turn — making a move stops your clock and starts your opponent’s, just like chess.com. The first player to run out of time loses. Pick 3, 5, or 10 minutes each, or leave it off for an untimed match.',
      },
      {
        question: 'Can I resign?',
        answer: 'Yes — there is a Resign button during play. Resigning hands the win to your opponent.',
      },
      {
        question: 'Can more than 2 people play?',
        answer: 'No — chess is strictly 2 players. The host can play as one of the two if they want in on the match.',
      },
      {
        question: 'How do you play chess?',
        answer:
          'Each player commands 16 pieces. Pawns move forward one square (two on their first move) and capture diagonally; rooks move in straight lines; bishops diagonally; the queen any direction; the king one square; and knights in an L-shape, jumping over pieces. White moves first, then players alternate. The goal is checkmate — trapping the opposing king so it can’t escape capture. Fate Round only allows legal moves, so you can’t make an illegal one by mistake.',
      },
      {
        question: 'What is castling?',
        answer:
          'Castling is a special move that tucks your king to safety and activates a rook. If neither the king nor the chosen rook has moved, no pieces sit between them, and the king isn’t in or moving through check, the king shifts two squares toward the rook and the rook hops to the other side. Fate Round handles both kingside and queenside castling automatically.',
      },
      {
        question: 'What is en passant?',
        answer:
          'En passant (“in passing”) lets a pawn capture an enemy pawn that just advanced two squares, as if it had only moved one. You must take it on the very next move or the chance is gone. Fate Round detects and offers en passant for you.',
      },
      {
        question: 'What is the difference between checkmate and stalemate?',
        answer:
          'Checkmate ends the game: the king is in check and has no legal move to escape — the attacker wins. Stalemate is a draw: the player to move is not in check but has no legal move at all. Fate Round detects checkmate, stalemate, insufficient material, and draws automatically.',
      },
      {
        question: 'Can we play timed or blitz chess?',
        answer:
          'Yes. Turn on the chess clock and pick 3, 5, or 10 minutes each for a blitz or rapid game — your clock only ticks on your turn, and running out of time loses. Leave it off for a relaxed, untimed match.',
      },
      {
        question: 'Can I run a chess tournament online?',
        answer:
          'Yes. Fate Round can run a chess tournament as a head-to-head knockout bracket — create one from the Tournaments page, share the join code, and players battle through the rounds until there’s a champion. Free, no app, no sign-up.',
      },
    ],
  }),

  checkers: landing('checkers', {
    seoTitle: 'Checkers Online — Play Draughts with a Friend',
    seoDescription:
      'Play checkers (draughts) online with a friend. Two players, forced jumps, multi-jump chains and king promotion — capture every piece to win. No sign-up.',
    keywords: [
      'checkers online',
      'play checkers with friends',
      'online draughts 2 player',
      'checkers with a friend',
      'play checkers online free',
      'checkers with friends online',
      'checkers rules',
      'how to play checkers',
      'draughts online',
      'two player checkers online',
      'checkers online free no download',
      'checkers online no sign up',
    ],
    heroSubtitle: 'Classic checkers, head-to-head — jump your friend’s pieces and crown your kings.',
    bodyParagraph:
      'Checkers on Fate Round is standard American (8×8) draughts — the same rules most people play in the US. Two players, 12 pieces each on the dark squares only, Black moves first. Men slide one square diagonally forward; jump an adjacent opponent to capture it — and if any jump is available you must take it, chaining multiple jumps in a single turn. Reach the far row to crown a king that moves and captures one square in any direction. Capture all of your opponent’s pieces, or leave them with no legal move, to win. Draws are detected automatically (threefold repetition or the 40-move rule). Add an optional clock — each player gets their own time bank (3, 5, or 10 minutes) that only ticks on their turn.',
    highlights: ['2 players', 'Forced jumps', 'Real-time board'],
    features: [
      {
        title: 'Real checkers rules',
        description: 'Forced captures, multi-jump chains, and king promotion all handled for you.',
        emoji: '⛀',
      },
      {
        title: 'Capture to win',
        description: 'Take every enemy piece, or block their last move — wins and draws are detected automatically.',
        emoji: '👑',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Two players join with their name — the host can join as a player too.' },
      {
        title: 'Black moves first',
        description: 'One player is Black, the other Red. Tap a piece, then its diagonal destination.',
      },
      {
        title: 'Capture to win',
        description: 'Jump every enemy piece or leave them no move. Crown kings by reaching the far row.',
      },
    ],
    perfectFor: ['Quick matches', 'Friend rivalries', 'Checkers fans'],
    extraFaqs: [
      {
        question: 'Do I have to take a jump?',
        answer:
          'Yes — captures are mandatory. If any of your pieces can jump, you must make a jump that turn. If the same piece can keep jumping, you must continue the chain until it can’t. You can choose which capture to make when several are available — American rules do not require the longest capture.',
      },
      {
        question: 'Can men capture backward?',
        answer:
          'No — regular pieces (men) can only move and capture forward. Only kings, crowned on the opponent’s back row, can move and jump in all four diagonal directions.',
      },
      {
        question: 'Do kings slide across the board?',
        answer:
          'No — this is American Checkers, not International Draughts. Kings move and capture one square diagonally at a time. Flying kings that slide any distance are an International variant.',
      },
      {
        question: 'How does the clock work?',
        answer:
          'Each player has their own time bank that only counts down while it is their turn — making a move stops your clock and starts your opponent’s. The first player to run out of time loses. Pick 3, 5, or 10 minutes each, or leave it off for an untimed match.',
      },
      {
        question: 'When is a game a draw?',
        answer:
          'A draw is declared automatically if the same position repeats three times, or after 40 consecutive moves by each player with no capture and no man move.',
      },
      {
        question: 'Can more than 2 people play?',
        answer:
          'No — checkers is strictly 2 players. The host can play as one of the two if they want in on the match.',
      },
      {
        question: 'How do you play checkers?',
        answer:
          'Each player has 12 pieces on the dark squares of an 8×8 board. Men move diagonally forward one square. You capture by jumping an adjacent enemy piece into the empty square beyond — captures are forced, and you must keep jumping with the same piece while more jumps are available. Reach the far row and your piece becomes a king (one square any direction). Win by capturing all your opponent’s pieces or leaving them with no legal move.',
      },
      {
        question: 'How do you get a king in checkers?',
        answer:
          'Move one of your pieces all the way to the opponent’s back row. It’s crowned a king and can then move and capture one square diagonally in any direction. Fate Round crowns kings automatically — crowning ends a multi-jump chain.',
      },
    ],
  }),

  ayo: landing('ayo', {
    seoTitle: 'Ayo Online — Play Ayo Olopon with a Friend',
    seoDescription:
      'Play Ayo (Ayo Olopon) online — the classic Yoruba seed game. Sow anti-clockwise, capture 2s and 3s, crown Ọta. Two players, optional clock. Free, no sign-up.',
    keywords: [
      'ayo online',
      'ayo olopon',
      'play ayo with friends',
      'awale online',
      'mancala yoruba',
      'ayo game rules',
      'two player ayo online',
      'ayo online free',
    ],
    heroSubtitle: 'Sow seeds, capture 2s and 3s, and crown Ọta — the Yoruba classic, head-to-head.',
    bodyParagraph:
      "Ayo on Fate Round follows traditional Ayo Olopon rules for two players online. Twelve houses, four seeds each, sow anti-clockwise around the board — skipping the house you picked up. When your last seed lands in an opponent's house with 2 or 3 seeds, you capture those seeds and any linked opponent houses ahead with 2 or 3. If their row is empty, you must sow into it when possible. When your opponent cannot move, you sweep every seed left on the board. Most captured seeds wins. The winner is Ọta; the loser is Ọpẹ. Three straight wins makes an Ọta champion.",
    highlights: ['2 players', 'Classic capture', 'Ọta & Ọpẹ'],
    features: [
      {
        title: 'Traditional sowing',
        description: "Pick up all seeds from one house and sow anti-clockwise — into your opponent's row too.",
        emoji: '🌰',
      },
      {
        title: 'Capture 2s & 3s',
        description: 'Land your last seed in an opponent house with 2 or 3 seeds — capture linked houses too.',
        emoji: '🎯',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Two players join with their name — the host can play too.' },
      { title: 'Sow seeds', description: 'On your turn, tap one of your houses with seeds. Seeds sow anti-clockwise.' },
      { title: 'Crown Ọta', description: 'Capture the most seeds to win. Mo ki ota, mo ki ope o!' },
    ],
    perfectFor: ['Cultural game nights', 'Quick strategy duels', 'Mancala fans'],
    extraFaqs: [
      {
        question: 'What is Ọta?',
        answer:
          'In Yoruba tradition, the winner of an Ayo match is called Ọta. The loser is Ọpẹ. Three consecutive wins makes you an Ọta champion.',
      },
      {
        question: 'How does capture work?',
        answer:
          "If your last sown seed lands in an opponent's house with 2 or 3 seeds, you capture those seeds plus any linked opponent houses ahead that also have 2 or 3. If their row is empty, you must feed them when you can.",
      },
      {
        question: 'Can I play untimed?',
        answer:
          'Yes — choose Casual (no timer) when creating a room. For faster ranked play, pick 30 seconds per player or longer clocks.',
      },
    ],
  }),

  describe_it: landing('describe_it', {
    seoTitle: 'Text Charades — Online Team Word Game',
    seoDescription:
      'Play Text Charades online with friends. Split into teams, describe the secret word without saying it, and race the clock to guess the most words. No sign-up.',
    keywords: [
      'describe it game',
      'online team word game',
      'password game online',
      'catch phrase online',
      'word guessing game',
      'text charades online',
      'play describe it online free',
      'catchphrase online free',
      'team guessing game online',
      'describe the word game online',
      'password game with friends online',
      'heads up alternative online',
    ],
    heroSubtitle:
      'Split into teams, describe the word without saying it, and guess as many as you can before time runs out.',
    bodyParagraph:
      'Text Charades on Fate Round is a fast, team-based word race — like Password or Catch Phrase, online. Players join with their name and split into 2–4 teams. Each round one team is on the clock: a describer sees a secret word and types clues (without using the word), while teammates race to type the answer. Every correct guess scores a point and reveals the next word. After all the rounds, the team with the most words wins.',
    highlights: ['4–20 players', '2–4 teams', 'Race the clock'],
    features: [
      {
        title: 'Describe, don’t say it',
        description: 'The describer types clues for a secret word — but never the word itself.',
        emoji: '🗣️',
      },
      {
        title: 'Teammates race to guess',
        description: 'Everyone on the team types guesses; a correct one scores and reveals the next word.',
        emoji: '💬',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Make teams', description: 'Players join with a name and pick a team — the host sets how many teams.' },
      {
        title: 'Describe & guess',
        description: 'One teammate describes secret words while the rest race to guess them.',
      },
      {
        title: 'Most words wins',
        description: 'Add up each team’s guessed words across all rounds — highest total wins.',
      },
    ],
    perfectFor: ['Parties', 'Team building', 'Family game night', 'Big groups'],
    extraFaqs: [
      {
        question: 'How do you play Describe It?',
        answer:
          'Split into teams. Each round, one teammate gets a secret word and describes it — without saying the word itself — while the rest of their team races to guess. Guess as many as you can before the timer runs out, then it’s the next team’s turn. It’s the classic describe-and-guess party game (think Catchphrase or Password), online.',
      },
      {
        question: 'Can I use my own words?',
        answer:
          'Yes. Use the built-in word pool or upload your own list when you create the game — handy for themed rounds, inside jokes, or a work-friendly set. Great for tailoring the game to your group.',
      },
    ],
  }),

  word_rush: landing('word_rush', {
    seoTitle: 'Word Rush — Online Letter Word Game',
    seoDescription:
      'Play Word Rush online with friends. Name words that start and end with given letters — team rush or individual rounds. Dictionary-validated. No sign-up.',
    keywords: [
      'word rush game',
      'starts with ends with word game',
      'letter word game online',
      'word game with friends',
      'play word rush online free',
      'team word game online',
    ],
    heroSubtitle: 'Starts with M, ends with Y — how fast can you name a valid word?',
    bodyParagraph:
      'Word Rush is a fast letter-constraint word game. In team mode, each team gets a timed run to name as many dictionary-valid words as possible that start and end with the given letters — Monkey ✅, then instantly on to the next pair. In individual mode, everyone answers the same prompt each round and scores on the leaderboard. Choose automatic prompts from the system or manual mode where players pick the letters.',
    highlights: ['2–20 players', 'Team or solo', 'Dictionary checked'],
    features: [
      {
        title: 'Starts with / ends with',
        description: 'Every prompt gives a start letter and end letter — first valid word wins in team rush mode.',
        emoji: '🔤',
      },
      {
        title: 'Four ways to play',
        description: 'Team or individual, automatic or manual letter prompts — mix and match for your group.',
        emoji: '⚡',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Pick your mode',
        description: 'Team rush (2-minute blitz per team) or individual rounds with a leaderboard.',
      },
      {
        title: 'See the letters',
        description: 'Automatic mode generates letter pairs; manual mode lets a player enter them.',
      },
      {
        title: 'Race to answer',
        description: 'Type a real word that fits — valid answers score instantly and the next prompt appears.',
      },
    ],
    perfectFor: ['Parties', 'Classrooms', 'Word nerds', 'Quick icebreakers'],
  }),

  scrabble: landing('scrabble', {
    seoTitle: 'Scrabble Online — Play with Friends',
    seoDescription:
      'Play Scrabble online with 2–4 friends. Standard 15×15 board, premium squares, blanks, and full dictionary word-checking. No sign-up.',
    keywords: [
      'scrabble online',
      'play scrabble with friends',
      'online scrabble multiplayer',
      'word game with friends',
      'play scrabble online free',
      'scrabble with friends online',
      'scrabble rules',
      'how to play scrabble',
      'words with friends alternative',
      'scrabble online free no download',
      'online word game with friends free',
      'scrabble online no sign up',
    ],
    heroSubtitle: 'The classic crossword tile game — build words, hit the premium squares, outscore your friends.',
    bodyParagraph:
      'Scrabble on Fate Round is the classic word game for 2–4 players on a full standard 15×15 board. Draw seven tiles, take turns building interlocking words outward from the center star, and rack up points — letters are worth their standard values, and double/triple letter and word squares multiply your score. Every word you form is checked against a real dictionary, so only valid plays count. Use a blank tile as any letter, swap tiles you do not want, or pass. When the bag is empty and someone uses their last tile, the game ends and the highest score wins.',
    highlights: ['2–4 players', 'Real dictionary', 'Premium squares'],
    features: [
      {
        title: 'Real dictionary check',
        description: 'Every word is validated against a full word list — no made-up words slip through.',
        emoji: '📖',
      },
      {
        title: 'Premium squares & blanks',
        description: 'Double and triple letter/word squares, blank tiles, and the 50-point bingo bonus all handled.',
        emoji: '🔠',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: '2–4 players join with their name — the host can play too.' },
      {
        title: 'Build words',
        description:
          'Tap tiles from your rack onto the board to form words. The first word must cross the center star.',
      },
      {
        title: 'Outscore everyone',
        description: 'Hit premium squares for big points. Highest score when the tiles run out wins.',
      },
    ],
    perfectFor: ['Word lovers', 'Family game night', 'Friend rivalries'],
    extraFaqs: [
      {
        question: 'How are words checked?',
        answer:
          'Every word you form — the main word and any crosswords it creates — is checked against a standard English word list. If any of them is not a valid word, the play is rejected and you can try again.',
      },
      {
        question: 'How do blank tiles work?',
        answer:
          'A blank can stand in for any letter — you choose which when you place it. It scores zero points but lets you complete words you otherwise could not.',
      },
      {
        question: 'How do you play Scrabble?',
        answer:
          'Each player draws seven letter tiles. On your turn you build a word on the 15×15 board, connecting to tiles already down (the first word crosses the centre star). You score the letter values, boosted by any double/triple letter and word squares your tiles cover, then draw back up to seven. Play until the bag is empty and someone uses their last tile — highest score wins.',
      },
      {
        question: 'How does scoring work?',
        answer:
          'Each letter has a point value, and premium squares multiply a letter or the whole word. Playing all seven tiles in one turn earns a 50-point “bingo” bonus. Fate Round tallies every play automatically, so there’s no maths or arguing over the pad.',
      },
      {
        question: 'Can I run a Scrabble tournament online?',
        answer:
          'Yes. Fate Round can run a Scrabble tournament as a head-to-head bracket, with your chosen dictionary and clock. Create one from the Tournaments page and share the join code — free, no app, no sign-up.',
      },
    ],
  }),
  snake_and_ladder: landing('snake_and_ladder', {
    seoTitle: 'Snakes and Ladders Online — Play the Classic Board Game with Friends',
    seoDescription:
      'Play Snakes and Ladders online with friends. Roll the die, climb ladders, dodge snakes, and race to square 100. Classic rules, real-time multiplayer, no sign-up.',
    keywords: [
      'snakes and ladders online',
      'snake and ladder game',
      'snakes and ladders rules',
      'how to play snakes and ladders',
      'play snakes and ladders friends',
      'snakes and ladders multiplayer',
      'play snakes and ladders online free',
      'snakes and ladders with friends online',
      'chutes and ladders online',
      'snakes and ladders online no download',
      'snakes and ladders family game online',
      'snakes and ladders online free no sign up',
    ],
    heroSubtitle: 'The timeless race to 100 — roll the die, ride the ladders, slip down the snakes.',
    bodyParagraph:
      'Snakes and Ladders on Fate Round follows classic rules: take turns rolling a single die and moving along the 1–100 board. Land on the bottom of a ladder to climb up; land on a snake’s head to slide down to its tail. Roll a 6 to take another turn. You must land on square 100 exactly to win — overshoot and your token stays put.',
    highlights: ['2–6 players', 'Classic rules', 'Real-time board'],
    features: [
      {
        title: 'Roll & race',
        description: 'One die, one token. Move up the board and be the first to reach square 100 exactly.',
        emoji: '🎲',
      },
      {
        title: 'Ladders & snakes',
        description:
          'Ladders shoot you up the board; snakes drag you back down. The board can change everything in one roll.',
        emoji: '🪜',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join a room', description: 'Enter your name and get your color when the host starts.' },
      { title: 'Roll the die', description: 'On your turn, tap to roll and move forward. Roll a 6 to go again.' },
      { title: 'Reach 100', description: 'Climb ladders, dodge snakes, and land on 100 exactly to win.' },
    ],
    perfectFor: ['Family game night', 'Kids & all ages', 'Friend groups'],
    extraFaqs: [
      {
        question: 'How do you win at Snakes and Ladders?',
        answer:
          'Be the first player to land on square 100. You must reach it with an exact roll — if your roll would take you past 100, your token stays where it is and you try again next turn.',
      },
      {
        question: 'What happens when you land on a snake or a ladder?',
        answer:
          'Land on the bottom of a ladder and you climb straight to its top. Land on a snake’s head and you slide down to its tail. You only jump when you finish your move on that exact square.',
      },
      {
        question: 'Does rolling a 6 do anything special?',
        answer:
          'Yes — rolling a 6 earns you another roll. But roll three 6s in a row and your turn is forfeited, so press your luck carefully.',
      },
    ],
  }),
  mafia: landing('mafia', {
    seoTitle: 'Mafia Online — Play Werewolf Social Deduction Game',
    seoDescription:
      'Play Mafia (Werewolf) online with friends. Secret roles, day and night cycles, voting and strategy. Uncover the killers or eliminate the town. No sign-up.',
    keywords: [
      'mafia online',
      'play mafia with friends',
      'online werewolf game',
      'social deduction games online',
      'play werewolf online free',
      'mafia party game online',
      'mafia rules',
      'how to play mafia',
      'mafia online free no download',
      'mafia online no sign up',
    ],
    heroSubtitle: 'Trust no one — discuss, vote, and uncover the secret killers in your group.',
    bodyParagraph:
      'Mafia on Fate Round is a real-time multiplayer social deduction game. Players are secretly assigned roles: Villagers, Mafia, Doctor, or Detective. During the Night, the Mafia votes to eliminate a player, the Doctor protects a player, and the Detective investigates players alignments. During the Day, the village discusses and votes on who they suspect is Mafia. The village wins if they eliminate all Mafia; the Mafia wins if they reach parity with the village.',
    highlights: ['5–16 players', 'Secret roles', 'Voice chat supported'],
    features: [
      {
        title: 'Secret roles',
        description:
          'Assigned automatically and privately. Only you know if you are a Villager, Mafia, Doctor, or Detective.',
        emoji: '🔍',
      },
      {
        title: 'Day & night phases',
        description:
          'Automated phase transitions keep the game moving seamlessly from night actions to daytime discussions.',
        emoji: '🌒',
      },
      SHARED_FEATURES.mobile,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      {
        title: 'Join the lobby',
        description: 'Enter the room code, get your secret role assigned when the host starts.',
      },
      {
        title: 'Perform night actions',
        description: 'Mafia vote on a target, Doctor heals, Detective investigates, Villagers sleep.',
      },
      {
        title: 'Discuss and vote',
        description: 'Read the night report, debate in public chat or voice, and vote to eliminate a suspect.',
      },
    ],
    perfectFor: ['Party nights', 'Large groups', 'Strategy fans'],
    extraFaqs: [
      {
        question: 'What are the roles in the game?',
        answer:
          'The default roles are Villagers (find the Mafia), Mafia (eliminate the Villagers), Doctor (protects one player from being killed each night), and Detective (investigates one player each night to see if they are Mafia).',
      },
      {
        question: 'Can the Doctor protect themselves?',
        answer:
          'No, to keep the game balanced, the Doctor cannot select themselves for protection. They must choose another player.',
      },
    ],
  }),
  matching_pairs: landing('matching_pairs', {
    seoTitle: 'Matching Pairs — Multiplayer Memory Game Online',
    seoDescription:
      'Play Matching Pairs online with friends for free. Flip cards, match icons, build streaks and race to finish your board. No sign-up.',
    keywords: [
      'matching pairs online',
      'memory match game online',
      'multiplayer memory game',
      'flip and match game',
      'matching game with friends',
      'memory game online free',
      'matching pairs game free',
      'online memory game no sign up',
      'memory card game online',
      'concentration card game online',
    ],
    heroSubtitle:
      'Everyone gets the same icons, different layouts. Flip two cards per turn and match the pair to keep them. Build streaks, finish first, and score big.',
    highlights: ['Per-player private boards', 'Streak and placement bonuses', 'Perfect-game reward'],
    features: [
      {
        title: 'Streak bonuses',
        description: 'Match 3 in a row with no miss and earn +500 bonus points. Streaks stack!',
        emoji: '🔥',
      },
      {
        title: 'Placement reward',
        description: 'First to match every pair earns +1500. Second gets +1000. Third gets +500.',
        emoji: '🏆',
      },
      {
        title: 'Perfect game',
        description: 'Complete your board with zero wrong attempts for a +2000 accuracy bonus.',
        emoji: '⭐',
      },
      {
        title: 'No sign-up',
        description: 'Join with a name, play instantly on any device.',
        emoji: '🚀',
      },
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to pick a grid size and start.' },
      {
        title: 'Flip your cards',
        description: 'Tap two cards per turn. Icons match? They stay face-up. Miss? They flip back after 0.8 s.',
      },
      {
        title: 'Score and finish',
        description:
          'Earn 1000 pts per pair, streak bonuses for consecutive matches, and a placement bonus for finishing early.',
      },
    ],
    perfectFor: ['Family game night', 'Kids and all ages', 'Brain training', 'Party games'],
    extraFaqs: [
      {
        question: 'How does scoring work in Matching Pairs?',
        answer:
          'You earn 1000 points per matched pair. Match 3 in a row without a miss and earn a +500 streak bonus — streaks stack so 6-in-a-row gives +1000 total streak bonus. The first player to finish gets +1500, second +1000, third +500. Completing the board with zero misses adds a +2000 perfect-game bonus.',
      },
      {
        question: 'Does everyone play the same board?',
        answer:
          'Everyone sees the same set of icons, but each player gets their own independently shuffled layout — so two players can never simply copy each other. Same fairness, different challenge.',
      },
      {
        question: 'What happens if I flip two cards that do not match?',
        answer:
          'Both cards flip back face-down after 0.8 seconds. Your streak resets to 0, but you can keep playing. There is no per-miss point penalty, only missed streak opportunities.',
      },
      {
        question: 'Can I play Matching Pairs solo?',
        answer:
          'Yes — the game works with a single player. Placement bonuses apply when there are multiple players, but you can still chase the perfect-game and streak bonuses on your own.',
      },
    ],
  }),

  quiplash: landing('quiplash', {
    seoTitle: 'Quiplash Online — Free Fill-in-the-Blank Party Game',
    seoDescription:
      'Play Quiplash-style fill-in-the-blank battles online with friends. Write funny answers, vote head-to-head, and crown the wittiest player. Free, no sign-up.',
    keywords: [
      'quiplash online',
      'quiplash game online free',
      'fill in the blank party game',
      'funny answer game online',
      'jackbox quiplash alternative',
      'play quiplash with friends',
      'quiplash style game browser',
    ],
    heroSubtitle:
      'Everyone gets the same prompt — write the funniest answer you can. Answers battle head-to-head and the group votes. Most votes wins the round.',
    highlights: ['3–6 players', 'Head-to-head battles', '~10 minute games'],
    features: [
      {
        title: 'Write & vote',
        description: 'Fill in the blank, then pick the funnier answer in each battle.',
        emoji: '✍️',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a room', description: 'Pick rounds, timers, and max players (up to 6).' },
      { title: 'Share the code', description: 'Friends join from their phones with a nickname.' },
      { title: 'Battle it out', description: 'Submit answers, vote on battles, and climb the leaderboard.' },
    ],
    perfectFor: ['Party nights', 'Discord calls', 'Icebreakers', 'Remote teams'],
  }),

  quick_draw: landing('quick_draw', {
    seoTitle: 'Quick Draw Online — Free Drawing Party Game',
    seoDescription:
      'Play Quick Draw online with friends. Lie mode: Drawful-style fake titles and voting. Guess mode: draw secret words while teammates race to guess. Free, no sign-up.',
    keywords: [
      'quick draw game online',
      'drawful alternative free',
      'drawing party game browser',
      'pictionary online with friends',
      'fake title drawing game',
      'jackbox drawing game alternative',
      'draw and guess game online',
    ],
    heroSubtitle: 'Draw on your phone — fool everyone with fake titles, or race to guess what the drawer is sketching.',
    highlights: ['3–10 players', 'Lie or guess modes', '~15 minute games'],
    features: [
      {
        title: 'Two ways to play',
        description: 'Lie mode tricks the room with fake captions; Guess mode is Pictionary-style speed drawing.',
        emoji: '🎨',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a room', description: 'Pick Lie or Guess mode, rounds, and timers.' },
      { title: 'Share the code', description: 'Friends join from their phones with a nickname.' },
      { title: 'Draw & score', description: 'Fool the room or guess fast — most points wins.' },
    ],
    perfectFor: ['Party nights', 'Creative groups', 'Remote teams', 'Jackbox fans'],
  }),
  crossword: landing('crossword', {
    seoTitle: 'Crossword Race Online — Free Multiplayer Crossword Game',
    seoDescription:
      'Race friends to fill the same crossword grid in real time. Solve Across and Down clues, score per word, and be first to complete the puzzle. Free, no sign-up.',
    keywords: [
      'crossword online multiplayer',
      'crossword race game',
      'play crossword with friends online',
      'real time crossword game',
      'crossword party game browser',
      'multiplayer crossword puzzle free',
      'competitive crossword online',
    ],
    heroSubtitle:
      'Everyone gets the same grid. Read the clues, tap a cell, and type your answer. Score points for every word you finish — first to solve the whole puzzle wins.',
    highlights: ['1–20 players', 'Same grid for everyone', 'Themed puzzles'],
    features: [
      {
        title: 'Race the grid',
        description: 'Solve Across and Down clues live — completed words lock in your colour as you go.',
        emoji: '🧩',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a room', description: 'Pick a theme, difficulty, and time limit.' },
      { title: 'Share the code', description: 'Friends join from their phones with a nickname.' },
      { title: 'Solve to win', description: 'Fill words for points — first to 100% correct takes the crown.' },
    ],
    perfectFor: ['Puzzle lovers', 'Family game night', 'Commutes', 'Remote teams'],
  }),
  word_search: landing('word_search', {
    seoTitle: 'Word Search Race Online — Free Multiplayer Word Search Game',
    seoDescription:
      'Race friends to find every hidden word in the same letter grid. Drag to select words across, down, and diagonally — first to find them all wins. Free, no sign-up.',
    keywords: [
      'word search online multiplayer',
      'word search race game',
      'play word search with friends online',
      'real time word search game',
      'word search party game browser',
      'multiplayer word search free',
      'competitive word search online',
    ],
    heroSubtitle:
      'Everyone gets the same letter grid and word list. Drag from the first letter to the last to grab a hidden word — first to find them all wins.',
    highlights: ['1–20 players', 'Same grid for everyone', 'Themed puzzles'],
    features: [
      {
        title: 'Hunt the grid',
        description: 'Drag across, down, or diagonally — found words lock in your colour as you go.',
        emoji: '🔎',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a room', description: 'Pick a theme, difficulty, and time limit.' },
      { title: 'Share the code', description: 'Friends join from their phones with a nickname.' },
      { title: 'Find to win', description: 'Grab words for points — first to find them all takes the crown.' },
    ],
    perfectFor: ['Puzzle lovers', 'Family game night', 'Commutes', 'Remote teams'],
  }),
  word_scramble: landing('word_scramble', {
    seoTitle: 'Word Scramble Race Online — Free Multiplayer Unscramble Game',
    seoDescription:
      'Race friends to unscramble the same jumbled words. Type the answer fastest for a speed bonus — highest score wins. Free, no sign-up.',
    keywords: [
      'word scramble online multiplayer',
      'unscramble game with friends',
      'word scramble race game',
      'anagram party game online',
      'real time word scramble',
      'multiplayer word scramble free',
      'competitive unscramble game',
    ],
    heroSubtitle:
      'Everyone gets the same jumbled words. Type the unscrambled answer fastest for a speed bonus — highest score wins.',
    highlights: ['1–20 players', 'Same scramble for everyone', 'Quick-fire rounds'],
    features: [
      {
        title: 'Unscramble fast',
        description: 'Type the hidden word — solve it first for a speed bonus, longer words score more.',
        emoji: '🔀',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Create a room', description: 'Pick a theme, difficulty, and time limit.' },
      { title: 'Share the code', description: 'Friends join from their phones with a nickname.' },
      { title: 'Solve to win', description: 'Unscramble words for points — highest score takes the crown.' },
    ],
    perfectFor: ['Puzzle lovers', 'Family game night', 'Commutes', 'Remote teams'],
  }),

  landmine: landing('landmine', {
    seoTitle: 'Landmine — Free Online Party Word Game',
    seoDescription:
      'Play Landmine online. Type a blind answer to a category — but one common answer is a hidden mine. Dodge it to score, hit it and you’re zeroed or knocked out.',
    keywords: [
      'landmine game',
      'party word game online',
      'category bluff game',
      'word game with friends online',
      'elimination party game',
      'free party game no signup',
      'guess the safe answer game',
    ],
    heroSubtitle:
      'Pick a category, type a blind answer — but the system has secretly planted a mine on one of the obvious ones. Play it safe or play it clever.',
    highlights: ['Zero Points or Elimination', 'Peer-marked answers', 'Hidden mine each round'],
    features: [
      {
        title: 'Dodge the mine',
        description:
          'The obvious answer might be the mine — the safest word is rarely the first one that comes to mind.',
        emoji: '🧨',
      },
      {
        title: 'Mark together',
        description: 'Everyone marks the next player’s answer Valid or Void before the mine is revealed.',
        emoji: '👀',
      },
      SHARED_FEATURES.realtime,
      SHARED_FEATURES.noSignup,
    ],
    steps: [
      { title: 'Join the room', description: 'Enter your name and wait for the host to start.' },
      {
        title: 'Answer blind',
        description: 'A category is revealed and a mine is secretly planted — type one answer before time runs out.',
      },
      {
        title: 'Mark, then reveal',
        description:
          'Mark the next player’s answer, then the mine is revealed — valid answers score 10 (+5 if unique), the mine scores 0 or knocks you out.',
      },
    ],
    perfectFor: ['Friend groups', 'Party nights', 'Icebreakers', 'Family game night'],
    extraFaqs: [
      {
        question: 'How does scoring work?',
        answer:
          'A valid answer that isn’t the mine scores 10 points, plus 5 more if nobody else gave the same answer. An answer marked Void by your reviewer scores 0. Hit the mine and you score 0 for the round (Zero Points mode) or get knocked out (Elimination mode).',
      },
      {
        question: 'What’s the difference between the two modes?',
        answer:
          'Zero Points is softer — hitting the mine just scores you 0 for that round and everyone plays every round. Elimination is higher-stakes — hit the mine and you’re out, last player standing wins. Elimination plays best with 5+ players.',
      },
    ],
  }),
}

export function getGameLandingContent(slug: string): GameLandingContent | null {
  const gameType = gameTypeFromSlug(slug)
  if (!gameType) return null
  return GAME_LANDING_CONTENT[gameType]
}

export function getGameBodyParagraph(content: GameLandingContent): string {
  if (content.bodyParagraph) return content.bodyParagraph

  const cfg = gameTypeConfig(content.gameType)
  return `${cfg.label} on Fate Round runs entirely in the browser — no app download or account required. ${content.heroSubtitle} Create a game, share a short code with your group, and play together from any phone or computer in real time.`
}

export function getGameFaqs(content: GameLandingContent): GameLandingFaq[] {
  const cfg = gameTypeConfig(content.gameType)
  const label = cfg.label

  return [
    {
      question: `How many players do you need for ${label}?`,
      answer: `${label} works with ${cfg.card.players.toLowerCase()}. Create a game on Fate Round, share the link or code, and everyone joins from their browser — no sign-up required.`,
    },
    {
      question: `Is ${label} free to play online?`,
      answer: `Yes. ${label} on Fate Round is completely free — no download, no payment, and no account needed. Create a game and start playing in under a minute.`,
    },
    {
      question: `Can I play ${label} on my phone?`,
      answer: `Yes. Fate Round runs in any mobile browser. Share the room link in your group chat and everyone can play ${label} from their phone or desktop.`,
    },
    ...(content.extraFaqs ?? []),
  ]
}
