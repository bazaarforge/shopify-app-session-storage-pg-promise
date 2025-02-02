import {RdbmsConnection} from '@shopify/shopify-app-session-storage';
import {IBaseProtocol} from 'pg-promise';

export class PgPromiseConnection implements RdbmsConnection {
  sessionStorageIdentifier: string;
  private db: IBaseProtocol<any>;

  constructor(pgPromise: IBaseProtocol<any>, sessionStorageIdentifier: string) {
    this.sessionStorageIdentifier = sessionStorageIdentifier;
    this.db = pgPromise;
  }

  async connect(): Promise<void> {
    // No-op since pg-promise handles connections
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    // No-op since pg-promise handles connections
    return Promise.resolve();
  }

  async query(query: string, params: any[] = []): Promise<any[]> {
    return this.db.query(query, params);
  }

  /**
   * Runs a series of queries in a transaction - requires the use of a SINGLE client,
   * hence we can't use the query method above.
   *
   * @param queries an array of SQL queries to execute in a transaction
   */
  async transaction(queries: string[]): Promise<void> {
    await this.db.tx(async (t) => {
      for (const query of queries) {
        await t.query(query);
      }
    });
  }

  async hasTable(tablename: string): Promise<boolean> {
    const query = `
            SELECT EXISTS (SELECT tablename
                           FROM pg_catalog.pg_tables
                           WHERE tablename = ${this.getArgumentPlaceholder(1)})
        `;

    // Allow multiple apps to be on the same host with separate DB and querying the right
    // DB for the session table exisitence
    const rows = await this.db.any(query, [tablename]);
    return rows[0].exists;
  }

  getArgumentPlaceholder(position: number): string {
    return `$${position}`;
  }
}
