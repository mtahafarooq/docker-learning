# syntax=docker/dockerfile:1

# =============================================================================
# Multi-stage build.
#
# Why bother with stages? Because the final image should contain ONLY what is
# needed to RUN the app - not the TypeScript compiler, not dev dependencies,
# not your test files. Fewer files = smaller image = smaller attack surface =
# faster to push/pull in CI.
# =============================================================================

# ----------------------------------------------------------------------------
# Stage 1 - "deps": install ALL dependencies (including dev) once.
# This layer is cached and reused by the build stage below.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Copy manifests FIRST. As long as package.json/lock don't change, Docker reuses
# the cached npm layer even when your source code changes. Huge speed win.
COPY package.json package-lock.json ./
RUN npm ci

# ----------------------------------------------------------------------------
# Stage 2 - "build": compile TypeScript -> JavaScript (dist/)
# ----------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ----------------------------------------------------------------------------
# Stage 3 - "prod-deps": install ONLY production dependencies.
# `--omit=dev` drops @nestjs/cli, typescript, etc.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ----------------------------------------------------------------------------
# Stage 4 - "runtime": the image that actually ships.
# Built FROM a clean alpine node base, NOT from the build stage, so none of the
# build tooling leaks in.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as the unprivileged "node" user that ships with the official image.
# Never run your app as root in production.
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

USER node
EXPOSE 3000

# Docker (and nginx/compose) can ask "is this container actually healthy?".
# wget is provided by busybox in alpine, so no extra install needed.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

CMD ["node", "dist/main.js"]
