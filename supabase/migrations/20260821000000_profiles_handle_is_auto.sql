-- Track whether a profile's handle is still the auto-assigned random name (e.g. "SwiftFalcon12")
-- vs a name the player actually chose. Lets the finish-screen "make it yours" nudge target only
-- players who haven't personalized yet, without nagging existing named users.
--
-- Default false so every EXISTING profile (which already has a real/chosen name, or none) is
-- treated as "not auto" and never nudged. New anon profiles set it true when the random name is
-- assigned; setting a handle via /api/profile/me clears it back to false.

alter table profiles add column if not exists handle_is_auto boolean not null default false;
