import type { WstDeckEntry } from '@/lib/who-said-this'

/**
 * Built-in Who Said This decks. The "Platform" deck is a general, broadly-known set of famous
 * lines (not everyone watches anime, so this is the default). The anime deck ships as a Library
 * pack (see the migration) for people who want it. Each entry is a quote plus four options with
 * the correct speaker first — options are shuffled per round at game start.
 */

/** Popular / broadly-known quotes — the Platform deck. Correct answer is options[0]. */
export const WST_PLATFORM_DECK: WstDeckEntry[] = [
  { quote: "I'll be back.", options: ['The Terminator', 'James Bond', 'Rocky', 'John Wick'], correctIndex: 0 },
  { quote: 'May the Force be with you.', options: ['Obi-Wan Kenobi', 'Gandalf', 'Dumbledore', 'Neo'], correctIndex: 0 },
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
  {
    quote: 'Why so serious?',
    options: ['The Joker', 'Bane', 'The Riddler', 'Loki'],
    correctIndex: 0,
  },
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
  {
    quote: 'I am your father.',
    options: ['Darth Vader', 'Thanos', 'Scar', 'Magneto'],
    correctIndex: 0,
  },
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
  {
    quote: 'Hasta la vista, baby.',
    options: ['The Terminator', 'Rambo', 'Neo', 'Blade'],
    correctIndex: 0,
  },
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

/** Iconic anime lines — shipped as a Library pack for who_said_this. Correct answer is options[0]. */
export const WST_ANIME_DECK: WstDeckEntry[] = [
  { quote: 'Believe it!', options: ['Naruto Uzumaki', 'Luffy', 'Ichigo', 'Goku'], correctIndex: 0 },
  {
    quote: "I'm gonna be King of the Pirates!",
    options: ['Monkey D. Luffy', 'Naruto', 'Natsu', 'Eren'],
    correctIndex: 0,
  },
  { quote: 'Plus Ultra!', options: ['All Might', 'Deku', 'Bakugo', 'Endeavor'], correctIndex: 0 },
  {
    quote: 'People die when they are killed.',
    options: ['Shirou Emiya', 'Kirito', 'Light Yagami', 'Lelouch'],
    correctIndex: 0,
  },
  { quote: 'I am justice!', options: ['Light Yagami', 'L', 'Lelouch', 'Kira (fan)'], correctIndex: 0 },
  { quote: 'Tatakae. (Fight.)', options: ['Eren Yeager', 'Mikasa', 'Levi', 'Armin'], correctIndex: 0 },
  {
    quote: 'Omae wa mou shindeiru. (You are already dead.)',
    options: ['Kenshiro', 'Guts', 'Saitama', 'Vegeta'],
    correctIndex: 0,
  },
  { quote: "It's over 9000!", options: ['Vegeta', 'Goku', 'Piccolo', 'Krillin'], correctIndex: 0 },
  { quote: 'Bankai!', options: ['Ichigo Kurosaki', 'Naruto', 'Natsu', 'Yusuke'], correctIndex: 0 },
  {
    quote: 'I want to be the very best, like no one ever was.',
    options: ['Ash Ketchum', 'Gon', 'Tanjiro', 'Yugi'],
    correctIndex: 0,
  },
]
