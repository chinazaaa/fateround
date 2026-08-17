// Curated Naija Slang word bank for Daily Wordle — 3–7 letters, attempts scale with length
// (attempts = word_length + 1). Sourced across Pidgin, Yoruba, Igbo and Hausa so no single
// language dominates.
//
// Content policy: clean-only. Terms that read as mildly derogatory or vulgar depending on context
// (e.g. ABOKI, NYASH, OYIBO) are deliberately excluded even where they're widely known — a daily
// word can't be a slur in any tone. Each entry carries a `hint` shown after a loss, since slang
// familiarity varies by player. Shape matches the `{ word, clue }` banks in themed-words.ts.
//
// ABNORMALITY NOTE: these are loanwords with no dictionary entry — do NOT run them through the
// Scrabble dictionary validator (unlike the General English bank).

export interface WordleSlangEntry {
  word: string
  hint: string
}

export const WORDLE_NAIJA_SLANG: readonly WordleSlangEntry[] = [
  // 3 letters
  { word: 'OMO', hint: "Expression of surprise — 'OMG!' in Nigerian" },
  { word: 'OGA', hint: 'Boss, sir — the person in charge' },
  { word: 'OYA', hint: "Come on, let's go — move it!" },
  // 4 letters
  { word: 'JAPA', hint: 'To leave Nigeria for abroad' },
  { word: 'SAPA', hint: 'Broke — financial hardship' },
  { word: 'ABEG', hint: 'Please — the Pidgin beg word' },
  { word: 'BIKO', hint: "Please — the Yoruba/Igbo 'please'" },
  { word: 'CHOP', hint: 'To eat — also "chop life"' },
  { word: 'GELE', hint: 'The headwrap Yoruba women tie' },
  { word: 'JARA', hint: 'The extra — a free bonus thrown in' },
  { word: 'KOLO', hint: "Mad, crazy — 'he don kolo'" },
  { word: 'NEPA', hint: 'The power company — meaning electricity' },
  { word: 'SORO', hint: 'To speak, to talk (Yoruba)' },
  { word: 'SUYA', hint: 'Spicy grilled beef skewers' },
  { word: 'WAKA', hint: "To walk, to move — 'waka waka'" },
  { word: 'YEYE', hint: 'Nonsense, rubbish' },
  // 5 letters
  { word: 'AMEBO', hint: 'A gossiper — someone who spreads news' },
  { word: 'AJEBO', hint: 'Privileged, sheltered upbringing' },
  { word: 'AKARA', hint: 'Fried bean cakes — street food' },
  { word: 'EGUSI', hint: 'Melon seeds — the soup base' },
  { word: 'GBEGE', hint: 'Trouble, drama' },
  { word: 'KWENU', hint: 'Get lost — nonsense talk' },
  { word: 'OKOSO', hint: "Fine, okay — 'okay sir' squeezed together" },
  { word: 'SHEGE', hint: 'A hard time, trouble (Hausa)' },
  { word: 'TRYBE', hint: 'Your crew, your people' },
  { word: 'WETIN', hint: 'What — the Pidgin question word' },
  { word: 'ASIRI', hint: 'A secret' },
  { word: 'OMOBA', hint: 'Prince — a royal child' },
  // 6 letters
  { word: 'HOWFAR', hint: "'How are you?' — the Pidgin greeting" },
  { word: 'SHEMPE', hint: 'Cheap, low-quality' },
  { word: 'WAHALA', hint: 'Trouble, problem' },
  { word: 'CORPER', hint: 'A NYSC service corps member' },
  { word: 'GBASHA', hint: "To hustle, to try — 'just gba sha'" },
  { word: 'KOROPE', hint: 'Cool, laid-back (street slang)' },
  { word: 'ODOGWU', hint: 'A big man, a legend (Igbo)' },
  { word: 'OLORUN', hint: 'God (Yoruba)' },
  { word: 'OLOSHI', hint: 'Trouble, bad omen (Igbo)' },
  { word: 'SOKOYE', hint: "'Have you eaten?' (Yoruba greeting)" },
  // 7 letters
  { word: 'WAZOBIA', hint: "'Come join us' — the three-language rallying cry" },
  { word: 'OGBANJE', hint: 'A scam — 419 money tricks' },
  { word: 'FINEBOY', hint: 'A handsome guy' },
]
