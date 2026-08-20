'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    CloudDownload,
    CloudUpload,
    RefreshCw,
    ShieldCheck,
} from 'lucide-react';
import {
    accountWorkspaceContentEquals,
    type AccountWorkspaceState,
} from '@/lib/account-workspace-export';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import {
    accountWorkspaceMatchesLocal,
    createAccountWorkspaceExportFromLocal,
    getAccountWorkspaceSyncMode,
    localWorkspaceClient,
    type LocalWorkspaceSnapshot,
} from '@/lib/local-workspace';
import { useToastStore } from '@/store/useToastStore';

export function AccountWorkspaceSync() {
    const addToast = useToastStore(state => state.addToast);
    const [localWorkspace, setLocalWorkspace] = useState<LocalWorkspaceSnapshot | null>(null);
    const [accountState, setAccountState] = useState<AccountWorkspaceState | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isWorking, setIsWorking] = useState(false);

    const loadState = useCallback(async () => {
        setIsLoading(true);
        try {
            const [local, account] = await Promise.all([
                localWorkspaceClient.read(),
                apiClient.getAccountWorkspaceState(),
            ]);
            setLocalWorkspace(local);
            setAccountState(account);
        } catch (error) {
            addToast(getErrorMessage(error, '계정 연동 상태를 확인하지 못했습니다.'), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void loadState();
    }, [loadState]);

    const mode = useMemo(() => {
        if (!localWorkspace || !accountState) return 'empty';
        return getAccountWorkspaceSyncMode(localWorkspace, accountState);
    }, [accountState, localWorkspace]);

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
            addToast('계정 데이터를 빈 로컬 workspace에 안전하게 복원했습니다.', 'success');
            window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            addToast(getErrorMessage(error, '계정 데이터를 복원하지 못했습니다.'), 'error');
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
                        snapshot 백업과 새 기기 복원에만 사용합니다.
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
                                병합 기능이 준비될 때까지 JSON 내보내기로 양쪽 원본을 보관해주세요.
                            </StatusBox>
                        )}
                        {mode === 'empty' && (
                            <StatusBox tone="neutral" icon={ShieldCheck}>
                                아직 백업하거나 복원할 개인 데이터가 없습니다.
                            </StatusBox>
                        )}

                        {(mode === 'upload' || mode === 'update') && (
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
