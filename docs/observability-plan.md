# Observability & uptime plan

Planned work to stop flying blind in production. Today FateRound runs on a **single AWS EC2**
box (Caddy origin-TLS → Next.js container on `:8080`, behind Cloudflare) with Supabase as the
backend and a self-hosted LiveKit — and there is **no external uptime monitoring and no
tracing/metrics**. If the box wedges, a route gets slow, or a Supabase/LiveKit dependency
degrades, we find out from users. Two complementary tracks fix that:

- **UptimeRobot** — external, black-box _"is it up?"_ + alerting. Cheap, fast to land.
- **OpenTelemetry** — internal, white-box _"why is it slow / erroring?"_ traces + metrics.

Do **UptimeRobot first** (small, high value), then OTel.

---

## Track 1 — UptimeRobot (external uptime + alerting)  · Effort S

**Goal:** know within minutes if prod (`fateround.com`) or dev (`dev.fateround.com`) is down,
with alerts to a channel we actually watch. Single-EC2 = no redundancy, so an early ping matters.

### 1a. Add a health endpoint  (code — this repo)
Add `GET /api/health` (there is none today — nearest existing ops surface is the freeze-recovery
`/api/describe-it/tick`). Two levels so the external check stays cheap:
- **Liveness (default):** returns `200 {"status":"ok","commit":<GIT_SHA>}` immediately — no I/O.
  Proves the container is up and serving. This is what UptimeRobot polls.
- **Readiness (`?deep=1`):** additionally does a short, timeout-guarded `SELECT 1` against
  Supabase (anon client) and returns `503` if the DB is unreachable. Used by a separate,
  lower-frequency monitor so a Supabase outage is distinguishable from an app outage. Keep it
  cheap and abuse-resistant (hard timeout, no query params echoed).

Wire `commit` from the image build (the CI already stamps `GITHUB_SHA`; expose it as an env/build
arg, mirroring the existing `NEXT_PUBLIC_*` plumbing).

### 1b. Configure monitors (UptimeRobot dashboard or API/Terraform)
- HTTPS keyword monitor → `https://fateround.com/api/health`, keyword `"ok"`, 5-min interval
  (free tier), alert after **2 consecutive** failures (avoid flap).
- HTTPS keyword monitor → `https://dev.fateround.com/api/health`.
- HTTPS monitor → `https://fateround.com/api/health?deep=1` (DB readiness), 5-min.
- (Optional) LiveKit: HTTPS monitor on the LiveKit host so a comms outage is visible.
- **Alert contacts:** email + a Slack/Discord webhook (pick one we watch).
- (Optional) Public status page → `status.fateround.com` (Cloudflare CNAME to the UptimeRobot
  status page).

### Decisions to make
- **Free tier (5-min interval, 50 monitors) vs paid (1-min).** Start free; upgrade if 5 min is
  too coarse.
- **UptimeRobot vs Cloudflare Health Checks vs BetterStack.** UptimeRobot is the ask; Cloudflare
  Health Checks is a viable complement (already on Cloudflare) — note but don't block on it.
- Whether to manage monitors as code (UptimeRobot Terraform provider, key in the existing secrets
  store) or click-ops in the dashboard. Lean click-ops first; codify if it sprawls.

---

## Track 2 — OpenTelemetry (traces + metrics)  · Effort M

**Goal:** see slow API routes, Supabase query latency, and external-call latency (LiveKit token
issuance, Klipy GIFs, Anthropic AI-questions) as distributed traces, plus a few business metrics —
instead of guessing from a single box with no APM.

### 2a. App instrumentation (code — this repo)
- Add `src/instrumentation.ts` using **`@vercel/otel`** (framework-agnostic — runs on our
  self-hosted Node container, not just Vercel; auto-instruments `fetch` + Next.js server spans
  with the least code). Raw `@opentelemetry/sdk-node` is the fallback if we need finer control.
- Export via **OTLP** to an **OTel Collector running on the EC2 box** (systemd unit, same pattern
  as Caddy + the tick timer), which batches/retries and forwards to the chosen backend. Keeps
  exporter creds off the app and lets us swap backends without redeploying.
- Config via env, per-environment (dev/prod), added to SSM + build args like the other secrets:
  `OTEL_SERVICE_NAME=fateround`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES`
  (env, commit), and a sampling ratio.

### 2b. Custom spans + metrics (incremental)
- Spans around Supabase calls and the external integrations (LiveKit / Klipy / Anthropic) so the
  slow dependency is obvious in a trace.
- A handful of business metrics: games created, currently-active games, join failures,
  freeze-recovery tick duration/failures (the tick is our existing liveness heartbeat).
- Correlate logs later (pino → OTLP, or ship to the same backend) — phase 3, optional.

### Decisions to make
- **Backend:** Grafana Cloud (traces+metrics+logs, generous free tier) vs Honeycomb (best trace
  UX, free 20M events/mo) vs Axiom. Recommend starting with **Grafana Cloud** (one backend for all
  three signals) unless we want Honeycomb's trace exploration.
- **Sampling:** head sampling (~10–20% of traces) but **always-sample errors**; revisit if volume
  is low enough to keep 100%.
- **Collector on-box vs direct OTLP export** from the app. Prefer the on-box collector (buffering
  + backend-swap without redeploy); direct export is simpler if we want to skip running one more
  process on the single box.

---

## Sequencing
1. `/api/health` endpoint + UptimeRobot monitors + one alert channel  → immediate safety net.
2. `@vercel/otel` + OTLP → collector → backend; validate traces for the hot API routes.
3. Custom Supabase/external spans + business metrics; (optional) log correlation and a status page.

_Both are infra/ops initiatives, tracked in [architecture-debt.md](./architecture-debt.md) under
"Phase 5 — Observability & operations". Deployment context: [environments.md](./environments.md)._
