export interface WordGroupingPuzzle {
  groups: Array<{
    category: string
    words: [string, string, string, string]
    difficulty: 1 | 2 | 3 | 4
  }>
}

export const WORD_GROUPING_BANK: WordGroupingPuzzle[] = [
  // Puzzle 1
  {
    groups: [
      { category: 'Card suits', words: ['HEART', 'DIAMOND', 'CLUB', 'SPADE'], difficulty: 1 },
      { category: 'Shapes', words: ['CIRCLE', 'SQUARE', 'TRIANGLE', 'OVAL'], difficulty: 2 },
      { category: '___ stone', words: ['KEY', 'MILE', 'LIME', 'SAND'], difficulty: 3 },
      { category: 'Things with holes', words: ['DONUT', 'NEEDLE', 'BAGEL', 'VOLCANO'], difficulty: 4 },
    ],
  },
  // Puzzle 2
  {
    groups: [
      { category: 'Planets', words: ['MARS', 'VENUS', 'SATURN', 'MERCURY'], difficulty: 1 },
      { category: 'Chocolate bars', words: ['SNICKERS', 'BOUNTY', 'TWIX', 'KITKAT'], difficulty: 2 },
      { category: 'Car brands', words: ['JAGUAR', 'MUSTANG', 'BEETLE', 'PINTO'], difficulty: 3 },
      { category: 'Also an animal', words: ['RAM', 'IMPALA', 'VIPER', 'FALCON'], difficulty: 4 },
    ],
  },
  // Puzzle 3
  {
    groups: [
      { category: 'Colors of the rainbow', words: ['RED', 'ORANGE', 'VIOLET', 'INDIGO'], difficulty: 1 },
      { category: 'Fruits', words: ['MANGO', 'LEMON', 'LIME', 'PEACH'], difficulty: 2 },
      { category: '___ light', words: ['FLASH', 'MOON', 'STAR', 'SPOT'], difficulty: 3 },
      { category: 'Slang for money', words: ['BREAD', 'DOUGH', 'CHEDDAR', 'CABBAGE'], difficulty: 4 },
    ],
  },
  // Puzzle 4
  {
    groups: [
      { category: 'Parts of a shoe', words: ['SOLE', 'TONGUE', 'HEEL', 'LACE'], difficulty: 1 },
      { category: 'Fish', words: ['BASS', 'TROUT', 'PIKE', 'PERCH'], difficulty: 2 },
      { category: 'Music genres', words: ['ROCK', 'SOUL', 'METAL', 'FUNK'], difficulty: 3 },
      { category: '___ bar', words: ['CROW', 'HANDLE', 'SAND', 'MINI'], difficulty: 4 },
    ],
  },
  // Puzzle 5
  {
    groups: [
      { category: 'Breakfast foods', words: ['WAFFLE', 'PANCAKE', 'CEREAL', 'TOAST'], difficulty: 1 },
      { category: 'Dog breeds', words: ['BOXER', 'POINTER', 'SETTER', 'RETRIEVER'], difficulty: 2 },
      { category: 'Things in a courtroom', words: ['BENCH', 'STAND', 'BAR', 'GAVEL'], difficulty: 3 },
      { category: 'Email parts', words: ['SUBJECT', 'BODY', 'HEADER', 'ATTACHMENT'], difficulty: 4 },
    ],
  },
  // Puzzle 6
  {
    groups: [
      { category: 'Kitchen appliances', words: ['BLENDER', 'TOASTER', 'MICROWAVE', 'MIXER'], difficulty: 1 },
      { category: 'Dances', words: ['WALTZ', 'TANGO', 'SALSA', 'SWING'], difficulty: 2 },
      { category: 'Things that spin', words: ['TOP', 'WHEEL', 'DRILL', 'TURBINE'], difficulty: 3 },
      { category: '___ drop', words: ['TEAR', 'DEW', 'BACK', 'GUM'], difficulty: 4 },
    ],
  },
  // Puzzle 7
  {
    groups: [
      { category: 'Things at the beach', words: ['SAND', 'WAVE', 'SHELL', 'SURF'], difficulty: 1 },
      { category: 'Musical instruments', words: ['DRUM', 'HORN', 'HARP', 'BELL'], difficulty: 2 },
      { category: 'Body parts that are also verbs', words: ['SHOULDER', 'PALM', 'ELBOW', 'FINGER'], difficulty: 3 },
      { category: 'Taco ___', words: ['TRUCK', 'TUESDAY', 'STAND', 'BOUT'], difficulty: 4 },
    ],
  },
  // Puzzle 8
  {
    groups: [
      { category: 'Types of pasta', words: ['PENNE', 'RIGATONI', 'ORZO', 'FUSILLI'], difficulty: 1 },
      { category: 'Board games', words: ['RISK', 'CLUE', 'LIFE', 'SORRY'], difficulty: 2 },
      { category: 'Things that can be golden', words: ['GATE', 'RETRIEVER', 'RATIO', 'RULE'], difficulty: 3 },
      { category: 'Words before "age"', words: ['ICE', 'BAND', 'LEVER', 'PASS'], difficulty: 4 },
    ],
  },
  // Puzzle 9
  {
    groups: [
      { category: 'Seasons', words: ['SPRING', 'SUMMER', 'FALL', 'WINTER'], difficulty: 1 },
      { category: 'Beverages', words: ['PUNCH', 'JULEP', 'TODDY', 'SLING'], difficulty: 2 },
      { category: 'Actions in boxing', words: ['JAB', 'HOOK', 'BLOCK', 'CROSS'], difficulty: 3 },
      { category: '___ board', words: ['CARD', 'CUP', 'DART', 'STAIR'], difficulty: 4 },
    ],
  },
  // Puzzle 10
  {
    groups: [
      { category: 'Cuts of meat', words: ['CHUCK', 'RIB', 'LOIN', 'FLANK'], difficulty: 1 },
      { category: 'Poker terms', words: ['FOLD', 'RAISE', 'CALL', 'BLUFF'], difficulty: 2 },
      { category: 'Things with wings', words: ['PLANE', 'BAT', 'ANGEL', 'STAGE'], difficulty: 3 },
      { category: 'First names of Michaels', words: ['JORDAN', 'JACKSON', 'DOUGLAS', 'SCOTT'], difficulty: 4 },
    ],
  },
  // Puzzle 11
  {
    groups: [
      { category: 'Weather', words: ['RAIN', 'SNOW', 'HAIL', 'SLEET'], difficulty: 1 },
      { category: 'Martial arts', words: ['JUDO', 'KARATE', 'BOXING', 'FENCING'], difficulty: 2 },
      { category: 'Words meaning "hit"', words: ['STRIKE', 'PUNCH', 'BELT', 'SLUG'], difficulty: 3 },
      { category: 'Can follow "thunder"', words: ['BOLT', 'STORM', 'CLAP', 'BIRD'], difficulty: 4 },
    ],
  },
  // Puzzle 12
  {
    groups: [
      { category: 'Footwear', words: ['BOOT', 'SANDAL', 'SLIPPER', 'CLOG'], difficulty: 1 },
      { category: 'Things in a gym', words: ['BENCH', 'RACK', 'PLATE', 'RING'], difficulty: 2 },
      { category: 'Hair styles', words: ['BOB', 'MULLET', 'FADE', 'BANGS'], difficulty: 3 },
      { category: '___ house', words: ['FIRE', 'POWER', 'WARE', 'ROUND'], difficulty: 4 },
    ],
  },
  // Puzzle 13
  {
    groups: [
      { category: 'Baby animals', words: ['CUB', 'FOAL', 'LAMB', 'CALF'], difficulty: 1 },
      { category: 'Things in a wallet', words: ['CASH', 'CARD', 'LICENSE', 'RECEIPT'], difficulty: 2 },
      { category: 'Types of shot', words: ['FREE', 'LONG', 'CHEAP', 'SLAP'], difficulty: 3 },
      { category: 'Leg of ___', words: ['JOURNEY', 'TABLE', 'RELAY', 'CHICKEN'], difficulty: 4 },
    ],
  },
  // Puzzle 14
  {
    groups: [
      { category: 'US coins', words: ['PENNY', 'NICKEL', 'DIME', 'QUARTER'], difficulty: 1 },
      { category: 'Fabrics', words: ['SILK', 'SATIN', 'VELVET', 'LINEN'], difficulty: 2 },
      { category: 'Things that are smooth', words: ['JAZZ', 'BUTTER', 'GLASS', 'TALKER'], difficulty: 3 },
      { category: '___ screen', words: ['TOUCH', 'SILVER', 'SUN', 'SMOKE'], difficulty: 4 },
    ],
  },
  // Puzzle 15
  {
    groups: [
      { category: 'Zoo animals', words: ['LION', 'GIRAFFE', 'ZEBRA', 'HIPPO'], difficulty: 1 },
      { category: 'Card games', words: ['BRIDGE', 'POKER', 'RUMMY', 'SNAP'], difficulty: 2 },
      { category: 'Things with stripes', words: ['TIGER', 'CANDY', 'FLAG', 'REFEREE'], difficulty: 3 },
      { category: 'Power ___', words: ['PLANT', 'WASH', 'NAP', 'SURGE'], difficulty: 4 },
    ],
  },
  // Puzzle 16
  {
    groups: [
      { category: 'Vegetables', words: ['CORN', 'BEET', 'TURNIP', 'RADISH'], difficulty: 1 },
      { category: 'Currencies', words: ['POUND', 'FRANC', 'MARK', 'CROWN'], difficulty: 2 },
      { category: 'DJ equipment', words: ['DECK', 'MIXER', 'SPEAKER', 'TURNTABLE'], difficulty: 3 },
      { category: 'Can mean "defeat"', words: ['CRUSH', 'TOAST', 'DUST', 'SCHOOL'], difficulty: 4 },
    ],
  },
  // Puzzle 17
  {
    groups: [
      { category: 'Parts of a book', words: ['CHAPTER', 'COVER', 'SPINE', 'INDEX'], difficulty: 1 },
      { category: 'Knots', words: ['BOWLINE', 'HITCH', 'CLEAT', 'REEF'], difficulty: 2 },
      { category: 'Words for "great"', words: ['CAPITAL', 'GRAND', 'PRIME', 'STERLING'], difficulty: 3 },
      { category: '___ minister', words: ['FOREIGN', 'DEFENSE', 'FINANCE', 'INTERIOR'], difficulty: 4 },
    ],
  },
  // Puzzle 18
  {
    groups: [
      { category: 'Gems', words: ['RUBY', 'EMERALD', 'TOPAZ', 'OPAL'], difficulty: 1 },
      { category: 'Camera parts', words: ['LENS', 'FLASH', 'SHUTTER', 'APERTURE'], difficulty: 2 },
      { category: 'Types of humor', words: ['DRY', 'DARK', 'SLAPSTICK', 'DEADPAN'], difficulty: 3 },
      { category: 'Programming languages', words: ['PYTHON', 'SWIFT', 'RUST', 'JAVA'], difficulty: 4 },
    ],
  },
  // Puzzle 19
  {
    groups: [
      { category: 'Tools', words: ['HAMMER', 'WRENCH', 'PLIERS', 'CHISEL'], difficulty: 1 },
      { category: 'Types of test', words: ['BLOOD', 'STRESS', 'LITMUS', 'ACID'], difficulty: 2 },
      { category: 'Nail ___', words: ['FILE', 'POLISH', 'BED', 'GUN'], difficulty: 3 },
      { category: 'Things that can be blind', words: ['DATE', 'SPOT', 'FOLD', 'TASTE'], difficulty: 4 },
    ],
  },
  // Puzzle 20
  {
    groups: [
      { category: 'Berries', words: ['STRAW', 'BLUE', 'BLACK', 'RASP'], difficulty: 1 },
      { category: 'Textures', words: ['ROUGH', 'SMOOTH', 'COARSE', 'SILKY'], difficulty: 2 },
      { category: 'Things with keys', words: ['PIANO', 'MAP', 'LOCK', 'LAPTOP'], difficulty: 3 },
      { category: '___ berry (but not a real berry)', words: ['GOOSE', 'CRAN', 'ELDER', 'BOYSEN'], difficulty: 4 },
    ],
  },
  // Puzzle 21
  {
    groups: [
      { category: 'Desserts', words: ['PIE', 'CAKE', 'FLAN', 'TART'], difficulty: 1 },
      { category: 'Things at a carnival', words: ['RIDE', 'BOOTH', 'TICKET', 'COTTON'], difficulty: 2 },
      { category: 'Meanings of "set"', words: ['PLACE', 'GROUP', 'HARDEN', 'READY'], difficulty: 3 },
      { category: 'Cutie ___', words: ['MARK', 'PATOOTIE', 'BOOT', 'PANTS'], difficulty: 4 },
    ],
  },
  // Puzzle 22
  {
    groups: [
      { category: 'Types of bread', words: ['RYE', 'WHEAT', 'SOURDOUGH', 'PUMPERNICKEL'], difficulty: 1 },
      { category: 'Jazz musicians', words: ['MONK', 'MILES', 'DUKE', 'COUNT'], difficulty: 2 },
      { category: 'Nobility titles', words: ['KING', 'BARON', 'EARL', 'PRINCE'], difficulty: 3 },
      { category: '___ of the hill', words: ['JACK', 'TOP', 'FOOT', 'BROW'], difficulty: 4 },
    ],
  },
  // Puzzle 23
  {
    groups: [
      { category: 'Camping gear', words: ['TENT', 'LANTERN', 'COOLER', 'COMPASS'], difficulty: 1 },
      { category: 'Things that tick', words: ['CLOCK', 'BOMB', 'INSECT', 'METRONOME'], difficulty: 2 },
      { category: 'Running terms', words: ['SPRINT', 'PACE', 'LAP', 'RELAY'], difficulty: 3 },
      { category: 'Dead ___', words: ['LINE', 'LOCK', 'WEIGHT', 'PAN'], difficulty: 4 },
    ],
  },
  // Puzzle 24
  {
    groups: [
      { category: 'Ocean creatures', words: ['WHALE', 'SQUID', 'SHARK', 'SEAL'], difficulty: 1 },
      { category: 'Parts of a guitar', words: ['NECK', 'BRIDGE', 'NUT', 'FRET'], difficulty: 2 },
      { category: 'Words meaning "steal"', words: ['PINCH', 'SWIPE', 'NICK', 'LIFT'], difficulty: 3 },
      { category: 'Navy ___', words: ['BLUE', 'YARD', 'BEAN', 'PIER'], difficulty: 4 },
    ],
  },
  // Puzzle 25
  {
    groups: [
      { category: 'Zodiac signs', words: ['ARIES', 'LEO', 'VIRGO', 'LIBRA'], difficulty: 1 },
      { category: 'Watches', words: ['ROLEX', 'OMEGA', 'TAG', 'CASIO'], difficulty: 2 },
      { category: 'Greek letters', words: ['ALPHA', 'BETA', 'DELTA', 'SIGMA'], difficulty: 3 },
      { category: '___ male', words: ['PACK', 'POST', 'STRIP', 'AIR'], difficulty: 4 },
    ],
  },
  // Puzzle 26
  {
    groups: [
      { category: 'Trees', words: ['OAK', 'MAPLE', 'BIRCH', 'CEDAR'], difficulty: 1 },
      { category: 'Things that branch', words: ['RIVER', 'ROAD', 'NERVE', 'CORAL'], difficulty: 2 },
      { category: 'Bowling terms', words: ['STRIKE', 'SPARE', 'GUTTER', 'LANE'], difficulty: 3 },
      { category: 'Sounds like a number', words: ['WON', 'ATE', 'FORE', 'SEW'], difficulty: 4 },
    ],
  },
  // Puzzle 27
  {
    groups: [
      { category: 'Flowers', words: ['ROSE', 'DAISY', 'LILY', 'POPPY'], difficulty: 1 },
      { category: 'Units of measurement', words: ['YARD', 'FOOT', 'MILE', 'INCH'], difficulty: 2 },
      { category: 'Traps in a house', words: ['DOOR', 'STAIRS', 'FLOOR', 'ATTIC'], difficulty: 3 },
      { category: 'Also girls names', words: ['IRIS', 'VIOLET', 'HAZEL', 'OLIVE'], difficulty: 4 },
    ],
  },
  // Puzzle 28
  {
    groups: [
      { category: 'Fast food chains', words: ['WENDYS', 'ARBYS', 'SONIC', 'SUBWAY'], difficulty: 1 },
      { category: 'Sound systems', words: ['BOSE', 'SONOS', 'BEATS', 'BANG'], difficulty: 2 },
      { category: 'Things that are underground', words: ['METRO', 'ROOT', 'BUNKER', 'CAVE'], difficulty: 3 },
      { category: '___ wave', words: ['HEAT', 'SHOCK', 'MICRO', 'BRAIN'], difficulty: 4 },
    ],
  },
  // Puzzle 29
  {
    groups: [
      { category: 'Pizza toppings', words: ['OLIVE', 'PEPPER', 'ONION', 'MUSHROOM'], difficulty: 1 },
      { category: 'Things on a desk', words: ['LAMP', 'MOUSE', 'MONITOR', 'STAPLER'], difficulty: 2 },
      { category: 'Types of market', words: ['FLEA', 'STOCK', 'SUPER', 'BLACK'], difficulty: 3 },
      { category: 'Button ___', words: ['HOLE', 'DOWN', 'MASH', 'NOSE'], difficulty: 4 },
    ],
  },
  // Puzzle 30
  {
    groups: [
      { category: 'Planets', words: ['EARTH', 'NEPTUNE', 'URANUS', 'PLUTO'], difficulty: 1 },
      { category: 'Disney characters', words: ['GOOFY', 'BAMBI', 'DUMBO', 'STITCH'], difficulty: 2 },
      { category: 'Sewing terms', words: ['NEEDLE', 'THREAD', 'BOBBIN', 'SEAM'], difficulty: 3 },
      { category: 'Double letters in the middle', words: ['COFFEE', 'TOFFEE', 'KITTEN', 'BUTTER'], difficulty: 4 },
    ],
  },
  // Puzzle 31
  {
    groups: [
      { category: 'Cheese types', words: ['BRIE', 'GOUDA', 'FETA', 'SWISS'], difficulty: 1 },
      { category: 'Tennis terms', words: ['SERVE', 'VOLLEY', 'DEUCE', 'FAULT'], difficulty: 2 },
      { category: 'Things with a net', words: ['GOAL', 'BASKET', 'TRAMPOLINE', 'HAMMOCK'], difficulty: 3 },
      { category: 'Country inside the word', words: ['IRELAND', 'CHINA', 'SPAIN', 'FRANCE'], difficulty: 4 },
    ],
  },
  // Puzzle 32
  {
    groups: [
      { category: 'Breakfast drinks', words: ['JUICE', 'COFFEE', 'TEA', 'MILK'], difficulty: 1 },
      { category: 'Things in an orchestra', words: ['CELLO', 'OBOE', 'VIOLA', 'TIMPANI'], difficulty: 2 },
      { category: 'Types of wave', words: ['RADIO', 'SOUND', 'TIDAL', 'SHOCK'], difficulty: 3 },
      { category: 'Spill the ___', words: ['BEANS', 'INK', 'BLOOD', 'GUTS'], difficulty: 4 },
    ],
  },
  // Puzzle 33
  {
    groups: [
      { category: 'Metals', words: ['GOLD', 'SILVER', 'BRONZE', 'COPPER'], difficulty: 1 },
      { category: 'Olympics events', words: ['SHOT', 'VAULT', 'HAMMER', 'RELAY'], difficulty: 2 },
      { category: 'Bank terms', words: ['DEPOSIT', 'LEDGER', 'BALANCE', 'DRAFT'], difficulty: 3 },
      { category: 'Things that can be double', words: ['DUTCH', 'AGENT', 'VISION', 'TAKE'], difficulty: 4 },
    ],
  },
  // Puzzle 34
  {
    groups: [
      { category: 'Garden tools', words: ['RAKE', 'HOE', 'SHOVEL', 'TROWEL'], difficulty: 1 },
      { category: 'Types of dance', words: ['TAP', 'SAMBA', 'MAMBO', 'FOXTROT'], difficulty: 2 },
      { category: 'Fire ___', words: ['TRUCK', 'PLACE', 'WORK', 'FLY'], difficulty: 3 },
      { category: 'Words hidden in "extraordinary"', words: ['EXTRA', 'RAIN', 'TRAY', 'DINAR'], difficulty: 4 },
    ],
  },
  // Puzzle 35
  {
    groups: [
      { category: 'Nuts', words: ['ALMOND', 'WALNUT', 'PECAN', 'CASHEW'], difficulty: 1 },
      { category: 'Words for "walk"', words: ['STROLL', 'MARCH', 'TREK', 'HIKE'], difficulty: 2 },
      { category: 'Things that crack', words: ['EGG', 'WHIP', 'CODE', 'DAWN'], difficulty: 3 },
      { category: 'Hard ___', words: ['BALL', 'SHIP', 'WARE', 'CORE'], difficulty: 4 },
    ],
  },
  // Puzzle 36
  {
    groups: [
      { category: 'Months', words: ['MARCH', 'MAY', 'AUGUST', 'JUNE'], difficulty: 1 },
      { category: 'Also verbs', words: ['SPRING', 'FALL', 'DUCK', 'FIRE'], difficulty: 2 },
      { category: 'Military ranks', words: ['CAPTAIN', 'MAJOR', 'GENERAL', 'PRIVATE'], difficulty: 3 },
      { category: 'Also first names', words: ['LANCE', 'CHASE', 'WADE', 'MARK'], difficulty: 4 },
    ],
  },
  // Puzzle 37
  {
    groups: [
      { category: 'Insects', words: ['ANT', 'FLY', 'MOTH', 'WASP'], difficulty: 1 },
      { category: 'Things with a crown', words: ['TOOTH', 'QUEEN', 'ROOSTER', 'PINEAPPLE'], difficulty: 2 },
      { category: 'Web terms', words: ['BROWSER', 'COOKIE', 'CACHE', 'LINK'], difficulty: 3 },
      { category: 'Spider-___', words: ['MAN', 'WEB', 'PLANT', 'MONKEY'], difficulty: 4 },
    ],
  },
  // Puzzle 38
  {
    groups: [
      { category: 'Furniture', words: ['CHAIR', 'TABLE', 'COUCH', 'DRESSER'], difficulty: 1 },
      { category: 'Things at a bar', words: ['STOOL', 'TAP', 'SHOT', 'RAIL'], difficulty: 2 },
      { category: 'Pool terms', words: ['CUE', 'BREAK', 'RACK', 'POCKET'], difficulty: 3 },
      { category: 'Behind the eight ___', words: ['BALL', 'TRACK', 'MILE', 'COUNT'], difficulty: 4 },
    ],
  },
  // Puzzle 39
  {
    groups: [
      { category: 'Spices', words: ['SAGE', 'THYME', 'BASIL', 'MINT'], difficulty: 1 },
      { category: 'British slang', words: ['BLOKE', 'MATE', 'CHAP', 'BRUV'], difficulty: 2 },
      { category: 'Also names in Fawlty Towers', words: ['SYBIL', 'MANUEL', 'POLLY', 'TERRY'], difficulty: 3 },
      { category: 'Royal ___', words: ['FLUSH', 'BLUE', 'GUARD', 'JELLY'], difficulty: 4 },
    ],
  },
  // Puzzle 40
  {
    groups: [
      { category: 'Kitchen utensils', words: ['FORK', 'WHISK', 'LADLE', 'TONGS'], difficulty: 1 },
      { category: 'Things with teeth', words: ['COMB', 'SAW', 'ZIPPER', 'GEAR'], difficulty: 2 },
      { category: 'Pitch types', words: ['CURVE', 'SLIDER', 'SINKER', 'CUTTER'], difficulty: 3 },
      { category: '___ fork', words: ['TUNING', 'PITCH', 'DINNER', 'SALAD'], difficulty: 4 },
    ],
  },
  // Puzzle 41
  {
    groups: [
      { category: 'Types of tea', words: ['GREEN', 'BLACK', 'WHITE', 'HERBAL'], difficulty: 1 },
      { category: 'Hat types', words: ['FEDORA', 'BERET', 'BEANIE', 'TURBAN'], difficulty: 2 },
      { category: 'Things that brew', words: ['STORM', 'COFFEE', 'TROUBLE', 'PLOT'], difficulty: 3 },
      { category: '___ magic', words: ['DARK', 'STREET', 'STAGE', 'CARPET'], difficulty: 4 },
    ],
  },
  // Puzzle 42
  {
    groups: [
      { category: 'Citrus fruits', words: ['LEMON', 'GRAPEFRUIT', 'TANGERINE', 'CLEMENTINE'], difficulty: 1 },
      { category: 'Words for "crowd"', words: ['MOB', 'THRONG', 'SWARM', 'FLOCK'], difficulty: 2 },
      { category: 'Things with a peel', words: ['BANANA', 'ONION', 'PAINT', 'STICKER'], difficulty: 3 },
      { category: 'Zest for ___', words: ['LIFE', 'LIVING', 'ADVENTURE', 'COOKING'], difficulty: 4 },
    ],
  },
  // Puzzle 43
  {
    groups: [
      { category: 'Winter clothes', words: ['SCARF', 'MITTEN', 'PARKA', 'BEANIE'], difficulty: 1 },
      { category: 'Things that melt', words: ['ICE', 'BUTTER', 'CANDLE', 'CHEESE'], difficulty: 2 },
      { category: 'Poker hands', words: ['FLUSH', 'STRAIGHT', 'PAIR', 'FULL'], difficulty: 3 },
      { category: 'Cold ___', words: ['SNAP', 'CASE', 'FRONT', 'TURKEY'], difficulty: 4 },
    ],
  },
  // Puzzle 44
  {
    groups: [
      { category: 'Toys', words: ['DOLL', 'KITE', 'YOYO', 'SLINKY'], difficulty: 1 },
      { category: 'Things with a string', words: ['GUITAR', 'BOW', 'PUPPET', 'BALLOON'], difficulty: 2 },
      { category: 'Play ___', words: ['GROUND', 'LIST', 'MATE', 'BOOK'], difficulty: 3 },
      { category: 'Words ending in a body part', words: ['CARPET', 'CHAIRMAN', 'EYEBROW', 'THUMBNAIL'], difficulty: 4 },
    ],
  },
  // Puzzle 45
  {
    groups: [
      { category: 'Breeds of cat', words: ['PERSIAN', 'SIAMESE', 'BENGAL', 'TABBY'], difficulty: 1 },
      { category: 'Regions of the world', words: ['ARCTIC', 'SAHARA', 'OUTBACK', 'TUNDRA'], difficulty: 2 },
      { category: 'Things with nine lives', words: ['CAT', 'BOND', 'PHOENIX', 'HOUDINI'], difficulty: 3 },
      { category: '___ Gulf', words: ['STREAM', 'WAR', 'COAST', 'STATE'], difficulty: 4 },
    ],
  },
  // Puzzle 46
  {
    groups: [
      { category: 'Snack foods', words: ['CHIPS', 'PRETZEL', 'POPCORN', 'CRACKERS'], difficulty: 1 },
      { category: 'Things that pop', words: ['BALLOON', 'CORN', 'BUBBLE', 'CORK'], difficulty: 2 },
      { category: 'Chip ___', words: ['MONK', 'BOARD', 'SET', 'SHOT'], difficulty: 3 },
      { category: 'Casino words', words: ['ANTE', 'STAKE', 'HOUSE', 'DEALER'], difficulty: 4 },
    ],
  },
  // Puzzle 47
  {
    groups: [
      { category: 'Paper types', words: ['TISSUE', 'GRAPH', 'SAND', 'WALL'], difficulty: 1 },
      { category: 'Things with layers', words: ['CAKE', 'ONION', 'LASAGNA', 'EARTH'], difficulty: 2 },
      { category: 'Flat ___', words: ['IRON', 'LINE', 'RATE', 'BED'], difficulty: 3 },
      {
        category: 'Words that lose a letter to make a new word',
        words: ['PLATE', 'BRAKE', 'BLAND', 'SHOUT'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 48
  {
    groups: [
      { category: 'Elements', words: ['NEON', 'ARGON', 'XENON', 'RADON'], difficulty: 1 },
      { category: 'Light sources', words: ['CANDLE', 'TORCH', 'LANTERN', 'LAMP'], difficulty: 2 },
      { category: 'Things that glow', words: ['EMBER', 'WORM', 'STICK', 'SCREEN'], difficulty: 3 },
      { category: 'Noble ___', words: ['GAS', 'PRIZE', 'CAUSE', 'BIRTH'], difficulty: 4 },
    ],
  },
  // Puzzle 49
  {
    groups: [
      { category: 'Colors', words: ['TEAL', 'CORAL', 'IVORY', 'MAROON'], difficulty: 1 },
      { category: 'Things in the ocean', words: ['REEF', 'KELP', 'TIDE', 'CURRENT'], difficulty: 2 },
      { category: 'Paint terms', words: ['PRIMER', 'GLOSS', 'MATTE', 'WASH'], difficulty: 3 },
      { category: 'Shades of meaning for "angry"', words: ['CROSS', 'SORE', 'BITTER', 'SHORT'], difficulty: 4 },
    ],
  },
  // Puzzle 50
  {
    groups: [
      { category: 'Room types', words: ['BEDROOM', 'KITCHEN', 'BATHROOM', 'CELLAR'], difficulty: 1 },
      { category: 'Things with a lock', words: ['DOOR', 'SAFE', 'CANAL', 'PHONE'], difficulty: 2 },
      { category: 'Key ___', words: ['CHAIN', 'NOTE', 'WORD', 'STONE'], difficulty: 3 },
      { category: 'Secret ___', words: ['AGENT', 'SANTA', 'SERVICE', 'GARDEN'], difficulty: 4 },
    ],
  },
  // Puzzle 51
  {
    groups: [
      { category: 'Breakfast items', words: ['BACON', 'SAUSAGE', 'OMELET', 'MUFFIN'], difficulty: 1 },
      { category: 'Things that sizzle', words: ['STEAK', 'GRILL', 'WIRE', 'FAJITA'], difficulty: 2 },
      { category: 'Strip ___', words: ['CLUB', 'MALL', 'MINE', 'TEASE'], difficulty: 3 },
      { category: 'Words with silent letters', words: ['KNIFE', 'KNIGHT', 'PSALM', 'GNOME'], difficulty: 4 },
    ],
  },
  // Puzzle 52
  {
    groups: [
      { category: 'Tropical fruits', words: ['PAPAYA', 'GUAVA', 'COCONUT', 'PASSION'], difficulty: 1 },
      { category: 'Words for "money"', words: ['BUCK', 'QUID', 'CLAM', 'NOTE'], difficulty: 2 },
      { category: 'Shell ___', words: ['FISH', 'SHOCK', 'FIRE', 'GAME'], difficulty: 3 },
      { category: 'Things that are cracked', words: ['MIRROR', 'PEPPER', 'WHEAT', 'SAFE'], difficulty: 4 },
    ],
  },
  // Puzzle 53
  {
    groups: [
      { category: 'Landforms', words: ['MESA', 'CLIFF', 'RIDGE', 'CANYON'], difficulty: 1 },
      { category: 'Yoga poses', words: ['COBRA', 'WARRIOR', 'TREE', 'CROW'], difficulty: 2 },
      { category: 'Mountain ___', words: ['BIKE', 'DEW', 'GOAT', 'LION'], difficulty: 3 },
      { category: 'Words that sound like letters', words: ['SEA', 'JAY', 'ARE', 'GEE'], difficulty: 4 },
    ],
  },
  // Puzzle 54
  {
    groups: [
      { category: 'Sauces', words: ['RANCH', 'GRAVY', 'PESTO', 'AIOLI'], difficulty: 1 },
      { category: 'Cowboy things', words: ['LASSO', 'SADDLE', 'SPUR', 'RODEO'], difficulty: 2 },
      { category: 'Home on the ___', words: ['RANGE', 'FRONT', 'STRETCH', 'PAGE'], difficulty: 3 },
      { category: 'Words containing a color', words: ['BLUSHING', 'REDEEM', 'PINKY', 'GREENHOUSE'], difficulty: 4 },
    ],
  },
  // Puzzle 55
  {
    groups: [
      { category: 'Candy', words: ['SKITTLES', 'NERDS', 'STARBURST', 'WARHEADS'], difficulty: 1 },
      { category: 'Astronomy terms', words: ['NEBULA', 'QUASAR', 'PULSAR', 'COMET'], difficulty: 2 },
      { category: 'Words for "weird"', words: ['ODD', 'QUIRKY', 'BIZARRE', 'FUNKY'], difficulty: 3 },
      { category: 'Star ___', words: ['FISH', 'DUST', 'BOARD', 'CRAFT'], difficulty: 4 },
    ],
  },
  // Puzzle 56
  {
    groups: [
      { category: 'Salad ingredients', words: ['LETTUCE', 'CROUTON', 'TOMATO', 'CUCUMBER'], difficulty: 1 },
      { category: 'Things that are tossed', words: ['COIN', 'GRENADE', 'PANCAKE', 'CABER'], difficulty: 2 },
      { category: 'Dress ___', words: ['CODE', 'SHIRT', 'MAKER', 'ROOM'], difficulty: 3 },
      { category: 'Hidden animals', words: ['RAMPAGE', 'BEAGLE', 'SCOWL', 'THERAPIST'], difficulty: 4 },
    ],
  },
  // Puzzle 57
  {
    groups: [
      { category: 'Things with wheels', words: ['BICYCLE', 'SKATEBOARD', 'WAGON', 'TROLLEY'], difficulty: 1 },
      { category: 'Things that roll', words: ['DICE', 'THUNDER', 'CREDITS', 'DOUGH'], difficulty: 2 },
      { category: 'Drum ___', words: ['STICK', 'ROLL', 'LINE', 'MAJOR'], difficulty: 3 },
      {
        category: 'Words where removing first letter gives a new word',
        words: ['BRAID', 'CLOVE', 'SWEAR', 'TRAIN'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 58
  {
    groups: [
      { category: 'Vegetables', words: ['CARROT', 'CELERY', 'SPINACH', 'KALE'], difficulty: 1 },
      { category: 'Things in a salad', words: ['DRESSING', 'OLIVE', 'FETA', 'WALNUT'], difficulty: 2 },
      { category: 'Stick ___', words: ['SHIFT', 'FIGURE', 'INSECT', 'NOTE'], difficulty: 3 },
      { category: 'Words with double O', words: ['VOODOO', 'TABOO', 'BAMBOO', 'SHAMPOO'], difficulty: 4 },
    ],
  },
  // Puzzle 59
  {
    groups: [
      { category: 'River names', words: ['THAMES', 'NILE', 'DANUBE', 'SEINE'], difficulty: 1 },
      { category: 'Flow words', words: ['STREAM', 'GUSH', 'TRICKLE', 'CASCADE'], difficulty: 2 },
      { category: 'Bank ___', words: ['ROLL', 'NOTE', 'SHOT', 'HOLIDAY'], difficulty: 3 },
      { category: 'Bridges of ___', words: ['MADISON', 'LONDON', 'SIGHS', 'NOSE'], difficulty: 4 },
    ],
  },
  // Puzzle 60
  {
    groups: [
      { category: 'Things on a pizza', words: ['CRUST', 'SAUCE', 'CHEESE', 'PEPPERONI'], difficulty: 1 },
      { category: 'Layers of the earth', words: ['MANTLE', 'CORE', 'MAGMA', 'PLATE'], difficulty: 2 },
      { category: 'Deep ___', words: ['SEA', 'FAKE', 'STATE', 'THROAT'], difficulty: 3 },
      { category: 'Things with a thin crust', words: ['PIE', 'SNOW', 'BREAD', 'WOUND'], difficulty: 4 },
    ],
  },
  // Puzzle 61
  {
    groups: [
      { category: 'School subjects', words: ['MATH', 'HISTORY', 'SCIENCE', 'ENGLISH'], difficulty: 1 },
      { category: 'Types of exam', words: ['ORAL', 'FINAL', 'MIDTERM', 'ENTRANCE'], difficulty: 2 },
      { category: 'Class ___', words: ['MATE', 'ROOM', 'ACTION', 'WARFARE'], difficulty: 3 },
      { category: 'Words that follow "pop"', words: ['QUIZ', 'CORN', 'STAR', 'CULTURE'], difficulty: 4 },
    ],
  },
  // Puzzle 62
  {
    groups: [
      { category: 'Grains', words: ['RICE', 'WHEAT', 'BARLEY', 'OATS'], difficulty: 1 },
      { category: 'Things in a field', words: ['SCARECROW', 'FENCE', 'PLOW', 'FURROW'], difficulty: 2 },
      { category: 'Wild ___', words: ['CARD', 'FIRE', 'GOOSE', 'WEST'], difficulty: 3 },
      { category: 'Words ending in a grain', words: ['PORTRAIT', 'COMPLEAT', 'ENTREAT', 'CONCEIT'], difficulty: 4 },
    ],
  },
  // Puzzle 63
  {
    groups: [
      { category: 'Board game pieces', words: ['DICE', 'TOKEN', 'CARD', 'BOARD'], difficulty: 1 },
      { category: 'Things you shuffle', words: ['DECK', 'FEET', 'PLAYLIST', 'PAPERS'], difficulty: 2 },
      { category: 'Game ___', words: ['PLAN', 'SHOW', 'CHANGER', 'FACE'], difficulty: 3 },
      { category: 'Things with a face but no body', words: ['CLOCK', 'CLIFF', 'COIN', 'BUILDING'], difficulty: 4 },
    ],
  },
  // Puzzle 64
  {
    groups: [
      { category: 'Things that buzz', words: ['BEE', 'PHONE', 'RAZOR', 'DOORBELL'], difficulty: 1 },
      { category: 'Honey ___', words: ['COMB', 'MOON', 'DEW', 'TRAP'], difficulty: 2 },
      { category: 'Sweet words', words: ['SUGAR', 'CANDY', 'DARLING', 'ANGEL'], difficulty: 3 },
      { category: 'Words for "nothing"', words: ['ZIP', 'ZILCH', 'NADA', 'SQUAT'], difficulty: 4 },
    ],
  },
  // Puzzle 65
  {
    groups: [
      { category: 'Olympic sports', words: ['ROWING', 'DIVING', 'ARCHERY', 'FENCING'], difficulty: 1 },
      { category: 'Things with a point', words: ['PENCIL', 'SWORD', 'ARROW', 'NEEDLE'], difficulty: 2 },
      { category: 'Score ___', words: ['CARD', 'BOARD', 'LINE', 'KEEPER'], difficulty: 3 },
      { category: 'Words meaning "edge"', words: ['BRINK', 'VERGE', 'MARGIN', 'BRIM'], difficulty: 4 },
    ],
  },
  // Puzzle 66
  {
    groups: [
      { category: 'Dairy products', words: ['YOGURT', 'CREAM', 'BUTTER', 'WHEY'], difficulty: 1 },
      { category: 'Things that float', words: ['RAFT', 'CORK', 'BUBBLE', 'CLOUD'], difficulty: 2 },
      { category: 'Ice ___', words: ['CAP', 'PICK', 'BERG', 'RINK'], difficulty: 3 },
      { category: 'Words containing "arm"', words: ['CHARM', 'FARMER', 'HARMONY', 'WARM'], difficulty: 4 },
    ],
  },
  // Puzzle 67
  {
    groups: [
      { category: 'Dog commands', words: ['SIT', 'STAY', 'HEEL', 'FETCH'], difficulty: 1 },
      { category: 'Chess pieces', words: ['ROOK', 'BISHOP', 'KNIGHT', 'PAWN'], difficulty: 2 },
      { category: 'Things that can be checked', words: ['MATE', 'MARK', 'LIST', 'RAIN'], difficulty: 3 },
      { category: '___ mate', words: ['STALE', 'FLAT', 'SOUL', 'SHIP'], difficulty: 4 },
    ],
  },
  // Puzzle 68
  {
    groups: [
      { category: 'Superhero powers', words: ['FLIGHT', 'SPEED', 'STRENGTH', 'VISION'], difficulty: 1 },
      { category: 'Lenses', words: ['CONTACT', 'ZOOM', 'FISH', 'MACRO'], difficulty: 2 },
      { category: 'Super ___', words: ['HERO', 'BOWL', 'MARKET', 'NOVA'], difficulty: 3 },
      { category: 'Words that mean "excellent"', words: ['STELLAR', 'ACE', 'CRACKING', 'MINT'], difficulty: 4 },
    ],
  },
  // Puzzle 69
  {
    groups: [
      { category: 'Pasta shapes', words: ['BOW', 'SHELL', 'WHEEL', 'TUBE'], difficulty: 1 },
      { category: 'Things in a harbor', words: ['DOCK', 'ANCHOR', 'BUOY', 'CRANE'], difficulty: 2 },
      { category: 'Anchor ___', words: ['MAN', 'POINT', 'TEXT', 'BOLT'], difficulty: 3 },
      { category: 'Words where "w" is silent', words: ['WRAP', 'SWORD', 'WRONG', 'WRITE'], difficulty: 4 },
    ],
  },
  // Puzzle 70
  {
    groups: [
      { category: 'Things in a park', words: ['BENCH', 'FOUNTAIN', 'SWING', 'TRAIL'], difficulty: 1 },
      { category: 'Newspaper sections', words: ['SPORTS', 'EDITORIAL', 'COMIC', 'CLASSIFIED'], difficulty: 2 },
      { category: 'Press ___', words: ['RELEASE', 'BOX', 'AGENT', 'CONFERENCE'], difficulty: 3 },
      { category: 'Words that rhyme with "night"', words: ['PLIGHT', 'QUITE', 'MITE', 'FLIGHT'], difficulty: 4 },
    ],
  },
  // Puzzle 71
  {
    groups: [
      { category: 'Baked goods', words: ['CROISSANT', 'SCONE', 'BAGUETTE', 'BRIOCHE'], difficulty: 1 },
      { category: 'French words used in English', words: ['ENCORE', 'DEBUT', 'GENRE', 'FIANCEE'], difficulty: 2 },
      { category: 'Things with a crust', words: ['EARTH', 'BREAD', 'PIE', 'SNOW'], difficulty: 3 },
      { category: 'Half ___', words: ['TIME', 'BACK', 'PIPE', 'HEARTED'], difficulty: 4 },
    ],
  },
  // Puzzle 72
  {
    groups: [
      { category: 'Countries in Africa', words: ['CHAD', 'MALI', 'TOGO', 'NIGER'], difficulty: 1 },
      { category: 'Four-letter boy names', words: ['JACK', 'LUKE', 'RYAN', 'OWEN'], difficulty: 2 },
      { category: 'Things with a flag', words: ['NATION', 'GOLF', 'SHIP', 'REFEREE'], difficulty: 3 },
      { category: 'Red ___', words: ['TAPE', 'CARPET', 'HERRING', 'CROSS'], difficulty: 4 },
    ],
  },
  // Puzzle 73
  {
    groups: [
      { category: 'Things in a toolbox', words: ['DRILL', 'LEVEL', 'TAPE', 'CLAMP'], difficulty: 1 },
      { category: 'Words meaning "drunk" (slang)', words: ['HAMMERED', 'LOADED', 'SMASHED', 'WASTED'], difficulty: 2 },
      { category: 'Loaded ___', words: ['DICE', 'GUN', 'QUESTION', 'FRIES'], difficulty: 3 },
      { category: 'Words that become new words backward', words: ['TRAP', 'EVIL', 'REED', 'DIAL'], difficulty: 4 },
    ],
  },
  // Puzzle 74
  {
    groups: [
      { category: 'Breakfast cereals', words: ['CHEERIOS', 'FROSTED', 'LUCKY', 'CAPTAIN'], difficulty: 1 },
      { category: 'Ship parts', words: ['MAST', 'HULL', 'STERN', 'KEEL'], difficulty: 2 },
      { category: 'Captain ___', words: ['HOOK', 'AMERICA', 'CRUNCH', 'OBVIOUS'], difficulty: 3 },
      { category: 'Words that follow "first"', words: ['AID', 'BORN', 'CLASS', 'HAND'], difficulty: 4 },
    ],
  },
  // Puzzle 75
  {
    groups: [
      { category: 'Types of cloud', words: ['CIRRUS', 'CUMULUS', 'STRATUS', 'NIMBUS'], difficulty: 1 },
      { category: 'Things that hover', words: ['HELICOPTER', 'DRONE', 'HUMMINGBIRD', 'KESTREL'], difficulty: 2 },
      { category: 'Silver ___', words: ['LINING', 'BULLET', 'FOX', 'TONGUE'], difficulty: 3 },
      { category: 'Harry Potter terms', words: ['QUIDDITCH', 'MUGGLE', 'SNITCH', 'WAND'], difficulty: 4 },
    ],
  },
  // Puzzle 76
  {
    groups: [
      { category: 'Units of time', words: ['DECADE', 'CENTURY', 'EPOCH', 'ERA'], difficulty: 1 },
      { category: 'Things at a wedding', words: ['VEIL', 'BOUQUET', 'TOAST', 'AISLE'], difficulty: 2 },
      { category: 'Long ___', words: ['SHOT', 'TERM', 'BOW', 'ISLAND'], difficulty: 3 },
      { category: 'Words containing "age"', words: ['PASSAGE', 'STAGE', 'LUGGAGE', 'VOYAGE'], difficulty: 4 },
    ],
  },
  // Puzzle 77
  {
    groups: [
      { category: 'Types of jacket', words: ['BLAZER', 'BOMBER', 'DENIM', 'WINDBREAKER'], difficulty: 1 },
      { category: 'Things that zip', words: ['BAG', 'COAT', 'FILE', 'LINE'], difficulty: 2 },
      { category: 'Leather ___', words: ['BELT', 'BOUND', 'NECK', 'BACK'], difficulty: 3 },
      { category: 'Words meaning "fast"', words: ['SWIFT', 'FLEET', 'RAPID', 'BRISK'], difficulty: 4 },
    ],
  },
  // Puzzle 78
  {
    groups: [
      { category: 'Pieces of jewelry', words: ['RING', 'BROOCH', 'PENDANT', 'ANKLET'], difficulty: 1 },
      { category: 'Things with a band', words: ['WATCH', 'RUBBER', 'WEDDING', 'ROCK'], difficulty: 2 },
      { category: 'Gold ___', words: ['RUSH', 'MINE', 'FISH', 'DIGGER'], difficulty: 3 },
      { category: 'Words ending in "and"', words: ['DEMAND', 'EXPAND', 'STRAND', 'BRAND'], difficulty: 4 },
    ],
  },
  // Puzzle 79
  {
    groups: [
      { category: 'Condiments', words: ['KETCHUP', 'MUSTARD', 'RELISH', 'MAYO'], difficulty: 1 },
      { category: 'Words meaning "enjoy"', words: ['SAVOR', 'CHERISH', 'DELIGHT', 'TREASURE'], difficulty: 2 },
      { category: 'Hot ___', words: ['DOG', 'SPRINGS', 'SAUCE', 'SHOT'], difficulty: 3 },
      { category: 'Things associated with yellow', words: ['TAXI', 'BANANA', 'SUNFLOWER', 'CANARY'], difficulty: 4 },
    ],
  },
  // Puzzle 80
  {
    groups: [
      { category: 'Types of bag', words: ['TOTE', 'CLUTCH', 'DUFFEL', 'SATCHEL'], difficulty: 1 },
      { category: 'Basketball moves', words: ['DUNK', 'LAYUP', 'CROSSOVER', 'FADEAWAY'], difficulty: 2 },
      { category: 'Carry ___', words: ['ON', 'OUT', 'OVER', 'AWAY'], difficulty: 3 },
      { category: 'Words that are also dances', words: ['TWIST', 'HUSTLE', 'BUMP', 'SLIDE'], difficulty: 4 },
    ],
  },
  // Puzzle 81
  {
    groups: [
      { category: 'Things in space', words: ['ASTEROID', 'SATELLITE', 'STATION', 'PROBE'], difficulty: 1 },
      { category: 'Words meaning "study"', words: ['EXAMINE', 'REVIEW', 'SURVEY', 'SCAN'], difficulty: 2 },
      { category: 'Space ___', words: ['CADET', 'CRAFT', 'BAR', 'SUIT'], difficulty: 3 },
      { category: 'Words containing "orbit"', words: ['ORBIT', 'MORBID', 'FORBID', 'EXORBITANT'], difficulty: 4 },
    ],
  },
  // Puzzle 82
  {
    groups: [
      { category: 'Types of map', words: ['ROAD', 'TREASURE', 'WEATHER', 'MIND'], difficulty: 1 },
      { category: 'Things with legends', words: ['CHART', 'MYTH', 'HERO', 'FABLE'], difficulty: 2 },
      { category: 'World ___', words: ['CUP', 'RECORD', 'SERIES', 'WAR'], difficulty: 3 },
      {
        category: 'Words that are also Greek titans',
        words: ['ATLAS', 'HYPERION', 'OCEANUS', 'PROMETHEUS'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 83
  {
    groups: [
      { category: 'Modes of transport', words: ['FERRY', 'TRAM', 'GONDOLA', 'RICKSHAW'], difficulty: 1 },
      { category: 'Things with a cable', words: ['CAR', 'TELEVISION', 'BRIDGE', 'ELEVATOR'], difficulty: 2 },
      { category: 'Lift ___', words: ['OFF', 'GATE', 'SHAFT', 'TICKET'], difficulty: 3 },
      { category: 'Words meaning "to carry"', words: ['BEAR', 'HAUL', 'LUG', 'SCHLEP'], difficulty: 4 },
    ],
  },
  // Puzzle 84
  {
    groups: [
      { category: 'Things on a face', words: ['FRECKLE', 'DIMPLE', 'WRINKLE', 'MOLE'], difficulty: 1 },
      { category: 'Underground animals', words: ['GOPHER', 'WORM', 'BADGER', 'RABBIT'], difficulty: 2 },
      { category: 'Mole ___', words: ['HILL', 'SKIN', 'CULE', 'RAT'], difficulty: 3 },
      { category: 'Words meaning "to annoy"', words: ['PESTER', 'NEEDLE', 'GRILL', 'HOUND'], difficulty: 4 },
    ],
  },
  // Puzzle 85
  {
    groups: [
      { category: 'Things in a hospital', words: ['WARD', 'GURNEY', 'SCALPEL', 'DRIP'], difficulty: 1 },
      { category: 'Words for "doctor"', words: ['SURGEON', 'PHYSICIAN', 'MEDIC', 'SHRINK'], difficulty: 2 },
      { category: 'Bed ___', words: ['BUG', 'ROCK', 'ROOM', 'SPREAD'], difficulty: 3 },
      { category: 'Things that have a pulse', words: ['WRIST', 'LASER', 'STAR', 'MUSIC'], difficulty: 4 },
    ],
  },
  // Puzzle 86
  {
    groups: [
      { category: 'Stringed instruments', words: ['BANJO', 'VIOLA', 'CELLO', 'SITAR'], difficulty: 1 },
      { category: 'Things with strings attached', words: ['PUPPET', 'KITE', 'APRON', 'GIFT'], difficulty: 2 },
      { category: 'Pull ___', words: ['OVER', 'TAB', 'UP', 'OUT'], difficulty: 3 },
      {
        category: 'Words containing a musical instrument',
        words: ['TRUMPET', 'DRUMSTICK', 'HARPSICHORD', 'OBOIST'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 87
  {
    groups: [
      { category: 'Shades of blue', words: ['NAVY', 'COBALT', 'AZURE', 'CYAN'], difficulty: 1 },
      { category: 'Things in the sky at night', words: ['MOON', 'BAT', 'AURORA', 'SATELLITE'], difficulty: 2 },
      { category: 'Sky ___', words: ['DIVE', 'SCRAPER', 'LIGHT', 'ROCKET'], difficulty: 3 },
      { category: 'Words that are also snakes', words: ['COBRA', 'MAMBA', 'ADDER', 'BOA'], difficulty: 4 },
    ],
  },
  // Puzzle 88
  {
    groups: [
      { category: 'Writing instruments', words: ['QUILL', 'MARKER', 'CRAYON', 'STYLUS'], difficulty: 1 },
      { category: 'Things with ink', words: ['PRINTER', 'SQUID', 'TATTOO', 'STAMP'], difficulty: 2 },
      { category: 'Pen ___', words: ['PAL', 'KNIFE', 'HOUSE', 'ALTY'], difficulty: 3 },
      {
        category: 'Words that sound like two words',
        words: ['OUTSIDE', 'UNDERSTAND', 'CARPET', 'WINDOW'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 89
  {
    groups: [
      { category: 'Tropical birds', words: ['TOUCAN', 'PARROT', 'MACAW', 'FLAMINGO'], difficulty: 1 },
      { category: 'Things with feathers', words: ['PILLOW', 'ARROW', 'QUILL', 'DART'], difficulty: 2 },
      { category: 'Bird ___', words: ['CAGE', 'BATH', 'SONG', 'HOUSE'], difficulty: 3 },
      { category: 'Words meaning "to flee"', words: ['BOLT', 'DASH', 'SCRAM', 'SPLIT'], difficulty: 4 },
    ],
  },
  // Puzzle 90
  {
    groups: [
      { category: 'Things in a library', words: ['SHELF', 'CATALOG', 'ARCHIVE', 'STACK'], difficulty: 1 },
      { category: 'Computer terms', words: ['SERVER', 'CLOUD', 'BUFFER', 'DRIVER'], difficulty: 2 },
      { category: 'Book ___', words: ['WORM', 'END', 'MARK', 'CASE'], difficulty: 3 },
      {
        category: 'Words with "over" hidden inside',
        words: ['DISCOVER', 'CLOVER', 'MOREOVER', 'RECOVERY'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 91
  {
    groups: [
      { category: 'Martial arts belts', words: ['WHITE', 'YELLOW', 'GREEN', 'BLACK'], difficulty: 1 },
      { category: 'Things with a buckle', words: ['BELT', 'SHOE', 'HELMET', 'STRAP'], difficulty: 2 },
      { category: 'Black ___', words: ['SHEEP', 'HOLE', 'SMITH', 'JACK'], difficulty: 3 },
      { category: 'Words that can precede "board"', words: ['SKATE', 'CHALK', 'CLIP', 'SNOW'], difficulty: 4 },
    ],
  },
  // Puzzle 92
  {
    groups: [
      { category: 'Types of sandwich', words: ['CLUB', 'WRAP', 'PANINI', 'HOAGIE'], difficulty: 1 },
      { category: 'Things with layers', words: ['PARFAIT', 'SEDIMENT', 'OUTFIT', 'TIRAMISU'], difficulty: 2 },
      { category: 'Double ___', words: ['CROSS', 'CHECK', 'DUTCH', 'TIME'], difficulty: 3 },
      { category: 'Words containing "sand"', words: ['SANDAL', 'THOUSAND', 'SANDALWOOD', 'QUICKSAND'], difficulty: 4 },
    ],
  },
  // Puzzle 93
  {
    groups: [
      { category: 'Things in a garage', words: ['TOOLBOX', 'LADDER', 'WORKBENCH', 'JACK'], difficulty: 1 },
      { category: 'Things that lift', words: ['CRANE', 'PULLEY', 'FORKLIFT', 'LEVER'], difficulty: 2 },
      { category: 'Jack ___', words: ['POT', 'HAMMER', 'RABBIT', 'KNIFE'], difficulty: 3 },
      { category: 'Words meaning "to raise"', words: ['HOIST', 'HEAVE', 'ELEVATE', 'BOOST'], difficulty: 4 },
    ],
  },
  // Puzzle 94
  {
    groups: [
      { category: 'Garden flowers', words: ['TULIP', 'DAHLIA', 'PEONY', 'ASTER'], difficulty: 1 },
      { category: 'Things that bloom', words: ['ALGAE', 'ROMANCE', 'YOUTH', 'ONION'], difficulty: 2 },
      { category: 'Bed of ___', words: ['ROSES', 'NAILS', 'COAL', 'RIVER'], difficulty: 3 },
      { category: 'Words that are also asteroids', words: ['CERES', 'VESTA', 'JUNO', 'PALLAS'], difficulty: 4 },
    ],
  },
  // Puzzle 95
  {
    groups: [
      { category: 'Types of bean', words: ['KIDNEY', 'LIMA', 'PINTO', 'BLACK'], difficulty: 1 },
      { category: 'Things shaped like a kidney', words: ['POOL', 'TABLE', 'DISH', 'PILLOW'], difficulty: 2 },
      { category: 'Cool ___', words: ['RANCH', 'HAND', 'HEAD', 'DOWN'], difficulty: 3 },
      {
        category: 'Capital cities that are also common words',
        words: ['NICE', 'SOFIA', 'SEOUL', 'BERN'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 96
  {
    groups: [
      { category: 'Things with a handle', words: ['MUG', 'PAN', 'BROOM', 'SUITCASE'], difficulty: 1 },
      { category: 'Social media terms', words: ['HANDLE', 'FEED', 'POST', 'STORY'], difficulty: 2 },
      { category: 'Pot ___', words: ['LUCK', 'HOLE', 'SHOT', 'BELLY'], difficulty: 3 },
      {
        category: 'Words that mean both "to endure" and something else',
        words: ['BEAR', 'STAND', 'STOMACH', 'WEATHER'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 97
  {
    groups: [
      { category: 'Things with a trunk', words: ['ELEPHANT', 'CAR', 'TREE', 'SWIMMER'], difficulty: 1 },
      { category: 'Things that shed', words: ['SNAKE', 'DOG', 'LEAF', 'TEAR'], difficulty: 2 },
      { category: 'Branch ___', words: ['MANAGER', 'LINE', 'OFFICE', 'WATER'], difficulty: 3 },
      { category: 'Words containing "oak"', words: ['CLOAK', 'SOAK', 'CROAK', 'OAK'], difficulty: 4 },
    ],
  },
  // Puzzle 98
  {
    groups: [
      { category: 'Circus performers', words: ['CLOWN', 'ACROBAT', 'JUGGLER', 'TRAPEZE'], difficulty: 1 },
      { category: 'Things under a big top', words: ['RING', 'TENT', 'CAGE', 'NET'], difficulty: 2 },
      { category: 'Ring ___', words: ['LEADER', 'TONE', 'WORM', 'SIDE'], difficulty: 3 },
      { category: 'Words meaning "to throw"', words: ['HURL', 'CHUCK', 'FLING', 'TOSS'], difficulty: 4 },
    ],
  },
  // Puzzle 99
  {
    groups: [
      { category: 'Types of rug', words: ['PERSIAN', 'SHAG', 'BRAIDED', 'ORIENTAL'], difficulty: 1 },
      { category: 'Things with a fringe', words: ['CURTAIN', 'JACKET', 'BENEFIT', 'LAMP'], difficulty: 2 },
      { category: 'Rug ___', words: ['RAT', 'BURN', 'PULL', 'BEATER'], difficulty: 3 },
      { category: 'Words meaning "to sweep under"', words: ['CONCEAL', 'BURY', 'HIDE', 'SUPPRESS'], difficulty: 4 },
    ],
  },
  // Puzzle 100
  {
    groups: [
      { category: 'Parts of a clock', words: ['DIAL', 'HAND', 'PENDULUM', 'SPRING'], difficulty: 1 },
      { category: 'Things that wind', words: ['RIVER', 'PATH', 'STAIRCASE', 'ROAD'], difficulty: 2 },
      { category: 'Time ___', words: ['BOMB', 'ZONE', 'TABLE', 'STAMP'], difficulty: 3 },
      { category: 'Words meaning "second"', words: ['MOMENT', 'INSTANT', 'TICK', 'FLASH'], difficulty: 4 },
    ],
  },
  // Puzzle 101
  {
    groups: [
      { category: 'Primates', words: ['CHIMP', 'GORILLA', 'LEMUR', 'GIBBON'], difficulty: 1 },
      { category: 'Things that swing', words: ['BAT', 'PENDULUM', 'GATE', 'MOOD'], difficulty: 2 },
      { category: 'Monkey ___', words: ['BARS', 'WRENCH', 'BUSINESS', 'SUIT'], difficulty: 3 },
      { category: 'Words meaning "to copy"', words: ['APE', 'PARROT', 'MIRROR', 'ECHO'], difficulty: 4 },
    ],
  },
  // Puzzle 102
  {
    groups: [
      { category: 'Woodwind instruments', words: ['FLUTE', 'CLARINET', 'BASSOON', 'PICCOLO'], difficulty: 1 },
      { category: 'Things with a reed', words: ['SAXOPHONE', 'BASKET', 'MARSH', 'ORGAN'], difficulty: 2 },
      { category: 'Note ___', words: ['PAD', 'BOOK', 'WORTHY', 'CARD'], difficulty: 3 },
      { category: 'Musical terms that are also food', words: ['CLEF', 'TEMPO', 'FORTE', 'STACCATO'], difficulty: 4 },
    ],
  },
  // Puzzle 103
  {
    groups: [
      { category: 'Things on a boat', words: ['SAIL', 'RUDDER', 'CABIN', 'DECK'], difficulty: 1 },
      { category: 'Things that are rigged', words: ['ELECTION', 'JURY', 'GAME', 'SHIP'], difficulty: 2 },
      { category: 'Sail ___', words: ['BOAT', 'CLOTH', 'FISH', 'MAKER'], difficulty: 3 },
      { category: 'Words meaning "cabin"', words: ['LODGE', 'HUT', 'SHACK', 'COTTAGE'], difficulty: 4 },
    ],
  },
  // Puzzle 104
  {
    groups: [
      { category: 'Things in a wallet', words: ['PHOTO', 'COUPON', 'PASS', 'STUB'], difficulty: 1 },
      { category: 'Types of pass', words: ['BOARDING', 'MOUNTAIN', 'BACKSTAGE', 'SEASON'], difficulty: 2 },
      { category: 'Pass ___', words: ['PORT', 'WORD', 'OVER', 'ENGER'], difficulty: 3 },
      { category: 'Words that follow "by"', words: ['LINE', 'STANDER', 'PRODUCT', 'GONE'], difficulty: 4 },
    ],
  },
  // Puzzle 105
  {
    groups: [
      { category: 'Water sports', words: ['SURFING', 'SAILING', 'KAYAKING', 'POLO'], difficulty: 1 },
      { category: 'Things with a paddle', words: ['CANOE', 'PING', 'CREEK', 'BOAT'], difficulty: 2 },
      { category: 'Water ___', words: ['FALL', 'MARK', 'COLOR', 'PROOF'], difficulty: 3 },
      { category: 'Words that can follow "under"', words: ['COVER', 'GROUND', 'DOG', 'WORLD'], difficulty: 4 },
    ],
  },
  // Puzzle 106
  {
    groups: [
      { category: 'Things in a bakery', words: ['LOAF', 'ROLL', 'OVEN', 'TRAY'], difficulty: 1 },
      { category: 'Words meaning "to turn over"', words: ['FLIP', 'TUMBLE', 'ROTATE', 'INVERT'], difficulty: 2 },
      { category: 'Roll ___', words: ['CALL', 'COASTER', 'MODEL', 'PLAY'], difficulty: 3 },
      { category: 'Things measured in dozens', words: ['EGGS', 'ROSES', 'DONUTS', 'OYSTERS'], difficulty: 4 },
    ],
  },
  // Puzzle 107
  {
    groups: [
      { category: 'Types of bridge', words: ['ARCH', 'DRAW', 'SUSPENSION', 'COVERED'], difficulty: 1 },
      { category: 'Things that span', words: ['RAINBOW', 'TIMELINE', 'WINGSPAN', 'CAREER'], difficulty: 2 },
      { category: 'Draw ___', words: ['BACK', 'STRING', 'BRIDGE', 'DOWN'], difficulty: 3 },
      {
        category: 'Words that contain a compass direction',
        words: ['SOUTH', 'NORTHWEST', 'EASTERN', 'WESTERN'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 108
  {
    groups: [
      { category: 'Things that sting', words: ['JELLYFISH', 'NETTLE', 'SCORPION', 'WASP'], difficulty: 1 },
      { category: 'Things with venom', words: ['FANG', 'STINGER', 'BARB', 'SPUR'], difficulty: 2 },
      { category: 'Sharp ___', words: ['SHOOTER', 'TONGUE', 'TURN', 'DRESSER'], difficulty: 3 },
      { category: 'Words meaning "pointless"', words: ['MOOT', 'FUTILE', 'VAIN', 'IDLE'], difficulty: 4 },
    ],
  },
  // Puzzle 109
  {
    groups: [
      { category: 'Things in a forest', words: ['MOSS', 'FERN', 'STREAM', 'LOG'], difficulty: 1 },
      { category: 'Things that grow on trees', words: ['BARK', 'LICHEN', 'FRUIT', 'MISTLETOE'], difficulty: 2 },
      { category: 'Log ___', words: ['JAM', 'CABIN', 'BOOK', 'ROLL'], difficulty: 3 },
      { category: 'Words meaning "to record"', words: ['TAPE', 'CHART', 'TRACK', 'TALLY'], difficulty: 4 },
    ],
  },
  // Puzzle 110
  {
    groups: [
      { category: 'Percussion instruments', words: ['BONGO', 'CYMBAL', 'GONG', 'TAMBOURINE'], difficulty: 1 },
      { category: 'Things that crash', words: ['WAVE', 'PARTY', 'MARKET', 'SYSTEM'], difficulty: 2 },
      { category: 'Crash ___', words: ['LAND', 'PAD', 'COURSE', 'TEST'], difficulty: 3 },
      { category: 'Words containing "ash"', words: ['FASHION', 'BRASH', 'DASHBOARD', 'EYELASH'], difficulty: 4 },
    ],
  },
  // Puzzle 111
  {
    groups: [
      { category: 'Things at an airport', words: ['RUNWAY', 'TERMINAL', 'LOUNGE', 'HANGAR'], difficulty: 1 },
      { category: 'Types of terminal', words: ['BUS', 'COMPUTER', 'BATTERY', 'NERVE'], difficulty: 2 },
      { category: 'Fly ___', words: ['WHEEL', 'PAPER', 'WEIGHT', 'OVER'], difficulty: 3 },
      {
        category: 'Words ending in a silent "e" that changes the vowel',
        words: ['PLANE', 'STRIPE', 'GLOBE', 'FLUTE'],
        difficulty: 4,
      },
    ],
  },
  // Puzzle 112
  {
    groups: [
      { category: 'Martial arts equipment', words: ['MAT', 'GLOVES', 'PADS', 'BELT'], difficulty: 1 },
      { category: 'Things with padding', words: ['CHAIR', 'ENVELOPE', 'CELL', 'RESUME'], difficulty: 2 },
      { category: 'Mat ___', words: ['ADOR', 'RESS', 'CHING', 'TER'], difficulty: 3 },
      { category: 'Words meaning "to guard"', words: ['SHIELD', 'WARD', 'HARBOR', 'SCREEN'], difficulty: 4 },
    ],
  },
  // Puzzle 113
  {
    groups: [
      { category: 'Things at a beach party', words: ['BONFIRE', 'SURFBOARD', 'COOLER', 'VOLLEYBALL'], difficulty: 1 },
      { category: 'Things with a flame', words: ['CANDLE', 'TORCH', 'LIGHTER', 'PILOT'], difficulty: 2 },
      { category: 'Burn ___', words: ['OUT', 'MARK', 'SIDE', 'RATE'], difficulty: 3 },
      { category: 'Words that can follow "slow"', words: ['MOTION', 'POKE', 'COOKER', 'WORM'], difficulty: 4 },
    ],
  },
  // Puzzle 114
  {
    groups: [
      { category: 'Things in a cave', words: ['STALACTITE', 'CRYSTAL', 'ECHO', 'SHADOW'], difficulty: 1 },
      { category: 'Things that echo', words: ['CANYON', 'HALL', 'TUNNEL', 'CHAMBER'], difficulty: 2 },
      { category: 'Echo ___', words: ['LOCATION', 'SYSTEM', 'SOUNDER', 'CARDIOGRAM'], difficulty: 3 },
      { category: 'Words meaning "to reverberate"', words: ['RESOUND', 'RESONATE', 'RING', 'BOOM'], difficulty: 4 },
    ],
  },
  // Puzzle 115
  {
    groups: [
      { category: 'Things with scales', words: ['FISH', 'DRAGON', 'PIANO', 'JUSTICE'], difficulty: 1 },
      { category: 'Things that are balanced', words: ['DIET', 'BUDGET', 'EQUATION', 'SEESAW'], difficulty: 2 },
      { category: 'Scale ___', words: ['MODEL', 'BACK', 'DOWN', 'MAIL'], difficulty: 3 },
      { category: 'Words meaning "to weigh up"', words: ['GAUGE', 'ASSESS', 'MEASURE', 'RECKON'], difficulty: 4 },
    ],
  },
  // Puzzle 116
  {
    groups: [
      { category: 'Shellfish', words: ['LOBSTER', 'CRAB', 'SHRIMP', 'MUSSEL'], difficulty: 1 },
      { category: 'Things at a clambake', words: ['CORN', 'POTATO', 'SAUSAGE', 'BUTTER'], difficulty: 2 },
      { category: 'Crab ___', words: ['APPLE', 'CAKE', 'GRASS', 'WALK'], difficulty: 3 },
      { category: 'Words meaning "to complain"', words: ['GRIPE', 'GRUMBLE', 'MOAN', 'WHINE'], difficulty: 4 },
    ],
  },
  // Puzzle 117
  {
    groups: [
      { category: 'Things with a dial', words: ['RADIO', 'SAFE', 'WATCH', 'OVEN'], difficulty: 1 },
      { category: 'Things that are tuned', words: ['GUITAR', 'ENGINE', 'PIANO', 'ANTENNA'], difficulty: 2 },
      { category: 'Tune ___', words: ['UP', 'SMITH', 'LESS', 'FUL'], difficulty: 3 },
      { category: 'Words meaning "to adjust"', words: ['CALIBRATE', 'TWEAK', 'MODIFY', 'FINE'], difficulty: 4 },
    ],
  },
  // Puzzle 118
  {
    groups: [
      { category: 'Things with a shell', words: ['TURTLE', 'EGG', 'TACO', 'WALNUT'], difficulty: 1 },
      { category: 'Things that crack under pressure', words: ['GLASS', 'ICE', 'VOICE', 'NERVE'], difficulty: 2 },
      { category: 'Nut ___', words: ['CRACKER', 'SHELL', 'CASE', 'MEG'], difficulty: 3 },
      { category: 'Words meaning "crazy" (slang)', words: ['BONKERS', 'BATTY', 'LOOPY', 'CRACKERS'], difficulty: 4 },
    ],
  },
  // Puzzle 119
  {
    groups: [
      { category: 'Things in a gym locker', words: ['TOWEL', 'SNEAKERS', 'PADLOCK', 'BOTTLE'], difficulty: 1 },
      { category: 'Types of lock', words: ['DEAD', 'GRID', 'CANAL', 'DOOR'], difficulty: 2 },
      { category: 'Locker ___', words: ['ROOM', 'COMBO', 'KEY', 'SEARCH'], difficulty: 3 },
      { category: 'Words meaning "to secure"', words: ['FASTEN', 'CLAMP', 'BOLT', 'LATCH'], difficulty: 4 },
    ],
  },
  // Puzzle 120
  {
    groups: [
      { category: 'Things with spots', words: ['LEOPARD', 'LADYBUG', 'DOMINO', 'DICE'], difficulty: 1 },
      { category: 'Things that are dotted', words: ['LINE', 'SWISS', 'MAP', 'NOTE'], difficulty: 2 },
      { category: 'Spot ___', words: ['CHECK', 'LIGHT', 'LESS', 'TED'], difficulty: 3 },
      { category: 'Words meaning "to notice"', words: ['DETECT', 'GLIMPSE', 'OBSERVE', 'SPOT'], difficulty: 4 },
    ],
  },
  // Puzzle 121
  {
    groups: [
      { category: 'Racket sports', words: ['TENNIS', 'BADMINTON', 'SQUASH', 'RACQUETBALL'], difficulty: 1 },
      { category: 'Things that bounce', words: ['CHECK', 'BALL', 'IDEA', 'LIGHT'], difficulty: 2 },
      { category: 'Squash ___', words: ['COURT', 'BLOSSOM', 'MATCH', 'RACKET'], difficulty: 3 },
      { category: 'Words meaning "to crush"', words: ['FLATTEN', 'MASH', 'PRESS', 'TRAMPLE'], difficulty: 4 },
    ],
  },
  // Puzzle 122
  {
    groups: [
      { category: 'Things in a wallet (non-money)', words: ['PHOTO', 'RECEIPT', 'TICKET', 'CARD'], difficulty: 1 },
      { category: 'Card ___', words: ['SHARK', 'BOARD', 'STOCK', 'TRICK'], difficulty: 2 },
      { category: 'Things dealt', words: ['HAND', 'BLOW', 'FATE', 'JUSTICE'], difficulty: 3 },
      { category: 'Words meaning "to cope"', words: ['MANAGE', 'HANDLE', 'TACKLE', 'DEAL'], difficulty: 4 },
    ],
  },
  // Puzzle 123
  {
    groups: [
      { category: 'Things with a pit', words: ['CHERRY', 'PEACH', 'AVOCADO', 'OLIVE'], difficulty: 1 },
      { category: 'Things in a mine', words: ['SHAFT', 'CART', 'RAIL', 'CANARY'], difficulty: 2 },
      { category: 'Pit ___', words: ['FALL', 'STOP', 'BULL', 'CREW'], difficulty: 3 },
      { category: 'Words meaning "trap"', words: ['SNARE', 'LURE', 'AMBUSH', 'DECOY'], difficulty: 4 },
    ],
  },
  // Puzzle 124
  {
    groups: [
      { category: 'Things with antlers', words: ['MOOSE', 'DEER', 'ELK', 'REINDEER'], difficulty: 1 },
      { category: 'Things associated with Christmas', words: ['STOCKING', 'HOLLY', 'TINSEL', 'CAROL'], difficulty: 2 },
      { category: 'Stocking ___', words: ['CAP', 'STUFFER', 'MASK', 'FILLER'], difficulty: 3 },
      { category: 'Words that are also girls names', words: ['GINGER', 'PENNY', 'DAWN', 'CHERRY'], difficulty: 4 },
    ],
  },
  // Puzzle 125
  {
    groups: [
      { category: 'Things with a tail', words: ['COMET', 'KITE', 'SCORPION', 'PLANE'], difficulty: 1 },
      { category: 'Things that wag', words: ['DOG', 'FINGER', 'TONGUE', 'CHIN'], difficulty: 2 },
      { category: 'Tail ___', words: ['GATE', 'SPIN', 'COAT', 'WIND'], difficulty: 3 },
      { category: 'Words meaning "to follow"', words: ['TRAIL', 'SHADOW', 'PURSUE', 'STALK'], difficulty: 4 },
    ],
  },
]
