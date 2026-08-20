'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    CheckCircle2,
    DatabaseZap,
    ExternalLink,
    LoaderCircle,
    RotateCcw,
    ShieldAlert,
    XCircle,
} from 'lucide-react';
import type {
    BenefitRule,
    CardBenefitCandidateStatus,
    CardBenefitEvidence,
    CardBenefitExtraction,
    CardBenefitRevisionSnapshot,
} from '@/types';
import { getErrorMessage } from '@/lib/api-client';
import { useToastStore } from '@/store/useToastStore';

type Candidate = {
    id: string;
    cardId: string;
    documentId: string;
    sourceUrl: string;
    documentVersion: number;
    contentHash: string;
    collectedAt?: string;
    extractor: string;
    model?: string;
    confidence: number;
    extraction: CardBenefitExtraction;
    validationErrors: string[];
    status: CardBenefitCandidateStatus;
    createdAt: string;
    reviewedAt?: string;
};

type Revision = {
    id: string;
    cardId: string;
    revision: number;
    candidateId?: string;
    documentId?: string;
    snapshot: CardBenefitRevisionSnapshot;
    rollbackOfRevision?: number;
    isActive: boolean;
    publishedAt: string;
};

type ReviewData = {
    candidates: Candidate[];
    revisions: Revision[];
};

