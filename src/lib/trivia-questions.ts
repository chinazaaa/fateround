import type { TriviaCategory, TriviaQuestion } from '@/types'
import { pickLeastUsed } from '@/lib/question-picker'

export const TRIVIA_QUESTION_COUNT = 40

export const TRIVIA_TECH_QUESTIONS: TriviaQuestion[] = [
  {
    question: 'What does HTTP stand for?',
    choices: [
      'HyperText Transfer Protocol',
      'High Transfer Text Protocol',
      'Hyperlink Text Transmission',
      'Host Transfer Terminal Protocol',
    ],
    correctIndex: 0,
    category: 'tech',
  },
  {
    question: 'Which company created the Python programming language?',
    choices: ['Microsoft', 'No single company — it is open source', 'Google', 'Apple'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'What year was the first iPhone released?',
    choices: ['2005', '2007', '2009', '2010'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'What does CPU stand for?',
    choices: ['Central Processing Unit', 'Computer Personal Unit', 'Core Program Utility', 'Central Power Unit'],
    correctIndex: 0,
    category: 'tech',
  },
  {
    question: 'Which protocol is used for secure web browsing?',
    choices: ['FTP', 'HTTP', 'HTTPS', 'SMTP'],
    correctIndex: 2,
    category: 'tech',
  },
  {
    question: 'Git is primarily used for what?',
    choices: ['Image editing', 'Version control', 'Video streaming', 'Database queries'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'What does API stand for?',
    choices: [
      'Application Programming Interface',
      'Automated Process Integration',
      'Advanced Protocol Internet',
      'Application Protocol Index',
    ],
    correctIndex: 0,
    category: 'tech',
  },
  {
    question: 'Which language runs in the browser?',
    choices: ['Python', 'Java', 'JavaScript', 'C++'],
    correctIndex: 2,
    category: 'tech',
  },
  {
    question: 'What is the default port for HTTPS?',
    choices: ['80', '443', '8080', '22'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'RAM is what type of memory?',
    choices: ['Permanent storage', 'Volatile temporary memory', 'Optical storage', 'Magnetic tape'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'Which company developed the Android OS (original lead)?',
    choices: ['Apple', 'Google', 'Android Inc. (later acquired by Google)', 'Samsung'],
    correctIndex: 2,
    category: 'tech',
  },
  {
    question: 'What does SQL stand for?',
    choices: ['Structured Query Language', 'Simple Question Logic', 'System Quality Layer', 'Standard Queue List'],
    correctIndex: 0,
    category: 'tech',
  },
  {
    question: 'Bluetooth is named after a king from which country?',
    choices: ['Sweden', 'Denmark', 'Norway', 'England'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'Which data structure is LIFO?',
    choices: ['Queue', 'Stack', 'Linked list', 'Hash map'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'What does DNS do?',
    choices: ['Encrypts files', 'Maps domain names to IP addresses', 'Compresses images', 'Routes email only'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'Linux is based on which kernel?',
    choices: ['Windows NT', 'Unix', 'Linux kernel (Unix-like)', 'macOS kernel'],
    correctIndex: 2,
    category: 'tech',
  },
  {
    question: 'What does SSD stand for?',
    choices: ['Solid State Drive', 'Super Speed Disk', 'System Storage Device', 'Secure Software Drive'],
    correctIndex: 0,
    category: 'tech',
  },
  {
    question: 'Which company created TypeScript?',
    choices: ['Facebook', 'Microsoft', 'Google', 'Mozilla'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'What is the binary representation of decimal 10?',
    choices: ['1010', '1100', '1001', '1110'],
    correctIndex: 0,
    category: 'tech',
  },
  {
    question: 'OAuth is mainly used for what?',
    choices: ['File compression', 'Authorization / delegated access', 'Hardware drivers', 'DNS resolution'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'Which is a NoSQL database?',
    choices: ['PostgreSQL', 'MySQL', 'MongoDB', 'SQLite'],
    correctIndex: 2,
    category: 'tech',
  },
  {
    question: 'What does VPN stand for?',
    choices: ['Virtual Private Network', 'Verified Public Node', 'Variable Protocol Name', 'Visual Packet Network'],
    correctIndex: 0,
    category: 'tech',
  },
  {
    question: 'HTML is used to structure what?',
    choices: ['Databases', 'Web pages', 'Operating systems', 'Network cables'],
    correctIndex: 1,
    category: 'tech',
  },
  {
    question: 'Which company owns GitHub?',
    choices: ['Amazon', 'Google', 'Microsoft', 'Meta'],
    correctIndex: 2,
    category: 'tech',
  },
  {
    question: 'What does IoT stand for?',
    choices: ['Internet of Things', 'Index of Technology', 'Integrated Online Tools', 'Internal Operations Terminal'],
    correctIndex: 0,
    category: 'tech',
  },
]

export const TRIVIA_GENERAL_QUESTIONS: TriviaQuestion[] = [
  {
    question: 'What is the capital of France?',
    choices: ['Lyon', 'Paris', 'Marseille', 'Bordeaux'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'How many continents are there?',
    choices: ['5', '6', '7', '8'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'Which planet is known as the Red Planet?',
    choices: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'Who painted the Mona Lisa?',
    choices: ['Michelangelo', 'Leonardo da Vinci', 'Raphael', 'Donatello'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'What is the largest ocean on Earth?',
    choices: ['Atlantic', 'Indian', 'Pacific', 'Arctic'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'How many sides does a hexagon have?',
    choices: ['5', '6', '7', '8'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'Which gas do plants absorb from the atmosphere?',
    choices: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'What is the chemical symbol for gold?',
    choices: ['Go', 'Gd', 'Au', 'Ag'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'In which country would you find the Great Pyramid of Giza?',
    choices: ['Greece', 'Mexico', 'Egypt', 'Peru'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'What is the hardest natural substance on Earth?',
    choices: ['Gold', 'Iron', 'Diamond', 'Quartz'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'Who wrote "Romeo and Juliet"?',
    choices: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'What is the smallest prime number?',
    choices: ['0', '1', '2', '3'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'Which sport is played at Wimbledon?',
    choices: ['Golf', 'Cricket', 'Tennis', 'Rugby'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'What is the main ingredient in hummus?',
    choices: ['Lentils', 'Chickpeas', 'Black beans', 'Peas'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'How many players are on a standard soccer team on the field?',
    choices: ['9', '10', '11', '12'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'Which country is home to the kangaroo?',
    choices: ['South Africa', 'Australia', 'Brazil', 'India'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'What is the boiling point of water at sea level (°C)?',
    choices: ['90', '100', '110', '120'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'Which instrument has 88 keys?',
    choices: ['Guitar', 'Violin', 'Piano', 'Flute'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'What is the longest river in the world?',
    choices: ['Amazon', 'Nile', 'Yangtze', 'Mississippi'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'Which element has the atomic number 1?',
    choices: ['Helium', 'Hydrogen', 'Lithium', 'Oxygen'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'In what year did World War II end?',
    choices: ['1943', '1944', '1945', '1946'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'What is the currency of Japan?',
    choices: ['Won', 'Yuan', 'Yen', 'Ringgit'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'Which organ pumps blood through the body?',
    choices: ['Lungs', 'Liver', 'Heart', 'Kidneys'],
    correctIndex: 2,
    category: 'general',
  },
  {
    question: 'What is the tallest mammal?',
    choices: ['Elephant', 'Giraffe', 'Blue whale', 'Ostrich'],
    correctIndex: 1,
    category: 'general',
  },
  {
    question: 'How many days are in a leap year?',
    choices: ['364', '365', '366', '367'],
    correctIndex: 2,
    category: 'general',
  },
]

export function triviaQuestionKey(q: TriviaQuestion): string {
  return q.question.trim().toLowerCase()
}

export function platformTriviaPool(category: TriviaCategory): TriviaQuestion[] {
  return category === 'tech' ? TRIVIA_TECH_QUESTIONS : TRIVIA_GENERAL_QUESTIONS
}

export function pickTriviaQuestions(
  count: number,
  category: TriviaCategory,
  usageCounts: Map<string, number> = new Map()
): TriviaQuestion[] {
  const pool = platformTriviaPool(category)
  return pickLeastUsed(pool, triviaQuestionKey, usageCounts, count)
}

const TRIVIA_CAT_LABELS: Record<string, string> = {
  tech: 'Tech',
  general: 'General knowledge',
  art: 'Art',
  food: 'Food',
  geography: 'Geography',
  history: 'History',
  language: 'Language',
  literature: 'Literature',
  math: 'Math',
  movies: 'Movies',
  music: 'Music',
  nature: 'Nature',
  pop_culture: 'Pop Culture',
  science: 'Science',
  sports: 'Sports',
  technology: 'Technology',
  world_culture: 'World Culture',
}

/**
 * Display label for a stored category.
 *
 * Takes a loose string because the read sites (lobby chips, host panels) get the column
 * straight off the game row. Anything unrecognised falls back to the general label rather
 * than leaking a raw enum value like `pop_culture` into the UI.
 */
export function triviaCategoryLabel(category: string | null | undefined): string {
  return (category && TRIVIA_CAT_LABELS[category]) || TRIVIA_CAT_LABELS.general
}

/**
 * Options for a category picker, in display order — the single list behind the create page
 * and the lobby edit sheet. Both used to hand-maintain their own array, and the lobby one
 * had drifted down to just Tech/General, so re-opening the settings of a Maths room showed
 * "General" preselected.
 */
export const TRIVIA_CATEGORY_OPTIONS: readonly { value: TriviaCategory; label: string }[] = (
  Object.keys(TRIVIA_CAT_LABELS) as TriviaCategory[]
)
  .map((value) => ({
    // The picker spells out what "general" draws from; chips use the short label.
    value,
    label: value === 'general' ? 'General (All Categories)' : TRIVIA_CAT_LABELS[value],
  }))
  .sort((a, b) => (a.value === 'general' ? -1 : b.value === 'general' ? 1 : a.label.localeCompare(b.label)))
