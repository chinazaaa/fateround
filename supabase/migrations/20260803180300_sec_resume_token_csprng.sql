-- Strengthen player resume_token generation.
--
-- resume_token is the ONLY credential in the anonymous-player model (it authorizes
-- player actions and, as of this change set, LiveKit voice access). The trigger minted
-- it as 6 chars from a 32-symbol alphabet using non-cryptographic `random()` — ~30 bits
-- from a state-recoverable PRNG. The token is carried in share URLs (not typed by hand)
-- and shown masked in the UI, so we can raise both the entropy and the length without any
-- UX cost.
--
-- New tokens: 16 uppercase hex chars (64 bits) from pgcrypto's gen_random_bytes(8).
--
-- NOT the first 16 hex of a gen_random_uuid(): a v4 UUID carries fixed version/variant bits,
-- and character 13 of the de-hyphenated string is ALWAYS '4' (verified over 500 samples).
-- That would be 15 random hex chars — 60 bits — plus one constant, which is both weaker than
-- advertised and a needlessly odd shape for a credential (flagged in review on PR #738).
--
-- Uppercase hex is a subset of [A-Z0-9], so it survives normalizeResumeToken() (which
-- uppercases + strips to [A-Z0-9]) unchanged. Existing tokens keep working (comparisons are
-- equality-based); we do NOT rotate them.

CREATE OR REPLACE FUNCTION set_player_resume_token()
RETURNS TRIGGER AS $$
DECLARE
  candidate text;
  attempts int := 0;
BEGIN
  IF NEW.resume_token IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    -- 16 uppercase hex chars = 8 CSPRNG bytes = 64 bits, no fixed bits.
    -- Fall back to the UUID form if pgcrypto is somehow unavailable: a weaker token beats a
    -- trigger that raises and blocks every player from joining.
    begin
      candidate := upper(encode(gen_random_bytes(8), 'hex'));
    exception
      when undefined_function then
        candidate := upper(replace(gen_random_uuid()::text, '-', ''));
        candidate := upper(substr(candidate, 1, 12) || substr(candidate, 17, 4));
    end;
    IF NOT EXISTS (
      SELECT 1 FROM players p
      WHERE p.game_id = NEW.game_id AND p.resume_token = candidate
    ) THEN
      NEW.resume_token := candidate;
      RETURN NEW;
    END IF;
    attempts := attempts + 1;
    IF attempts > 24 THEN
      RAISE EXCEPTION 'Could not generate player resume token';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger definition is unchanged; CREATE OR REPLACE above swaps the body in place.
