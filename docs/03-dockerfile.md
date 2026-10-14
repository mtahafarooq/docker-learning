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

## Where do the files come from? (the build context)

This is the part that confuses almost everyone, so let's slow right down.

The Dockerfile sits at `backend/Dockerfile`, but it does **not** magically read
files from "wherever it happens to be". When you build, you hand Docker exactly
**one folder** — called the *build context* — and `COPY` can only reach files
that live inside it:

```bash
docker build ./backend        # ./backend IS the build context
```

Compose does the same thing behind the scenes:

```yaml
build:
  context: ./backend          # <- the same folder
```

Docker tars up that whole folder and ships it to the build engine. Every
`COPY local-path dest-path` is then resolved **relative to the context**, and
`dest-path` lands relative to the current `WORKDIR` *inside* the growing image.

So there are **two worlds**, and `COPY` is the only bridge between them:

```text
      WORLD 1: YOUR MAC                        WORLD 2: INSIDE THE IMAGE
      backend/   (the build context)           /app   (the WORKDIR)

      package.json          ────────COPY ────────►  /app/package.json
      package-lock.json     ────────COPY ────────►  /app/package-lock.json
      src/                  ────────COPY ────────►  /app/src/
      tsconfig.json         ────────COPY ────────►  /app/tsconfig.json
      Dockerfile            (the instructions themselves — never copied in)

      node_modules/         ✗  stripped by .dockerignore
      dist/                 ✗  stripped by .dockerignore
      .env                  ✗  stripped by .dockerignore
```

Two rules fall straight out of this, and between them they explain most
beginner errors:

- **Not in the context → `COPY` can't see it.** `COPY ../db/init.sql .` fails,
  because `../db` is *outside* the `./backend` context. Only files under
  `backend/` are reachable.
- **`.dockerignore` deletes files from the context *before* the build starts.**
  That is the exact mechanism that keeps your host `node_modules/`, `dist/`, and
  `.env` out of the final image. More on this at the bottom of the page.

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

## Multi-stage, step by step: watch the files move

Here is the single most important sentence on this page:

> **Every `FROM` starts a brand-new, empty machine. Stages do *not* share files
> unless you explicitly copy them across with `COPY --from=`.**

That's the whole trick. We build **four machines** (four stages). Three of them
start from the plain `node:22-alpine` base — a fresh, empty machine each time.
Only `build` starts from another stage (`FROM deps AS build`), which *clones* the
`deps` machine so its `node_modules` is already sitting there.

Now let's watch `/app` fill up, stage by stage.

### Stage 1 — `deps`: stock the pantry

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
```

```text
  STAGE 1 — deps        FROM node:22-alpine AS deps
  "Stock a pantry with every ingredient AND every gadget."

  instruction                                effect on /app
  ───────────────────────────────────────────────────────────────────────────
  FROM node:22-alpine AS deps                fresh base; /app does not exist
  WORKDIR /app                               creates /app and cd's into it
  COPY package.json package-lock.json ./      the two manifests appear
  RUN npm ci                                  downloads ALL deps

  /app after Stage 1
  ├── package.json
  ├── package-lock.json
  └── node_modules/        ← everything, incl. typescript + @nestjs/cli (dev)
```

We copy the **manifests first**, install, and only copy the source in the *next*
stage. Why? Caching: `package.json` rarely changes, so the slow `npm ci` layer
survives every code edit. (See [lesson 2](02-images-and-containers.md).)

### Stage 2 — `build`: cook the meal

```dockerfile
FROM deps AS build
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build
```

```text
  STAGE 2 — build       FROM deps AS build      ← starts as a CLONE of deps
  "Cook the meal: turn TypeScript into JavaScript."

  instruction                                effect on /app
  ───────────────────────────────────────────────────────────────────────────
  FROM deps AS build                         inherits deps: node_modules ✓
  COPY tsconfig.json nest-cli.json ./        + 2 config files
  COPY src ./src                             + src/  (your TypeScript)
  RUN npm run build                          compiles → dist/

  /app after Stage 2
  ├── package.json
  ├── package-lock.json
  ├── node_modules/        ← inherited from deps (still mixes dev + prod deps)
  ├── tsconfig.json
  ├── nest-cli.json
  ├── src/                 ← your TypeScript source
  └── dist/                ← ★ THE PRIZE: plain JavaScript, ready to run
