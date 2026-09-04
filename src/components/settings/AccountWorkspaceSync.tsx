'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    CloudDownload,
    CloudUpload,
    GitMerge,
    RefreshCw,
    ShieldCheck,
} from 'lucide-react';
import {
    accountWorkspaceContentEquals,
    type AccountWorkspaceState,
} from '@/lib/account-workspace-export';
import type { LocalWorkspaceSyncStatus } from '@/lib/account-workspace-sync-contract';
import {
    createAccountWorkspaceMergePlan,
    createDefaultAccountWorkspaceMergeChoices,
    resolveAccountWorkspaceMerge,
    type AccountWorkspaceMergeConflict,
    type AccountWorkspaceMergeSide,
} from '@/lib/account-workspace-merge';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import {
    accountWorkspaceMatchesLocal,
    createAccountWorkspaceExportFromLocal,
    getAccountWorkspaceSyncMode,
    localWorkspaceClient,
    type LocalWorkspaceSnapshot,
} from '@/lib/local-workspace';
import {
    enableLocalWorkspaceSync,
    getLocalWorkspaceSyncStatus,
    synchronizeLocalWorkspace,
    WORKSPACE_SYNC_COMPLETED_EVENT,
} from '@/lib/local-workspace-sync';
import { useToastStore } from '@/store/useToastStore';

