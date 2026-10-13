# 06 — Storage: volumes and the #1 beginner gotcha

Containers are **ephemeral**. The writable layer on top of an image disappears
when the container is removed. That's a feature — clean state every time — but it
means a database's data would vanish on `docker compose down` unless we do
something about it.

That something is a **volume**.

## The three kinds of storage

| Type | Where it lives | Use for |
|------|----------------|---------|
| **Named volume** | Managed by Docker, under `/var/lib/docker/volumes` | Databases, anything that must persist. **Use this.** |
| **Bind mount** | A path on your host, mounted into the container (`./src:/app/src`) | Live-editing source during development, injecting config files |
| **tmpfs** | RAM only | Caches, scratch space you never want on disk |

Ours uses named volumes for data and a bind mount for config:

```yaml
postgres:
  volumes:
    - pgdata:/var/lib/postgresql/data                      # named volume: persists
    - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql:ro # bind mount: config
```

`pgdata:/var/lib/postgresql/data` says "mount the volume named `pgdata` at this
path inside the container". They're declared at the bottom of the file:

```yaml
volumes:
  pgdata:
  redisdata:
```

The contract: **if the path is inside the container, the container's writes go to
the volume, not the throwaway layer.** Recreate the container and Postgres opens
the same data directory.

## Experiment: prove persistence

```bash
docker compose up -d
curl -X POST localhost:8080/users \
  -H 'content-type: application/json' \
  -d '{"name":"You","email":"you@example.com"}'

docker compose down          # NOTE: no -v. Containers and network go; volumes stay.
docker compose up -d

curl localhost:8080/users    # "You" is still there. The volume survived.
```

Now destroy it:

```bash
docker compose down -v       # -v ALSO removes named volumes  <-- data is gone
docker compose up -d
curl localhost:8080/users    # back to just the seed rows
```

`down` preserves volumes; `down -v` deletes them. Internalise that difference —
it saves a lot of confusion.

## The #1 gotcha: `init.sql` runs only ONCE ever

Our [`db/init.sql`](../db/init.sql) creates the `users` table. Docker's postgres
image runs everything in `/docker-entrypoint-initdb.d` **only when it initialises
an empty data directory** — i.e. the very first time the volume is created.

So if you edit `init.sql` and restart, *nothing happens*. The volume already has
data, so init is skipped. This trips people up constantly. The fix is always:

```bash
docker compose down -v && docker compose up -d    # wipe the volume, re-run init
```

In a real project you would *not* rely on this at all — you'd run migrations
(Prisma, TypeORM, Alembic, Flyway…) as a step in the deploy. Init scripts are for
local development and throwaway environments.

## Bind mounts and live reload

A bind mount maps a host directory *into* the container, so edits on your laptop
appear instantly inside:

```yaml
# conceptually, for a dev override file
volumes:
  - ./backend/src:/app/src
```

Combined with a watcher (`nest start --watch`), you get hot reload without
rebuilding the image. The trade-off: you're now running your host's files in the
container, which is exactly the kind of "works on my machine" coupling images were
meant to remove — so keep bind mounts confined to a dev override file, never in
the production config.

## Housekeeping

Volumes are not garbage-collected for you. They pile up.

```bash
docker volume ls                 # list them
docker volume inspect docker-learning_pgdata
docker volume rm <name>          # delete one (must be unused)
docker volume prune              # delete ALL unused volumes  <- careful!
```

Next: [Scaling & load balancing](07-scaling-nginx.md).
