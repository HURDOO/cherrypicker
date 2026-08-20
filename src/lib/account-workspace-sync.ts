import type { AccountWorkspaceExport } from '@/lib/account-workspace-export';
import {
    createAccountWorkspaceMergePlan,
    createDefaultAccountWorkspaceMergeChoices,
    resolveAccountWorkspaceMerge,
} from '@/lib/account-workspace-merge';

export function mergeAccountWorkspaceSyncOperation(
    incoming: AccountWorkspaceExport,
    current: AccountWorkspaceExport,
) {
    const plan = createAccountWorkspaceMergePlan(incoming, current);
    const resolution = resolveAccountWorkspaceMerge(
        incoming,
        current,
        createDefaultAccountWorkspaceMergeChoices(plan),
        {
            sourceWorkspaceId: current.sourceWorkspaceId,
            exportedAt: incoming.exportedAt,
        },
    );

    return { plan, resolution };
}
