import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Client } from 'pg';
import { EventEmitter } from 'node:events';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export type OperationalChange = {
  organizationId: string;
  yardId: string | null;
  kind: 'yard' | 'policy' | 'dashboard';
};

@Injectable()
export class OperationalUpdatesService
  implements OnModuleInit, OnModuleDestroy
{
  readonly events = new EventEmitter();
  private readonly logger = new Logger(OperationalUpdatesService.name);
  private client: Client | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private flush: ReturnType<typeof setTimeout> | undefined;
  private readonly pending = new Map<string, OperationalChange>();
  private stopped = false;
  private delay = 1000;

  constructor(private readonly db: DataSource) {}
  onModuleInit() {
    void this.connect();
  }
  private async connect() {
    if (this.stopped) return;
    const options = this.db.options as PostgresConnectionOptions;
    const client = new Client({
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
      database: options.database,
      ssl: options.ssl,
      connectionString: options.url,
      connectionTimeoutMillis: 5000,
      keepAlive: true,
      application_name: 'alms-operational-listener',
    });
    this.client = client;
    const failed = () => {
      if (this.client !== client) return;
      this.client = null;
      void client.end().catch(() => undefined);
      if (!this.stopped && !this.retry) {
        this.logger.warn(
          'Operational update listener disconnected; reconnecting',
        );
        this.retry = setTimeout(() => {
          this.retry = undefined;
          void this.connect();
        }, this.delay);
        this.delay = Math.min(30000, this.delay * 2);
      }
    };
    client.on('error', failed);
    client.on('end', failed);
    client.on('notification', (message) => {
      if (message.channel !== 'alms_operational_change' || !message.payload)
        return;
      try {
        const change = JSON.parse(message.payload) as OperationalChange;
        if (
          !change.organizationId ||
          !['yard', 'policy', 'dashboard'].includes(change.kind)
        )
          return;
        this.pending.set(
          `${change.organizationId}:${change.yardId}:${change.kind}`,
          change,
        );
        if (!this.flush)
          this.flush = setTimeout(() => {
            this.flush = undefined;
            const changes = [...this.pending.values()];
            this.pending.clear();
            this.events.emit('change', changes);
          }, 100);
      } catch {
        this.logger.warn('Invalid operational notification');
      }
    });
    try {
      await client.connect();
      if (this.stopped) {
        await client.end();
        return;
      }
      await client.query('LISTEN alms_operational_change');
      this.delay = 1000;
      // Every backend instance listens, so this also works across multiple application processes.
      // A reconnect may have missed notifications; readers must invalidate and resync.
      this.events.emit('reset');
    } catch {
      failed();
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearTimeout(this.flush);
    const client = this.client;
    this.client = null;
    await client?.end().catch(() => undefined);
    this.events.removeAllListeners();
  }
}
