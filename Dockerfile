# syntax=docker/dockerfile:1

# Build the Next.js standalone output with pnpm (the project's package manager;
# matches CI: pnpm install --frozen-lockfile).
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
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
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SPOTIFY_CLIENT_ID=$NEXT_PUBLIC_SPOTIFY_CLIENT_ID

RUN pnpm build

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
