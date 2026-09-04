# Egress bench

Measures what this app actually costs in Supabase egress, in **bytes and request counts**, so
that performance PRs can be argued from measurement instead of from structural reasoning.

Supabase bills two channels and these benches count both:

1. **REST/PostgREST** — `globalThis.fetch` is wrapped and every response body is weighed, then
   grouped by table/endpoint.
2. **Realtime** — `globalThis.WebSocket` is subclassed and every inbound frame is weighed, then
   grouped by channel/table. This is the channel nothing else in the repo measures.

Both wrappers live in `tally.ts`. **If a number in a bench report did not pass through one of
them, it is an inference, and whoever writes it up must label it as one.**

## What these are not

They are not tests, and they deliberately do not live in `vitest.config.ts`'s `include`. They
take minutes of real wall-clock time, they need a live Supabase, and they must never run in CI
next to the unit suite. They use **real timers**: the thing under test in `poll-gating.bench.tsx`
IS the scheduling, and a fake clock would measure the fake clock.

## Running

```sh
supabase start   # and see scripts/playtest/README.md re: the service_role grant on a fresh reset

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase status -o env | grep NEXT_PUBLIC_SUPABASE_ANON_KEY | cut -d= -f2-)"
export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o env | grep SUPABASE_SERVICE_ROLE_KEY | cut -d= -f2-)"

BENCH_LABEL=baseline npx vitest run --config scripts/bench/vitest.bench.config.ts
```

Results append to `scripts/bench/results/<BENCH_LABEL>.jsonl` (gitignored). To compare a branch
against `dev`, run the identical harness on both and diff the two files:

```sh
node scripts/bench/egress-bench.mjs compare scripts/bench/results/baseline.jsonl scripts/bench/results/branch.jsonl
```

Knobs: `BENCH_WINDOW_MS` (default 180000), `BENCH_DEGRADED_WINDOW_MS` (default 60000),
`BENCH_SAMPLES` (default 5), `BENCH_APP_URL` (default `http://127.0.0.1:3100`).

## Isolation — read this before believing a number

- **Never point a bench at whatever is on `:3000`.** Other sessions run dev servers there, and a
  bench aimed at one measures *that branch's* code while reporting it as yours. Start your own
  server from the worktree under test on a dedicated port and set `BENCH_APP_URL`.
- The local Supabase stack may be **shared**. Every bench seeds fixtures it owns, under the
  `BNC*` id prefix, and filters its measurements to those rows, so another session's games and
  messages cannot leak into a count. Row-count-sensitive benches delete before seeding rather
  than topping up, or reruns would make the growth curve an artefact of the rerun count.
- Where a measurement could still be perturbed by concurrent load, take repeated samples and
  report the spread. `realtime-row.bench.tsx` does this; a spread that is not ~0 means the
  number is not clean enough to base a decision on.

## Gotchas found writing these

- **`SUBSCRIBED` does not mean the postgres_changes binding is live.** The channel join and the
  server's `"Subscribed to PostgreSQL"` system message are separate round trips. Firing the
  UPDATE in between produces zero events, and a bench that averages that in reports realtime as
  free. `realtime-row.bench.tsx` waits for the system frame.
- **jsdom + Node's WebSocket do not compose.** jsdom installs its own `Event` on `globalThis`;
  Node's `WebSocket` builds its `open`/`message` events with `globalThis.Event` and dispatches
  them through Node's `EventTarget`, which rejects any Event that is not its own. The socket
  connects and then dies silently on first dispatch. `setup.bench.ts` recovers Node's native
  `Event` from an `AbortSignal` and restores it. Without that fix, realtime never connects — and
  a bench for a *realtime-gated* optimisation would score the branch as saving nothing. A false
  refutation is the worst outcome a bench can produce, worse than not running.
- **A fresh `[]` passed to a hook is not an empty list, it is a new identity every render.** It
  invalidated `useAnonymousMessages`' `loadMessages`, re-ran the polling effect with
  `runImmediately`, and turned one mount read into 44. Hoist fixture props out of the render.
- **"Zero requests" is two different findings.** For a poll that is gated on realtime health, it
  is the saving; for the same poll after realtime has been taken away, it is a client that will
  never refresh again. `poll-gating.bench.tsx` measures a degraded window as well as a healthy
  one and FAILS if the branch is silent in both.
- Seeding a `games` row needs `host_token` — it is `NOT NULL` even though anon can never read it.
