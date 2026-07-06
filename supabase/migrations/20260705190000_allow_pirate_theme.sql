-- Migration: Allow 'pirate' as a valid theme in the games table check constraint

alter table games drop constraint if exists games_theme_check;
alter table games add constraint games_theme_check check (theme in ('default', 'neon', 'retro', 'elegant', 'tropical', 'pirate'));
