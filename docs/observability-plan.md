# Observability & uptime plan

Planned work to stop flying blind in production. Today FateRound runs on a **single AWS EC2**
box (Caddy origin-TLS → Next.js container on `:8080`, behind Cloudflare) with Supabase as the
backend and a self-hosted LiveKit. A `/api/health` endpoint now ships (Track 1a below) and
OpenTelemetry tracing is **live on dev** (Track 2 — traces are exporting and Application
Observability is generating RED metrics from them). Still outstanding: **no external uptime
monitoring is wired to the health endpoint, and prod is not yet exporting traces** (its OTLP
auth header is unset). If the box wedges, a route gets slow, or a Supabase/LiveKit dependency
degrades in prod, we still find out from users. Two complementary tracks fix that:

- **UptimeRobot** — external, black-box _"is it up?"_ + alerting. Cheap, fast to land.
- **OpenTelemetry** — internal, white-box _"why is it slow / erroring?"_ traces + metrics.

Do **UptimeRobot first** (small, high value), then OTel.

---

## Track 1 — UptimeRobot (external uptime + alerting) · Effort S

**Goal:** know within minutes if prod (`fateround.com`) or dev (`dev.fateround.com`) is down,
with alerts to a channel we actually watch. Single-EC2 = no redundancy, so an early ping matters.

### 1a. Add a health endpoint (code — this repo) ✅ DONE (PR #393, live in prod)

