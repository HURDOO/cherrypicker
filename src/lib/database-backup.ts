import type Database from 'better-sqlite3';

export const REQUIRED_DATABASE_BACKUP_TABLES = [
    '__drizzle_migrations',
    'account',
    'benefit_rules',
    'brands',
    'cards',
    'categories',
    'session',
    'transaction_history',
    'user',
    'user_card_performances',
    'verification',
] as const;

export const CURRENT_DATABASE_BACKUP_TABLES = [
    ...REQUIRED_DATABASE_BACKUP_TABLES,
    'account_workspace_operations',
    'account_workspace_snapshots',
    'card_benefit_candidate_documents',
    'card_benefit_candidates',
    'card_benefit_collection_runs',
    'card_benefit_documents',
    'card_benefit_revisions',
    'merchant_route_verifications',
    'promotion_candidates',
    'promotion_collection_runs',
    'promotion_offers',
    'promotion_providers',
    'promotion_source_bundle_documents',
    'promotion_source_bundles',
    'promotion_source_documents',
    'subscription_products',
    'transaction_benefits',
    'user_benefit_profiles',
] as const;

export const DATABASE_BACKUP_COUNT_TABLES = [
    'account_workspace_snapshots',
    'benefit_rules',
    'brands',
    'cards',
    'promotion_offers',
    'transaction_history',
    'user',
    'user_card_performances',
] as const;

type CountedTable = typeof DATABASE_BACKUP_COUNT_TABLES[number];

export type DatabaseMigrationCompatibility =
    | 'CURRENT'
    | 'MIGRATION_REQUIRED'
    | 'NEWER_THAN_CODE';

export interface DatabaseBackupInspection {
    quickCheck: 'ok';
    integrityCheck: 'ok';
    tableCount: number;
    appliedMigrationCount: number;
    appliedMigrationHashes: string[];
    foreignKeyViolationCount: 0;
    tableNames: string[];
    recordCounts: Partial<Record<CountedTable, number>>;
}

const readCount = (
    connection: Database.Database,
    tableName: string,
): number => {
    const result = connection
        .prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`)
        .get() as { count: number };

    return result.count;
};

export const inspectDatabaseBackup = (
    connection: Database.Database,
): DatabaseBackupInspection => {
    const quickCheck = String(connection.pragma('quick_check', { simple: true }));
    if (quickCheck !== 'ok') {
        throw new Error(`SQLite quick_check failed: ${quickCheck}`);
    }

    const integrityCheck = String(connection.pragma('integrity_check', { simple: true }));
    if (integrityCheck !== 'ok') {
        throw new Error(`SQLite integrity_check failed: ${integrityCheck}`);
    }

    const foreignKeyViolations = connection.pragma('foreign_key_check') as unknown[];
    if (foreignKeyViolations.length > 0) {
        throw new Error(
            `SQLite foreign_key_check found ${foreignKeyViolations.length} violation(s).`,
        );
    }

    const tableRows = connection
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>;
    const tableNames = new Set(tableRows.map(row => row.name));
    const missingTables = REQUIRED_DATABASE_BACKUP_TABLES.filter(
        tableName => !tableNames.has(tableName),
    );

    if (missingTables.length > 0) {
        throw new Error(
            `Database backup is missing required table(s): ${missingTables.join(', ')}`,
        );
    }

    const appliedMigrations = connection
        .prepare(`
            SELECT hash
            FROM "__drizzle_migrations"
            ORDER BY created_at ASC
        `)
        .all() as Array<{ hash: string }>;

    return {
        quickCheck: 'ok',
        integrityCheck: 'ok',
        tableCount: tableNames.size,
        appliedMigrationCount: appliedMigrations.length,
        appliedMigrationHashes: appliedMigrations.map(migration => migration.hash),
        foreignKeyViolationCount: 0,
        tableNames: [...tableNames].sort(),
        recordCounts: Object.fromEntries(
            DATABASE_BACKUP_COUNT_TABLES
                .filter(tableName => tableNames.has(tableName))
                .map(tableName => [
                    tableName,
                    readCount(connection, tableName),
                ]),
        ) as Partial<Record<CountedTable, number>>,
    };
};

export const classifyDatabaseMigrationCompatibility = (
    appliedMigrationCount: number,
    availableMigrationCount: number,
): DatabaseMigrationCompatibility => {
    if (
        !Number.isSafeInteger(appliedMigrationCount)
        || appliedMigrationCount < 0
        || !Number.isSafeInteger(availableMigrationCount)
        || availableMigrationCount < 0
    ) {
        throw new Error('Migration counts must be non-negative safe integers.');
    }

    if (appliedMigrationCount > availableMigrationCount) {
        return 'NEWER_THAN_CODE';
    }

    if (appliedMigrationCount < availableMigrationCount) {
        return 'MIGRATION_REQUIRED';
    }

    return 'CURRENT';
};
