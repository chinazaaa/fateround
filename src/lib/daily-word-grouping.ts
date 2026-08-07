// ---------------------------------------------------------------------------
// Daily Word Grouping (Connections-style) puzzle engine
// ---------------------------------------------------------------------------
// Self-contained, no external imports. Pure functions safe for client + server.
// ---------------------------------------------------------------------------

// ---- Public types ---------------------------------------------------------

export interface WordGroup {
  category: string
  words: string[]
  difficulty: 1 | 2 | 3 | 4
}

export interface WordGroupingPuzzleResult {
  puzzleData: {
    words: string[]
    solution: {
      groups: WordGroup[]
    }
  }
  config: {
    timer: number
    totalGroups: number
    maxMistakes: number
  }
}

// ---- Seeded PRNG (LCG) ---------------------------------------------------

function createRng(seed: number) {
  let s = seed | 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0
    return (s >>> 0) / 0x100000000
  }
}

/** Fisher-Yates shuffle using the seeded RNG. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

// ---- Puzzle bank ----------------------------------------------------------

interface BankPuzzle {
  groups: [WordGroup, WordGroup, WordGroup, WordGroup]
}

/**
 * Read-only view of the built-in puzzle bank. The multiplayer start route uses this to run
 * the shared pool_usage-aware picker over the built-in bank, so play-again avoids repeats
 * even when no custom/platform pool is configured.
 */
export function getWordGroupingPuzzleBank(): { groups: WordGroup[] }[] {
  return PUZZLE_BANK.map((p) => ({ groups: p.groups.map((g) => ({ ...g, words: [...g.words] })) }))
}

