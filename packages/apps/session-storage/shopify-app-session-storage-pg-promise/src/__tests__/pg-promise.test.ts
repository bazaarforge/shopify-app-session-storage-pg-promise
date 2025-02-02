import * as child_process from 'child_process';
import {promisify} from 'util';

import {
  batteryOfTests,
  poll,
} from '@shopify/shopify-app-session-storage-test-utils';
import pgPromise from 'pg-promise';

import {PgPromiseSessionStorage} from '../pg-promise';

const exec = promisify(child_process.exec);

const dbURL = new URL(
  `postgres://${encodeURIComponent('shop&fy')}:${encodeURIComponent(
    'passify#$',
  )}@localhost/${encodeURIComponent('shop&test')}`,
);
const dbURL2 = new URL(
  `postgres://${encodeURIComponent('shop&fy')}:${encodeURIComponent(
    'passify#$',
  )}@localhost/${encodeURIComponent('shop&test2')}`,
);

describe('PgPromiseSessionStorage', () => {
  let storage: PgPromiseSessionStorage;
  let storage2: PgPromiseSessionStorage;

  const pgp = pgPromise();
  const client = pgp({
    host: dbURL.hostname,
    user: decodeURIComponent(dbURL.username),
    password: decodeURIComponent(dbURL.password),
    database: decodeURIComponent(dbURL.pathname.slice(1)),
  });
  const client2 = pgp({
    host: dbURL2.hostname,
    user: decodeURIComponent(dbURL2.username),
    password: decodeURIComponent(dbURL2.password),
    database: decodeURIComponent(dbURL2.pathname.slice(1)),
  });

  let containerId: string;
  beforeAll(async () => {
    const runCommand = await exec(
      "podman run -d -e POSTGRES_DB='shop&test' -e POSTGRES_USER='shop&fy' -e POSTGRES_PASSWORD='passify#$' -p 5432:5432 postgres:15",
      {encoding: 'utf8'},
    );

    containerId = runCommand.stdout.trim();
    await poll(
      async () => {
        try {
          await client.query(`CREATE DATABASE "shop&test2"`);
          await client.query(
            `GRANT ALL PRIVILEGES ON DATABASE "shop&test2" TO "shop&fy"`,
          );

          const createTableQuery = `
          CREATE TABLE IF NOT EXISTS "shopify_sessions"(
            "id"  text NOT NULL PRIMARY KEY,
            "shop" text NOT NULL,
            "state" varchar(255) NOT NULL,
            "isOnline" boolean default false not null,
            "onlineAccessInfo" text,
            "scope" text,
            "expires" integer,
            "accessToken" text,
            "userId" bigint,
            "firstName" text,
            "lastName" text,
            "email" text,
            "accountOwner" boolean default false not null,
            "locale" text,
            "collaborator" boolean default false,
            "emailVerified" boolean default false
          );`;
          await client.query(createTableQuery);
          await client2.query(createTableQuery);
        } catch (error) {
          // console.error(error);  // uncomment to see error for debugging tests
          return false;
        }
        return true;
      },
      {interval: 500, timeout: 80000},
    );
    storage = new PgPromiseSessionStorage(client);
    storage2 = new PgPromiseSessionStorage(client2);

    await storage.ready;
    await storage2.ready;
  });

  afterAll(async () => {
    await exec(`podman rm -f ${containerId}`);
  });

  const tests = [
    {dbName: 'shop&test', sessionStorage: async () => storage},
    {dbName: 'shop&test2', sessionStorage: async () => storage2},
  ];

  for (const {dbName, sessionStorage} of tests) {
    describe(`with ${dbName}`, () => {
      batteryOfTests(sessionStorage);
    });
  }
});
