import { parseAccountWorkspaceExport } from '@/lib/account-workspace-export';
import type { AccountWorkspaceSyncOperation } from '@/lib/account-workspace-sync-contract';
import {
    pullAccountWorkspaceOperations,
    pushAccountWorkspaceOperation,
} from '@/lib/account-workspace-sync-server';
import {
    handleRouteError,
    HttpError,
    readJsonObject,
    requireUser,
} from '@/lib/api-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SYNC_OPERATION_BYTES = 5 * 1024 * 1024;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

const requiredId = (value: unknown, label: string) => {
    if (typeof value !== 'string' || !SAFE_ID_PATTERN.test(value)) {
        throw new HttpError(400, `${label}가 올바르지 않습니다.`);
    }
    return value;
};

const revision = (value: unknown, label: string) => {
    const parsed = typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : value;
    if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) {
        throw new HttpError(400, `${label}이 올바르지 않습니다.`);
    }
    return Number(parsed);
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
        const afterRevision = revision(
            new URL(request.url).searchParams.get('afterRevision') ?? '0',
            '동기화 cursor revision',
        );
        return noStoreJson(pullAccountWorkspaceOperations(user.id, afterRevision));
    } catch (error) {
        return handleRouteError(error);
    }
}

export async function POST(request: Request) {
    try {
        const user = await requireUser(request);
        const input = await readJsonObject(request, MAX_SYNC_OPERATION_BYTES);
        let workspace: AccountWorkspaceSyncOperation['workspace'];
        try {
            workspace = parseAccountWorkspaceExport(input.workspace);
        } catch (error) {
            throw new HttpError(
                400,
                error instanceof Error
                    ? error.message
                    : '동기화 workspace 형식이 올바르지 않습니다.',
            );
        }
        const operation: AccountWorkspaceSyncOperation = {
            operationId: requiredId(input.operationId, '동기화 operation ID'),
            deviceId: requiredId(input.deviceId, '동기화 기기 ID'),
            baseRevision: revision(input.baseRevision, '동기화 기준 revision'),
            workspace,
        };

        return noStoreJson(pushAccountWorkspaceOperation(user.id, operation));
    } catch (error) {
        return handleRouteError(error);
    }
}
