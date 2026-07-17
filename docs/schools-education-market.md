# Schools & Education — Market Thesis (exploration)

Status: **Exploration / thesis — parked, not scheduled.** Created 2026-07-17.
Not part of the consumer build roadmap in
[`platform-features-master-plan.md`](./platform-features-master-plan.md); it's an **adjacent B2B
revenue track**. Documented now so it (a) isn't lost and (b) can *inform* product decisions we make
today (content curation, a "managed mode" flag) so a school edition is cheap to switch on later.

> **One-line thesis:** FateRound's trivia + word/puzzle games are already a classroom-engagement
> product. Schools are a **higher-value, stickier, budget-funded** customer than consumer cosmetics.
> The wedge is **individual play on the school's own devices** (a computer lab / class set of tablets)
> — which the product already does — so the work is packaging: a **safe curated catalog**, a
> **teacher/managed mode**, and a **B2B sales motion**, not a rebuild.

---

## 1. Why this is real (not a cute side idea)

- **The category is proven at scale.** Classroom trivia is literally what **Kahoot!** is — a
  multi-billion-dollar company — with Blooket, Gimkit, Quizizz, Quizlet Live all following. "Games
  in the classroom" is a validated market, not a bet on whether it works.
- **Nigeria angle.** Private schools are numerous, fee-paying, competitive on "we use tech," and
  there's a strong inter-school quiz culture (Cowbellpedia-style competitions). A platform that runs
  *class warm-ups, inter-house quizzes, and inter-school competitions* fits a real cultural habit.

## 2. Why it might be BIGGER revenue than consumer (the counter-intuitive part)

The founder's instinct was "cool but maybe not as big." The economics suggest the opposite:

| | Consumer (current model) | Schools (B2B) |
|---|---|---|
| Deal shape | Many people × ~₦400 impulse | One invoice × much larger |
| Example value | ₦400 skin, one-off | ₦80k–200k/yr per school (illustrative) |
| Renewal | none | **annual**, budget-funded, predictable |
| Stickiness | low (churn) | high (embedded in lesson routine) |
| Volume needed | huge | modest (dozens of schools = meaningful ARR) |

**Trade-off (the honest downside):** the *sales cycle is slow*. Schools buy through a champion
(proprietor / head / IT or subject teacher), often want a **free pilot term first**, and move on
budget cycles. This is relationship + pilot selling, not app-store installs. Higher value per deal,
lower volume, longer to close.

## 3. The device question — individual play is the wedge, not whole-class

The founder flagged the "no phones in school" constraint, and it's real — but it does **not** point
to a whole-class no-device mode as the wedge, because **the flagship games are individually scored.**
Trivia ranks each student, Word Hunt / Sudoku / Word Search are solo puzzles — they *need one screen
per student*. A shared projector can't run them. So the target school is one with **devices the
school provides**, and the product works as-is (individual play).

Three deployment modes, reordered by fit for the games that matter:

1. **Computer-lab / one-per-student (school-provided devices) — the primary model.** Students each
   on a lab PC / tablet / Chromebook. This is exactly what the product already does — every player on
   a device — so **little to no new work**, and it's the right fit for Trivia + word/puzzle games.
   The target school is one with a **computer lab or a class set of tablets** (many private schools
   have these). Students don't need *their own* phones; the school's devices suffice.
2. **One-device-per-team.** A handful of tablets; groups huddle around one. Fits the *team* games
   (Codewords, Describe It, team Trivia) but not individual puzzles. Modest new work (team-owns-a-seat).
3. **Whole-class / projector, zero student devices.** Teacher's screen on the projector, students
   shout / buzz / raise hands, teacher taps. **Only works for team/quiz-show-style play, not the
   individual puzzles** — so it's a *secondary* mode, not the wedge, and it's the most net-new work.
   Build it later if demand appears; don't lead with it.

**Recommendation:** lead with **mode 1 (individual, school-provided devices)** — it needs the least
new work and fits the flagship games. Qualify schools on "do you have a computer lab / class set of
tablets?" Treat modes 2–3 as later add-ons for the team games, not the opening bet.

## 4. Which games fit school (and which absolutely don't)

**Strong fits (curriculum-aligned):**
- **Trivia** — the flagship. The real product is **curriculum question packs by subject / grade /
  term** (Maths, English, Science, Social Studies…). This is where the content value lives.
- **Word / literacy:** Word Hunt, Word Search, Crossword, Scrabble, Word Scramble, Describe It,
  Codewords — English & vocabulary.
- **Numeracy / logic:** Sudoku.
- Possible new mode: a **Spelling Bee**.

**Must be excluded — adult party content, cannot be near a classroom:** Mafia, Smash or Pass,
Smash Marry Kill, Red Flag / Green Flag, Never Have I Ever, Hot Seat, Would You Rather (unless
curated), Date My Kid, etc.

➡️ **A curated "school-safe catalog" is a hard requirement, not optional.** This is the single most
important trust gate for selling to schools.

