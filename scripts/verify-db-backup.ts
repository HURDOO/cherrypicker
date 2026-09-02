import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import Database from 'better-sqlite3';

import {
    CURRENT_DATABASE_BACKUP_TABLES,
    classifyDatabaseMigrationCompatibility,
    inspectDatabaseBackup,
} from '../src/lib/database-backup';

interface DrizzleJournal {
    entries?: Array<{ tag?: unknown }>;
}

const readAvailableMigrationHashes = (): string[] => {
    const journalPath = resolve('drizzle/meta/_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as DrizzleJournal;

    if (!Array.isArray(journal.entries)) {
        throw new Error(`Invalid Drizzle migration journal: ${journalPath}`);
    }

    return journal.entries.map((entry, index) => {
        if (typeof entry.tag !== 'string' || entry.tag.length === 0) {
            throw new Error(`Invalid migration tag at journal index ${index}.`);
        }

        const migrationPath = resolve('drizzle', `${entry.tag}.sql`);
        const migrationSql = readFileSync(migrationPath);

        return createHash('sha256').update(migrationSql).digest('hex');
    });
};

const main = (): void => {
    process.umask(0o077);

    const inputPath = process.argv[2];
    if (!inputPath) {
        throw new Error('Usage: npm run db:verify-backup -- <backup-file>');
    }

    const backupPath = resolve(inputPath);
    if (!existsSync(backupPath)) {
        throw new Error(`Backup does not exist: ${backupPath}`);
    }

    const stats = statSync(backupPath);
    if (!stats.isFile() || stats.size === 0) {
        throw new Error(`Backup must be a non-empty regular file: ${backupPath}`);
    }

    const connection = new Database(backupPath, {
        fileMustExist: true,
        readonly: true,
        timeout: 5_000,
    });

    try {
        const inspection = inspectDatabaseBackup(connection);
        const availableMigrationHashes = readAvailableMigrationHashes();
        const availableMigrationCount = availableMigrationHashes.length;
        const migrationCompatibility = classifyDatabaseMigrationCompatibility(
            inspection.appliedMigrationCount,
            availableMigrationCount,
        );

        if (migrationCompatibility === 'NEWER_THAN_CODE') {
            throw new Error(
                `Backup has ${inspection.appliedMigrationCount} migrations, but this checkout has only ${availableMigrationCount}.`,
            );
        }

        const mismatchedMigrationIndex = inspection.appliedMigrationHashes.findIndex(
            (hash, index) => availableMigrationHashes[index] !== hash,
        );
        if (mismatchedMigrationIndex >= 0) {
            throw new Error(
                `Backup migration history diverges from this checkout at index ${mismatchedMigrationIndex}.`,
            );
        }

        if (migrationCompatibility === 'CURRENT') {
            const tableNames = new Set(inspection.tableNames);
            const missingCurrentTables = CURRENT_DATABASE_BACKUP_TABLES.filter(
                tableName => !tableNames.has(tableName),
            );

            if (missingCurrentTables.length > 0) {
                throw new Error(
                    `Current database backup is missing table(s): ${missingCurrentTables.join(', ')}`,
                );
            }
        }

        console.log(`Backup verified: ${backupPath}`);
        console.log(JSON.stringify({
            sizeBytes: stats.size,
            tableCount: inspection.tableCount,
            appliedMigrationCount: inspection.appliedMigrationCount,
            availableMigrationCount,
            migrationCompatibility,
            quickCheck: inspection.quickCheck,
            integrityCheck: inspection.integrityCheck,
            foreignKeyViolationCount: inspection.foreignKeyViolationCount,
            recordCounts: inspection.recordCounts,
        }, null, 2));

        if ((stats.mode & 0o077) !== 0) {
            console.warn('Warning: backup is readable or writable by group/other users; prefer mode 0600.');
        }

        if (migrationCompatibility === 'MIGRATION_REQUIRED') {
            console.warn(
                'Warning: rehearse db:setup on an isolated copy before restoring this older backup.',
            );
        }
    } finally {
        connection.close();
    }
};

try {
    main();
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Backup verification failed: ${message}`);
    process.exitCode = 1;
}
