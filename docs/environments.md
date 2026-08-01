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
| `admin_email` | `nazaalistic@gmail.com` |
| `aws_region` | `us-east-1` |
| `cloudflare_zone_id` | `fff141dbd5d5f15aadf4497bcd46f3fc` |

## ⚠️ Must be split per environment (audit finding M1 — action required)

These were the **same value in dev and prod**, which makes dev a full path into production:
anyone who compromises the looser environment gets the production admin panel, and a LiveKit
token minted on dev is valid against production voice rooms on the same instance.

| Secret | Why it must differ | Status |
|---|---|---|
| `admin_password` | dev admin password === prod admin password | **rotate per env** |
| `admin_session_secret` | a session cookie forged on dev validates on prod | **rotate per env** |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | see the note below — splitting keys alone does **not** isolate the environments | **needs a deployment split** |
| `klipy_api_key` | shared quota; a dev flood exhausts prod's GIFs | split when convenient |

### LiveKit: separate keys are not separate environments

Both stacks point `NEXT_PUBLIC_LIVEKIT_URL` at the **same** self-hosted LiveKit
(`wss://livekit.fateround.com`), and rooms are named by game code. A LiveKit server accepts a
token signed by **any** key pair in its `keys:` map, and the token grants whatever room name it
carries — so issuing dev its own key pair changes nothing: a dev-minted token for room `ABC123`
is still valid against the production room `ABC123`. Per-environment keys only help with
attribution and revocation, not isolation.

Real isolation needs one of:

1. **A separate LiveKit deployment per environment** (own host, own keys) — the clean fix, and
   what the table above now asks for; or
2. **Environment-prefixed room names** (`dev:ABC123` / `prod:ABC123`), so a token minted in one
   environment names a room that cannot exist in the other. Cheaper, but it is enforced by our
   own `authorizedRoom()` naming rather than by LiveKit, so it has to be applied on every path
   that mints or joins a room.

Until one of those lands, treat dev and prod voice as a single trust domain.

`ADMIN_SESSION_SECRET` is additionally load-bearing for three unrelated things — the admin
session HMAC, the community-manager session HMAC (`src/lib/manager-session.ts`) and the
rate-limiter's IP pepper (`src/lib/rate-limit.ts`). Rotating it therefore signs every manager
out and resets every rate-limit bucket. Split it into `ADMIN_SESSION_SECRET`,
`MANAGER_SESSION_SECRET` and `RATE_LIMIT_PEPPER` so each can be rotated independently.

## Where the secrets live

| Secret | Source of truth | Applied to the deploy via |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY`, `cron_secret`, `LIVEKIT_API_KEY/SECRET`, `admin_*`, `klipy_api_key`, `SPOTIFY_CLIENT_SECRET` | `infra/terraform.<env>.tfvars` (gitignored) | `terraform apply` → SSM `/fateround-<env>/<NAME>` → `redeploy.sh` reads them at container start |

### Spotify (in-game music)

`NEXT_PUBLIC_SPOTIFY_CLIENT_ID` is public (PKCE) and can live alongside the other
`NEXT_PUBLIC_*` values; `SPOTIFY_CLIENT_SECRET` is a secret (table above). One Spotify app
serves all envs — register every redirect URI on it:

| Env | Redirect URI |
|---|---|
| prod | `https://fateround.com/api/spotify/callback` |
| dev | `https://dev.fateround.com/api/spotify/callback` |
| local | `http://localhost:3000/api/spotify/callback` |

> New Spotify apps are in **development mode**: only up to 25 dashboard-allow-listed users can
> complete OAuth until you request a quota extension. Fine for testing; request the extension
> before a public launch.

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
NEXT_PUBLIC_APP_URL=http://localhost:3000
# In-game Spotify music (optional locally):
NEXT_PUBLIC_SPOTIFY_CLIENT_ID=<Spotify app client id>
SPOTIFY_CLIENT_SECRET=<Spotify app client secret>
```

> Spotify's redirect URI must match exactly, and it's derived from `NEXT_PUBLIC_APP_URL`
> (`${NEXT_PUBLIC_APP_URL}/api/spotify/callback`) — so set `NEXT_PUBLIC_APP_URL=http://localhost:3000`
> locally, matching the URI registered in the dashboard.

Start the dev server with the local Next binary (`./node_modules/.bin/next dev -p 3000`) — `pnpm dev`
trips pnpm's verify-deps-before-run on the ignored `sharp` build script.

> **Note on LiveKit isolation:** dev and prod currently share one LiveKit instance + credentials.
> Rooms are keyed by game code so calls never collide, but a leaked dev-side LiveKit secret also
> grants prod access, and dev load shares prod's LiveKit capacity. If true isolation is wanted, stand
> up a separate dev instance (e.g. `wss://livekit-dev.fateround.com`) with its own key/secret and
> point the dev stack + dev `.env.local` at it.