## 5. How much is already built (the strategic gift)

School needs map almost 1:1 onto systems already planned or shipped:

| School need | Existing / planned system | Doc |
|---|---|---|
| A class with a roster & teams | **Clubs** (a class *is* a club) | [`clubs-spec.md`](./clubs-spec.md) |
| Inter-house / inter-school competitions | **Tournaments** (already shipped) | account-tiers §Tournaments |
| Students without emails/accounts (minor privacy) | **Anonymous-first identity** — teacher holds the account, students are seats | [`trophies-and-streaks.md`](./trophies-and-streaks.md) §2 |
| Teachers loading their own content | **Custom questions + admin puzzle themes** (built) | admin-puzzle-themes |
| Daily classroom warm-up | **Daily Challenge** | [`high-scores-leaderboards-plan.md`](./high-scores-leaderboards-plan.md) |
| Motivation / gamification | **Trophies, streaks, leaderboards** | trophies + high-scores |

So the school edition is **~80% packaging of existing systems**, ~20% net-new.

## 6. The net-new work (3 core things + 1 later)

Because the wedge is **individual play on school devices** (§3 mode 1), which the product already
does, the net-new list is *smaller* than first thought — no-device mode is deferred.

1. **School-safe curated catalog** + curriculum question packs (subject/grade/term). Content is the
   moat here, and the #1 trust gate.
2. **Teacher / school-admin role + "managed mode"** — a flag that **hides all cosmetic & purchase
   prompts from students** (selling skins to kids in class is a non-starter), plus locked-down
   privacy (no public rooms with strangers, no open chat with outsiders — critical for minors), and
   a **teacher dashboard** to launch a game to the class and see results.
3. **A B2B sales motion** — free pilot-term offer, banded whole-school pricing (§7A), a champion-led
   pitch. Different muscle from consumer growth.
4. *(Later, only if demand appears)* **Whole-class projector / team-buzz mode** for the team games —
   the most net-new work, and *not* the opening bet (§3 mode 3).

## 6A. Pricing strategy (the recommended model)

**Two anti-patterns to avoid first:**
- **❌ Per-student billing.** Puts a scary "×500" multiplication on every quote and creates a
  head-counting / compliance burden. It reads as a tax on enrolment. Don't.
- **❌ Per-game / usage metering** (the tempting "bill per number of games" idea). Backwards for this
  market for two reasons: schools need a **predictable annual budget** (a meter they can't forecast
  kills the sale), and metering **penalises the exact engagement we want to grow** — we want them
  playing *more*, not watching a counter. A meter taxes success.

**✅ Recommended: a flat, whole-school annual license, priced in size bands, with a per-teacher
entry and one-off event fees.**

| Line | What it is | Why it's attractive |
|---|---|---|
| **Whole-school site license** *(primary)* | One flat annual (or per-**term** — schools think in 3 terms) fee. **Unlimited students.** Priced in **size bands** (e.g. small / medium / large by enrolment) so it's fair without ever showing a per-student number. | One clean figure, easy to budget, flat = encourages usage, no head-counting. |
| **Per-teacher / single-classroom license** *(entry — land & expand)* | One teacher licenses their class cheaply, proves it, then pulls the school into the site license. The "seat" is the **teacher, never the student**. | Low-risk way in; how Kahoot grows. Bottom-up champion → top-down purchase. |
| **Competition / event hosting** *(one-off upsell)* | A one-off fee to run an inter-house or inter-school quiz/tournament (rides the shipped Tournaments system). | Usage-*flavoured* revenue, but framed as an **event** (like renting a venue) schools understand and budget — not a meter on daily play. |
| **Free pilot term** *(acquisition, not revenue)* | One class/school, one term, flagship games, free. | De-risks the buy; lets a real classroom prove the wedge before money changes hands. |

**Why banded-site-license beats the alternatives:** predictable (annual/per-term budget line),
flat (no penalty for playing more → drives the stickiness that renews the contract), fair (bands
track school size), and *simple to quote* (one number, no per-user math). It also matches how school
budgets actually work — a line item per year, approved once.

**Content packs as a later add-on:** premium curriculum question packs (e.g. exam-prep, WAEC/JAMB-
style, subject bundles) can sell *on top* of the license — content is the moat and a natural upsell,
without touching the flat base price.

> Concrete figures deliberately omitted — real numbers need pilot data + a look at what schools
> already pay for tools. The *structure* above is the recommendation; the *amounts* are a later pass.

## 6B. How "hiding the party games" actually works (architecture)

**The key reframe: hiding games is an *access-policy* problem, not a *URL* problem.** A per-school
subdomain (`pampas.fateround.com`) is about *branding*; what a student can open is about
*permissions*. Using the domain to control access would mean wildcard DNS + per-school SSL + tenant
routing just to filter a list — heavy infra for the wrong reason. **Keep branding and access
separate.** The mechanism is two small primitives:

