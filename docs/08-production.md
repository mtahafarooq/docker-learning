# 08 — From this lab to production

What we built is a *development* setup. It teaches the mechanics correctly, but
production adds concerns. Here's the honest gap.

## 1. Stop publishing database ports

```yaml
postgres:
  ports:
    - "5432:5432"   # <-- delete this in production
redis:
  ports:
    - "6379:6379"   # <-- and this
```

Every published port is reachable from the host network and, with a
misconfigured firewall, from the internet. Only the load balancer should be
exposed. Internal services talk over the private network by name and need no
published ports at all.

## 2. Secrets do not belong in `.env`

Our `.env` has `POSTGRES_PASSWORD=app` committed to the repo for convenience. In
production, credentials come from a **secret manager** — AWS Secrets Manager,
Vault, GCP Secret Manager, Kubernetes Secrets (or better, SOPS/sealed-secrets) —
injected as env vars or mounted files at runtime. Never `COPY` a `.env` into an
image; images are stored in registries and layers are readable by anyone who can
pull them.

Related: a `.env` in a repo is a footgun. Commit `.env.example` with dummy values
and gitignore the real `.env` (as we did).

## 3. Tag your images properly

`latest` is not a version. Production images are tagged with something immutable:

```bash
docker build -t registry.example.com/acme/backend:1.4.2 -t registry.example.com/acme/backend:sha-a1b2c3d ./backend
docker push registry.example.com/acme/backend:1.4.2
```

Deploy by **digest** (`@sha256:...`) when you need guarantees that the artifact
can't be swapped under you. Use multi-arch builds (`docker buildx`) if you run
both ARM and x86.

## 4. Compose is not your production orchestrator

Compose is excellent for local dev and single-host deployments, and people do run
it in production on one box. But it does not give you:

- scheduling across a cluster,
- rolling/blue-green deploys with zero downtime,
- self-healing when a *node* dies,
- autoscaling.

For those you reach for **Kubernetes, ECS, Nomad, or a PaaS** (Fly.io, Railway,
Render). The good news: the container you built is exactly what they consume.
Nothing about your Dockerfile changes.

## 5. Observability

- **Logs:** we log to stdout/stderr (`access_log /dev/stdout`). Containers should
  never write log *files*; the platform collects the stream. Twelve-factor rule.
- **Metrics:** expose Prometheus metrics from the app; don't scrape `docker stats`
  in prod.
- **Health:** you have `/health`. Split it into **liveness** (am I alive? restart
  if not) and **readiness** (can I serve traffic *right now*? e.g. DB reachable)
  for Kubernetes. Our `/health` is closer to readiness.

## 6. Resource limits and non-root

```yaml
backend:
  deploy:
    resources:
      limits:
        cpus: "1.0"
        memory: 512M
```

Without limits, one misbehaving container can starve the host. And we already run
as `USER node` — keep it that way; add a read-only root filesystem
(`read_only: true`) and drop capabilities where you can.

## 7. Migrations, not init scripts

`db/init.sql` only runs on an empty volume. Real deployments run **versioned
migrations** as an explicit release step (Flyway, Prisma Migrate, TypeORM
migrations, Alembic…). Schema changes must be reviewable, ordered, and
reversible-ish — not "delete your data volume and hope".

## 8. CI/CD shape

A typical pipeline, most of which you can write today:

```text
git push
  → run tests
  → docker build (cached layers make this fast)
  → docker scan / trivy (vulnerability scan)
  → push tagged image to registry
  → deploy: update the running service to the new tag
      (k8s: kubectl set image / Helm; ECS: new task definition; etc.)
```

Cache your layers in CI (`cache-from`/`cache-to` with `buildx`) so you're not
re-downloading dependencies on every run.

## 9. Don't forget `.dockerignore`

It's a security control, not just a speed one. Without it you can accidentally
bake `.env`, `.git`, SSH keys, or `node_modules` into an image that ends up in a
registry.

---

## The short list of things to do differently

| This lab | Production |
|----------|-----------|
| `.env` with real-ish creds | Secret manager |
| DB ports published | Not published |
| `:latest`-ish local tags | Immutable tags / digests |
| `db/init.sql` | Versioned migrations |
| Compose on one machine | Kubernetes / ECS / Nomad |
| `/health` | liveness + readiness + metrics |
| No resource limits | CPU/memory limits, non-root, read-only FS |
| Logs to stdout (✓ correct) | stdout + a log pipeline |

The core mental model — **build an immutable image, run it as an isolated
container, wire containers together over a private network, keep state in volumes
or external services** — is identical at every scale. Everything above is
operational detail layered on top.
