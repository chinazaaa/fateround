-- Mafia: replace the long per-role Advanced checklist with a single Classic/Advanced switch.
-- Classic (default): Bodyguard, Serial Killer, Priest. Advanced: Trapper, Arsonist, Vigilante
-- (plus Witch and Little Girl become available). The investigator trio (Aura Seer / Seer /
-- Detective) and Mafia specialist pool (Alpha Wolf / Wolf Cub / Framer) are randomized per game
-- regardless of this switch — see resolveMafiaRoundToggles() in src/lib/mafia.ts. Detective
-- itself becomes Tracker when Advanced mode is on and Detective wins the investigator slot.
ALTER TABLE games
ADD COLUMN IF NOT EXISTS mafia_advanced_mode boolean NOT NULL DEFAULT false;

GRANT SELECT (mafia_advanced_mode) ON public.games TO anon, authenticated;
