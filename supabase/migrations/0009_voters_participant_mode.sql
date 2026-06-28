-- Allow voter-only mode: host list appears in rounds; players join separately to vote
alter table games drop constraint if exists games_participant_mode_check;
alter table games add constraint games_participant_mode_check
  check (participant_mode in ('import', 'joiners', 'voters'));
