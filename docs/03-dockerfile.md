# 03 — The Dockerfile, line by line

Open [`backend/Dockerfile`](../backend/Dockerfile) alongside this.

A Dockerfile is a recipe. Each instruction creates a layer. Ours uses **four
stages**, which is the single most valuable pattern to learn.

## How a Dockerfile works (the simple picture)

If you've never used Docker, forget the commands for a second. A Dockerfile is
just a **to-do list you write for the computer**. Docker reads it **top to
bottom**, does each line in order, and the finished result is a single reusable
package called an **image**.

```text
   Dockerfile                    docker build                    IMAGE
  (the recipe)                   (the cook)                 (the boxed meal)

   FROM node           ──►   "start from this base"      ┐
   COPY package.json   ──►   "add this file"             │  each line stacks
   RUN npm ci          ──►   "run this command"          ├─ a new LAYER on top
   COPY src ./src      ──►   "add the code"              │  of the last
   RUN npm run build   ──►   "compile it"                │
   CMD ["node",...]    ──►   "when it starts, do this"   ┘

                              ▼
                    ┌─────────────────────┐
                    │  IMAGE (built once) │
                    └──────────┬──────────┘
                               │  run it (docker run / compose up)
                               ▼
                    ┌─────────────────────┐
                    │  CONTAINER (running)│   ← the actual live app
                    └─────────────────────┘
```

Three ideas and you're 90% of the way there:

- **A Dockerfile is a list of steps.** Read it like a shopping-and-cooking list:
  get the base, add files, run commands. No magic.
- **Each step becomes a "layer", like stacked transparent sheets.** Docker saves
  the result of every line. If only line 4 changed, Docker reuses the sheets
  above it and only redoes line 4 downward. This is why the order matters and why
  we copy `package.json` *before* `src` — see [lesson 2](02-images-and-containers.md).
- **Image = the frozen, reusable thing. Container = that image switched on.**
  Build once, run anywhere, as many times as you like. Think "recipe →
  cooked-and-boxed meal → the meal on the table."

The words you'll see, in plain English:

| Dockerfile word | What it really means to a newcomer |
| --- | --- |
| `FROM` | Start from this ready-made base (here: a tiny Linux with Node preinstalled). |
| `WORKDIR` | "From now on, do everything inside this folder." |
| `COPY` | Grab files from *your* computer and drop them in. |
| `RUN` | Execute a command now, while building (install, compile). |
| `ENV` | Set a setting the app can read (e.g. "we're in production"). |
| `USER` | Which account the app runs as (we use the safe, non-root `node`). |
| `EXPOSE` | A note saying "this app listens on port 3000" (a label, not a lock). |
| `CMD` | The command that runs when the container *starts*. |

That's the whole mental model. Everything below is just this same idea, applied
four times in a row — that's what "multi-stage" means.

## Why multi-stage?

A naive Dockerfile copies everything — source, dev dependencies, the TypeScript
compiler — into the final image. That gives you a 1 GB "production" image that
ships a compiler and your test files. Multi-stage builds let you *build* with all
that tooling, then copy only the finished artifacts into a clean final image.

```text
   deps  ──►  build  ──►  dist/*.js ─┐
   (all deps) (tsc)                  ├──►  runtime   (small, prod-only)
   prod-deps ──► node_modules ───────┘
```

The build tools never reach the final image.

## Stage by stage

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
```

- `FROM ... AS deps` names the stage so later stages can copy from it.
- `WORKDIR /app` — all subsequent commands run here; creates it if missing.
- **Copy the manifests first, install, then copy source.** This is the caching
  trick from [lesson 2](02-images-and-containers.md): editing app code no longer
  re-downloads dependencies.
- `npm ci` (not `npm install`) installs *exactly* what `package-lock.json` pins,
  and fails if the lock is out of sync. CI and production should always use `ci`.

```dockerfile
FROM deps AS build
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build
```

Reuses the `deps` stage (so `node_modules` is already there), compiles
TypeScript to `dist/`.

```dockerfile
FROM node:22-alpine AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
```

A *separate* install without dev dependencies. We can't just delete `node_modules`
from the build stage because it mixes dev and prod packages.

```dockerfile
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build    /app/dist         ./dist
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- **`FROM node:22-alpine` again, not `FROM build`.** This is the crux: we start
  from a clean base so no build tooling leaks into the final image.
- `COPY --from=<stage>` cherry-picks artifacts from earlier stages.
- `USER node` — the official Node image ships an unprivileged `node` user. Running
  as root inside a container is a needless risk; if the app is compromised, root
  in the container is a much bigger deal than an unprivileged user.
- `EXPOSE 3000` is *documentation*, not a firewall. It announces intent; it does
  not publish the port. Publishing is done by `ports:` in Compose.
- `CMD` is the default command. Use the **JSON array form** so it runs directly
  without a shell — important for signal handling (so `Ctrl-C`/`SIGTERM` reach
  your process and it shuts down cleanly).

## The health check

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1
```

This turns "is the process running?" into "is the process *working*?". Docker
runs it periodically and marks the container `healthy` or `unhealthy`. Compose
uses that status with `depends_on: condition: service_healthy`, and orchestrators
use it to decide whether to route traffic or restart the container. Note it uses
`wget`, which busybox provides in Alpine — no extra install.

## `.dockerignore` matters as much as the Dockerfile

```text
node_modules
dist
.git
.env
```

Without this, `COPY src ./src` is fine but a broader `COPY . .` would drag your
host's `node_modules` (built for macOS) into a Linux image and break it. It also
keeps secrets and build junk out of the image. Always create one.

## Try it

```bash
# Build just the backend and watch the stages execute
docker compose build backend
docker build -t myapp:test ./backend

# How big did we get, and what's in each layer?
docker image ls docker-learning-backend
docker history docker-learning-backend

# Prove the final image has no dev tooling in it (this should fail - no tsc):
docker run --rm myapp:test npx tsc --version
```

Next: [Compose](04-compose.md).
