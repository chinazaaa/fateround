import type { SystemTrophySpec } from './types'

/**
 * Mafia — derived at finish from `mafia_player_states` (role / alive / death_cause / is_lover /
 * bodyguard_hits_taken) and `mafia_sessions.winning_team`. See `./game-facts/mafia.ts`.
 *
 * Ordered bronze → platinum. Every counter here is a per-round 0/1 flag, so the threshold is the
 * default 1 ("did it in a game") throughout. Trophies the persisted data cannot support are simply
 * absent rather than approximated:
 *  - "Townsfolk" (play a game) and "Champion" (win a game) are dropped as generic duplicates of
 *    the platform-wide `games_played` / `games_won` catalog templates.
 *  - Role Player (five distinct roles) and Solo Artist (win as all three solo roles) count DISTINCT
 *    roles, which a single-counter rule cannot express; they belong in `player_distinct`, which no
 *    facts builder emits — omitted rather than shipped unearnable.
 *  - Kingmaker (Mayor public reveal) is omitted: no reveal mechanic exists for the Mayor.
 *  - Framed ("successfully framed") is omitted: the Framer's frame has no persisted success/failure
 *    outcome to key on.
 *  - Vigilante Justice (shoot a mafioso) is omitted: `vigilante_shots_used` counts shots, not the
 *    victim's alignment, so "the target was Mafia" is unknowable at finish.
 *  - The night-outcome trophies (Doctor save, Aura Seer read, Tracker, Perfect Read, Untouchable)
 *    are omitted: their inputs are transient to night resolution and never persisted.
 */
export const MAFIA: SystemTrophySpec[] = [
  // ── Bronze ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'made_man',
    tier: 'bronze',
    title: 'Made Man',
    description: 'Play a game on the Mafia’s side.',
    counter: 'mafia_mafia_games',
    points: 10,
    sortOrder: 10,
  },
  {
    suffix: 'survivor',
    tier: 'bronze',
    title: 'Survivor',
    description: 'Still be alive when the game ends.',
    counter: 'mafia_survivor_games',
    points: 10,
    sortOrder: 20,
  },
  {
    suffix: 'strung_up',
    tier: 'bronze',
    title: 'Strung Up',
    description: 'Get voted out by the village.',
    counter: 'mafia_lynched_games',
    points: 10,
    sortOrder: 30,
  },
  {
    suffix: 'took_the_bullet',
    tier: 'bronze',
    title: 'Took the Bullet',
    description: 'As the Bodyguard, absorb an attack to protect someone.',
    counter: 'mafia_bodyguard_hits',
    points: 15,
    sortOrder: 40,
  },

  // ── Silver ──────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'villager',
    tier: 'silver',
    title: 'Villager',
    description: 'Win a game with the Village.',
    counter: 'mafia_village_wins',
    points: 25,
    sortOrder: 50,
  },
  {
    suffix: 'family_business',
    tier: 'silver',
    title: 'Family Business',
    description: 'Win a game with the Mafia.',
    counter: 'mafia_mafia_wins',
    points: 25,
    sortOrder: 60,
  },
  {
    suffix: 'big_game',
    tier: 'silver',
    title: 'Big Game',
    description: 'Play a game with twelve or more players.',
    counter: 'mafia_big_game_12',
    points: 25,
    sortOrder: 70,
  },
  {
    suffix: 'last_villager',
    tier: 'silver',
    title: 'Last Villager',
    description: 'Be the sole surviving member of the town.',
    counter: 'mafia_last_villager',
    points: 30,
    sortOrder: 80,
  },

  // ── Gold ────────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'cupids_arrow',
    tier: 'gold',
    title: 'Cupid’s Arrow',
    description: 'Win as one of the two Lovers.',
    counter: 'mafia_lovers_wins',
    points: 60,
    sortOrder: 90,
  },
  {
    suffix: 'jesters_wish',
    tier: 'gold',
    title: 'Jester’s Wish',
    description: 'Win as the Jester by getting yourself lynched.',
    counter: 'mafia_jester_wins',
    points: 60,
    sortOrder: 100,
  },
  {
    suffix: 'serial_killer',
    tier: 'gold',
    title: 'Serial Killer',
    description: 'Win the game as the Serial Killer.',
    counter: 'mafia_serial_killer_wins',
    points: 60,
    sortOrder: 110,
  },
  {
    suffix: 'arsonist',
    tier: 'gold',
    title: 'Burn It Down',
    description: 'Win the game as the Arsonist.',
    counter: 'mafia_arsonist_wins',
    points: 60,
    sortOrder: 120,
  },
  {
    suffix: 'full_house',
    tier: 'gold',
    title: 'Full House',
    description: 'Play a full sixteen-player game.',
    counter: 'mafia_full_house_16',
    points: 60,
    sortOrder: 130,
  },

  // ── Platinum ────────────────────────────────────────────────────────────────────────────
  {
    suffix: 'clean_sweep',
    tier: 'platinum',
    title: 'Clean Sweep',
    description: 'Win with the Mafia without losing a single member.',
    counter: 'mafia_clean_sweep_wins',
    points: 150,
    sortOrder: 140,
  },
]