export function AccountWorkspaceSync({ accountUserId }: { accountUserId: string }) {
    const addToast = useToastStore(state => state.addToast);
    const [localWorkspace, setLocalWorkspace] = useState<LocalWorkspaceSnapshot | null>(null);
    const [accountState, setAccountState] = useState<AccountWorkspaceState | null>(null);
    const [syncStatus, setSyncStatus] = useState<LocalWorkspaceSyncStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isWorking, setIsWorking] = useState(false);
    const [isMergeOpen, setIsMergeOpen] = useState(false);
    const [hasConfirmedMerge, setHasConfirmedMerge] = useState(false);
    const [mergeChoices, setMergeChoices] = useState<Record<
        string,
        AccountWorkspaceMergeSide
    >>({});

    const loadState = useCallback(async () => {
        setIsLoading(true);
        try {
            const [local, account, localSyncStatus] = await Promise.all([
                localWorkspaceClient.read(),
                apiClient.getAccountWorkspaceState(),
                getLocalWorkspaceSyncStatus(accountUserId),
            ]);
            setLocalWorkspace(local);
            setAccountState(account);
            setSyncStatus(localSyncStatus);
            setIsMergeOpen(false);
            setHasConfirmedMerge(false);
        } catch (error) {
            addToast(getErrorMessage(error, '계정 연동 상태를 확인하지 못했습니다.'), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [accountUserId, addToast]);

    useEffect(() => {
        void loadState();
    }, [loadState]);

    useEffect(() => {
        const onSyncCompleted = () => void loadState();
        window.addEventListener(WORKSPACE_SYNC_COMPLETED_EVENT, onSyncCompleted);
        return () => window.removeEventListener(
            WORKSPACE_SYNC_COMPLETED_EVENT,
            onSyncCompleted,
        );
    }, [loadState]);

    const mode = useMemo(() => {
        if (!localWorkspace || !accountState) return 'empty';
        return getAccountWorkspaceSyncMode(localWorkspace, accountState);
    }, [accountState, localWorkspace]);

    const mergePreview = useMemo(() => {
        if (!localWorkspace || !accountState || mode !== 'conflict') return null;
        try {
            const localExport = createAccountWorkspaceExportFromLocal(
                localWorkspace,
                accountState.workspace.exportedAt,
            );
            const plan = createAccountWorkspaceMergePlan(localExport, accountState.workspace);
            const choices = Object.keys(mergeChoices).length > 0
                ? mergeChoices
                : createDefaultAccountWorkspaceMergeChoices(plan);
            const resolution = resolveAccountWorkspaceMerge(
                localExport,
                accountState.workspace,
                choices,
                {
                    sourceWorkspaceId: localWorkspace.workspaceId,
                    exportedAt: localWorkspace.updatedAt,
                },
            );
            return { localExport, plan, resolution, error: null };
        } catch (error) {
            return {
                localExport: null,
                plan: null,
                resolution: null,
                error: error instanceof Error ? error : new Error('병합 내용을 만들지 못했습니다.'),
            };
        }
    }, [accountState, localWorkspace, mergeChoices, mode]);

    const backUpWorkspace = async () => {
        if (!localWorkspace || !accountState || !['upload', 'update'].includes(mode)) return;
        setIsWorking(true);
        try {
            const exported = createAccountWorkspaceExportFromLocal(localWorkspace);
            const saved = mode === 'upload'
                ? await apiClient.createAccountWorkspaceBackup(exported)
                : await apiClient.updateAccountWorkspaceBackup(exported, accountState.revision);
            const downloaded = await apiClient.getAccountWorkspaceState();
            if (
                saved.revision !== downloaded.revision ||
                !accountWorkspaceContentEquals(exported, downloaded.workspace)
            ) {
                throw new Error('업로드 후 다시 받은 계정 데이터가 원본과 일치하지 않습니다.');
            }
            setAccountState(downloaded);
            setSyncStatus(await enableLocalWorkspaceSync(
                accountUserId,
                downloaded.revision,
            ));
            addToast(
                mode === 'upload'
                    ? '이 기기 데이터를 계정에 안전하게 백업했습니다.'
                    : '계정 백업을 최신 로컬 데이터로 갱신했습니다.',
                'success'
            );
        } catch (error) {
            addToast(getErrorMessage(error, '계정 백업을 완료하지 못했습니다.'), 'error');
            await loadState();
        } finally {
            setIsWorking(false);
        }
    };

    const restoreWorkspace = async () => {
        if (!localWorkspace || !accountState || mode !== 'restore') return;
        setIsWorking(true);
        try {
            const imported = await localWorkspaceClient.importAccountWorkspace(
                accountState.workspace
            );
            if (!accountWorkspaceMatchesLocal(imported, accountState.workspace)) {
                throw new Error('복원한 기기 데이터가 계정 원본과 일치하지 않습니다.');
            }
            if (accountState.revision > 0) {
                await enableLocalWorkspaceSync(accountUserId, accountState.revision);
            }
            addToast('계정 데이터를 빈 로컬 workspace에 안전하게 복원했습니다.', 'success');
            window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            addToast(getErrorMessage(error, '계정 데이터를 복원하지 못했습니다.'), 'error');
            setIsWorking(false);
        }
    };

    const openMergePreview = () => {
        if (!mergePreview?.plan) return;
        setMergeChoices(createDefaultAccountWorkspaceMergeChoices(mergePreview.plan));
        setHasConfirmedMerge(false);
        setIsMergeOpen(true);
    };

    const chooseMergeSide = (key: string, side: AccountWorkspaceMergeSide) => {
        setMergeChoices(current => ({ ...current, [key]: side }));
        setHasConfirmedMerge(false);
    };

    const chooseAllMergeConflicts = (side: AccountWorkspaceMergeSide) => {
        if (!mergePreview?.plan) return;
        setMergeChoices(Object.fromEntries(
            mergePreview.plan.conflicts.map(conflict => [conflict.key, side])
        ));
        setHasConfirmedMerge(false);
    };

    const mergeWorkspaces = async () => {
        if (
            !localWorkspace ||
            !accountState ||
            mode !== 'conflict' ||
            !mergePreview?.plan ||
            !hasConfirmedMerge
        ) return;

        setIsWorking(true);
        let mergedLocally = false;
        try {
            const [latestLocal, latestAccount] = await Promise.all([
                localWorkspaceClient.read(),
                apiClient.getAccountWorkspaceState(),
            ]);
            if (
                latestLocal.updatedAt !== localWorkspace.updatedAt ||
                latestAccount.revision !== accountState.revision ||
                !accountWorkspaceContentEquals(latestAccount.workspace, accountState.workspace)
            ) {
                throw new Error('확인하는 동안 데이터가 변경되었습니다. 병합 내용을 다시 확인해주세요.');
            }

            const localExport = createAccountWorkspaceExportFromLocal(latestLocal);
            const resolution = resolveAccountWorkspaceMerge(
                localExport,
                latestAccount.workspace,
                mergeChoices,
                {
                    sourceWorkspaceId: latestLocal.workspaceId,
                    exportedAt: new Date(),
                },
            );
            let imported = await localWorkspaceClient.importMergedAccountWorkspace(
                resolution.workspace
            );
            mergedLocally = true;

            const saved = await apiClient.mergeAccountWorkspaceBackup(
                resolution.workspace,
                latestAccount.revision,
            );
            if (!accountWorkspaceMatchesLocal(imported, saved.workspace)) {
                imported = await localWorkspaceClient.importMergedAccountWorkspace(saved.workspace);
            }
            const downloaded = await apiClient.getAccountWorkspaceState();
            if (
                saved.revision !== downloaded.revision ||
                !accountWorkspaceContentEquals(saved.workspace, downloaded.workspace) ||
                !accountWorkspaceMatchesLocal(imported, downloaded.workspace)
            ) {
                throw new Error('병합 후 다시 받은 계정 데이터가 기기 원본과 일치하지 않습니다.');
            }

            await enableLocalWorkspaceSync(accountUserId, downloaded.revision);

            addToast('선택한 항목을 병합하고 계정 백업까지 검증했습니다.', 'success');
            window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            const message = getErrorMessage(
                error,
                mergedLocally
                    ? '계정 백업을 갱신하지 못했습니다.'
                    : '계정과 기기 데이터를 병합하지 못했습니다.',
            );
            addToast(
                mergedLocally
                    ? `병합 결과는 이 기기에 보존했습니다. 계정 백업 오류: ${message}`
                    : message,
                'error',
            );
            if (mergedLocally) {
                window.setTimeout(() => window.location.reload(), 800);
            } else {
                await loadState();
                setIsWorking(false);
            }
        }
    };

    const enableAutomaticSync = async () => {
        if (!accountState || mode !== 'synced') return;
        setIsWorking(true);
        try {
            setSyncStatus(await enableLocalWorkspaceSync(
                accountUserId,
                accountState.revision,
            ));
            addToast('이 계정의 자동 동기화를 시작했습니다.', 'success');
        } catch (error) {
            addToast(getErrorMessage(error, '자동 동기화를 시작하지 못했습니다.'), 'error');
        } finally {
            setIsWorking(false);
        }
    };

    const syncNow = async () => {
        setIsWorking(true);
        try {
            const result = await synchronizeLocalWorkspace(accountUserId, { force: true });
            if (result.status === 'retrying') {
                throw new Error(result.error || '자동 동기화를 다시 시도할 예정입니다.');
            }
            await loadState();
            addToast('계정과 이 기기의 변경사항을 동기화했습니다.', 'success');
        } catch (error) {
            addToast(getErrorMessage(error, '계정 동기화를 완료하지 못했습니다.'), 'error');
            setSyncStatus(await getLocalWorkspaceSyncStatus(accountUserId).catch(() => null));
        } finally {
            setIsWorking(false);
        }
    };

    const personalItemCount = accountState
        ? accountState.summary.categories + accountState.summary.brands +
            accountState.summary.cards + accountState.summary.rules
        : 0;

    return (
        <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-100 p-2 text-blue-700">
                    <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-black text-blue-950">계정 백업 및 기기 연동</h2>
                    <p className="mt-1 text-[11px] leading-relaxed text-blue-700">
                        로그인해도 이 기기의 로컬 데이터를 계속 사용합니다. 계정은 검증된
                        snapshot 백업과 새 기기 복원, 선택한 계정의 증분 동기화에 사용합니다.
                    </p>
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-4">
                {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs font-bold text-blue-700">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        계정과 기기 상태 확인 중...
                    </div>
                ) : !localWorkspace || !accountState ? (
                    <div className="flex gap-2 rounded-xl bg-rose-50 px-3 py-3 text-[11px] text-rose-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        연동 상태를 불러오지 못했습니다. 다시 확인해주세요.
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <span className="text-gray-400">계정 개인 항목</span>
                                <strong className="float-right text-gray-800">{personalItemCount}개</strong>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <span className="text-gray-400">카드 실적</span>
                                <strong className="float-right text-gray-800">
                                    {accountState.summary.performances}개
                                </strong>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <span className="text-gray-400">결제 기록</span>
                                <strong className="float-right text-gray-800">
                                    {accountState.summary.history}개
                                </strong>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                                <span className="text-gray-400">계정 revision</span>
                                <strong className="float-right text-gray-800">
                                    {accountState.revision || '-'}
                                </strong>
                            </div>
                        </div>

                        {mode === 'synced' && (
                            <StatusBox tone="success" icon={CheckCircle2}>
                                계정과 이 기기의 데이터가 일치합니다. 이후 이 기기에서 바꾼 내용은
                                변경사항 백업으로 안전하게 갱신할 수 있습니다.
                            </StatusBox>
                        )}
                        {mode === 'upload' && (
                            <StatusBox tone="info" icon={CloudUpload}>
                                계정이 비어 있어 현재 로컬 데이터를 안전하게 처음 백업할 수 있습니다.
                            </StatusBox>
                        )}
                        {mode === 'update' && (
                            <StatusBox tone="info" icon={CloudUpload}>
                                최초 백업을 만든 이 기기에 새 변경사항이 있습니다.
                            </StatusBox>
                        )}
                        {mode === 'restore' && (
                            <StatusBox tone="info" icon={CloudDownload}>
                                이 기기의 로컬 workspace가 비어 있어 계정 데이터를 복원할 수 있습니다.
                            </StatusBox>
                        )}
                        {mode === 'conflict' && (
                            <StatusBox tone="warning" icon={AlertTriangle}>
                                계정과 이 기기에 서로 다른 데이터가 있어 어느 쪽도 덮어쓰지 않았습니다.
                                항목별 병합 내용을 확인하고 명시적으로 적용할 수 있습니다.
                            </StatusBox>
                        )}
                        {mode === 'empty' && (
                            <StatusBox tone="neutral" icon={ShieldCheck}>
                                아직 백업하거나 복원할 개인 데이터가 없습니다.
                            </StatusBox>
                        )}

                        {syncStatus && (
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-3 text-[11px] leading-relaxed text-emerald-800">
                                <strong className="font-black">자동 동기화 사용 중</strong>
                                <span className="ml-2">
                                    대기 {syncStatus.pendingOperationCount}개 · revision {syncStatus.remoteRevision}
                                </span>
                                {syncStatus.lastError && (
                                    <p className="mt-1 text-amber-700">
                                        최근 오류: {syncStatus.lastError}
                                    </p>
                                )}
                            </div>
                        )}

                        {(mode === 'upload' || (mode === 'update' && !syncStatus)) && (
                            <button
                                type="button"
                                onClick={() => void backUpWorkspace()}
                                disabled={isWorking}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isWorking
                                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                                    : <CloudUpload className="h-4 w-4" />}
                                {isWorking
                                    ? '검증하며 백업 중...'
                                    : mode === 'upload' ? '계정에 처음 백업' : '변경사항 백업'}
                            </button>
                        )}
                        {mode === 'synced' && !syncStatus && (
                            <button
                                type="button"
                                onClick={() => void enableAutomaticSync()}
                                disabled={isWorking}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isWorking
                                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                                    : <RefreshCw className="h-4 w-4" />}
                                자동 동기화 시작
                            </button>
                        )}
                        {syncStatus && (
                            <button
                                type="button"
                                onClick={() => void syncNow()}
                                disabled={isWorking}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-3 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60"
                            >
                                <RefreshCw className={`h-4 w-4 ${isWorking ? 'animate-spin' : ''}`} />
                                지금 동기화
                            </button>
                        )}
                        {mode === 'restore' && (
                            <button
                                type="button"
                                onClick={() => void restoreWorkspace()}
                                disabled={isWorking}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-xs font-black text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
                            >
                                {isWorking
                                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                                    : <CloudDownload className="h-4 w-4" />}
                                {isWorking ? '검증하며 복원 중...' : '이 기기로 복원'}
                            </button>
                        )}
                        {mode === 'conflict' && !isMergeOpen && (
                            <button
                                type="button"
                                onClick={openMergePreview}
                                disabled={isWorking || Boolean(mergePreview?.error)}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-3 text-xs font-black text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <GitMerge className="h-4 w-4" />
                                항목별 병합 내용 확인
                            </button>
                        )}
                        {mode === 'conflict' && mergePreview?.error && (
                            <p className="rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">
                                {mergePreview.error.message}
                            </p>
                        )}
                        {mode === 'conflict' && isMergeOpen && mergePreview?.plan && (
                            <MergePreview
                                conflicts={mergePreview.plan.conflicts}
                                localOnlyCount={mergePreview.plan.localOnlyCount}
                                accountOnlyCount={mergePreview.plan.accountOnlyCount}
                                identicalCount={mergePreview.plan.identicalCount}
                                autoResolvedCount={mergePreview.plan.autoResolvedCount}
                                cascadedDeletionCount={
                                    mergePreview.resolution?.cascadedDeletionCount ?? 0
                                }
                                adjustedReferenceCount={
                                    mergePreview.resolution?.adjustedReferenceCount ?? 0
                                }
                                choices={mergeChoices}
                                hasConfirmed={hasConfirmedMerge}
                                isWorking={isWorking}
                                onChoose={chooseMergeSide}
                                onChooseAll={chooseAllMergeConflicts}
                                onConfirm={setHasConfirmedMerge}
                                onCancel={() => {
                                    setIsMergeOpen(false);
                                    setHasConfirmedMerge(false);
                                }}
                                onMerge={() => void mergeWorkspaces()}
                            />
                        )}
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={() => void loadState()}
                disabled={isLoading || isWorking}
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-[10px] font-black text-blue-700 disabled:opacity-50"
            >
                <RefreshCw className="h-3 w-3" />
                연동 상태 다시 확인
            </button>
        </section>
    );
}

const MERGE_KIND_LABELS: Record<AccountWorkspaceMergeConflict['kind'], string> = {
    profile: '혜택 프로필',
    workspacePreferences: '내 카드·첫 설정',
    category: '카테고리',
    brand: '브랜드',
    card: '카드',
    rule: '혜택 규칙',
    performance: '카드 실적',
    history: '결제 기록',
    metadata: '삭제 기록',
};

const formatMergeTime = (value: string) => new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
}).format(new Date(value));

