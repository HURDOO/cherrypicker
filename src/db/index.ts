import { chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const databasePath = process.env.DATABASE_PATH || path.join(
    process.cwd(),
    'data',
    'cherrypicker.db'
);

type DatabaseGlobal = typeof globalThis & {
    cherryPickerSqlite?: Database.Database;
};

const databaseGlobal = globalThis as DatabaseGlobal;

function createSqliteClient() {
    const previousUmask = process.umask(0o077);
    let client: Database.Database | undefined;

    try {
        mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });

        client = new Database(databasePath, {
            timeout: 5_000,
        });

        if (databasePath !== ':memory:') {
            chmodSync(databasePath, 0o600);
        }

        client.pragma('journal_mode = WAL');
        client.pragma('foreign_keys = ON');
        client.pragma('busy_timeout = 5000');
        client.pragma('synchronous = FULL');

        return client;
    } catch (error) {
        client?.close();
        throw error;
    } finally {
        process.umask(previousUmask);
    }
}

export const sqlite = databaseGlobal.cherryPickerSqlite || createSqliteClient();

if (process.env.NODE_ENV !== 'production') {
    databaseGlobal.cherryPickerSqlite = sqlite;
}

export const db = drizzle(sqlite, { schema });
export { databasePath };
