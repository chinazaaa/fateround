# Coins — Privacy Policy addition

Drop-in language covering the device identifier retained for the
guest-earnings feature. Add this to the existing privacy policy under
whatever section covers gameplay data / device identifiers, or as a
standalone bullet under "Information we collect."

## Recommended text

> **Guest gameplay identifiers.** When you play FateRound without an
> account, we generate a temporary device identifier and per-session
> identifier that we use to track any Coins you earn during those
> games. This lets us grant those Coins to your account if you later
> sign up on the same device. These identifiers are stored for up to
> **7 days** after the game session, then automatically deleted. If
> you never sign up, the identifiers and the associated Coin totals
> expire and are removed.

## Notes for the team

- The 7-day window matches the `guest_pending_grants` retention rule
  in `coins-and-shop-plan.md` § "Guest earnings & migration to
  signed-up profiles." Keep them consistent; if the retention window
  changes in one place, change it here too.
- The device identifier is the anonymous id already used for guest
  players — this addition documents an existing identifier's use in
  a new feature; you are not introducing a new identifier.
- No new user-facing consent flow is required for this addition
  under most jurisdictions, because the identifier is purely
  functional (grant continuity, not tracking or advertising). If your
  jurisdiction requires it, add a short one-line disclosure to the
  guest-play entry point (e.g. tooltip on the "Play as guest"
  button).
- When Phase 6 (real-money coin packs) ships, revisit the privacy
  policy for payment-processor data, receipt storage, and tax
  reporting obligations. Not needed at v1.
