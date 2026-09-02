import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import {
    DATABASE_BACKUP_COUNT_TABLES,
    CURRENT_DATABASE_BACKUP_TABLES,
    REQUIRED_DATABASE_BACKUP_TABLES,
    classifyDatabaseMigrationCompatibility,
    inspectDatabaseBackup,
} from './database-backup';

const createDatabase = (
    excludedTable?: string,
    tableNames: readonly string[] = CURRENT_DATABASE_BACKUP_TABLES,
) => {
    const connection = new Database(':memory:');

    tableNames.forEach(tableName => {
        if (tableName === excludedTable) return;
        connection.exec(tableName === '__drizzle_migrations'
            ? `CREATE TABLE "${tableName}" (hash TEXT NOT NULL, created_at NUMERIC NOT NULL)`
            : `CREATE TABLE "${tableName}" (id TEXT PRIMARY KEY)`);
    });

    return connection;
};

describe('database backup inspection', () => {
    it('checks integrity, foreign keys, migrations, and critical record counts', () => {
        const connection = createDatabase();

        try {
            connection.prepare(`
                INSERT INTO "__drizzle_migrations" (hash, created_at)
                VALUES (?, ?), (?, ?)
            `).run('hash-1', 1, 'hash-2', 2);
            connection.prepare('INSERT INTO "cards" (id) VALUES (?)').run('card-1');
            connection.prepare('INSERT INTO "user" (id) VALUES (?)').run('user-1');

            expect(inspectDatabaseBackup(connection)).toEqual({
                quickCheck: 'ok',
                integrityCheck: 'ok',
                tableCount: CURRENT_DATABASE_BACKUP_TABLES.length,
                appliedMigrationCount: 2,
                appliedMigrationHashes: ['hash-1', 'hash-2'],
                foreignKeyViolationCount: 0,
                tableNames: [...CURRENT_DATABASE_BACKUP_TABLES].sort(),
                recordCounts: {
                    account_workspace_snapshots: 0,
                    benefit_rules: 0,
                    brands: 0,
                    cards: 1,
                    promotion_offers: 0,
                    transaction_history: 0,
                    user: 1,
                    user_card_performances: 0,
                },
            });
            expect(Object.keys(inspectDatabaseBackup(connection).recordCounts))
                .toEqual([...DATABASE_BACKUP_COUNT_TABLES]);
        } finally {
            connection.close();
        }
    });

    it('rejects a database that is not a complete Cherrypicker backup', () => {
        const connection = createDatabase('transaction_history');

        try {
            expect(() => inspectDatabaseBackup(connection)).toThrow(
                'Database backup is missing required table(s): transaction_history',
            );
        } finally {
            connection.close();
        }
    });

    it('allows an older base-schema backup to proceed to an isolated migration rehearsal', () => {
        const connection = createDatabase(undefined, REQUIRED_DATABASE_BACKUP_TABLES);

        try {
            connection.prepare(`
                INSERT INTO "__drizzle_migrations" (hash, created_at)
                VALUES (?, ?)
            `).run('hash-1', 1);
            const inspection = inspectDatabaseBackup(connection);

            expect(inspection.tableNames).not.toContain('account_workspace_snapshots');
            expect(inspection.recordCounts.account_workspace_snapshots).toBeUndefined();
            expect(classifyDatabaseMigrationCompatibility(
                inspection.appliedMigrationCount,
                16,
            )).toBe('MIGRATION_REQUIRED');
        } finally {
            connection.close();
        }
    });

    it('rejects foreign-key violations', () => {
        const connection = createDatabase();

        try {
            connection.pragma('foreign_keys = OFF');
            connection.exec(`
                CREATE TABLE parent (id TEXT PRIMARY KEY);
                CREATE TABLE child (
                    id TEXT PRIMARY KEY,
                    parent_id TEXT NOT NULL REFERENCES parent(id)
                );
                INSERT INTO child (id, parent_id) VALUES ('child-1', 'missing-parent');
            `);
            connection.pragma('foreign_keys = ON');

            expect(() => inspectDatabaseBackup(connection)).toThrow(
                'SQLite foreign_key_check found 1 violation(s).',
            );
        } finally {
            connection.close();
        }
    });

    it('classifies migration compatibility without modifying the backup', () => {
        expect(classifyDatabaseMigrationCompatibility(16, 16)).toBe('CURRENT');
        expect(classifyDatabaseMigrationCompatibility(15, 16)).toBe('MIGRATION_REQUIRED');
        expect(classifyDatabaseMigrationCompatibility(17, 16)).toBe('NEWER_THAN_CODE');
        expect(() => classifyDatabaseMigrationCompatibility(-1, 16)).toThrow(
            'Migration counts must be non-negative safe integers.',
        );
    });
});
