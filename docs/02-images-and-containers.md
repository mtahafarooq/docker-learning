# 02 — Images vs. containers, and layers

These two words get used interchangeably, but the distinction is the whole model.

- An **image** is a blueprint. It is immutable, read-only, and sits on disk (or
  in a registry) taking up space. Nothing is running.
- A **container** is a running instance of an image. It gets a thin, writable
  layer on top of the image's read-only layers. Delete the container and that
  writable layer is gone — but the image is untouched.

Analogy: an image is a class, a container is an object. Or: a recipe vs. a cake.

## Layers: why Docker is fast

An image is a **stack of layers**. Each build instruction that changes the
filesystem creates a new layer. Layers are cached and shared.

```
┌──────────────────────────────┐
│ CMD ["node","dist/main.js"]  │  metadata (no filesystem change)
├──────────────────────────────┤
│ COPY --from=build dist ./dist│  layer: compiled JS
├──────────────────────────────┤
│ RUN npm ci --omit=dev        │  layer: production node_modules   ← big, cached
├──────────────────────────────┤
│ COPY package.json ...        │  layer: manifests
├──────────────────────────────┤
│ FROM node:22-alpine          │  base layer (shared by every node:22-alpine image)
└──────────────────────────────┘
```

Two consequences you will feel immediately:

**Caching.** If you only edit `src/app.service.ts`, Docker reuses the cached
`npm ci` layer and only re-runs the `COPY` + `build` steps. Edit `package.json`,
though, and everything from that layer down is rebuilt. **This is why we copy
`package.json` and run `npm ci` *before* copying our source code** — so that the
expensive dependency install isn't invalidated by a one-line code change.

**Sharing.** Ten images based on `node:22-alpine` store that base layer once on
disk. Pulling a *new version* of your app only downloads the layers that changed.

## Try it

```bash
# List images on your machine
docker image ls

# Watch how small the final backend image is compared to a naive single-stage
docker image ls | grep docker-learning

# Inspect the layers of an image (the "history" of how it was built)
docker history docker-learning-backend

# See every layer, including the base OS
docker image inspect docker-learning-backend
```

## Which images to use: the `alpine` and `slim` tags

You'll see tags like `postgres:16`, `postgres:16-alpine`, `node:22-slim`.

- `postgres:16` — full Debian-based image, ~430 MB. Most compatible.
- `postgres:16-alpine` — Alpine Linux, ~240 MB. Smaller, but uses musl libc
  instead of glibc, which occasionally breaks pre-compiled native modules.
- `*-slim` — a middle ground.

We use `-alpine` variants throughout to keep images lean; that's a very common
production default. Pick deliberately, not by habit.

## Pulling vs. building

Some services in our stack use a pre-built image (`postgres`, `redis`, `nginx`);
only the backend is built from a Dockerfile. Compose does the right thing per
service: `image:` pulls, `build:` compiles.

```bash
docker pull postgres:16-alpine     # fetch an image without running it
docker image prune                 # delete dangling (untagged) images
```

Next: [the Dockerfile](03-dockerfile.md).