function MergePreview({
    conflicts,
    localOnlyCount,
    accountOnlyCount,
    identicalCount,
    autoResolvedCount,
    cascadedDeletionCount,
    adjustedReferenceCount,
    choices,
    hasConfirmed,
    isWorking,
    onChoose,
    onChooseAll,
    onConfirm,
    onCancel,
    onMerge,
}: {
    conflicts: AccountWorkspaceMergeConflict[];
    localOnlyCount: number;
    accountOnlyCount: number;
    identicalCount: number;
    autoResolvedCount: number;
    cascadedDeletionCount: number;
    adjustedReferenceCount: number;
    choices: Record<string, AccountWorkspaceMergeSide>;
    hasConfirmed: boolean;
    isWorking: boolean;
    onChoose: (key: string, side: AccountWorkspaceMergeSide) => void;
    onChooseAll: (side: AccountWorkspaceMergeSide) => void;
    onConfirm: (confirmed: boolean) => void;
    onCancel: () => void;
    onMerge: () => void;
}) {
    const visibleConflicts = conflicts.slice(0, 100);

    return (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <div>
                <h3 className="text-xs font-black text-amber-950">항목별 병합 확인</h3>
                <p className="mt-1 text-[10px] leading-relaxed text-amber-800">
                    한쪽에만 있는 항목은 모두 보존합니다. 같은 항목이 다르면 최근 수정본을
                    기본 선택하며, 삭제와 수정이 겹친 항목도 직접 바꿀 수 있습니다.
                </p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
                <MergeCount label="이 기기에만 있음" value={localOnlyCount} />
                <MergeCount label="계정에만 있음" value={accountOnlyCount} />
                <MergeCount label="같은 항목" value={identicalCount + autoResolvedCount} />
                <MergeCount label="선택 필요" value={conflicts.length} />
            </div>

            {(cascadedDeletionCount > 0 || adjustedReferenceCount > 0) && (
                <p className="rounded-xl bg-white px-3 py-2 text-[10px] font-bold text-amber-800">
                    선택한 삭제 기록에 맞춰 연결 항목 {cascadedDeletionCount}개를 함께 삭제하고,
                    참조 {adjustedReferenceCount}개를 안전하게 정리합니다.
                </p>
            )}

            {conflicts.length > 0 && (
                <>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onChooseAll('local')}
                            className="flex-1 rounded-lg border border-amber-200 bg-white px-2 py-2 text-[10px] font-black text-amber-800"
                        >
                            모두 이 기기 선택
                        </button>
                        <button
                            type="button"
                            onClick={() => onChooseAll('account')}
                            className="flex-1 rounded-lg border border-amber-200 bg-white px-2 py-2 text-[10px] font-black text-amber-800"
                        >
                            모두 계정 선택
                        </button>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {visibleConflicts.map(conflict => (
                            <div key={conflict.key} className="rounded-xl border border-amber-100 bg-white p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[9px] font-black text-amber-600">
                                            {MERGE_KIND_LABELS[conflict.kind]}
                                        </p>
                                        <p className="truncate text-[11px] font-black text-gray-900">
                                            {conflict.label}
                                        </p>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[8px] font-black text-amber-700">
                                        기본 {conflict.defaultChoice === 'local' ? '이 기기' : '계정'}
                                    </span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <MergeChoiceButton
                                        label="이 기기"
                                        updatedAt={conflict.local.updatedAt}
                                        deleted={conflict.local.deleted}
                                        selected={choices[conflict.key] === 'local'}
                                        onClick={() => onChoose(conflict.key, 'local')}
                                    />
                                    <MergeChoiceButton
                                        label="계정"
                                        updatedAt={conflict.account.updatedAt}
                                        deleted={conflict.account.deleted}
                                        selected={choices[conflict.key] === 'account'}
                                        onClick={() => onChoose(conflict.key, 'account')}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    {conflicts.length > visibleConflicts.length && (
                        <p className="text-[9px] font-bold text-amber-700">
                            처음 100개를 개별 표시했습니다. 나머지는 최근 수정본 기본값 또는
                            위의 전체 선택을 적용합니다.
                        </p>
                    )}
                </>
            )}

            <label className="flex items-start gap-2 rounded-xl bg-white px-3 py-3 text-[10px] font-bold leading-relaxed text-gray-700">
                <input
                    type="checkbox"
                    checked={hasConfirmed}
                    onChange={event => onConfirm(event.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-amber-600"
                />
                선택한 충돌 항목과 자동 참조 정리를 확인했습니다. 병합 결과를 먼저 이 기기에
                저장한 뒤 계정 revision을 검증해 백업합니다.
            </label>

            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isWorking}
                    className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-3 text-xs font-black text-amber-800 disabled:opacity-50"
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={onMerge}
                    disabled={!hasConfirmed || isWorking}
                    className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isWorking
                        ? <RefreshCw className="h-4 w-4 animate-spin" />
                        : <GitMerge className="h-4 w-4" />}
                    {isWorking ? '병합하고 검증 중...' : '선택한 내용으로 병합'}
                </button>
            </div>
        </div>
    );
}

function MergeCount({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-xl bg-white px-3 py-2">
            <span className="text-gray-500">{label}</span>
            <strong className="float-right text-gray-900">{value}개</strong>
        </div>
    );
}

function MergeChoiceButton({
    label,
    updatedAt,
    deleted,
    selected,
    onClick,
}: {
    label: string;
    updatedAt: string;
    deleted: boolean;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`rounded-lg border px-2 py-2 text-left transition-colors ${selected
                ? 'border-amber-500 bg-amber-50 text-amber-900'
                : 'border-gray-200 bg-white text-gray-500'}`}
        >
            <span className="block text-[10px] font-black">{label}</span>
            <span className="mt-0.5 block text-[8px] font-bold">
                {deleted ? '삭제됨' : '사용'} · {formatMergeTime(updatedAt)}
            </span>
        </button>
    );
}

function StatusBox({
    tone,
    icon: Icon,
    children,
}: {
    tone: 'success' | 'info' | 'warning' | 'neutral';
    icon: typeof ShieldCheck;
    children: ReactNode;
}) {
    const colors = {
        success: 'bg-emerald-50 text-emerald-700',
        info: 'bg-blue-50 text-blue-700',
        warning: 'bg-amber-50 text-amber-800',
        neutral: 'bg-gray-50 text-gray-600',
    };
    return (
        <div className={`flex gap-2 rounded-xl px-3 py-3 text-[11px] leading-relaxed ${colors[tone]}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{children}</span>
        </div>
    );
}
