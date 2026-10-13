# 01 — Why Docker exists

Before containers, handing someone your backend meant handing them a README like:

> Install Node 18, Postgres 14, Redis 6. It works on my Mac but the CI runs
> Ubuntu, and the staging box has Node 16, and oh — the intern's Postgres is
> version 15 so the query fails.

Multiply that by every service in an app with a database, a cache, a queue and a
web server, and "it works on my machine" becomes a full-time job.

**Docker's promise:** package an application *together with everything it needs
to run* — code, runtime, system libraries, config — into a single artifact that
behaves identically everywhere. That artifact is an **image**, and a running copy
of it is a **container**.

## The three problems it solves

**1. Environment consistency.** The image contains Node 22 on Alpine Linux. Your
laptop, your colleague's Windows machine, CI, and production all run *that exact
image*. There is no "install Node first" step.

**2. Isolation.** Each service gets its own filesystem and its own network
namespace. Postgres in one container cannot accidentally read files from your
backend's container. You can run three different Node versions side by side.

**3. Reproducible, declarative setup.** Instead of a wiki page describing how to
set things up, you write it down once in `docker-compose.yml`. `docker compose up`
reproduces the entire stack — database, cache, two backend replicas, load
balancer — from nothing.

## What Docker is *not*

- **Not a virtual machine.** Containers share the host's kernel. That's why they
  start in milliseconds and a VM takes a minute. A container is an isolated
  *process*, not an isolated *computer*.
- **Not a deployment strategy by itself.** Docker packages your app. Orchestrating
  thousands of containers across machines is Kubernetes/ECS territory (see
  [lesson 8](08-production.md)).
- **Not magic sugar.** In production you still worry about secrets, persistent
  storage, logs, and zero-downtime deploys. Docker just makes the *packaging* and
  *scheduling* problems tractable.

## The vocabulary, precisely

| Term | Meaning | Our project |
|------|---------|-------------|
| **Image** | A read-only template: filesystem + metadata. Built once, run many times. | `docker-learning-backend` |
| **Container** | A running instance of an image, with a thin writable layer on top. | one `backend` replica |
| **Dockerfile** | Recipe that builds an image. | `backend/Dockerfile` |
| **Registry** | Where images are stored/shared (Docker Hub, GHCR, ECR). | `postgres:16-alpine` lives on Docker Hub |
| **Volume** | Persistent storage that outlives containers. | `pgdata`, `redisdata` |
| **Compose** | Tool that runs a *multi-container* app from one YAML file. | `docker-compose.yml` |
| **Layer** | A cached filesystem diff; images are stacks of layers. | see [lesson 2](02-images-and-containers.md) |

Next: [images vs. containers](02-images-and-containers.md).
