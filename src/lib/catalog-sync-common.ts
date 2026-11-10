import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readdirSync,
    renameSync,
    statSync,
    unlinkSync,
} from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';

/** IDs in the shared catalog are ASCII slugs, UUIDs or `promotion-auto-<hash>`. */
export const CATALOG_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,200}$/;

// Backups the app writes into the data directory. Anything else there is left alone.
const MANAGED_BACKUP_NAME = /^(pre-start|pre-catalog-release|pre-promotion-handover|pre-manual-promotion-release)-.+\.db$/;
export const DEFAULT_BACKUP_KEEP_COUNT = 10;

/** JSON with object keys sorted, so the same data always gives the same text and hash. */
export function stableStringify(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value instanceof Date) return value.toISOString();
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, item]) => item !== undefined)
                .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
                .map(([key, item]) => [key, sortKeys(item)]),
        );
    }
    return value;
}

export const sha256Hex = (value: string | Buffer) =>
    createHash('sha256').update(value).digest('hex');

export const contentHash = (value: unknown) => sha256Hex(stableStringify(value));

export interface MigrationTag {
    count: number;
    lastHash: string | null;
}

/** The applied Drizzle migrations; both ends must match before data moves between them. */
export function readMigrationTag(client: Database.Database): MigrationTag {
    const table = client.prepare(
        "select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'",
    ).get();
    if (!table) return { count: 0, lastHash: null };
    const count = (client.prepare('select count(*) as count from __drizzle_migrations').get() as {
        count: number;
    }).count;
    const last = client.prepare(
        'select hash from __drizzle_migrations order by created_at desc, rowid desc limit 1',
    ).get() as { hash: string } | undefined;
    return { count, lastHash: last?.hash ?? null };
}

export function syncDataDirectory(databasePath: string) {
    return path.dirname(path.resolve(databasePath));
}

/** Newest first by modification time; removes the app's own backups beyond `keep`. */
export function pruneDatabaseBackups(directory: string, keep = DEFAULT_BACKUP_KEEP_COUNT) {
    if (!existsSync(directory)) return [];
    const backups = readdirSync(directory)
        .filter(name => MANAGED_BACKUP_NAME.test(name))
        .map(name => {
            const fullPath = path.join(directory, name);
            return { fullPath, modifiedAt: statSync(fullPath).mtimeMs };
        })
        .sort((left, right) => right.modifiedAt - left.modifiedAt);
    const removed = backups.slice(Math.max(keep, 0));
    removed.forEach(item => unlinkSync(item.fullPath));
    return removed.map(item => path.basename(item.fullPath));
}

export const backupTimestamp = (now = new Date()) =>
    now.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');

/**
 * Online backup of the live database next to it in `backups/`, checked with quick_check,
 * then the oldest app backups beyond the keep count are removed.
 */
export async function backupLiveDatabase(
    client: Database.Database,
    databasePath: string,
    label: 'pre-catalog-release' | 'pre-promotion-handover' | 'pre-manual-promotion-release',
    now = new Date(),
) {
    const directory = path.join(syncDataDirectory(databasePath), 'backups');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const destination = path.join(directory, `${label}-${backupTimestamp(now)}.db`);
    if (existsSync(destination)) throw new Error('같은 이름의 백업이 이미 있습니다.');
    const partial = path.join(directory, `.${path.basename(destination)}.partial-${process.pid}`);
    try {
        await client.backup(partial);
        const { default: DatabaseConstructor } = await import('better-sqlite3');
        const snapshot = new DatabaseConstructor(partial, { readonly: true, fileMustExist: true });
        try {
            const result = snapshot.pragma('quick_check', { simple: true });
            if (result !== 'ok') throw new Error(`백업 검사 실패: ${String(result)}`);
        } finally {
            snapshot.close();
        }
        renameSync(partial, destination);
    } catch (error) {
        if (existsSync(partial)) unlinkSync(partial);
        throw error;
    }
    pruneDatabaseBackups(directory);
    return path.basename(destination);
}
