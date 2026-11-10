// Exit 0 when the database has migrations still to apply (or no migration table yet), 1 when it
// is up to date, 2 when it cannot tell. The container entrypoint backs up before migrating unless
// this exits 1. Plain Node on purpose: starting tsx takes seconds on the Raspberry Pi.
// Same rule as drizzle's SQLite migrator: a journal entry is pending when its `when` is newer
// than the newest applied `created_at`.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

function check(databasePath, journalPath) {
    if (!databasePath) throw new Error('usage: has-pending-migrations.mjs <database> [journal]');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const newest = Math.max(...journal.entries.map(entry => Number(entry.when)));
    // Not readonly: a WAL database without its -shm file cannot be opened read-only.
    const client = new Database(databasePath, { fileMustExist: true });
    try {
        const table = client.prepare(
            "select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
        ).get();
        if (!table) return { pending: true, reason: 'No migration table yet; migrations are pending.' };
        const applied = client.prepare('select max(created_at) as last from __drizzle_migrations').get();
        const pending = !(Number(applied?.last) >= newest);
        return { pending, reason: pending ? 'Migrations are pending.' : 'No pending migrations.' };
    } finally {
        client.close();
    }
}

let code;
try {
    const [databasePath, journalPath = path.resolve('drizzle/meta/_journal.json')] = process.argv.slice(2);
    const result = check(databasePath, journalPath);
    console.log(result.reason);
    code = result.pending ? 0 : 1;
} catch (error) {
    console.error(`Could not check migrations: ${error instanceof Error ? error.message : String(error)}`);
    code = 2;
}
process.exit(code);
