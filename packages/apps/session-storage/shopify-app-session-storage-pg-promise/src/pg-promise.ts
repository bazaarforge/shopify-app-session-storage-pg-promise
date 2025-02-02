import {Session} from '@shopify/shopify-api';
import {
  SessionStorage,
  RdbmsSessionStorageOptions,
} from '@shopify/shopify-app-session-storage';
import {IBaseProtocol} from 'pg-promise';

import {PgPromiseConnection} from './pg-promise-connection';

export interface PgPromiseSessionStorageOptions
  extends RdbmsSessionStorageOptions {}

const defaultPgPromiseSessionStorageOptions: PgPromiseSessionStorageOptions = {
  sessionTableName: 'shopify_sessions',
};

export class PgPromiseSessionStorage implements SessionStorage {
  public readonly ready: Promise<void>;
  private options: PgPromiseSessionStorageOptions;
  private client: PgPromiseConnection;

  constructor(
    db: IBaseProtocol<any>,
    opts: Partial<PgPromiseSessionStorageOptions> = {},
  ) {
    this.options = {...defaultPgPromiseSessionStorageOptions, ...opts};
    this.client = new PgPromiseConnection(db, this.options.sessionTableName);
  }

  public async storeSession(session: Session): Promise<boolean> {
    await this.ready;

    // Note milliseconds to seconds conversion for `expires` property
    const entries = session
      .toPropertyArray()
      .map(([key, value]) =>
        key === 'expires'
          ? [key, Math.floor((value as number) / 1000)]
          : [key, value],
      );
    const query = `
            INSERT INTO "${this.options.sessionTableName}"
                (${entries.map(([key]) => `"${key}"`).join(', ')})
            VALUES (${entries
              .map((_, i) => `${this.client.getArgumentPlaceholder(i + 1)}`)
              .join(', ')}) ON CONFLICT ("id") DO
            UPDATE SET ${entries
              .map(([key]) => `"${key}" = Excluded."${key}"`)
              .join(', ')};
        `;

    await this.client.query(
      query,
      entries.map(([_key, value]) => value),
    );
    return true;
  }

  public async loadSession(id: string): Promise<Session | undefined> {
    await this.ready;
    const query = `
            SELECT *
            FROM "${this.options.sessionTableName}"
            WHERE "id" = ${this.client.getArgumentPlaceholder(1)};
        `;
    const rows = await this.client.query(query, [id]);
    if (!Array.isArray(rows) || rows?.length !== 1) return undefined;
    const rawResult = rows[0] as any;
    return this.databaseRowToSession(rawResult);
  }

  public async deleteSession(id: string): Promise<boolean> {
    await this.ready;
    const query = `
            DELETE
            FROM "${this.options.sessionTableName}"
            WHERE "id" = ${this.client.getArgumentPlaceholder(1)};
        `;
    await this.client.query(query, [id]);
    return true;
  }

  public async deleteSessions(ids: string[]): Promise<boolean> {
    await this.ready;
    const query = `
            DELETE
            FROM "${this.options.sessionTableName}"
            WHERE "id" IN (${ids
              .map((_, i) => `${this.client.getArgumentPlaceholder(i + 1)}`)
              .join(', ')});
        `;
    await this.client.query(query, ids);
    return true;
  }

  public async findSessionsByShop(shop: string): Promise<Session[]> {
    await this.ready;

    const query = `
            SELECT *
            FROM "${this.options.sessionTableName}"
            WHERE "shop" = ${this.client.getArgumentPlaceholder(1)};
        `;
    const rows = await this.client.query(query, [shop]);
    if (!Array.isArray(rows) || rows?.length === 0) return [];

    const results: Session[] = rows.map((row: any) => {
      return this.databaseRowToSession(row);
    });
    return results;
  }

  public disconnect(): Promise<void> {
    return this.client.disconnect();
  }

  private databaseRowToSession(row: any): Session {
    // convert seconds to milliseconds prior to creating Session object
    if (row.expires) row.expires *= 1000;
    return Session.fromPropertyArray(Object.entries(row));
  }
}
