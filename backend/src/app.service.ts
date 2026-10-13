import { Inject, Injectable } from '@nestjs/common';
import { hostname } from 'node:os';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { PG_POOL, REDIS } from './infra/infra.module';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

@Injectable()
export class AppService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  info() {
    return {
      service: 'backend',
      // hostname = the container id. Great for proving load balancing works.
      instance: hostname(),
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async health() {
    const checks: Record<string, string> = {};
    let ok = true;

    try {
      await this.pool.query('SELECT 1');
      checks.postgres = 'ok';
    } catch (err) {
      ok = false;
      checks.postgres = `error: ${(err as Error).message}`;
    }

    try {
      await this.redis.ping();
      checks.redis = 'ok';
    } catch (err) {
      ok = false;
      checks.redis = `error: ${(err as Error).message}`;
    }

    return { ok, instance: hostname(), checks };
  }

  async recordVisit() {
    // INCR is atomic. Because all replicas share ONE redis, the counter keeps
    // climbing no matter which backend instance answers the request.
    const total = await this.redis.incr('visits:total');
    return { totalVisits: total, servedBy: hostname() };
  }

  async listUsers() {
    // Parameterless query; note we never string-concatenate SQL.
    const { rows } = await this.pool.query<UserRow>(
      'SELECT id, name, email, created_at FROM users ORDER BY id',
    );
    return { servedBy: hostname(), count: rows.length, users: rows };
  }

  async createUser(name: string, email: string) {
    // $1/$2 = parameterised query. This is how you avoid SQL injection.
    const { rows } = await this.pool.query<UserRow>(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, name, email, created_at',
      [name, email],
    );
    return { servedBy: hostname(), user: rows[0] };
  }
}
