# syntax=docker/dockerfile:1

# ── Builder ──────────────────────────────────────────────────
# Debian slim (glibc) so the @discordjs/opus native addon builds/runs cleanly.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Toolchain for the native Opus addon.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install production deps against the lockfile (compiles the native addon).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Runtime ──────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# ffmpeg transcodes the Icecast stream for Discord voice; nothing else needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Drop privileges — the `node` user ships with the base image.
USER node

CMD ["node", "src/index.js"]
