# syntax=docker/dockerfile:1

# Build the Next.js standalone output with pnpm (the project's package manager;
# matches CI: pnpm install --frozen-lockfile).
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@10
# pnpm-workspace.yaml carries the `allowBuilds` approvals. It MUST be copied before the
# install: without it pnpm does not know @sentry/cli's postinstall is approved, skips the
# native-binary download, and the source-map upload later fails with a missing binary.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# Public env required at build time for Next.js NEXT_PUBLIC_* inlining.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_LIVEKIT_URL
# Web-push public (VAPID) key — public by design; empty when push isn't configured
# for this environment, in which case the notifications UI stays hidden.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
# Spotify OAuth client id — public (PKCE); the matching SPOTIFY_CLIENT_SECRET is a
# runtime secret in SSM. Empty when in-game music isn't configured for this env.
ARG NEXT_PUBLIC_SPOTIFY_CLIENT_ID
# Sentry DSN — public by design (it only authorises writing events, and it ships in the
# browser bundle either way), so it is a plain build arg like the VAPID and Spotify keys
# rather than a runtime secret. Empty disables Sentry entirely for the image.
ARG NEXT_PUBLIC_SENTRY_DSN
# The commit, surfaced to Sentry as the release so a stack trace pins to a revision.
# Declared again in the run stage below for /api/health; ARGs don't cross stages.
ARG GIT_SHA
# Sentry source-map upload. Org/project/url are not secret (the org slug is in every issue
# URL), so they are plain build args. The AUTH TOKEN is deliberately NOT one: build args are
# recoverable from image history, so it is mounted as a BuildKit secret on the build step
# below and never lands in a layer. `fateround-ss` is an EU-region org, so SENTRY_URL must
# point at de.sentry.io — the uploader defaults to sentry.io and would otherwise authenticate
# against the wrong instance.
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_URL
ENV SENTRY_ORG=$SENTRY_ORG
ENV SENTRY_PROJECT=$SENTRY_PROJECT
ENV SENTRY_URL=$SENTRY_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SPOTIFY_CLIENT_ID=$NEXT_PUBLIC_SPOTIFY_CLIENT_ID
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_RELEASE=$GIT_SHA

# The token is readable only for the lifetime of this RUN, and only inside it. Absent (local
# builds, forks, a laptop `docker build`), the shell expansion yields an empty string, upload
# stays off, and the build still succeeds — missing credentials must never fail a build.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    pnpm build

# Minimal runtime image (Next.js standalone output).
FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Commit this image was built from — a runtime env (read by /api/health at request time,
# not inlined at build like NEXT_PUBLIC_*), so it lives in the run stage. CI passes github.sha.
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
