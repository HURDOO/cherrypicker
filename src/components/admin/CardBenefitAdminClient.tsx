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
    CardBenefitCandidateAudit,
    CardBenefitCandidateStatus,
    CardBenefitEvidence,
    CardBenefitExtraction,
    CardBenefitNoticeDates,
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
    audit: CardBenefitCandidateAudit;
    sources: Array<{
        documentId: string;
        role: 'PRIMARY' | 'SUPPORTING';
        sourceUrl: string;
        sourceKind: 'PRODUCT_PAGE' | 'PRODUCT_GUIDE_PDF' | 'NOTICE';
        mediaType: string;
        version: number;
        contentHash: string;
        pageCount?: number;
        noticeDates?: CardBenefitNoticeDates;
        collectedAt: string;
    }>;
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

const extractorLabel = (extractor: string) => extractor.startsWith('gemini:')
    ? 'Gemini 구조화'
    : '공식 규칙 추출기';

const formatAction = (rule: BenefitRule) => {
    if (rule.action.type === 'PERCENT') return `${rule.action.value}%`;
    if (rule.action.type === 'FLAT') return `${rule.action.value.toLocaleString()}원`;
    return `${rule.action.value.toLocaleString()}원 정가`;
};

const ruleConditionLabels = (rule: BenefitRule) => [
    ...(rule.condition.requiredCardNetwork
        ? [`${rule.condition.requiredCardNetwork} 전용`]
        : []),
    ...(rule.condition.performanceWaiver === 'NEW_CARD_REGISTRATION_WINDOW'
        ? ['신규회원 실적 면제 확인']
        : []),
    ...(rule.condition.confirmationRequired ? ['사용자 조건 확인'] : []),
    ...((rule.condition.stackableWithRuleIds?.length ?? 0) > 0
        ? [`중복 적용 ${rule.condition.stackableWithRuleIds!.length}개`]
        : []),
    ...(rule.action.amountBasis === 'REMAINING_AMOUNT' ? ['잔액 기준 계산'] : []),
];

const sourceHost = (sourceUrl?: string) => {
    if (!sourceUrl) return undefined;
    try {
        return new URL(sourceUrl).hostname;
    } catch {
        return sourceUrl;
    }
};

const sourceKindLabel = {
    PRODUCT_PAGE: '웹 원문',
    PRODUCT_GUIDE_PDF: 'PDF 안내서',
    NOTICE: '공식 공지',
};

const auditFieldLabels: Record<string, string> = {
    rule: '혜택 규칙',
    name: '카드명',
    company: '카드사',
    network: '카드 브랜드',
    limitTable: '실적별 통합 한도',
    category: '카테고리',
    includedBrands: '적용 브랜드',
    excludedBrands: '제외 브랜드',
    platformType: '적용 채널',
    sharedGroupId: '공유 한도 그룹',
    usesCardLimit: '카드 통합 한도 사용',
    description: '혜택명',
    detail: '상세 설명',
    'condition.minSpend': '최소 결제금액',
    'condition.minPerformance': '전월 실적',
    'condition.startsAt': '시작일',
    'condition.endsAt': '종료일',
    'condition.requiredCardNetwork': '필수 카드 브랜드',
    'condition.performanceWaiver': '신규회원 실적 면제',
    'condition.confirmationRequired': '사용자 조건 확인',
    'condition.stackableWithRuleIds': '중복 적용 규칙',
    'condition.applicationOrder': '적용 순서',
    'condition.manualCheckRequired': '수동 확인',
    'condition.requiredNote': '필수 확인 문구',
    'action.type': '혜택 계산 방식',
    'action.value': '혜택 값',
    'action.maxDiscount': '건별 최대 혜택',
    'action.amountBasis': '혜택 계산 기준금액',
    'limitConfig.dailyCount': '일 이용 횟수',
    'limitConfig.dailyAmount': '일 혜택 한도',
    'limitConfig.monthlyCount': '월 이용 횟수',
    'limitConfig.yearlyCount': '연 이용 횟수',
    'limitConfig.monthlyAmount': '월 혜택 한도',
};

const auditValue = (value: unknown) => {
    if (value === undefined || value === null || value === '') return '없음';
    if (typeof value === 'boolean') return value ? '예' : '아니요';
    if (typeof value === 'number') return value.toLocaleString('ko-KR');
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        return value.every(item => ['boolean', 'number', 'string'].includes(typeof item))
            ? value.join(', ') || '없음'
            : JSON.stringify(value);
    }
    return JSON.stringify(value);
};

