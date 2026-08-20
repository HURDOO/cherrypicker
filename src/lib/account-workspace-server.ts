import 'server-only';

import { createHash } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import {
    accountWorkspaceSnapshots,
    benefitRules,
    brands,
    cards,
    categories,
    transactionHistory,
    userBenefitProfiles,
    userCardPerformances,
} from '@/db/schema';
import {
    createAccountWorkspaceExport,
    hasMeaningfulBenefitProfile,
    parseAccountWorkspaceExport,
    serializeAccountWorkspace,
    summarizeAccountWorkspace,
    type AccountWorkspaceExport,
    type AccountWorkspaceState,
} from '@/lib/account-workspace-export';
import { HttpError } from '@/lib/api-server';
import {
    toBrand,
    toBenefitProfile,
    toCard,
    toCategory,
    toPerformance,
    toRule,
    toTransaction,
} from '@/lib/db-mappers';

const hashWorkspace = (workspace: AccountWorkspaceExport) => createHash('sha256')
    .update(serializeAccountWorkspace(workspace))
    .digest('hex');

const stateFromSnapshot = (
    row: typeof accountWorkspaceSnapshots.$inferSelect
): AccountWorkspaceState => {
    const workspace = parseAccountWorkspaceExport(row.snapshot);
    const contentHash = hashWorkspace(workspace);
    if (contentHash !== row.contentHash) {
        throw new Error('저장된 계정 workspace 무결성 검증에 실패했습니다.');
    }
    if (
        row.schemaVersion !== workspace.schemaVersion ||
        row.sourceWorkspaceId !== workspace.sourceWorkspaceId
    ) {
        throw new Error('저장된 계정 workspace metadata가 일치하지 않습니다.');
    }

    return {
        workspace,
        summary: summarizeAccountWorkspace(workspace),
        revision: row.revision,
        source: 'snapshot',
        contentHash,
        updatedAt: row.updatedAt.toISOString(),
    };
};

function loadLegacyAccountWorkspace(userId: string): AccountWorkspaceExport {
    const categoryRows = db.select().from(categories)
        .where(eq(categories.userId, userId))
        .orderBy(asc(categories.sortOrder), asc(categories.name))
        .all();
    const brandRows = db.select().from(brands)
        .where(eq(brands.userId, userId))
        .orderBy(asc(brands.sortOrder), asc(brands.name))
        .all();
    const cardRows = db.select().from(cards)
        .where(eq(cards.userId, userId))
        .orderBy(asc(cards.name))
        .all();
    const ruleRows = db.select().from(benefitRules)
        .where(eq(benefitRules.userId, userId))
        .orderBy(asc(benefitRules.cardId), asc(benefitRules.description))
        .all();
    const performanceRows = db.select().from(userCardPerformances)
        .where(eq(userCardPerformances.userId, userId))
        .orderBy(desc(userCardPerformances.performanceMonth))
        .all();
    const historyRows = db.select().from(transactionHistory)
        .where(eq(transactionHistory.userId, userId))
        .orderBy(desc(transactionHistory.createdAt))
        .all();
    const benefitProfileRow = db.select().from(userBenefitProfiles)
        .where(eq(userBenefitProfiles.userId, userId))
        .get();

    const performanceUpdatedAt = Object.fromEntries(performanceRows.map(row => [
        `${row.cardId}:${row.performanceMonth}`,
        row.updatedAt,
    ]));
    return createAccountWorkspaceExport({
        sourceWorkspaceId: userId,
        categories: categoryRows.map(toCategory),
        brands: brandRows.map(toBrand),
        cards: cardRows.map(toCard),
        rules: ruleRows.map(toRule),
        performances: performanceRows.map(toPerformance),
        history: historyRows.map(toTransaction),
        benefitProfile: toBenefitProfile(benefitProfileRow),
        ...(benefitProfileRow && { profileUpdatedAt: benefitProfileRow.updatedAt }),
        performanceUpdatedAt,
    });
}

