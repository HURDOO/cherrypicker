import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

// The container entrypoint backs up before migrating unless this script exits 1 (up to date).
const script = resolve('scripts/has-pending-migrations.mjs');
const journal = JSON.parse(readFileSync(resolve('drizzle/meta/_journal.json'), 'utf8')) as {
    entries: Array<{ when: number }>;
};
const whens = journal.entries.map(entry => entry.when).sort((left, right) => left - right);

const run = (databasePath: string) => spawnSync(process.execPath, [script, databasePath], { encoding: 'utf8' }).status;

const database = (appliedUpTo?: number) => {
    const path = join(mkdtempSync(join(tmpdir(), 'cherrypicker-migrations-')), 'app.db');
    const client = new Database(path);
    client.pragma('journal_mode = WAL');
    if (appliedUpTo !== undefined) {
        client.exec('create table __drizzle_migrations (id integer primary key, hash text not null, created_at numeric)');
        client.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)').run('x', appliedUpTo);
    }
    client.close();
    return path;
};

describe('has-pending-migrations', () => {
    it('reports up to date only when the newest journal migration is applied', () => {
        expect(run(database(whens.at(-1)))).toBe(1);
        expect(run(database(whens.at(-2)))).toBe(0);
        expect(run(database())).toBe(0);
    });

    it('cannot tell for a missing database, so the entrypoint still backs up', () => {
        expect(run(join(tmpdir(), 'cherrypicker-missing', 'app.db'))).toBe(2);
    });
});
