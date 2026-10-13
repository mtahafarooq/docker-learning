# 07 — Scaling & load balancing

Now the payoff. Everything so far — DNS by service name, volumes, health checks —
comes together to let you add capacity by changing one number.

## Scale horizontally

```bash
docker compose up -d --scale backend=4     # or: make scale REPLICAS=4
make hit                                   # fire 6 requests, see who answers
```

`/` returns the container's hostname, so you can *see* the spread:

```
b7c1a9d2f3e1
1a2b3c4d5e6f
b7c1a9d2f3e1
9f8e7d6c5b4a
1a2b3c4d5e6f
9f8e7d6c5b4a
```

Four distinct container IDs, round-robin. Same URL, four different processes.
That is horizontal scaling in one command.

Because `backend` resolves to all replica IPs and our nginx uses a variable
`proxy_pass` with a `resolver`, **nginx notices the new replicas within ~5s
without a restart.** (With the classic static `upstream` block at the bottom of
`nginx.conf`, you'd need `docker compose restart nginx` instead — both are valid;
the trade-off is documented in that file.)

Each replica gets its own reserved IP; check with:

```bash
docker network inspect docker-learning_default | grep -A2 backend
```

## Why the backend can be scaled at all: it's stateless

This is the most important architectural lesson here. A service is
**horizontally scalable** when any replica can serve any request, because no
replica holds request-specific state that the others lack.

Our backend is stateless. It keeps nothing in memory between requests:

- **Sessions / counters → Redis.** `INCR visits:total` runs on the shared Redis.
  Refresh `/visits` and the number climbs smoothly *even though a different
  container answers each time*, because there's one counter, not one per
  container.
- **Durable data → Postgres**, likewise shared.

Watch it prove itself: hit `/visits` ten times while scaled to 4 replicas. The
`totalVisits` is monotonic and correct. If each replica kept a counter in a module
variable, you'd see four interleaved sequences that jump around. **That's the
difference between stateless (scale it) and stateful (don't).**

The same rule governs:
- **Connection pools.** Each replica opens its own pool to Postgres. 4 replicas ×
  10 connections = 40 connections. At scale you need PgBouncer or a smaller pool
  per replica — otherwise you exhaust `max_connections`. Scaling multiplies
  *everything*, including resource usage.
- **In-process cron jobs.** Scale to 4 and your nightly job runs 4 times. Move it
  to a dedicated worker or guard it with a Redis lock.
- **Local file uploads.** A file written on replica #1 isn't on #2. Use S3 or a
  shared volume.

## How the load balancing actually works

Nginx gets multiple IPs for the name `backend` and distributes requests. Our
config is round-robin. In real deployments you'd often tune this:

- `least_conn` — send to the replica with fewest active connections (better when
  requests vary in cost).
- `ip_hash` — same client IP → same replica. Sometimes used for stateful
  backends, but it defeats the purpose; prefer making the service stateless.
- **Health-based ejection** — don't route to unhealthy replicas. In nginx OSS you
  approximate this with `max_fails`/`fail_timeout` on an `upstream`; Kubernetes
  and cloud load balancers do it properly via readiness probes.

Try killing one replica and see nginx cope:

```bash
docker compose ps
docker kill docker-learning-backend-1        # (name may differ: check `docker compose ps`)
make hit                                     # requests still succeed, on the survivors
docker compose up -d --scale backend=2       # bring it back
```

Note that a plain container kill is abrupt — no grace period. `docker compose stop`
sends `SIGTERM` first, which our `OnApplicationShutdown` hook uses to close the
Postgres pool and Redis connection cleanly. **Graceful shutdown is what lets a
real load balancer drain connections before a replica goes away** — another reason
to handle `SIGTERM`.

## Vertical vs. horizontal

- **Vertical** = a bigger machine (`--cpus`, `--memory`, or a larger instance).
  Simple, has a ceiling, needs downtime.
- **Horizontal** = more copies. The reason containers and orchestrators exist.

Docker Compose scaling is great for learning and single-machine workloads. For
multi-machine, self-healing, rolling-deploy scaling, that's Kubernetes / ECS /
Nomad — but the *service* you've written here (stateless, config via env, health
endpoint, graceful shutdown) is exactly what those systems expect, so the concepts
transfer directly.

Next: [Production notes](08-production.md).
