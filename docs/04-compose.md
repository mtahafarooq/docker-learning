# 04 — Compose: describing the whole app

A single container is rarely useful. A real app is a web server, an API, a
database, a cache, maybe a queue and a worker. **Compose runs the whole set from
one YAML file**, creating a private network and starting everything in dependency
order.

Open [`docker-compose.yml`](../docker-compose.yml) alongside this.

## One command, whole stack

```bash
docker compose up -d --build     # -d = detached (background), --build = rebuild images
docker compose ps                # what's running
docker compose logs -f backend   # follow one service's logs
docker compose down              # stop + remove containers and network
```

That `up` did a surprising amount for you:

1. Created a **network** named `docker-learning_default`.
2. Pulled `postgres`, `redis`, `nginx` images.
3. **Built** the backend image from `./backend`.
4. Created volumes `pgdata` and `redisdata`.
5. Started Postgres and Redis, waited for their **health checks** to pass.
6. Only then started the **2 backend replicas**, and nginx.
7. Attached all of them to the network, where they address each other by name.

## Reading the file

**`services:`** — one block per container. `image:` pulls a prebuilt one;
`build:` compiles yours.

**`environment:`** — config injected as env vars. Our backend learns where
Postgres lives via `PGHOST: postgres` — a *service name*, not an IP. Compose and
Docker DNS resolve it (see [lesson 5](05-networking.md)).

**`ports:`** — `"8080:80"` means *host port 8080 → container port 80*. Only nginx
has this. That is deliberate: the outside world reaches the app through nginx,
never directly.

**`volumes:`** — `pgdata:/var/lib/postgresql/data` mounts a named volume so the
database survives. We'll cover this properly in [lesson 6](06-storage.md).

**`depends_on` with `condition: service_healthy`:**

```yaml
depends_on:
  postgres:
    condition: service_healthy
  redis:
    condition: service_healthy
```

This is the fix for the most common multi-container bug. Plain `depends_on` only
waits for the *container to start*, not for Postgres to finish initialising — so
your app boots, tries to connect, and crashes with `ECONNREFUSED`. Pairing it with
`healthcheck` makes Compose wait for the database to be *ready to accept
connections*. If your app is flaky on startup, this is almost always why.

**`restart: unless-stopped`** — if a container crashes, Docker restarts it
(unless *you* explicitly stopped it). Cheap resilience.

**`deploy: replicas: 2`** — run two copies of the backend, load-balanced by nginx.

## Two ways to run this: Compose vs. bare `docker run`

Everything Compose does, you *could* do with `docker run`:

```bash
docker network create mynet
docker run -d --name pg --network mynet -e POSTGRES_PASSWORD=app postgres:16-alpine
docker run -d --name cache --network mynet redis:7-alpine
docker run -d --name api --network mynet -e PGHOST=pg -e REDIS_HOST=cache my-api
# ...plus volumes, healthchecks, dependencies, and you must do this every reboot
```

Compose turns those eight commands — and the ordering, and the networking, and
the restart behaviour — into a file you can commit, review, and reproduce.
**That's the value proposition.** It is not "a way to run Docker"; it is
*infrastructure as code for your local/dev stack*.

## Compose profiles, overrides and `.env`

- **`.env`** — Compose auto-reads it. Our file does `${APP_PORT:-8080}`, so the
  port is configurable without editing YAML. Same pattern for DB credentials.
- **`docker-compose.override.yml`** — if present, Compose merges it automatically.
  Convention: keep the base file production-ish, put dev-only overrides (bind
  mounts of source, exposed debug ports) in the override.
- **Profiles** — tag optional services (e.g. a `pgadmin`) so they only start with
  `docker compose --profile tools up`. Handy for dev-only tooling.

## Handy

```bash
docker compose config          # print the fully-resolved config (great for debugging .env)
docker compose top             # processes running in each container
docker compose restart nginx   # restart one service
docker compose exec backend sh # shell INSIDE the running container
docker compose run --rm backend node -e "console.log('one-off')"
```

Next: [Networking](05-networking.md).