**1. Tag the content (once).** Every game — and every question pack — gets an **audience rating**:
simplest is a `school_safe boolean`; richer is `audience: 'everyone' | 'teen' | 'mature'`. Mafia,
Smash or Pass, Never Have I Ever, Smash Marry Kill, Hot Seat, etc. → not school-safe. This is a
reusable data attribute (it also powers a general "family-friendly" filter for regular users and
age-gating later), and it's the [`insurance decision`](#7-product-decisions-to-make-now-so-this-stays-cheap-later)
below made concrete.

**2. Make "school" a *mode on the account/org*, not a domain.** A **School** is an organization
record; teachers belong to it (`profiles.school_id`). When a teacher creates a room *under their
school*, the room is flagged **`managed`**, and the managed policy = { only `school_safe` games,
no purchase prompts, private rooms only, no stranger contact }.

**How the hiding then falls out:**
- **Create-game grid is filtered by context.** Host acting under a school → grid shows only
  school-safe games. Regular user → no school context → full catalog, unchanged. *Same screen, one
  conditional filter — not a separate build.*
- **Filter AND enforce server-side.** Merely hiding a tile is not safe — a student could URL-hop
  straight into Mafia. The room-create endpoint **rejects** non-safe `game_type`s for a managed
  context. Hidden-but-reachable is only acceptable as soft de-emphasis for *adult* users, never for
  a school.
- **Students inherit the policy from the room, no per-student flag needed.** They join the teacher's
  managed room → safe catalog + no shop prompts + private, automatically. Policy travels with the
  room via its host's org.

**Data sketch (light):**
```
schools           (id, name, policy jsonb, created_at)         -- the org above classes
profiles.school_id → schools(id)                                -- teachers belong to a school
games.audience    text default 'everyone'  -- or games.school_safe boolean
games rooms: managed boolean default false  -- set when host acts under a school
```
A **class = a Club** ([`clubs-spec.md`](./clubs-spec.md)); a **School = the org above the classes**.
Reuse Clubs for rosters/teams; the School row just carries the safety policy + billing.

**On subdomains / vanity URLs:** optional *later* branding only (`pampas.fateround.com` or a lighter
`/s/pampas` link with the school's logo) — decoupled from access control. Do **not** build it to
hide games.

## 7. Product decisions to make *now* so this stays cheap later

Even though this is parked, two low-cost choices today keep the door open (see §6B for the concrete
shape):
- **Build content curation so a catalog can be *scoped*** — add the `audience` / `school_safe` tag on
  games & question packs, and make the create-game grid read a "allowed audience" from context.
  Retrofitting a safe subset later is painful.
- **Design monetization prompts behind a suppressible "managed mode" flag** rather than hard-coding
  them into screens. A managed (school) room just flips it off.

Neither blocks the consumer roadmap; both are cheap insurance.

## 8. Who to pitch (the "body that would use this")

The founder's real question — *who's the buyer?* Candidates, likely in order:
- **Private school proprietors / heads** (Nigeria) — fastest-moving, budget authority, tech-as-
  differentiator.
- **Subject teachers** as champions (English, Maths, GK/quiz-club masters) — bottom-up adoption that
  a proprietor then pays for.
- **Quiz / debate clubs & inter-school competition organizers** — natural fit for Tournaments.
- **Ed-tech resellers / school-management-software partners** — distribution leverage later.
- (Longer shot) **state education bodies / NGOs** running literacy/numeracy programs — big but slow.

## 9. Risks / open questions

- **Sales cycle length & the pilot-to-paid conversion** — unproven; needs 2–3 real pilot schools.
- **Device reality per school** — the wedge assumes a **computer lab / class set of tablets**;
  qualify on this early. Schools without any student devices are out of scope until (if ever) the
  whole-class projector mode (§3 mode 3) is built.
- **Content credibility** — curriculum alignment may need a teacher/consultant to author packs.
- **Child-safety / data posture** — even anonymous-first, selling to schools invites scrutiny; needs
  a clear "no ads, no stranger contact, no purchases shown to students" stance.
- **Support & onboarding load** — schools need more hand-holding than consumers.

## 10. Recommendation

- **Pursue as a deliberate second track *after* the consumer foundation (Batch 1–2 at least) exists**
  — because the school edition rides on identity + clubs + tournaments. Don't split focus before the
  base is real.
- **Do the two cheap insurance decisions now** (§7) so the pivot is later a config, not a rebuild.
- **Validate with a single pilot** (one friendly private school *with a computer lab / tablets*, one
  term, Trivia + word games played individually, free) — let a real classroom prove the wedge before
  investing. Because individual-on-school-devices needs little new build, a pilot can run on close to
  today's product.
- **Keep it out of the consumer batched roadmap** — it's a parallel GTM bet with its own doc (this
  one), revisited once the base platform is live.

---

## What this is NOT (yet)
- Not scheduled, not a committed batch, not costed.
- Not a content library — curriculum packs are unbuilt.
- Pricing figures here are **illustrative**, not researched. A real pricing pass needs pilot data.
