# Docker Learning Lab

A runnable, four-service application you can poke at until Docker clicks.

**The stack:** `Nginx` → `Nest.js` (x2) → `PostgreSQL` + `Redis`, all wired
together with Docker Compose and started with a single command.

```text
                       ┌──────────────────────────────────────────────────┐
   browser / curl      │          docker compose network                   │
      │                │                                                   │
      │  localhost:8080│   ┌──────────┐                                    │
      └───────────────►│──►│  nginx   │  reverse proxy + load balancer     │
                       │   │  :80     │                                    │
                       │   └────┬─────┘                                    │
                       │        │  round-robin                              │
                       │     ┌──┴───┐                                       │
                       │     ▼      ▼        ← scale to as many as you like │
                       │  ┌───────┐┌───────┐   docker compose up -d \        │
                       │  │backend││backend│        --scale backend=4        │
                       │  │  #1   ││  #2   │                                 │
                       │  └──┬────┘└──┬────┘                                 │
                       │     └───┬────┘                                      │
                       │         ▼                                           │
                       │   ┌──────────┐    ┌─────────┐                       │
                       │   │ postgres │    │  redis  │                       │
                       │   │  :5432   │    │  :6379  │                       │
                       │   │ [volume] │    │[volume] │                       │
                       │   └──────────┘    └─────────┘                       │
                       └──────────────────────────────────────────────────┘
```

---

## Quick start

```bash
docker compose up -d --build      # or: make up

curl localhost:8080/health        # are postgres + redis reachable?
curl localhost:8080/users         # read rows from PostgreSQL
curl localhost:8080/visits        # hit this a few times and watch it climb
```

Open <http://localhost:8080> in a browser and **refresh a few times** — notice
the `"instance"` value changes. That's the load balancer spreading you across
backend replicas. Hit `/visits` repeatedly: the counter climbs even though
different containers answer, because they all share one Redis.

Tear it down with `docker compose down` (keeps data) or `make clean` (wipes data).

---

## The five experiments that teach you Docker

Do these in order. Each one takes a minute and demonstrates one idea.

 | # | Do this | What it teaches |
|---|---------|-----------------|
| 1 | `make hit` | Nginx round-robins across replicas; the "instance" is the container hostname |
| 2 | `curl localhost:8080/visits` ten times | Stateless vs. stateful: all replicas share one Redis |
| 3 | `make scale REPLICAS=4` then `make hit` | Horizontal scaling, and that nginx picks up new replicas live |
| 4 | `docker compose down` then `up` again, `curl /users` | Volumes: your data outlives the containers |
| 5 | `docker compose stop redis`, then `curl /health` | Health checks / failure: the app honestly reports what's broken |

> Experiment 5 is why `/health` exists. In production, nginx or Kubernetes uses
> exactly this signal to decide whether to send traffic to a container.

---

## What's in here

```
docker-compose.yml      the whole app as one declarative file  <- start here
.env / .env.example     local config (ports, DB credentials)
Makefile                shortcuts (run `make` to list them)

backend/                the Nest.js API
  Dockerfile            multi-stage build (the important file)
  .dockerignore         what NOT to send to the Docker daemon
  src/                  app code; talks to Postgres + Redis

db/init.sql             schema + seed data, runs once on first boot

nginx/nginx.conf        reverse proxy + load balancer config

docs/                   the lessons, read them alongside the code
```

## The lessons

1. [Why Docker exists](docs/01-why-docker.md) — the problem it actually solves
2. [Images vs. containers](docs/02-images-and-containers.md) — layers, registries, the mental model
3. [The Dockerfile](docs/03-dockerfile.md) — our multi-stage build, line by line
4. [Compose](docs/04-compose.md) — orchestrating four services without going mad
5. [Networking](docs/05-networking.md) — how `backend` finds `postgres` by name
6. [Storage](docs/06-storage.md) — volumes, and the #1 beginner gotcha
7. [Scaling & load balancing](docs/07-scaling-nginx.md) — why the backend is stateless
8. [Production notes](docs/08-production.md) — what changes in the real world
9. [Cheatsheet](docs/CHEATSHEET.md) — commands you'll actually reuse

## Requirements

Docker Desktop (or Docker Engine + Compose v2). Nothing else — Node, Postgres
and Redis all run inside containers. That is rather the point.
