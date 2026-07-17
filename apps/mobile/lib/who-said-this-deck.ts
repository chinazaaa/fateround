/**
 * Who Said This decks (mobile parallel copy of web `src/lib/who-said-this-questions.ts` +
 * the `WstDeckEntry` shape and deck parsers from `src/lib/who-said-this.ts` /
 * `src/lib/custom-questions.ts`). Each entry is a quote (the prompt) plus 2–4 answer
 * options with one marked correct — trivia with the quote in place of the question text.
 */

/** A deck game needs at least this many questions to start. */
export const WST_DECK_MIN_ENTRIES = 2
export const WST_MIN_OPTIONS = 2
export const WST_MAX_OPTIONS = 4

export interface WstDeckEntry {
  quote: string
  options: string[]
  correctIndex: number
}

/** Popular / broadly-known quotes — the Platform deck. Correct answer is options[0]. */
export const WST_PLATFORM_DECK: WstDeckEntry[] = [
  { quote: "I'll be back.", options: ['The Terminator', 'James Bond', 'Rocky', 'John Wick'], correctIndex: 0 },
  {
    quote: 'May the Force be with you.',
    options: ['Obi-Wan Kenobi', 'Gandalf', 'Dumbledore', 'Neo'],
    correctIndex: 0,
  },
  {
    quote: "Here's looking at you, kid.",
    options: ['Rick Blaine (Casablanca)', 'Don Draper', 'James Bond', 'Jay Gatsby'],
    correctIndex: 0,
  },
  {
    quote: 'You talking to me?',
    options: ['Travis Bickle (Taxi Driver)', 'Tony Montana', 'The Joker', 'Tyler Durden'],
    correctIndex: 0,
  },
  { quote: 'Why so serious?', options: ['The Joker', 'Bane', 'The Riddler', 'Loki'], correctIndex: 0 },
  {
    quote: 'Life is like a box of chocolates.',
    options: ['Forrest Gump', 'Willy Wonka', 'Mr. Rogers', 'Ferris Bueller'],
    correctIndex: 0,
  },
  {
    quote: 'To infinity and beyond!',
    options: ['Buzz Lightyear', 'Iron Man', 'Star-Lord', 'Optimus Prime'],
    correctIndex: 0,
  },
  { quote: 'I am your father.', options: ['Darth Vader', 'Thanos', 'Scar', 'Magneto'], correctIndex: 0 },
  {
    quote: "You can't handle the truth!",
    options: ['Col. Jessup (A Few Good Men)', 'Gordon Gekko', 'Harvey Specter', 'Atticus Finch'],
    correctIndex: 0,
  },
  {
    quote: 'Just keep swimming.',
    options: ['Dory (Finding Nemo)', 'SpongeBob', 'Ariel', 'Moana'],
    correctIndex: 0,
  },
  {
    quote: 'With great power comes great responsibility.',
    options: ['Uncle Ben', 'Yoda', 'Professor X', 'Alfred'],
    correctIndex: 0,
  },
  { quote: 'Hasta la vista, baby.', options: ['The Terminator', 'Rambo', 'Neo', 'Blade'], correctIndex: 0 },
  {
    quote: 'Say hello to my little friend!',
    options: ['Tony Montana (Scarface)', 'Michael Corleone', 'Walter White', 'Vito Corleone'],
    correctIndex: 0,
  },
  {
    quote: 'Elementary, my dear Watson.',
    options: ['Sherlock Holmes', 'Hercule Poirot', 'Batman', 'Dr. House'],
    correctIndex: 0,
  },
  {
    quote: "You're gonna need a bigger boat.",
    options: ['Chief Brody (Jaws)', 'Captain Ahab', 'Jack Sparrow', 'Aquaman'],
    correctIndex: 0,
  },
  {
    quote: 'I volunteer as tribute!',
    options: ['Katniss Everdeen', 'Hermione Granger', 'Tris Prior', 'Furiosa'],
    correctIndex: 0,
  },
]

/** Restore a stored WST deck (from a library pack's `questions` — {quote, options[], correctIndex}). */
export function parseStoredWstDeck(raw: unknown): WstDeckEntry[] {
  if (!Array.isArray(raw)) return []
  const out: WstDeckEntry[] = []
  const seen = new Set<string>()
  for (const item of raw as unknown[]) {
    const obj = item as { quote?: unknown; options?: unknown; correctIndex?: unknown }
    if (typeof obj?.quote !== 'string' || !Array.isArray(obj.options) || typeof obj.correctIndex !== 'number') continue
    const quote = obj.quote.trim()
    const options = obj.options.map((o) => String(o).trim()).filter(Boolean)
    if (!quote || options.length < WST_MIN_OPTIONS || obj.correctIndex < 0 || obj.correctIndex >= options.length)
      continue
    const key = `${quote.toLowerCase()}|${options.map((o) => o.toLowerCase()).join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ quote, options: options.slice(0, WST_MAX_OPTIONS), correctIndex: obj.correctIndex })
  }
  return out
}