const PUZZLE_BANK: BankPuzzle[] = [
  // 1
  {
    groups: [
      { category: 'Shades of blue', words: ['Navy', 'Cyan', 'Teal', 'Cobalt'], difficulty: 1 },
      { category: 'Card games', words: ['Bridge', 'Poker', 'Snap', 'Rummy'], difficulty: 2 },
      { category: 'Things that are round', words: ['Globe', 'Wheel', 'Ring', 'Coin'], difficulty: 3 },
      { category: '___ ball', words: ['Basket', 'Foot', 'Base', 'Snow'], difficulty: 4 },
    ],
  },
  // 2
  {
    groups: [
      { category: 'Baked goods', words: ['Croissant', 'Muffin', 'Scone', 'Bagel'], difficulty: 1 },
      { category: 'Musical instruments', words: ['Drum', 'Flute', 'Harp', 'Cello'], difficulty: 2 },
      { category: 'Weather phenomena', words: ['Thunder', 'Breeze', 'Drizzle', 'Frost'], difficulty: 3 },
      { category: 'Types of dance', words: ['Waltz', 'Salsa', 'Tango', 'Swing'], difficulty: 4 },
    ],
  },
  // 3
  {
    groups: [
      { category: 'Planets', words: ['Mars', 'Venus', 'Saturn', 'Mercury'], difficulty: 1 },
      { category: 'Units of time', words: ['Second', 'Minute', 'Quarter', 'Season'], difficulty: 2 },
      { category: 'Things with keys', words: ['Piano', 'Lock', 'Laptop', 'Map'], difficulty: 3 },
      { category: 'Candy bars', words: ['Bounty', 'Eclipse', 'Galaxy', 'Milky Way'], difficulty: 4 },
    ],
  },
  // 4 – Nigerian cities + overlap-bait
  {
    groups: [
      { category: 'Nigerian cities', words: ['Lagos', 'Abuja', 'Enugu', 'Kano'], difficulty: 1 },
      { category: 'Fabrics', words: ['Silk', 'Lace', 'Velvet', 'Denim'], difficulty: 2 },
      { category: 'Things that flow', words: ['River', 'Traffic', 'Current', 'Lava'], difficulty: 3 },
      { category: '___ work', words: ['Net', 'Frame', 'Team', 'Home'], difficulty: 4 },
    ],
  },
  // 5
  {
    groups: [
      // 'Date' would also fit Fruits, but a word can only occupy one of the 16 tiles —
      // keep it in the blind-___ group and use a fruit that doesn't collide.
      { category: 'Fruits', words: ['Mango', 'Plum', 'Peach', 'Fig'], difficulty: 1 },
      { category: 'Parts of a book', words: ['Spine', 'Cover', 'Index', 'Title'], difficulty: 2 },
      { category: 'Things that can be blind', words: ['Spot', 'Fold', 'Side', 'Date'], difficulty: 3 },
      { category: 'Email actions', words: ['Draft', 'Forward', 'Reply', 'Archive'], difficulty: 4 },
    ],
  },
  // 6 – Jollof ingredients + Nigerian culture
  {
    groups: [
      { category: 'Jollof rice ingredients', words: ['Tomato', 'Onion', 'Pepper', 'Rice'], difficulty: 1 },
      { category: 'Nollywood actors', words: ['Genevieve', 'Ramsey', 'Omotola', 'Funke'], difficulty: 2 },
      { category: 'Currencies', words: ['Naira', 'Pound', 'Dollar', 'Franc'], difficulty: 3 },
      { category: 'Words meaning "plenty"', words: ['Plenty', 'Surplus', 'Excess', 'Abundance'], difficulty: 4 },
    ],
  },
  // 7
  {
    groups: [
      { category: 'Dog breeds', words: ['Boxer', 'Pug', 'Pointer', 'Setter'], difficulty: 1 },
      { category: 'Kitchen tools', words: ['Whisk', 'Grater', 'Ladle', 'Tongs'], difficulty: 2 },
      { category: 'Things that pop', words: ['Corn', 'Bubble', 'Cork', 'Balloon'], difficulty: 3 },
      { category: 'Printer terms', words: ['Ink', 'Toner', 'Feed', 'Jam'], difficulty: 4 },
    ],
  },
  // 8
  {
    groups: [
      { category: 'Zodiac signs', words: ['Leo', 'Virgo', 'Libra', 'Aries'], difficulty: 1 },
      { category: 'Coffee drinks', words: ['Latte', 'Mocha', 'Espresso', 'Macchiato'], difficulty: 2 },
      { category: 'Things with legs', words: ['Table', 'Spider', 'Chair', 'Journey'], difficulty: 3 },
      { category: 'Apple ___', words: ['Sauce', 'Seed', 'Jack', 'Pie'], difficulty: 4 },
    ],
  },
  // 9
  {
    groups: [
      { category: 'Shades of red', words: ['Crimson', 'Scarlet', 'Ruby', 'Maroon'], difficulty: 1 },
      { category: 'Board games', words: ['Chess', 'Risk', 'Clue', 'Life'], difficulty: 2 },
      { category: 'Things with rings', words: ['Saturn', 'Phone', 'Tree', 'Circus'], difficulty: 3 },
      { category: 'Double ___', words: ['Dutch', 'Cross', 'Take', 'Check'], difficulty: 4 },
    ],
  },
  // 10 – West African food + overlap
  {
    groups: [
      { category: 'West African dishes', words: ['Suya', 'Egusi', 'Pounded', 'Akara'], difficulty: 1 },
      { category: 'Things that stick', words: ['Glue', 'Tape', 'Gum', 'Velcro'], difficulty: 2 },
      { category: 'Music genres', words: ['Afrobeats', 'Jazz', 'Reggae', 'Blues'], difficulty: 3 },
      { category: '___ house', words: ['Ware', 'Power', 'Green', 'Light'], difficulty: 4 },
    ],
  },
  // 11
  {
    groups: [
      { category: 'Ocean creatures', words: ['Whale', 'Squid', 'Urchin', 'Ray'], difficulty: 1 },
      { category: 'Types of jacket', words: ['Blazer', 'Parka', 'Bomber', 'Duster'], difficulty: 2 },
      { category: 'Things that break', words: ['Dawn', 'Ice', 'News', 'Record'], difficulty: 3 },
      { category: 'Sun ___', words: ['Flower', 'Burn', 'Set', 'Roof'], difficulty: 4 },
    ],
  },
  // 12
  {
    groups: [
      { category: 'Olympic sports', words: ['Fencing', 'Rowing', 'Diving', 'Boxing'], difficulty: 1 },
      { category: 'Pasta shapes', words: ['Penne', 'Fusilli', 'Rigatoni', 'Orzo'], difficulty: 2 },
      { category: 'Things with scales', words: ['Fish', 'Dragon', 'Map', 'Piano'], difficulty: 3 },
      { category: 'Fire ___', words: ['Truck', 'Place', 'Fly', 'Work'], difficulty: 4 },
    ],
  },
  // 13
  {
    groups: [
      { category: 'Trees', words: ['Oak', 'Pine', 'Maple', 'Cedar'], difficulty: 1 },
      { category: 'Things in a wallet', words: ['Card', 'Cash', 'Receipt', 'License'], difficulty: 2 },
      { category: 'Types of pitch', words: ['Sales', 'Perfect', 'Tar', 'Cricket'], difficulty: 3 },
      { category: 'Words before "stone"', words: ['Key', 'Lime', 'Mile', 'Corner'], difficulty: 4 },
    ],
  },
  // 14
  {
    groups: [
      { category: 'Vegetables', words: ['Carrot', 'Spinach', 'Celery', 'Radish'], difficulty: 1 },
      { category: 'Dances from Latin America', words: ['Samba', 'Rumba', 'Mambo', 'Cha-cha'], difficulty: 2 },
      { category: 'Things that have caps', words: ['Bottle', 'Mushroom', 'Pen', 'Salary'], difficulty: 3 },
      { category: 'Iron ___', words: ['Clad', 'Man', 'Ore', 'Curtain'], difficulty: 4 },
    ],
  },
  // 15 – Nigerian languages + overlap-bait
  {
    groups: [
      { category: 'Nigerian languages', words: ['Yoruba', 'Igbo', 'Hausa', 'Pidgin'], difficulty: 1 },
      { category: 'Precious stones', words: ['Diamond', 'Emerald', 'Opal', 'Jade'], difficulty: 2 },
      { category: 'Things that can be sharp', words: ['Tongue', 'Turn', 'Knife', 'Cheddar'], difficulty: 3 },
      { category: '___ light', words: ['Flash', 'Moon', 'Spot', 'Star'], difficulty: 4 },
    ],
  },
  // 16
  {
    groups: [
      { category: 'Hats', words: ['Beret', 'Fedora', 'Turban', 'Beanie'], difficulty: 1 },
      { category: 'Bridges', words: ['London', 'Golden', 'Tower', 'Brooklyn'], difficulty: 2 },
      { category: 'Things that run', words: ['Nose', 'River', 'Clock', 'Stocking'], difficulty: 3 },
      { category: 'Green ___', words: ['House', 'Card', 'Horn', 'Land'], difficulty: 4 },
    ],
  },
  // 17
  {
    groups: [
      { category: 'Spices', words: ['Cumin', 'Clove', 'Thyme', 'Nutmeg'], difficulty: 1 },
      { category: 'Footwear', words: ['Loafer', 'Sandal', 'Stiletto', 'Clog'], difficulty: 2 },
      { category: 'Things that bloom', words: ['Flower', 'Algae', 'Youth', 'Romance'], difficulty: 3 },
      { category: 'Black ___', words: ['Berry', 'Board', 'Smith', 'Market'], difficulty: 4 },
    ],
  },
  // 18 – Nigerian music + overlap
  {
    groups: [
      { category: 'Nigerian music artists', words: ['Burna', 'Wizkid', 'Davido', 'Tiwa'], difficulty: 1 },
      { category: 'Types of chart', words: ['Bar', 'Pie', 'Line', 'Flow'], difficulty: 2 },
      { category: 'Things that are golden', words: ['Gate', 'Rule', 'Age', 'Ratio'], difficulty: 3 },
      { category: 'Water ___', words: ['Fall', 'Mark', 'Proof', 'Melon'], difficulty: 4 },
    ],
  },
  // 19 – Around the house
  {
    groups: [
      { category: 'Furniture', words: ['Sofa', 'Bed', 'Desk', 'Shelf'], difficulty: 1 },
      { category: 'Kitchen appliances', words: ['Kettle', 'Toaster', 'Blender', 'Oven'], difficulty: 2 },
      { category: 'Things with drawers', words: ['Chest', 'Wardrobe', 'Cabinet', 'Bureau'], difficulty: 3 },
      { category: '___ room', words: ['Bath', 'Chat', 'Green', 'Rest'], difficulty: 4 },
    ],
  },
  // 20 – Time
  {
    groups: [
      { category: 'Days of the week', words: ['Monday', 'Tuesday', 'Friday', 'Sunday'], difficulty: 1 },
      { category: 'Months', words: ['January', 'March', 'July', 'November'], difficulty: 2 },
      { category: 'Long stretches of time', words: ['Century', 'Decade', 'Era', 'Epoch'], difficulty: 3 },
      { category: '___ time', words: ['Show', 'Dinner', 'Prime', 'Break'], difficulty: 4 },
    ],
  },
  // 21 – The sea
  {
    groups: [
      { category: 'Marine mammals', words: ['Whale', 'Dolphin', 'Seal', 'Otter'], difficulty: 1 },
      { category: 'Fish', words: ['Cod', 'Tuna', 'Salmon', 'Trout'], difficulty: 2 },
      { category: 'Shellfish', words: ['Crab', 'Lobster', 'Clam', 'Oyster'], difficulty: 3 },
      { category: 'Sea ___', words: ['Weed', 'Salt', 'Horse', 'Food'], difficulty: 4 },
    ],
  },
  // 22 – Cars
  {
    groups: [
      { category: 'Car parts', words: ['Wheel', 'Engine', 'Trunk', 'Hood'], difficulty: 1 },
      { category: 'Car brands', words: ['Toyota', 'Honda', 'Ford', 'Kia'], difficulty: 2 },
      { category: 'Where you find cars', words: ['Garage', 'Highway', 'Parking', 'Lot'], difficulty: 3 },
      { category: 'Race ___', words: ['Car', 'Track', 'Course', 'Horse'], difficulty: 4 },
    ],
  },
  // 23 – Around the world
  {
    groups: [
      { category: 'African countries', words: ['Ghana', 'Kenya', 'Egypt', 'Zambia'], difficulty: 1 },
      { category: 'European capitals', words: ['Rome', 'Berlin', 'Athens', 'Oslo'], difficulty: 2 },
      { category: 'Great rivers', words: ['Nile', 'Amazon', 'Danube', 'Volga'], difficulty: 3 },
      { category: 'Deserts', words: ['Sahara', 'Gobi', 'Kalahari', 'Atacama'], difficulty: 4 },
    ],
  },
  // 24 – Body
  {
    groups: [
      { category: 'Joints', words: ['Elbow', 'Knee', 'Ankle', 'Wrist'], difficulty: 1 },
      { category: 'Face features', words: ['Nose', 'Chin', 'Cheek', 'Brow'], difficulty: 2 },
      { category: 'Muscle groups', words: ['Bicep', 'Tricep', 'Quad', 'Calf'], difficulty: 3 },
      { category: 'Sense verbs', words: ['See', 'Hear', 'Smell', 'Taste'], difficulty: 4 },
    ],
  },
  // 25 – Music
  {
    groups: [
      { category: 'String instruments', words: ['Violin', 'Guitar', 'Bass', 'Banjo'], difficulty: 1 },
      { category: 'Brass instruments', words: ['Trumpet', 'Trombone', 'Tuba', 'Horn'], difficulty: 2 },
      { category: 'Musical notation', words: ['Sharp', 'Flat', 'Rest', 'Bar'], difficulty: 3 },
      { category: 'Sound ___', words: ['Bite', 'Wave', 'Track', 'Stage'], difficulty: 4 },
    ],
  },
  // 26 – Family
  {
    groups: [
      { category: 'Family members', words: ['Uncle', 'Cousin', 'Aunt', 'Sister'], difficulty: 1 },
      { category: 'Baby items', words: ['Cradle', 'Diaper', 'Bottle', 'Rattle'], difficulty: 2 },
      { category: 'Verbs meaning to nurture', words: ['Foster', 'Rear', 'Coach', 'Mentor'], difficulty: 3 },
      { category: '___ mother', words: ['Grand', 'God', 'Step', 'Fairy'], difficulty: 4 },
    ],
  },
  // 27 – Green
  {
    groups: [
      { category: 'Green vegetables', words: ['Kale', 'Broccoli', 'Peas', 'Cucumber'], difficulty: 1 },
      { category: 'Herbs', words: ['Basil', 'Parsley', 'Thyme', 'Rosemary'], difficulty: 2 },
      { category: 'Types of tea', words: ['Matcha', 'Chamomile', 'Chai', 'Oolong'], difficulty: 3 },
      { category: '___ garden', words: ['Roof', 'Rock', 'Beer', 'Zen'], difficulty: 4 },
    ],
  },
  // 28 – Superheroes + weather bait
  {
    groups: [
      { category: 'Marvel heroes', words: ['Hulk', 'Thor', 'Panther', 'Storm'], difficulty: 1 },
      { category: 'DC heroes', words: ['Batman', 'Flash', 'Robin', 'Aquaman'], difficulty: 2 },
      { category: 'Kinds of precipitation', words: ['Rain', 'Fog', 'Snow', 'Sleet'], difficulty: 3 },
      { category: 'Superhero prefix', words: ['Super', 'Wonder', 'Mighty', 'Ultra'], difficulty: 4 },
    ],
  },
  // 29 – Travel
  {
    groups: [
      { category: 'At the airport', words: ['Runway', 'Gate', 'Terminal', 'Luggage'], difficulty: 1 },
      { category: 'Types of luggage', words: ['Backpack', 'Duffle', 'Trolley', 'Case'], difficulty: 2 },
      { category: 'Flight verbs', words: ['Board', 'Land', 'Depart', 'Arrive'], difficulty: 3 },
      { category: 'Passport ___', words: ['Photo', 'Stamp', 'Control', 'Renewal'], difficulty: 4 },
    ],
  },
  // 30 – Money
  {
    groups: [
      { category: 'Foreign currencies', words: ['Yen', 'Euro', 'Peso', 'Rupee'], difficulty: 1 },
      { category: 'At the bank', words: ['Card', 'Loan', 'Vault', 'Ledger'], difficulty: 2 },
      { category: 'Money verbs', words: ['Save', 'Spend', 'Invest', 'Borrow'], difficulty: 3 },
      { category: '___ bank', words: ['Piggy', 'Blood', 'River', 'Data'], difficulty: 4 },
    ],
  },
  // 31 – In the kitchen
  {
    groups: [
      { category: 'Cooking verbs', words: ['Boil', 'Fry', 'Bake', 'Roast'], difficulty: 1 },
      { category: 'Baking ingredients', words: ['Flour', 'Sugar', 'Yeast', 'Butter'], difficulty: 2 },
      { category: 'Warm spices', words: ['Cumin', 'Ginger', 'Nutmeg', 'Clove'], difficulty: 3 },
      { category: 'Pot ___', words: ['Luck', 'Hole', 'Sticker', 'Belly'], difficulty: 4 },
    ],
  },
  // 32 – Naija food
  {
    groups: [
      { category: 'Nigerian soups', words: ['Egusi', 'Ogbono', 'Efo', 'Banga'], difficulty: 1 },
      { category: 'Nigerian street snacks', words: ['Boli', 'Suya', 'Kilishi', 'Kokoro'], difficulty: 2 },
      { category: 'Staples on the plate', words: ['Rice', 'Yam', 'Beans', 'Plantain'], difficulty: 3 },
      { category: 'Naija drinks', words: ['Zobo', 'Kunu', 'Fura', 'Chapman'], difficulty: 4 },
    ],
  },
  // 33 – Games
  {
    groups: [
      { category: 'Classic board games', words: ['Ludo', 'Cluedo', 'Backgammon', 'Monopoly'], difficulty: 1 },
      { category: 'Video game platforms', words: ['PlayStation', 'Xbox', 'Switch', 'Steam'], difficulty: 2 },
      { category: 'Playground games', words: ['Hopscotch', 'Tag', 'Marbles', 'Skipping'], difficulty: 3 },
      { category: '___ game', words: ['Board', 'Video', 'Party', 'End'], difficulty: 4 },
    ],
  },
  // 34 – Nature
  {
    groups: [
      { category: 'Trees', words: ['Birch', 'Ash', 'Willow', 'Fir'], difficulty: 1 },
      { category: 'Flowers', words: ['Rose', 'Lily', 'Daisy', 'Tulip'], difficulty: 2 },
      { category: 'Insects', words: ['Ant', 'Bee', 'Beetle', 'Wasp'], difficulty: 3 },
      { category: 'Wild ___', words: ['Fire', 'Cat', 'Life', 'Card'], difficulty: 4 },
    ],
  },
  // 35 – School
  {
    groups: [
      { category: 'School subjects', words: ['Maths', 'History', 'Physics', 'Art'], difficulty: 1 },
      { category: 'On your desk', words: ['Pen', 'Ruler', 'Eraser', 'Book'], difficulty: 2 },
      { category: 'Types of test', words: ['Quiz', 'Exam', 'Final', 'Practical'], difficulty: 3 },
      { category: '___ school', words: ['High', 'Sunday', 'Boarding', 'Music'], difficulty: 4 },
    ],
  },
  // 36 – Winter
  {
    groups: [
      { category: 'Cold things', words: ['Ice', 'Frost', 'Slush', 'Chill'], difficulty: 1 },
      { category: 'Winter sports', words: ['Ski', 'Skate', 'Sled', 'Curling'], difficulty: 2 },
      { category: 'Christmas', words: ['Carol', 'Elf', 'Reindeer', 'Wreath'], difficulty: 3 },
      { category: '___ storm', words: ['Brain', 'Snow', 'Fire', 'Thunder'], difficulty: 4 },
    ],
  },
  // 37 – Sports
  {
    groups: [
      { category: 'Ball sports', words: ['Tennis', 'Golf', 'Soccer', 'Rugby'], difficulty: 1 },
      { category: 'Sports equipment', words: ['Racket', 'Bat', 'Puck', 'Cleats'], difficulty: 2 },
      { category: 'Track & field events', words: ['Sprint', 'Hurdles', 'Relay', 'Marathon'], difficulty: 3 },
      { category: 'Sports terms', words: ['Foul', 'Goal', 'Save', 'Coach'], difficulty: 4 },
    ],
  },
  // 38 – Fashion
  {
    groups: [
      { category: 'Types of pants', words: ['Jeans', 'Slacks', 'Cargo', 'Chinos'], difficulty: 1 },
      { category: 'Shoe brands', words: ['Nike', 'Adidas', 'Puma', 'Reebok'], difficulty: 2 },
      { category: 'Accessories', words: ['Belt', 'Scarf', 'Watch', 'Bracelet'], difficulty: 3 },
      { category: 'Types of hat', words: ['Bowler', 'Fedora', 'Beret', 'Panama'], difficulty: 4 },
    ],
  },
  // 39 – Movies
  {
    groups: [
      { category: 'Movie genres', words: ['Comedy', 'Drama', 'Horror', 'Action'], difficulty: 1 },
      { category: 'Oscar categories', words: ['Picture', 'Director', 'Score', 'Screenplay'], difficulty: 2 },
      { category: 'Movie roles', words: ['Actor', 'Extra', 'Stunt', 'Voice'], difficulty: 3 },
      { category: 'Netflix ___', words: ['Chill', 'Series', 'Original', 'Special'], difficulty: 4 },
    ],
  },
  // 40 – Office life
  {
    groups: [
      { category: 'Office supplies', words: ['Stapler', 'Highlighter', 'Sticky', 'Clipboard'], difficulty: 1 },
      { category: 'Meeting terminology', words: ['Agenda', 'Minutes', 'Motion', 'Adjourn'], difficulty: 2 },
      { category: 'Office roles', words: ['Manager', 'Intern', 'Executive', 'Analyst'], difficulty: 3 },
      { category: '___ meeting', words: ['Team', 'Board', 'Family', 'Chance'], difficulty: 4 },
    ],
  },
  // 41 – Weather
  {
    groups: [
      { category: 'Kinds of rain', words: ['Drizzle', 'Shower', 'Downpour', 'Sprinkle'], difficulty: 1 },
      { category: 'Wind', words: ['Breeze', 'Gale', 'Gust', 'Draft'], difficulty: 2 },
      { category: 'Storm types', words: ['Hurricane', 'Tornado', 'Blizzard', 'Cyclone'], difficulty: 3 },
      { category: '___ weather', words: ['Fair', 'Cold', 'Rough', 'Under'], difficulty: 4 },
    ],
  },
  // 42 – Spooky
  {
    groups: [
      { category: 'Horror characters', words: ['Ghost', 'Vampire', 'Zombie', 'Witch'], difficulty: 1 },
      { category: 'Costume pieces', words: ['Cape', 'Mask', 'Wig', 'Fangs'], difficulty: 2 },
      { category: 'Halloween items', words: ['Pumpkin', 'Candy', 'Broom', 'Cauldron'], difficulty: 3 },
      { category: 'Spooky adjectives', words: ['Creepy', 'Eerie', 'Chilling', 'Haunted'], difficulty: 4 },
    ],
  },
  // 43 – Building
  {
    groups: [
      { category: 'Trades', words: ['Mason', 'Plumber', 'Electrician', 'Carpenter'], difficulty: 1 },
      { category: 'Building materials', words: ['Cement', 'Brick', 'Steel', 'Timber'], difficulty: 2 },
      { category: 'Tools', words: ['Hammer', 'Drill', 'Wrench', 'Saw'], difficulty: 3 },
      { category: '___ line', words: ['Head', 'Bottom', 'Time', 'Assembly'], difficulty: 4 },
    ],
  },
  // 44 – Feelings
  {
    groups: [
      { category: 'Positive feelings', words: ['Joy', 'Love', 'Peace', 'Hope'], difficulty: 1 },
      { category: 'Negative feelings', words: ['Anger', 'Fear', 'Grief', 'Envy'], difficulty: 2 },
      { category: 'Facial expressions', words: ['Smile', 'Frown', 'Grin', 'Scowl'], difficulty: 3 },
      { category: '___ pressure', words: ['Blood', 'Peer', 'Air', 'High'], difficulty: 4 },
    ],
  },
  // 45 – Amount
  {
    groups: [
      { category: 'Words for many', words: ['Countless', 'Numerous', 'Myriad', 'Ample'], difficulty: 1 },
      { category: 'Words for few', words: ['Scant', 'Sparse', 'Rare', 'Meagre'], difficulty: 2 },
      { category: 'Metric prefixes', words: ['Kilo', 'Mega', 'Giga', 'Tera'], difficulty: 3 },
      { category: 'Units of weight', words: ['Ounce', 'Pound', 'Gram', 'Ton'], difficulty: 4 },
    ],
  },
  // 46 – Chess
  {
    groups: [
      { category: 'Chess pieces', words: ['Knight', 'Bishop', 'Rook', 'Queen'], difficulty: 1 },
      { category: 'Chess moves', words: ['Castle', 'Pin', 'Fork', 'Skewer'], difficulty: 2 },
      { category: 'Chess openings', words: ['Sicilian', 'Italian', 'Slav', 'French'], difficulty: 3 },
      { category: '___ mate', words: ['Class', 'School', 'Room', 'Check'], difficulty: 4 },
    ],
  },
  // 47 – Sky
  {
    groups: [
      { category: 'Cloud types', words: ['Cumulus', 'Cirrus', 'Stratus', 'Nimbus'], difficulty: 1 },
      { category: 'Constellations', words: ['Orion', 'Lyra', 'Draco', 'Ursa'], difficulty: 2 },
      { category: 'Aircraft', words: ['Jet', 'Chopper', 'Glider', 'Balloon'], difficulty: 3 },
      { category: '___ ship', words: ['Space', 'Air', 'War', 'Flag'], difficulty: 4 },
    ],
  },
  // 48 – Communication
  {
    groups: [
      { category: 'Ways to message', words: ['Email', 'Text', 'Call', 'Fax'], difficulty: 1 },
      { category: 'Postal terms', words: ['Stamp', 'Envelope', 'Zipcode', 'Address'], difficulty: 2 },
      { category: 'News media', words: ['Paper', 'Radio', 'Podcast', 'Blog'], difficulty: 3 },
      { category: 'Voice ___', words: ['Note', 'Mail', 'Actor', 'Over'], difficulty: 4 },
    ],
  },
]