`GET /api/health` (PR #393) — two levels so the external check stays cheap:

- **Liveness (default):** returns `200 {"status":"ok","commit":<GIT_SHA>}` immediately — no I/O.
  Proves the container is up and serving. This is what UptimeRobot polls.
- **Readiness (`?deep=1`):** additionally does a short, timeout-guarded `SELECT 1` against
  Supabase (anon client) and returns `503` if the DB is unreachable. Used by a separate,
  lower-frequency monitor so a Supabase outage is distinguishable from an app outage. Keep it
  cheap and abuse-resistant (hard timeout, no query params echoed).

`commit` is stamped into the image at build time — the Dockerfile takes `ARG GIT_SHA` (CI passes
`github.sha`) and exposes it as `ENV GIT_SHA`, which the route reads via `process.env.GIT_SHA`
(falling back to `unknown`). ✅ done.

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

## Track 2 — OpenTelemetry (traces + metrics) · Effort M

**Goal:** see slow API routes, Supabase query latency, and external-call latency (LiveKit token
issuance, Klipy GIFs, Anthropic AI-questions) as distributed traces, plus a few business metrics —
instead of guessing from a single box with no APM.

### 2a. App instrumentation (code — this repo) ✅ DONE + wired · dev LIVE, prod pending

- ✅ `src/instrumentation.ts` uses **`@vercel/otel`** (framework-agnostic — runs on our
  self-hosted Node container; auto-instruments `fetch` + Next.js server spans with the least
  code). It is a deliberate **no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set**, so it ships
  dark. Raw `@opentelemetry/sdk-node` remains the fallback if we need finer control. (PR #400.)
- ✅ Runtime config wired through **SSM → container** in `infra/` — `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `OTEL_EXPORTER_OTLP_HEADERS` (SecureString), `OTEL_RESOURCE_ATTRIBUTES` — count-gated on the
  endpoint being set (mirrors the VAPID/Spotify optional-secret pattern) and read optionally at
  deploy time. `service.name` defaults to `fateround` in code, so no `OTEL_SERVICE_NAME` needed.
  **Status:** the backend stack now exists (a Grafana Cloud stack — see 2b). **dev is lit up**:
  `otel_exporter_otlp_endpoint` + `otel_exporter_otlp_headers` are set in `terraform.dev.tfvars`,
  applied, and traces are exporting. **prod is not yet wired** — `terraform.prod.tfvars` has the
  endpoint but an empty `otel_exporter_otlp_headers`, so prod exports nothing. To finish prod:
  mint a prod access-policy token on the stack, set the headers in `terraform.prod.tfvars`, and
  `terraform apply` (replaces the instance) — no code change. Per-env separation is by
  `deployment.environment` in `otel_resource_attributes`, so both point at one stack.
- **Chose direct OTLP export** (app → backend) over an on-box collector for the MVP: one fewer
  process on the single box, and the endpoint is env-driven so we can later point it at an on-box
  collector without a code change if buffering/backend-swap becomes worth it (that would export to
  the collector over `host.docker.internal`/host networking — the container can't reach the host's
  own `localhost`).

### 2b. Custom spans + metrics (incremental)

- Spans around Supabase calls and the external integrations (LiveKit / Klipy / Anthropic) so the
  slow dependency is obvious in a trace.
- A handful of business metrics: games created, currently-active games, join failures,
  freeze-recovery tick duration/failures (the tick is our existing liveness heartbeat).
- Correlate logs later (pino → OTLP, or ship to the same backend) — phase 3, optional.

### Decisions to make

- **Backend — ✅ resolved: Grafana Cloud** (one stack for traces+metrics+logs, free tier). Chosen
  over Honeycomb / Axiom for single-backend simplicity across all three signals. The stack is
  created and dev exports to it; Application Observability is activated on dev (auto RED metrics
  from traces). Its OTLP endpoint + auth header live in `terraform.<env>.tfvars`
  (`otel_exporter_otlp_endpoint` / `otel_exporter_otlp_headers`, the latter a SecureString). The
  free trial converts to the Free tier with no card on file (usage is well under free limits).
- **Sampling:** head sampling (~10–20% of traces) but **always-sample errors**; revisit if volume
  is low enough to keep 100%. Not yet wired (defaulting to 100% on a single low-traffic box is
  fine to start) — add `OTEL_TRACES_SAMPLER` env when volume warrants.
- **Collector on-box vs direct OTLP export** — ✅ resolved: **direct export** for the MVP (see 2a).
  Revisit an on-box collector only if we need buffering or backend-swap-without-redeploy.

---

## Track 3 — Sentry (error reporting) · Effort S ✅ DONE (code)

**Goal:** know that something *threw*, and where. OTel answers "why is it slow" and the health
endpoint answers "is it up"; neither surfaces an exception on one route for one player. Until
now the only record of a client-side crash was a `console.error` in the broken tab — which is
exactly why four attempts at the tab-resume bug shipped without anyone seeing what actually
threw (see the note at the top of `src/app/error.tsx`).

### 3a. App instrumentation (code — this repo) ✅ DONE

`@sentry/nextjs`, wired for **errors only** across all three runtimes:

- `src/instrumentation-client.ts` — browser.
- `src/sentry.server.config.ts` / `src/sentry.edge.config.ts` — imported from `register()` in
  `src/instrumentation.ts`; the `onRequestError` export in that file is what forwards uncaught
  server-component / route-handler / middleware errors.
- `src/app/error.tsx` reports from the route-level boundary; `src/app/global-error.tsx` is new
  and catches root-layout crashes, which `error.tsx` structurally cannot.
- `src/lib/sentry-shared.ts` holds the options common to all three.

**Sentry does NOT do tracing here.** `tracesSampleRate: 0`, and both server runtimes set
`skipOpenTelemetrySetup: true`. That flag is load-bearing: `@sentry/nextjs` builds its tracing on
OpenTelemetry and, left alone, registers its own global `TracerProvider` — which would silently
fight the one `@vercel/otel` registers in Track 2, and whichever loses stops exporting. Traces
stay with Grafana; Sentry only takes exceptions.

**Config:** `NEXT_PUBLIC_SENTRY_DSN`. The DSN is public by design (write-only, and it ships
inside the browser bundle either way), so it is a build arg hardcoded per-environment in
`.github/workflows/build-push-image.yml` alongside the VAPID and Spotify public keys — **no SSM
parameter and no Terraform change**. Empty DSN → `Sentry.init` is skipped entirely, so local dev
and any unconfigured stack run an inert SDK.

One project serves both environments; events are separated by the `environment` tag, which comes
from `resolveAppEnv()` (`APP_ENV`, else the host in `NEXT_PUBLIC_APP_URL`) — the same resolver the
background workers gate on, so a new stack can't mislabel itself. `release` is the commit, from
the existing `GIT_SHA` build arg.

**PII:** `sendDefaultPii: false`. The only user context attached is the Supabase user id, an
opaque uuid, set by `src/components/SentryUserContext.tsx` off `onAuthStateChange`. No handles,
no emails, no request bodies. Session Replay is deliberately not enabled (~50KB of JS on every
page, and it burns the event quota fast).

### 3b. Source maps (outstanding) ⏳

Without an upload, production stack traces name minified chunks
(`app:///_next/server/chunks/11433.js`) instead of real files and lines. `next.config.ts` is
already wired for it and no-ops without credentials, so turning it on is config only:

1. Mint a Sentry **org auth token** with `project:releases` + `org:read`.
2. Add it as the repo secret `SENTRY_AUTH_TOKEN`, and pass `SENTRY_ORG` / `SENTRY_PROJECT` plus
   that secret into the build step in `.github/workflows/build-push-image.yml`.
3. Flip `'@sentry/cli'` to `true` in `pnpm-workspace.yaml` — the uploader needs the binary its
   postinstall fetches.

### Decisions to make

- **Alerting** — a Sentry project with no alert rule is a dashboard nobody opens. Point issue
  alerts at the same channel UptimeRobot will use (Track 1b), so there is one place to watch.
- **Quota** — the free tier is 5k errors/month across both environments. If dev noise crowds out
  prod, split into two projects rather than raising sampling.

---

## Sequencing

1. ✅ `/api/health` endpoint (PR #393) — live in prod. ⏳ UptimeRobot monitors + one alert channel
   still to be configured in the dashboard (external, no code).
2. ✅ `@vercel/otel` app instrumentation (PR #400) + ✅ SSM→container env wiring for direct OTLP
   export + ✅ Grafana Cloud stack created and **dev exporting** (Application Observability
   activated on dev). ⏳ Wire **prod** (mint a prod token, set `otel_exporter_otlp_headers` in
   `terraform.prod.tfvars`, apply) and validate traces for the hot API routes.
3. ✅ Sentry error reporting (Track 3) — code landed and verified end to end against a local
   ingest sink (server error → event with the right `environment` and `release`). ⏳ Source-map
   upload (3b) and an issue-alert rule.
4. Custom Supabase/external spans + business metrics; (optional) log correlation and a status page.

_Both are infra/ops initiatives, tracked in [architecture-debt.md](./architecture-debt.md) under
"Phase 5 — Observability & operations". Deployment context: [environments.md](./environments.md)._
