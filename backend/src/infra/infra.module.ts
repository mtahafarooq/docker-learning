import {
  Global,
  Logger,
  Module,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';

export const PG_POOL = 'PG_POOL';
export const REDIS = 'REDIS';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          host: process.env.PGHOST ?? 'postgres',
          port: Number(process.env.PGPORT ?? 5432),
          user: process.env.PGUSER ?? 'app',
          password: process.env.PGPASSWORD ?? 'app',
          database: process.env.PGDATABASE ?? 'app',
          max: 10,
        }),
    },
    {
      provide: REDIS,
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST ?? 'redis',
          port: Number(process.env.REDIS_PORT ?? 6379),

          // Fail commands IMMEDIATELY while disconnected instead of queueing
          // them, so /health reports the failure honestly rather than hanging.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,

          // Keep trying to reconnect FOREVER with a capped backoff. Returning
          // null here would stop retrying for good, and the service would never
          // recover once Redis came back.
          retryStrategy: (times) => Math.min(times * 200, 2000),
          connectTimeout: 2000,
        }),
    },
  ],
  exports: [PG_POOL, REDIS],
})
export class InfraModule implements OnApplicationShutdown {
  private readonly logger = new Logger(InfraModule.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`shutdown (${signal ?? 'unknown'}), closing connections`);
    await Promise.allSettled([this.pool.end(), this.redis.quit()]);
  }
}