// ---- Main generator -------------------------------------------------------

export function generateWordGroupingPuzzle(seed: number, timer: number): WordGroupingPuzzleResult {
  const rng = createRng(seed)

  // Pick a puzzle deterministically
  const idx = ((seed % PUZZLE_BANK.length) + PUZZLE_BANK.length) % PUZZLE_BANK.length
  const puzzle = PUZZLE_BANK[idx]

  // Collect all 16 words, then shuffle
  const allWords = puzzle.groups.flatMap((g) => g.words)
  const shuffled = shuffle(allWords, rng)

  return {
    puzzleData: {
      words: shuffled,
      solution: {
        groups: puzzle.groups.map((g) => ({ ...g, words: [...g.words] })),
      },
    },
    config: {
      timer,
      totalGroups: 4,
      maxMistakes: 4,
    },
  }
}

// ---- Admin content generator ----------------------------------------------

export function generateWordGroupingFromContent(
  adminContent: unknown,
  seed: number,
  timer: number
): WordGroupingPuzzleResult | null {
  let puzzle: unknown = adminContent

  // Support an array of puzzles (pick one by seed)
  if (Array.isArray(adminContent)) {
    if (adminContent.length === 0) return null
    const idx = ((seed % adminContent.length) + adminContent.length) % adminContent.length
    puzzle = adminContent[idx]
  }

  if (!puzzle || typeof puzzle !== 'object') return null

  const content = puzzle as Record<string, unknown>
  if (!Array.isArray(content.groups)) return null

  const groups = content.groups as unknown[]
  if (groups.length !== 4) return null

  const parsed: WordGroup[] = []

  for (const raw of groups) {
    if (!raw || typeof raw !== 'object') return null
    const g = raw as Record<string, unknown>

    if (typeof g.category !== 'string' || !g.category.trim()) return null
    if (!Array.isArray(g.words) || g.words.length !== 4) return null
    if (!g.words.every((w) => typeof w === 'string' && w.trim())) return null

    const diff = Number(g.difficulty)
    if (![1, 2, 3, 4].includes(diff)) return null

    parsed.push({
      category: g.category.trim(),
      words: (g.words as string[]).map((w) => w.trim()),
      difficulty: diff as 1 | 2 | 3 | 4,
    })
  }

  // Verify exactly 16 unique words
  const allWords = parsed.flatMap((g) => g.words)
  if (allWords.length !== 16) return null
  const unique = new Set(allWords.map((w) => w.toLowerCase()))
  if (unique.size !== 16) return null

  const rng = createRng(seed)
  const shuffled = shuffle(allWords, rng)

  return {
    puzzleData: {
      words: shuffled,
      solution: { groups: parsed },
    },
    config: {
      timer,
      totalGroups: 4,
      maxMistakes: 4,
    },
  }
}
