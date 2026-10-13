# Cheatsheet

Commands you'll actually reuse. Nothing here is project-specific unless noted.

## Lifecycle (this project)

```bash
docker compose up -d --build        # start the stack (rebuild backend)
docker compose down                 # stop + remove containers/network, KEEP volumes
docker compose down -v              # ...and DELETE volumes (wipes DB data)
make up / down / logs / ps          # shortcuts, run `make` for the list
make hit                            # show which replica answers each request
make scale REPLICAS=4               # scale the backend
```

## Inspecting

```bash
docker ps                           # running containers
docker ps -a                        # including stopped ones
docker compose ps                   # containers in this project, with ports
docker compose logs -f backend      # follow one service's logs
docker compose logs --tail=100      # last 100 lines of everything
docker stats                        # live CPU/memory per container
docker compose top                  # processes inside each container
docker inspect <container>          # full JSON metadata (IPs, mounts, health)
docker compose config               # resolved config, including .env substitution
```

## Getting a shell / running commands

```bash
docker compose exec backend sh              # shell inside a running container
docker compose exec postgres psql -U app -d app
docker compose exec redis redis-cli
docker compose run --rm backend node -e "console.log(1)"   # one-off, throws container away
```

## Images & builds

```bash
docker image ls                     # images on disk
docker build -t myapp:dev ./backend # build directly
docker history myapp:dev            # see the layers
docker compose build --no-cache backend
docker image prune -a               # remove unused images
```

## Networks & volumes

```bash
docker network ls
docker network inspect docker-learning_default
docker volume ls
docker volume inspect docker-learning_pgdata
docker volume prune                 # delete unused volumes (careful!)
```

## Cleanup

```bash
docker compose down -v --remove-orphans      # nuke this project completely
docker system df                    # how much disk Docker is using
docker system prune -a              # reclaim space (removes unused images/containers)
```

## Handy one-liners

```bash
# Which backend replica served my last request?
curl -s localhost:8080/ | grep -o '"instance":"[^"]*"'

# 20 requests, count responses per replica
for i in $(seq 20); do curl -s localhost:8080/ | grep -o '"instance":"[^"]*"'; done | sort | uniq -c

# Watch the Redis counter from the redis container
docker compose exec redis redis-cli get visits:total

# Tail logs of every nginx upstream decision
docker compose logs -f nginx

# Follow all logs, prefixed by service name
docker compose logs -f --tail=20
```

## Environment files

```bash
cp .env.example .env                # then edit
docker compose config               # verify your variables were picked up
```

## Mental model, in one breath

An **image** is a read-only blueprint built from a **Dockerfile** (layers, cached).
A **container** is a running instance. **Compose** runs many containers as one app
on a private **network** where services find each other **by name** via DNS.
**Volumes** hold state that must outlive containers. Only the **load balancer**
publishes ports. Make services **stateless** so you can **scale** them.
