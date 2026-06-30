/** Built-in This or That prompts — each shown as "optionA or optionB?" */

import { pickLeastUsed } from '@/lib/question-picker'
import { wyrQuestionKey } from '@/lib/pool-key'
import type { WyrQuestion } from '@/lib/would-you-rather-questions'

export const THIS_OR_THAT_QUESTIONS: WyrQuestion[] = [
  { optionA: 'Coffee', optionB: 'Tea' },
  { optionA: 'Cats', optionB: 'Dogs' },
  { optionA: 'Sweet', optionB: 'Savory' },
  { optionA: 'Beach', optionB: 'Mountains' },
  { optionA: 'Summer', optionB: 'Winter' },
  { optionA: 'Books', optionB: 'Movies' },
  { optionA: 'Pizza', optionB: 'Burgers' },
  { optionA: 'Early bird', optionB: 'Night owl' },
  { optionA: 'Texting', optionB: 'Calling' },
  { optionA: 'City', optionB: 'Countryside' },
  { optionA: 'Tea', optionB: 'Hot chocolate' },
  { optionA: 'Pancakes', optionB: 'Waffles' },
  { optionA: 'Netflix', optionB: 'YouTube' },
  { optionA: 'Window seat', optionB: 'Aisle seat' },
  { optionA: 'Shower in the morning', optionB: 'Shower at night' },
  { optionA: 'Salty snacks', optionB: 'Sweet snacks' },
  { optionA: 'Ketchup', optionB: 'Mustard' },
  { optionA: 'iOS', optionB: 'Android' },
  { optionA: 'Cake', optionB: 'Ice cream' },
  { optionA: 'Spicy food', optionB: 'Mild food' },
  { optionA: 'Road trip', optionB: 'Flight' },
  { optionA: 'Sunrise', optionB: 'Sunset' },
  { optionA: 'Comedy', optionB: 'Horror' },
  { optionA: 'Tacos', optionB: 'Sushi' },
  { optionA: 'Gym workout', optionB: 'Outdoor run' },
  { optionA: 'Board games', optionB: 'Video games' },
  { optionA: 'Coffee shop', optionB: 'Library' },
  { optionA: 'Mountains', optionB: 'Ocean' },
  { optionA: 'Tattoos', optionB: 'Piercings' },
  { optionA: 'Cooking', optionB: 'Ordering takeout' },
  { optionA: 'Plan everything', optionB: 'Go with the flow' },
  { optionA: 'Sweater weather', optionB: 'Tank top weather' },
  { optionA: 'Chocolate', optionB: 'Vanilla' },
  { optionA: 'Morning person', optionB: 'Evening person' },
  { optionA: 'Dine in', optionB: 'Takeout' },
  { optionA: 'Mountains cabin', optionB: 'Beach house' },
  { optionA: 'Wine', optionB: 'Beer' },
  { optionA: 'Apple', optionB: 'Orange' },
  { optionA: 'Bath', optionB: 'Shower' },
  { optionA: 'Stripes', optionB: 'Polka dots' },
  { optionA: 'Print books', optionB: 'E-books' },
  { optionA: 'Sneakers', optionB: 'Sandals' },
  { optionA: 'Tea with milk', optionB: 'Tea without milk' },
  { optionA: 'Save money', optionB: 'Spend on experiences' },
  { optionA: 'Big party', optionB: 'Small gathering' },
  { optionA: 'Sci-fi', optionB: 'Fantasy' },
  { optionA: 'Pen', optionB: 'Pencil' },
  { optionA: 'Fries', optionB: 'Onion rings' },
  { optionA: 'Hot weather', optionB: 'Cold weather' },
  { optionA: 'Smooth peanut butter', optionB: 'Crunchy peanut butter' },
  { optionA: 'Train', optionB: 'Plane' },
  { optionA: 'Day at the museum', optionB: 'Day at the park' },
  { optionA: 'Cardio', optionB: 'Weights' },
  { optionA: 'Lake', optionB: 'River' },
  { optionA: 'Dark mode', optionB: 'Light mode' },
  { optionA: 'Pasta', optionB: 'Rice' },
  { optionA: 'Concert', optionB: 'Festival' },
  { optionA: 'Camping', optionB: 'Hotel' },
  { optionA: 'Hugs', optionB: 'High fives' },
  { optionA: 'Coffee black', optionB: 'Coffee with cream' },
]

export const THIS_OR_THAT_QUESTION_COUNT = THIS_OR_THAT_QUESTIONS.length

export function pickThisOrThatQuestions(count: number, usageCounts: Map<string, number> = new Map()): WyrQuestion[] {
  return pickLeastUsed(THIS_OR_THAT_QUESTIONS, (q) => wyrQuestionKey(q.optionA, q.optionB), usageCounts, count)
}
