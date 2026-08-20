import { eq } from 'drizzle-orm';
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
import { parseAccountWorkspaceExport } from '@/lib/account-workspace-export';
import {
    createAccountWorkspaceSnapshot,
    getAccountWorkspaceState,
    updateAccountWorkspaceSnapshot,
} from '@/lib/account-workspace-server';
import {
    handleRouteError,
    HttpError,
    readJsonObject,
    requireUser,
} from '@/lib/api-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ACCOUNT_WORKSPACE_BYTES = 5 * 1024 * 1024;

const workspaceFromInput = (input: Record<string, unknown>) => {
    try {
        return parseAccountWorkspaceExport(input.workspace);
    } catch (error) {
        throw new HttpError(
            400,
            error instanceof Error ? error.message : '계정 workspace 형식이 올바르지 않습니다.'
        );
    }
};

const noStoreJson = (value: unknown, init?: ResponseInit) => Response.json(value, {
    ...init,
    headers: {
        ...Object.fromEntries(new Headers(init?.headers).entries()),
        'Cache-Control': 'no-store',
    },
});

export async function GET(request: Request) {
    try {
        const user = await requireUser(request);
        return noStoreJson(getAccountWorkspaceState(user.id));
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request, MAX_ACCOUNT_WORKSPACE_BYTES);
        const workspace = workspaceFromInput(input);
        return noStoreJson(createAccountWorkspaceSnapshot(user.id, workspace), { status: 201 });
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function PUT(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request, MAX_ACCOUNT_WORKSPACE_BYTES);
        const workspace = workspaceFromInput(input);
        if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
            throw new HttpError(400, '계정 workspace revision이 올바르지 않습니다.');
        }
        return noStoreJson(updateAccountWorkspaceSnapshot(
            user.id,
            workspace,
            Number(input.expectedRevision)
        ));
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function DELETE(request: Request) {
    try {
        const user = await requireUser(request);

        db.transaction((tx) => {
            tx.delete(accountWorkspaceSnapshots)
                .where(eq(accountWorkspaceSnapshots.userId, user.id))
                .run();
            tx.delete(userBenefitProfiles)
                .where(eq(userBenefitProfiles.userId, user.id))
                .run();
            tx.delete(transactionHistory)
                .where(eq(transactionHistory.userId, user.id))
                .run();
            tx.delete(userCardPerformances)
                .where(eq(userCardPerformances.userId, user.id))
                .run();
            tx.delete(benefitRules)
                .where(eq(benefitRules.userId, user.id))
                .run();
            tx.delete(cards)
                .where(eq(cards.userId, user.id))
                .run();
            tx.delete(brands)
                .where(eq(brands.userId, user.id))
                .run();
            tx.delete(categories)
                .where(eq(categories.userId, user.id))
                .run();
        });

        return noStoreJson({ success: true });
    } catch (error) {
        return handleRouteError(error);
    }
}
