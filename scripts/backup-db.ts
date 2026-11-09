import './load-env';

import {
    chmodSync,
    existsSync,
    mkdirSync,
    renameSync,
    statSync,
    unlinkSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import Database from 'better-sqlite3';
import { pruneDatabaseBackups } from '../src/lib/catalog-sync-common';

const DEFAULT_DATABASE_PATH = 'data/cherrypicker.db';

function createTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function removePartialBackup(path: string): void {
    if (existsSync(path)) {
        unlinkSync(path);
    }
}

async function main(): Promise<void> {
    process.umask(0o077);

    const databasePath = resolve(process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH);
    const defaultDestination = join(
        'backups',
        `cherrypicker-${createTimestamp()}.db`,
    );
    const destinationArgument = process.argv.slice(2).find(item => !item.startsWith('--'));
    const keepArgument = process.argv.find(item => item.startsWith('--keep='))?.slice('--keep='.length);
    const keep = keepArgument === undefined ? undefined : Number(keepArgument);
    if (keep !== undefined && (!Number.isSafeInteger(keep) || keep < 1)) {
        throw new Error('--keep은 1 이상의 정수여야 합니다.');
    }
    const destinationPath = resolve(destinationArgument ?? defaultDestination);

    if (!existsSync(databasePath)) {
        throw new Error(`Database does not exist: ${databasePath}`);
    }

    if (databasePath === destinationPath) {
        throw new Error('Backup destination must differ from DATABASE_PATH.');
    }

    if (existsSync(destinationPath)) {
        throw new Error(`Refusing to overwrite existing backup: ${destinationPath}`);
    }

    mkdirSync(dirname(destinationPath), { recursive: true, mode: 0o700 });

    const partialPath = join(
        dirname(destinationPath),
        `.${basename(destinationPath)}.partial-${process.pid}-${Date.now()}`,
    );

    try {
        const source = new Database(databasePath, {
            fileMustExist: true,
            readonly: true,
            timeout: 5_000,
        });

        try {
            await source.backup(partialPath);
        } finally {
            source.close();
        }

        const snapshot = new Database(partialPath, {
            fileMustExist: true,
            readonly: true,
        });

        try {
            const result = snapshot.pragma('quick_check', { simple: true });

            if (result !== 'ok') {
                throw new Error(`SQLite quick_check failed: ${String(result)}`);
            }
        } finally {
            snapshot.close();
        }

        renameSync(partialPath, destinationPath);
        chmodSync(destinationPath, 0o600);

        const size = statSync(destinationPath).size;
        console.log(`Backup complete: ${destinationPath} (${size} bytes)`);

        // Only the app's own pre-start/pre-sync backups count toward --keep; others stay.
        if (keep !== undefined) {
            const removed = pruneDatabaseBackups(dirname(destinationPath), keep);
            if (removed.length > 0) console.log(`Removed ${removed.length} older backups.`);
        }
    } catch (error) {
        removePartialBackup(partialPath);
        throw error;
    }
}

void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Backup failed: ${message}`);
    process.exitCode = 1;
});