const request = async <T,>(init?: RequestInit): Promise<T> => {
    const response = await fetch('/api/admin/card-benefits', {
        ...init,
        headers: {
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
            ...init?.headers,
        },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '카드 혜택 관리 요청에 실패했습니다.');
    return body as T;
};

const statusLabel: Record<CardBenefitCandidateStatus, string> = {
    PENDING: '검수 대기',
    APPROVED: '게시 완료',
    REJECTED: '반려',
};

const formatAction = (rule: BenefitRule) => {
    if (rule.action.type === 'PERCENT') return `${rule.action.value}%`;
    if (rule.action.type === 'FLAT') return `${rule.action.value.toLocaleString()}원`;
    return `${rule.action.value.toLocaleString()}원 정가`;
};

const EvidenceList = ({ evidence }: { evidence: CardBenefitEvidence[] }) => (
    <div className="space-y-2">
        {evidence.map(item => (
            <div key={item.id} className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                <p className="text-[9px] font-black text-gray-400">
                    {item.location ?? '공식 원문'} · {item.fields.join(', ')}
                </p>
                <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-700">
                    “{item.quote}”
                </p>
            </div>
        ))}
    </div>
);

export function CardBenefitAdminClient() {
    const addToast = useToastStore(state => state.addToast);
    const [data, setData] = useState<ReviewData>();
    const [isLoading, setIsLoading] = useState(true);
    const [busyKey, setBusyKey] = useState<string>();

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            setData(await request<ReviewData>({ cache: 'no-store' }));
        } catch (error) {
            addToast(getErrorMessage(error, '카드 혜택 검수 데이터를 불러오지 못했습니다.'), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const collect = async () => {
        setBusyKey('collect');
        try {
            const result = await request<{ validationErrors: string[] }>({
                method: 'POST',
                body: JSON.stringify({ action: 'collect-shinhan-sol' }),
            });
            addToast(
                result.validationErrors.length > 0
                    ? `수집했지만 검증 오류 ${result.validationErrors.length}건이 있어 게시를 막았습니다.`
                    : '공식 문서와 카드 혜택 후보를 수집했습니다.',
                result.validationErrors.length > 0 ? 'error' : 'success',
            );
            await load();
        } catch (error) {
            addToast(getErrorMessage(error, '카드 공식 문서를 수집하지 못했습니다.'), 'error');
        } finally {
            setBusyKey(undefined);
        }
    };

    const review = async (candidate: Candidate, status: 'APPROVED' | 'REJECTED') => {
        const key = `${status}:${candidate.id}`;
        setBusyKey(key);
        try {
            await request({
                method: 'PATCH',
                body: JSON.stringify({
                    action: 'review',
                    candidateId: candidate.id,
                    status,
                }),
            });
            addToast(status === 'APPROVED'
                ? '카드 혜택 revision을 게시했습니다.'
                : '카드 혜택 후보를 반려했습니다.', 'success');
            await load();
        } catch (error) {
            addToast(getErrorMessage(error, '카드 혜택 후보를 검수하지 못했습니다.'), 'error');
        } finally {
            setBusyKey(undefined);
        }
    };

    const rollback = async (revision: Revision) => {
        const key = `rollback:${revision.id}`;
        setBusyKey(key);
        try {
            await request({
                method: 'PATCH',
                body: JSON.stringify({
                    action: 'rollback',
                    cardId: revision.cardId,
                    targetRevision: revision.revision,
                }),
            });
            addToast(`revision ${revision.revision} 내용으로 되돌렸습니다.`, 'success');
            await load();
        } catch (error) {
            addToast(getErrorMessage(error, '카드 혜택을 되돌리지 못했습니다.'), 'error');
        } finally {
            setBusyKey(undefined);
        }
    };

    const pendingCount = data?.candidates.filter(item => item.status === 'PENDING').length ?? 0;
    const activeRevision = useMemo(
        () => data?.revisions.find(item => item.isActive),
        [data],
    );

    return (
        <main className="min-h-screen bg-gray-50 pb-24">
            <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link href="/admin/promotions" className="rounded-xl bg-gray-100 p-2 text-gray-600">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <div>
                            <h1 className="text-lg font-black text-gray-950">카드 혜택 카탈로그</h1>
                            <p className="text-[10px] font-bold text-gray-400">
                                공식 원문 → 구조화 → 검증 → revision 게시
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={collect}
                        disabled={Boolean(busyKey)}
                        className="flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                    >
                        {busyKey === 'collect'
                            ? <LoaderCircle className="h-4 w-4 animate-spin" />
                            : <DatabaseZap className="h-4 w-4" />}
                        SOL트래블 수집
                    </button>
                </div>
            </header>

            <div className="mx-auto max-w-6xl space-y-6 px-5 pt-6">
                <section className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-[10px] font-black text-amber-700">검수 대기</p>
                        <p className="mt-1 text-2xl font-black text-amber-950">{pendingCount}</p>
                    </div>
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <p className="text-[10px] font-black text-blue-700">활성 revision</p>
                        <p className="mt-1 text-2xl font-black text-blue-950">
                            {activeRevision ? `r${activeRevision.revision}` : '-'}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-[10px] font-black text-emerald-700">보존된 revision</p>
                        <p className="mt-1 text-2xl font-black text-emerald-950">
                            {data?.revisions.length ?? 0}
                        </p>
                    </div>
                </section>

                <section className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-violet-900">
                    AI 또는 규칙 추출 결과는 자동 게시되지 않습니다. 원문 인용·참조 무결성·금액 범위 검증이 모두 통과한 후보만 승인할 수 있고, 첫 승인 전에 현재 seed 규칙을 기준 revision으로 보존합니다.
                </section>

                {isLoading && (
                    <div className="flex items-center justify-center gap-2 py-20 text-sm font-bold text-gray-400">
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        검수 데이터를 불러오고 있어요
                    </div>
                )}

                {!isLoading && (data?.candidates.length ?? 0) === 0 && (
                    <section className="rounded-3xl border border-gray-200 bg-white p-10 text-center">
                        <DatabaseZap className="mx-auto h-8 w-8 text-gray-300" />
                        <p className="mt-3 text-sm font-black text-gray-800">수집된 카드 혜택 후보가 없습니다</p>
                        <p className="mt-1 text-xs text-gray-400">SOL트래블 수집으로 첫 공식 문서를 보존하세요.</p>
                    </section>
                )}

                {(data?.candidates ?? []).map(candidate => (
                    <article key={candidate.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-black text-gray-600">
                                        {statusLabel[candidate.status]}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400">
                                        문서 v{candidate.documentVersion} · {candidate.extractor}
                                        {candidate.model ? `/${candidate.model}` : ''}
                                    </span>
                                </div>
                                <h2 className="mt-2 text-base font-black text-gray-950">
                                    {candidate.extraction.card.name}
                                </h2>
                                <p className="mt-1 text-[10px] font-bold text-gray-400">
                                    신뢰도 {Math.round(candidate.confidence * 100)}% · 규칙 {candidate.extraction.rules.length}개 · hash {candidate.contentHash.slice(0, 10)}
                                </p>
                            </div>
                            <a
                                href={candidate.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-black text-blue-600"
                            >
                                공식 원문 <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>

                        {candidate.validationErrors.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3">
                                <p className="flex items-center gap-1 text-[10px] font-black text-red-800">
                                    <ShieldAlert className="h-3.5 w-3.5" /> 검증 오류
                                </p>
                                <ul className="mt-2 space-y-1 pl-4 text-[10px] font-bold text-red-700">
                                    {candidate.validationErrors.map(error => <li key={error} className="list-disc">{error}</li>)}
                                </ul>
                            </div>
                        )}

                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                            <div>
                                <p className="mb-2 text-[10px] font-black text-gray-500">구조화 규칙</p>
                                <div className="space-y-2">
                                    {candidate.extraction.rules.map(rule => (
                                        <div key={rule.id} className="rounded-xl bg-gray-50 px-3 py-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-[11px] font-black text-gray-800">{rule.description}</p>
                                                <span className="shrink-0 text-[10px] font-black text-blue-600">{formatAction(rule)}</span>
                                            </div>
                                            <p className="mt-1 text-[9px] font-bold text-gray-400">{rule.detail}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="mb-2 text-[10px] font-black text-gray-500">원문 근거</p>
                                <EvidenceList evidence={candidate.extraction.evidence} />
                            </div>
                        </div>

                        {candidate.status === 'PENDING' && (
                            <div className="mt-5 grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => review(candidate, 'REJECTED')}
                                    disabled={Boolean(busyKey)}
                                    className="flex items-center justify-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-black text-gray-600 disabled:opacity-50"
                                >
                                    <XCircle className="h-4 w-4" /> 반려
                                </button>
                                <button
                                    type="button"
                                    onClick={() => review(candidate, 'APPROVED')}
                                    disabled={Boolean(busyKey) || candidate.validationErrors.length > 0}
                                    className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white disabled:bg-gray-200 disabled:text-gray-400"
                                >
                                    <CheckCircle2 className="h-4 w-4" /> 검수 후 게시
                                </button>
                            </div>
                        )}
                    </article>
                ))}

                {(data?.revisions.length ?? 0) > 0 && (
                    <section>
                        <h2 className="mb-3 px-1 text-sm font-black text-gray-900">Revision 기록</h2>
                        <div className="space-y-2">
                            {data?.revisions.map(revision => (
                                <div key={revision.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-black text-gray-900">revision {revision.revision}</p>
                                            {revision.isActive && (
                                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700">활성</span>
                                            )}
                                            {revision.rollbackOfRevision && (
                                                <span className="text-[9px] font-bold text-violet-600">r{revision.rollbackOfRevision} 롤백본</span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-[10px] font-bold text-gray-400">
                                            규칙 {revision.snapshot.rules.length}개 · {new Date(revision.publishedAt).toLocaleString('ko-KR')}
                                        </p>
                                    </div>
                                    {!revision.isActive && (
                                        <button
                                            type="button"
                                            onClick={() => rollback(revision)}
                                            disabled={Boolean(busyKey)}
                                            className="inline-flex items-center gap-1 rounded-xl border border-violet-200 px-3 py-2 text-[10px] font-black text-violet-700 disabled:opacity-50"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" /> 이 내용으로 롤백
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </main>
    );
}
