# Environments

`fateround-dev` and `fateround-prod` are separate app stacks — each its own EC2/ASG behind
Cloudflare, with its own **Supabase** project. They are isolated at the compute, edge, and database
layers, but **not fully isolated**: they share a single self-hosted **LiveKit** instance and its
credentials (rooms are namespaced per game code). Your local `.env.local` should mirror whichever
environment you're targeting.

> **Secrets are not in this file.** Real secret values live only in `infra/terraform.<env>.tfvars`
> (gitignored) and in SSM at `/fateround-<env>/<NAME>`. This doc records the **public** values and
> **where** each secret lives, so the team knows which value is used where without leaking any.

## Per-environment values (these differ)

| Variable | dev | prod |
|---|---|---|
| `name_prefix` (stack) | `fateround-dev` | `fateround-prod` |
| `NEXT_PUBLIC_APP_URL` | `https://dev.fateround.com` | `https://fateround.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xzvsrzbbgxbaagqwtpts.supabase.co` | `https://skhvbzitwvnbhqxfitgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_4U7akfEx_4sxtLrxeCU_Rw_VpSeFRAu` | `sb_publishable_daKXZ2-HKxB6k3rAy1tmGw_jQuACg0K` |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** → dev project | **secret** → prod project |
| `cron_secret` | **secret** (per-env) | **secret** (per-env) |
| Cloudflare | enabled, record `dev` (subdomain) | record `@` (apex) |

> The anon keys are Supabase **publishable** keys — public by design (already baked into the client
> bundle / CI build args), so they're safe to record here.

## Shared across both environments (same value)

| Variable | value |
|---|---|
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://livekit.fateround.com` (self-hosted) |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | **secret** — same self-hosted LiveKit creds for both envs |
| `admin_email` | `nazaalistic@gmail.com` |
| `admin_password` / `admin_session_secret` / `klipy_api_key` | **secret** (shared) |
| `aws_region` | `us-east-1` |
| `cloudflare_zone_id` | `fff141dbd5d5f15aadf4497bcd46f3fc` |

## Where the secrets live

| Secret | Source of truth | Applied to the deploy via |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY`, `cron_secret`, `LIVEKIT_API_KEY/SECRET`, `admin_*`, `klipy_api_key` | `infra/terraform.<env>.tfvars` (gitignored) | `terraform apply` → SSM `/fateround-<env>/<NAME>` → `redeploy.sh` reads them at container start |

To rotate a secret: update `terraform.<env>.tfvars` → `terraform apply` (writes SSM) → trigger the
gated redeploy (`gh workflow run "Build & Push Image" -f environment=<env>`).

## Running locally

`.env.local` is gitignored and per-developer. For a dev run, it needs the dev Supabase trio plus the
(shared) self-hosted LiveKit trio:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://xzvsrzbbgxbaagqwtpts.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_4U7akfEx_4sxtLrxeCU_Rw_VpSeFRAu
SUPABASE_SERVICE_ROLE_KEY=<dev service-role — from terraform.dev.tfvars>
NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.fateround.com
LIVEKIT_API_KEY=<from terraform.<env>.tfvars>
LIVEKIT_API_SECRET=<from terraform.<env>.tfvars>
```

Start the dev server with the local Next binary (`./node_modules/.bin/next dev -p 3000`) — `pnpm dev`
trips pnpm's verify-deps-before-run on the ignored `sharp` build script.

> **Note on LiveKit isolation:** dev and prod currently share one LiveKit instance + credentials.
> Rooms are keyed by game code so calls never collide, but a leaked dev-side LiveKit secret also
> grants prod access, and dev load shares prod's LiveKit capacity. If true isolation is wanted, stand
> up a separate dev instance (e.g. `wss://livekit-dev.fateround.com`) with its own key/secret and
> point the dev stack + dev `.env.local` at it.