```

`dist/` is the *only* thing this stage makes that we actually want to keep.

### Stage 3 — `prod-deps`: stock a smaller pantry

```dockerfile
FROM node:22-alpine AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
```

```text
  STAGE 3 — prod-deps   FROM node:22-alpine     ← a FRESH machine again
  "Only the ingredients that go on the plate — no gadgets."

  instruction                                effect on /app
  ───────────────────────────────────────────────────────────────────────────
  FROM node:22-alpine AS prod-deps           fresh base; /app empty AGAIN
  COPY package.json package-lock.json ./      the two manifests
  RUN npm ci --omit=dev                       prod deps only

  /app after Stage 3
  ├── package.json
  ├── package-lock.json
  └── node_modules/        ← ONLY runtime deps (no typescript, no @nestjs/cli)
```

We install a **second time**, on purpose. The Stage 1 `node_modules` has the dev
tooling baked in with no clean way to separate it, so we simply build a fresh,
prod-only tree. `--omit=dev` drops `typescript`, `@nestjs/cli`, and friends.

### Stage 4 — `runtime`: the box that ships

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

```text
  STAGE 4 — runtime     FROM node:22-alpine     ← a FRESH machine one last time
  "The takeaway box that actually leaves the kitchen."

  instruction                                            effect on /app
  ───────────────────────────────────────────────────────────────────────────────
  FROM node:22-alpine AS runtime                         fresh base; /app empty
  ENV NODE_ENV=production                                a setting, not a file
  COPY --from=prod-deps /app/node_modules ./node_modules ← reach into Stage 3
  COPY --from=build     /app/dist         ./dist         ← reach into Stage 2
  COPY package.json ./                                   from the context (World 1)
  USER node                                              run as the safe node user
  EXPOSE 3000                                            a label, not a firewall
  CMD ["node","dist/main.js"]                            what runs when it starts

  /app in the FINAL IMAGE
  ├── node_modules/        ← from prod-deps (prod-only, no dev tools)
  ├── dist/                ← from build     (compiled JavaScript)
  └── package.json         ← from the context
```

**`COPY --from=<stage>` is a crane that reaches into an earlier stage's
filesystem and plucks out one folder.** `src/`, the TypeScript compiler, and the
dev dependencies never get plucked — they stay behind in their throwaway stages
and are discarded.

### The whole picture

```text
   STAGE 1  deps                STAGE 2  build               STAGE 4  runtime
   ┌──────────────┐  FROM deps  ┌──────────────────┐         ┌────────────────┐
   │ node_modules │────clone───►│ node_modules     │         │                │
   └──────────────┘             │ + src + tsconfig │ dist/   │    dist/       │
                                │ npm run build  → │────────►│ node_modules/  │
                                └──────────────────┘         │  package.json  │
                                                             └────────▲───────┘
   STAGE 3  prod-deps                                                 │
   ┌──────────────────────┐                                          │
   │ node_modules         │───── node_modules (prod only) ───────────┘
   │ (npm ci --omit=dev)  │
   └──────────────────────┘
```

### Why each choice, in one line

| Design choice | Why it's done this way |
| --- | --- |
| Copy `package.json` before `src/` | Keeps the slow `npm ci` layer cached when only code changes. |
| `build` uses `FROM deps` | Reuses the already-installed `node_modules` — no re-download. |
| `runtime` uses `FROM node:22-alpine`, not `FROM build` | Starts clean so the compiler, `src/`, and dev deps never leak in. |
| Two installs (`deps` + `prod-deps`) | Dev and prod deps can't be cleanly split after the fact — build a fresh prod-only tree. |
| `COPY --from=` instead of `COPY . .` | Picks *only* the finished `dist/` + `node_modules`, nothing else. |

### The dinner analogy (if the diagrams still feel abstract)

```text
   deps       →  the big pantry + every gadget, including the blender you
                 only touch while prepping
   build      →  the kitchen: you cook and plate the dish        (dist/ = dish)
   prod-deps  →  a second, tiny pantry: only what goes ON the plate
   runtime    →  the takeaway box you hand the customer:
                 the dish (dist) + the plate ingredients (prod node_modules)
                 + the menu (package.json)
                 ▶ the blender and the chef NEVER go in the box.
```

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