export function getAccountWorkspaceState(userId: string): AccountWorkspaceState {
    const snapshot = db.select().from(accountWorkspaceSnapshots)
        .where(eq(accountWorkspaceSnapshots.userId, userId))
        .get();
    if (snapshot) return stateFromSnapshot(snapshot);

    const workspace = loadLegacyAccountWorkspace(userId);
    return {
        workspace,
        summary: summarizeAccountWorkspace(workspace),
        revision: 0,
        source: 'legacy',
    };
}

const accountHasMeaningfulLegacyData = (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string
) => {
    const hasRows = [
        tx.select({ id: categories.id }).from(categories)
            .where(eq(categories.userId, userId)).get(),
        tx.select({ id: brands.id }).from(brands)
            .where(eq(brands.userId, userId)).get(),
        tx.select({ id: cards.id }).from(cards)
            .where(eq(cards.userId, userId)).get(),
        tx.select({ id: benefitRules.id }).from(benefitRules)
            .where(eq(benefitRules.userId, userId)).get(),
        tx.select({ id: userCardPerformances.id }).from(userCardPerformances)
            .where(eq(userCardPerformances.userId, userId)).get(),
        tx.select({ id: transactionHistory.id }).from(transactionHistory)
            .where(eq(transactionHistory.userId, userId)).get(),
    ].some(Boolean);
    if (hasRows) return true;

    const profile = tx.select().from(userBenefitProfiles)
        .where(eq(userBenefitProfiles.userId, userId))
        .get();
    return hasMeaningfulBenefitProfile(toBenefitProfile(profile));
};

export function createAccountWorkspaceSnapshot(
    userId: string,
    value: AccountWorkspaceExport
): AccountWorkspaceState {
    const workspace = parseAccountWorkspaceExport(value);
    if (summarizeAccountWorkspace(workspace).totalRecords === 0) {
        throw new HttpError(400, '백업할 로컬 데이터가 없습니다.');
    }
    const contentHash = hashWorkspace(workspace);
    const now = new Date();

    const row = db.transaction(tx => {
        const existing = tx.select({ userId: accountWorkspaceSnapshots.userId })
            .from(accountWorkspaceSnapshots)
            .where(eq(accountWorkspaceSnapshots.userId, userId))
            .get();
        if (existing || accountHasMeaningfulLegacyData(tx, userId)) {
            throw new HttpError(
                409,
                '계정과 이 기기에 모두 데이터가 있어 자동으로 덮어쓰지 않았습니다.'
            );
        }

        return tx.insert(accountWorkspaceSnapshots).values({
            userId,
            schemaVersion: workspace.schemaVersion,
            sourceWorkspaceId: workspace.sourceWorkspaceId,
            revision: 1,
            contentHash,
            snapshot: workspace,
            createdAt: now,
            updatedAt: now,
        }).returning().get();
    });

    return stateFromSnapshot(row);
}

export function updateAccountWorkspaceSnapshot(
    userId: string,
    value: AccountWorkspaceExport,
    expectedRevision: number
): AccountWorkspaceState {
    const workspace = parseAccountWorkspaceExport(value);
    const contentHash = hashWorkspace(workspace);

    const row = db.transaction(tx => {
        const current = tx.select().from(accountWorkspaceSnapshots)
            .where(eq(accountWorkspaceSnapshots.userId, userId))
            .get();
        if (!current) {
            throw new HttpError(409, '계정 백업이 변경되었습니다. 상태를 다시 확인해주세요.');
        }
        if (current.revision !== expectedRevision) {
            throw new HttpError(409, '다른 기기에서 계정 백업이 변경되었습니다. 다시 확인해주세요.');
        }
        if (current.sourceWorkspaceId !== workspace.sourceWorkspaceId) {
            throw new HttpError(
                409,
                '다른 로컬 workspace의 데이터로 계정 백업을 덮어쓰지 않았습니다.'
            );
        }
        if (current.contentHash === contentHash) return current;

        return tx.update(accountWorkspaceSnapshots)
            .set({
                schemaVersion: workspace.schemaVersion,
                sourceWorkspaceId: workspace.sourceWorkspaceId,
                revision: current.revision + 1,
                contentHash,
                snapshot: workspace,
                updatedAt: new Date(),
            })
            .where(eq(accountWorkspaceSnapshots.userId, userId))
            .returning()
            .get();
    });

    return stateFromSnapshot(row);
}
