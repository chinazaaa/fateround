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

### 2a. App instrumentation (code — this repo)  ✅ DONE + wired (dormant)
- ✅ `src/instrumentation.ts` uses **`@vercel/otel`** (framework-agnostic — runs on our
  self-hosted Node container; auto-instruments `fetch` + Next.js server spans with the least
  code). It is a deliberate **no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set**, so it ships
  dark. Raw `@opentelemetry/sdk-node` remains the fallback if we need finer control. (PR #400.)
- ✅ Runtime config wired through **SSM → container** in `infra/` — `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `OTEL_EXPORTER_OTLP_HEADERS` (SecureString), `OTEL_RESOURCE_ATTRIBUTES` — count-gated on the
  endpoint being set (mirrors the VAPID/Spotify optional-secret pattern) and read optionally at
  deploy time. `service.name` defaults to `fateround` in code, so no `OTEL_SERVICE_NAME` needed.
  **Remaining to light it up:** create the backend stack (below), then set the endpoint + headers
  in `terraform.<env>.tfvars` and `terraform apply` (replaces the instance) — no code change.
- **Chose direct OTLP export** (app → backend) over an on-box collector for the MVP: one fewer
  process on the single box, and the endpoint is env-driven so we can later point it at a
  `localhost:4318` collector without a code change if buffering/backend-swap becomes worth it.

### 2b. Custom spans + metrics (incremental)
- Spans around Supabase calls and the external integrations (LiveKit / Klipy / Anthropic) so the
  slow dependency is obvious in a trace.
- A handful of business metrics: games created, currently-active games, join failures,
  freeze-recovery tick duration/failures (the tick is our existing liveness heartbeat).
- Correlate logs later (pino → OTLP, or ship to the same backend) — phase 3, optional.

### Decisions to make
- **Backend (still open — the one remaining blocker to lighting OTel up):** Grafana Cloud
  (traces+metrics+logs, generous free tier) vs Honeycomb (best trace UX, free 20M events/mo) vs
  Axiom. Recommend starting with **Grafana Cloud** (one backend for all three signals) unless we
  want Honeycomb's trace exploration. Create the stack, grab its OTLP endpoint + auth header, drop
  them into `terraform.<env>.tfvars` (`otel_exporter_otlp_endpoint` / `otel_exporter_otlp_headers`).
- **Sampling:** head sampling (~10–20% of traces) but **always-sample errors**; revisit if volume
  is low enough to keep 100%. Not yet wired (defaulting to 100% on a single low-traffic box is
  fine to start) — add `OTEL_TRACES_SAMPLER` env when volume warrants.
- **Collector on-box vs direct OTLP export** — ✅ resolved: **direct export** for the MVP (see 2a).
  Revisit an on-box collector only if we need buffering or backend-swap-without-redeploy.

---

## Sequencing
1. ✅ `/api/health` endpoint (PR #393) — live in prod. ⏳ UptimeRobot monitors + one alert channel
   still to be configured in the dashboard (external, no code).
2. ✅ `@vercel/otel` app instrumentation (PR #400) + ✅ SSM→container env wiring for direct OTLP
   export. ⏳ Create the backend stack (Grafana Cloud), set the endpoint+headers in tfvars, apply,
   and validate traces for the hot API routes.
3. Custom Supabase/external spans + business metrics; (optional) log correlation and a status page.

_Both are infra/ops initiatives, tracked in [architecture-debt.md](./architecture-debt.md) under
"Phase 5 — Observability & operations". Deployment context: [environments.md](./environments.md)._
