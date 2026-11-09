import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient } from 'pg';

export type Queryable = Pick<PoolClient, 'query'>;

export class Db {
  readonly pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({ connectionString: url, max: 10 });
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = [], client: Queryable = this.pool): Promise<T[]> {
    const r = await client.query(sql, params);
    return r.rows as T[];
  }

  async one<T = Record<string, unknown>>(sql: string, params: unknown[] = [], client: Queryable = this.pool): Promise<T | undefined> {
    return (await this.query<T>(sql, params, client))[0];
  }

  /** Run fn in a transaction. Serialisation for bookings is done with row locks (SELECT … FOR UPDATE). */
  async tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      c.release();
    }
  }

  async migrate(dir = path.join(__dirname, '..', 'migrations')): Promise<string[]> {
    await this.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await this.query<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
    const applied: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await this.tx(async (c) => {
        await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      });
      applied.push(f);
    }
    return applied;
  }

  close() {
    return this.pool.end();
  }
}
