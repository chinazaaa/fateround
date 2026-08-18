// Built-in seed for the pilot "Church & youth" collection.
//
// Each dataset is inserted as a normal APPROVED question_packs row (author 'Fate Round') and then
// linked to the collection via question_pack_collections. The `questions` shape MUST match what the
// custom-pool parser stores for that game_type (see src/lib/custom-questions.ts):
//   - trivia:       { question, choices: string[], correctIndex, category? }
//   - this_or_that: { optionA, optionB }
// Admins can edit or extend these afterwards from /admin/library and /admin/collections.

export const SEED_AUTHOR = 'Fate Round'

export interface SeedDataset {
  title: string
  game_type: string
  description: string
  tags: string[]
  questions: unknown[]
}

export interface SeedCollection {
  slug: string
  name: string
  description: string
  audience: string
  icon: string
  sort_order: number
  datasets: SeedDataset[]
}

const BIBLE_TRIVIA: SeedDataset = {
  title: 'Bible Trivia',
  game_type: 'trivia',
  description: 'General-knowledge questions drawn from the Bible — great for church and youth groups.',
  tags: ['family-friendly'],
  questions: [
    { question: 'Who built the ark?', choices: ['Noah', 'Moses', 'Abraham', 'David'], correctIndex: 0 },
    {
      question: 'How many days and nights did it rain during the flood?',
      choices: ['7', '12', '40', '100'],
      correctIndex: 2,
    },
    {
      question: 'Who led the Israelites out of Egypt?',
      choices: ['Aaron', 'Moses', 'Joshua', 'Joseph'],
      correctIndex: 1,
    },
    {
      question: 'What is the first book of the Bible?',
      choices: ['Exodus', 'Genesis', 'Psalms', 'Matthew'],
      correctIndex: 1,
    },
    {
      question: 'Who was thrown into the lions’ den?',
      choices: ['Daniel', 'Jonah', 'Elijah', 'Peter'],
      correctIndex: 0,
    },
    {
      question: 'Which sea did Moses part?',
      choices: ['Dead Sea', 'Sea of Galilee', 'Red Sea', 'Mediterranean'],
      correctIndex: 2,
    },
    { question: 'How many disciples did Jesus have?', choices: ['7', '10', '12', '40'], correctIndex: 2 },
    {
      question: 'Who betrayed Jesus for thirty pieces of silver?',
      choices: ['Peter', 'Judas', 'Thomas', 'John'],
      correctIndex: 1,
    },
    {
      question: 'In which town was Jesus born?',
      choices: ['Nazareth', 'Jerusalem', 'Bethlehem', 'Capernaum'],
      correctIndex: 2,
    },
    {
      question: 'Who was swallowed by a great fish?',
      choices: ['Jonah', 'Job', 'Joshua', 'Jeremiah'],
      correctIndex: 0,
    },
    {
      question: 'What did God create on the first day?',
      choices: ['Animals', 'Light', 'Man', 'Water'],
      correctIndex: 1,
    },
    {
      question: 'Who was the strongest man in the Bible?',
      choices: ['Samson', 'Goliath', 'Saul', 'Gideon'],
      correctIndex: 0,
    },
    {
      question: 'Which apostle walked on water toward Jesus?',
      choices: ['John', 'Peter', 'Andrew', 'Philip'],
      correctIndex: 1,
    },
    { question: 'How many books are in the New Testament?', choices: ['27', '39', '66', '12'], correctIndex: 0 },
    {
      question: 'Who wrote most of the New Testament letters?',
      choices: ['Peter', 'Luke', 'Paul', 'James'],
      correctIndex: 2,
    },
    {
      question: 'What was the first miracle of Jesus?',
      choices: ['Feeding 5000', 'Water into wine', 'Healing a blind man', 'Calming a storm'],
      correctIndex: 1,
    },
  ],
}

const BIBLE_CHOICES: SeedDataset = {
  title: 'Bible Choices',
  game_type: 'this_or_that',
  description: 'Would-you-rather style choices with a biblical twist. Light, fun, no wrong answers.',
  tags: ['family-friendly'],
  questions: [
    { optionA: 'Old Testament', optionB: 'New Testament' },
    { optionA: 'Psalms', optionB: 'Proverbs' },
    { optionA: 'Moses', optionB: 'Elijah' },
    { optionA: 'David', optionB: 'Solomon' },
    { optionA: 'Peter', optionB: 'Paul' },
    { optionA: 'The parting of the Red Sea', optionB: 'The feeding of the 5000' },
    { optionA: 'Sunday service', optionB: 'Midweek bible study' },
    { optionA: 'Worship songs', optionB: 'Hymns' },
    { optionA: 'Noah’s ark', optionB: 'Daniel in the lions’ den' },
    { optionA: 'Bethlehem', optionB: 'Jerusalem' },
    { optionA: 'Faith', optionB: 'Works' },
    { optionA: 'Loaves', optionB: 'Fishes' },
  ],
}

export const SEED_COLLECTIONS: SeedCollection[] = [
  {
    slug: 'church',
    name: 'Church & youth group games',
    description:
      'Bible-themed datasets that run on the games you already know — trivia, this-or-that and more. Perfect for church groups, Sunday school and youth nights.',
    audience: 'Church & youth',
    icon: '⛪',
    sort_order: 10,
    datasets: [BIBLE_TRIVIA, BIBLE_CHOICES],
  },
]
