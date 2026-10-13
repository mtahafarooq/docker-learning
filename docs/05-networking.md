# 05 — Networking: how the containers find each other

This is where Docker "clicks" for a lot of people. Our backend talks to Postgres
by the hostname `postgres` with no IP address anywhere. How?

## Every Compose project gets a private network

When you run `docker compose up`, Compose creates a **user-defined bridge
network**. Every service joins it and gets:

- its own IP address on that network,
- a **DNS name equal to the service name**.

So inside the backend container, `postgres`, `redis` and `nginx` are all valid
hostnames, resolved by Docker's embedded DNS server at `127.0.0.11`.

That's the entire trick behind `PGHOST: postgres`. No service discovery system,
no config files with IPs — Compose's network *is* the service discovery.

```bash
# Prove it: resolve the name from inside another container
docker compose exec backend getent hosts postgres
docker compose exec backend getent hosts redis

# Prove the connection works
docker compose exec backend wget -qO- http://backend:3000/health   # from nginx, see below
```

## Names, not IPs — and why that matters

Container IPs change every time a container is recreated. If you hardcoded
`172.18.0.4`, your app would break on the next `up`. Using service names means
the app is indifferent to IP churn — which is also what makes [scaling](07-scaling-nginx.md)
work: `backend` resolves to *all* backend replicas' IPs, and nginx balances
across them.

## Published ports vs. exposed ports — the crucial distinction

```yaml
nginx:
  ports:
    - "8080:80"      # host:container  -> reachable at localhost:8080
backend:
  # no ports         -> reachable ONLY from other containers on this network
```

- **`ports:`** publishes a container port to your *host machine*. `"8080:80"`
  means traffic to `localhost:8080` is forwarded to port 80 in the container.
- **No `ports:`** means the container is reachable only from inside the
  Compose network, by name.

Notice our backend has **no published port**. You cannot `curl localhost:3000` —
and that is correct. Only nginx should talk to the API. Databases and app servers
should almost never be exposed directly to the internet; every published port is
an attack surface. (We *do* publish Postgres/Redis here only so you can poke them
with `psql`/`redis-cli` for learning. Delete those lines in production.)

## The `localhost` trap

Inside a container, `localhost` means **that container**, not your laptop.

- In the backend container, `localhost:5432` → "is there a Postgres in *this*
  container?" → no. Use `postgres:5432`.
- When a service *on your host* connects, it's the opposite: from your Mac,
  `localhost:5432` works because we published it.

Also: **binding to `127.0.0.1` inside a container breaks everything** — the app is
then only reachable from within its own container. Our `main.ts` calls
`app.listen(port, '0.0.0.0')` for exactly this reason.

If you ever need a container to reach something running on your host, use
`host.docker.internal` (Docker Desktop) instead of `localhost`.

## DNS round-robin in action

Because `backend` resolves to multiple IPs when scaled, nginx gets a fresh set on
each resolution. Our `nginx.conf` uses Docker's resolver plus a variable in
`proxy_pass` precisely so newly-scaled replicas are discovered without a restart:

```nginx
resolver 127.0.0.11 valid=5s ipv6=off;
set $backend_upstream "backend:3000";
proxy_pass http://$backend_upstream;
```

## Debugging network problems

```bash
# What network is the stack on, and who's attached?
docker network ls
docker network inspect docker-learning_default

# From inside a container: can I resolve and reach the dependency?
docker compose exec backend sh
  getent hosts postgres       # DNS resolution
  nc -zv postgres 5432        # TCP reachability (if nc is present)
  wget -qO- http://redis:6379 # expect a Redis error, which still proves reachability
  exit

# Ports published on the host
docker compose ps        # shows the host:container port mapping
```

Next: [Storage](06-storage.md).