const AuditPanel = ({ audit }: { audit: CardBenefitCandidateAudit }) => {
    const missing = audit.coverage.filter(item => item.status === 'MISSING_EVIDENCE');
    const totalCoverage = audit.summary.coveredFields + audit.summary.missingFields;
    return (
        <details
            open={audit.blockingErrors.length > 0}
            className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-3"
        >
            <summary className="cursor-pointer text-[10px] font-black text-sky-900">
                게시본 대비 변경 · 기준 {audit.baselineRevision > 0
                    ? `revision ${audit.baselineRevision}`
                    : '초기 카탈로그'} · 변경 {audit.changes.length}건 · 필수 근거 {audit.summary.coveredFields}/{totalCoverage}
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[8px] font-black text-gray-400">추가 규칙</p>
                    <p className="mt-0.5 text-sm font-black text-emerald-700">{audit.summary.addedRules}</p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[8px] font-black text-gray-400">삭제 규칙</p>
                    <p className="mt-0.5 text-sm font-black text-rose-700">{audit.summary.removedRules}</p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-[8px] font-black text-gray-400">변경 필드</p>
                    <p className="mt-0.5 text-sm font-black text-blue-700">{audit.summary.changedFields}</p>
                </div>
            </div>
            {audit.changes.length === 0 ? (
                <p className="mt-3 text-[10px] font-bold text-sky-800">
                    현재 게시본과 구조화된 계산 필드가 같습니다.
                </p>
            ) : (
                <div className="mt-3 space-y-1.5">
                    {audit.changes.map((change, index) => (
                        <div
                            key={`${change.entityId}:${change.path}:${index}`}
                            className="rounded-xl border border-sky-100 bg-white px-3 py-2"
                        >
                            <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-black">
                                <span className={change.risk === 'HIGH' ? 'text-rose-700' : 'text-gray-500'}>
                                    {change.risk === 'HIGH' ? '중요' : '문구'}
                                </span>
                                <span className="text-gray-800">{change.entityLabel}</span>
                                <span className="text-gray-400">· {auditFieldLabels[change.path] ?? change.path}</span>
                            </div>
                            <p className="mt-1 break-words text-[9px] font-bold text-gray-500">
                                {change.kind === 'ADDED'
                                    ? `추가: ${auditValue(change.after)}`
                                    : change.kind === 'REMOVED'
                                        ? `삭제: ${auditValue(change.before)}`
                                        : `${auditValue(change.before)} → ${auditValue(change.after)}`}
                            </p>
                        </div>
                    ))}
                </div>
            )}
            {missing.length > 0 && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                    <p className="text-[9px] font-black text-rose-800">근거가 빠진 필수 조건</p>
                    <ul className="mt-1 space-y-1 pl-4 text-[9px] font-bold text-rose-700">
                        {missing.map(item => (
                            <li key={`${item.ruleId}:${item.path}`} className="list-disc">
                                {item.ruleLabel} · {auditFieldLabels[item.path] ?? item.path}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </details>
    );
};

const EvidenceList = ({ evidence }: { evidence: CardBenefitEvidence[] }) => (
    <div className="space-y-2">
        {evidence.map(item => (
            <div key={item.id} className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                <p className="text-[9px] font-black text-gray-400">
                    {item.location ?? '공식 원문'} · {item.fields.join(', ')}
                </p>
                {item.sourceUrl && (
                    <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[9px] font-black text-blue-600"
                    >
                        {sourceHost(item.sourceUrl)}{item.page ? ` · ${item.page}쪽` : ''}
                        <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                )}
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
            const result = await request<{
                validationErrors: string[];
                sources: Array<unknown>;
                sourceFailures: Array<unknown>;
            }>({
                method: 'POST',
                body: JSON.stringify({ action: 'collect-shinhan-sol' }),
            });
            addToast(
                result.validationErrors.length > 0
                    ? `출처 ${result.sources.length}개를 수집했지만 검증 오류 ${result.validationErrors.length}건이 있어 게시를 막았습니다.`
                    : `공식 출처 ${result.sources.length}개를 묶어 후보를 만들었습니다.` +
                        (result.sourceFailures.length > 0
                            ? ` 선택 출처 ${result.sourceFailures.length}개는 실패했습니다.`
                            : ''),
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
                        SOL트래블 출처 수집
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
                    AI 또는 규칙 추출 결과는 자동 게시되지 않습니다. 상품 페이지·이용가이드·공지·PDF를 source bundle로 묶고, 원문 인용·PDF 페이지·참조 무결성·금액 범위 검증이 모두 통과한 후보만 승인할 수 있습니다.
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
                                        문서 v{candidate.documentVersion} · {extractorLabel(candidate.extractor)}
                                        {' '}({candidate.extractor})
                                        {candidate.model ? `/${candidate.model}` : ''}
                                    </span>
                                </div>
                                <h2 className="mt-2 text-base font-black text-gray-950">
                                    {candidate.extraction.card.name}
                                </h2>
                                <p className="mt-1 text-[10px] font-bold text-gray-400">
                                    schema v{candidate.extraction.schemaVersion} · {candidate.extraction.card.network ?? '브랜드 미지정'} · 추출 신뢰도 {Math.round(candidate.confidence * 100)}% · 규칙 {candidate.extraction.rules.length}개 · 근거 {candidate.extraction.evidence.length}개 · hash {candidate.contentHash.slice(0, 10)}
                                </p>
                            </div>
                            <div className="flex flex-wrap justify-end gap-1.5">
                                {candidate.sources.map(source => (
                                    <a
                                        key={source.documentId}
                                        href={source.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[9px] font-black text-blue-700"
                                    >
                                        {sourceKindLabel[source.sourceKind]} v{source.version}
                                        {source.pageCount ? ` · ${source.pageCount}쪽` : ''}
                                        {source.noticeDates?.publicationDate
                                            ? ` · 게시 ${source.noticeDates.publicationDate}`
                                            : ''}
                                        {source.noticeDates?.effectiveFrom
                                            ? ` · 시행 ${source.noticeDates.effectiveFrom}`
                                            : ''}
                                        <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                ))}
                            </div>
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

                        {candidate.extraction.notes.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-[10px] font-black text-amber-800">추출·검수 메모</p>
                                <ul className="mt-2 space-y-1 pl-4 text-[10px] font-bold text-amber-700">
                                    {candidate.extraction.notes.map(note => (
                                        <li key={note} className="list-disc">{note}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <AuditPanel audit={candidate.audit} />

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
                                            {ruleConditionLabels(rule).length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {ruleConditionLabels(rule).map(label => (
                                                        <span
                                                            key={label}
                                                            className="rounded-full bg-blue-50 px-2 py-0.5 text-[8px] font-black text-blue-700"
                                                        >
                                                            {label}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
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
