'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    CheckCircle2,
    DatabaseZap,
    ExternalLink,
    FileText,
    LoaderCircle,
    Plus,
    ShieldCheck,
    Trash2,
} from 'lucide-react';
import { getErrorMessage } from '@/lib/api-client';
import { useToastStore } from '@/store/useToastStore';
import type {
    CardBenefitSourceKind,
    CardBenefitSourceRole,
    CardBenefitBatchResult,
    CardNetwork,
    SystemCardCatalogStatus,
    SystemCardIssueStatus,
} from '@/types';

type SourceDraft = {
    clientId: string;
    label: string;
    sourceUrl: string;
    sourceKind: CardBenefitSourceKind;
    candidateRole: CardBenefitSourceRole;
    required: boolean;
    discoverLinkedPdfs: boolean;
};

type OnboardingCard = {
    id: string;
    name: string;
    company: string;
    color: string;
    network?: CardNetwork;
    catalogStatus: SystemCardCatalogStatus;
    issueStatus: SystemCardIssueStatus;
    issuerProductCode?: string;
    catalogCaveat?: string;
    activeRevision?: number;
    lastCheckedAt?: string;
    sources: Array<Omit<SourceDraft, 'clientId'>>;
};

type OnboardingData = {
    cards: OnboardingCard[];
};

type SystemCardDraftPayload = {
    id: string;
    name: string;
    company: string;
    color: string;
    network?: CardNetwork;
    issuerProductCode?: string;
    issueStatus: SystemCardIssueStatus;
    catalogCaveat?: string;
    sources: Array<Omit<SourceDraft, 'clientId'>>;
};

type CollectionResult = {
    validationErrors: string[];
    sources: Array<unknown>;
    sourceFailures: Array<unknown>;
    candidatePreserved?: boolean;
    cacheHit?: boolean;
};

const colors = [
    ['bg-blue-500', '파랑'],
    ['bg-sky-500', '하늘'],
    ['bg-indigo-500', '남색'],
    ['bg-violet-500', '보라'],
    ['bg-emerald-500', '초록'],
    ['bg-teal-500', '청록'],
    ['bg-amber-500', '노랑'],
    ['bg-orange-500', '주황'],
    ['bg-rose-500', '분홍'],
    ['bg-gray-700', '회색'],
] as const;

const networkLabels: Record<CardNetwork, string> = {
    DOMESTIC: '국내전용',
    MASTERCARD: 'Mastercard',
    VISA: 'Visa',
    AMEX: 'American Express',
    UNIONPAY: 'UnionPay',
    OTHER: '기타',
};

const sourceKindLabels: Record<CardBenefitSourceKind, string> = {
    PRODUCT_PAGE: '상품 페이지',
    PRODUCT_GUIDE_PDF: '상품 안내 PDF',
    NOTICE: '공식 공지',
};

const makeSource = (primary = false): SourceDraft => ({
    clientId: crypto.randomUUID(),
    label: primary ? '공식 상품 페이지' : '',
    sourceUrl: '',
    sourceKind: primary ? 'PRODUCT_PAGE' : 'PRODUCT_GUIDE_PDF',
    candidateRole: primary ? 'PRIMARY' : 'SUPPORTING',
    required: primary,
    discoverLinkedPdfs: primary,
});

const request = async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(path, {
        ...init,
        headers: {
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
            ...init?.headers,
        },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '요청에 실패했습니다.');
    return body as T;
};

const fieldClass = 'mt-1.5 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-bold text-gray-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

export function SystemCardOnboardingClient() {
    const addToast = useToastStore(state => state.addToast);
    const formRef = useRef<HTMLFormElement>(null);
    const [data, setData] = useState<OnboardingData>();
    const [isLoading, setIsLoading] = useState(true);
    const [busyAction, setBusyAction] = useState<
        'save' | 'collect' | 'batch-save' | 'batch-collect'
    >();
    const [batch, setBatch] = useState<SystemCardDraftPayload[]>([]);
    const [editingCardId, setEditingCardId] = useState<string>();
    const [lastResult, setLastResult] = useState<{
        cardId: string;
        collected: boolean;
        validationErrorCount?: number;
        sourceFailureCount?: number;
        error?: string;
    }>();
    const [lastBatchResult, setLastBatchResult] = useState<{
        cardIds: string[];
        collection?: CardBenefitBatchResult;
        collectionError?: string;
    }>();
    const [form, setForm] = useState({
        id: '',
        name: '',
        company: '',
        issuerProductCode: '',
        network: '' as CardNetwork | '',
        issueStatus: 'ACTIVE' as SystemCardIssueStatus,
        color: 'bg-blue-500',
        catalogCaveat: '',
    });
    const [sources, setSources] = useState<SourceDraft[]>(() => [makeSource(true)]);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            setData(await request<OnboardingData>('/api/admin/system-cards', {
                cache: 'no-store',
            }));
        } catch (error) {
            addToast(getErrorMessage(error, '시스템 카드 목록을 불러오지 못했습니다.'), 'error');
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void load();
    }, [load]);

    const updateSource = (clientId: string, patch: Partial<SourceDraft>) => {
        setSources(current => current.map(source => (
            source.clientId === clientId ? { ...source, ...patch } : source
        )));
    };

    const designatePrimary = (clientId: string) => {
        setSources(current => current.map(source => source.clientId === clientId
            ? { ...source, candidateRole: 'PRIMARY', required: true }
            : { ...source, candidateRole: 'SUPPORTING' }));
    };

    const resetForm = () => {
        setEditingCardId(undefined);
        setForm({
            id: '',
            name: '',
            company: '',
            issuerProductCode: '',
            network: '',
            issueStatus: 'ACTIVE',
            color: 'bg-blue-500',
            catalogCaveat: '',
        });
        setSources([makeSource(true)]);
    };

    const editDraft = (card: OnboardingCard) => {
        setEditingCardId(card.id);
        setForm({
            id: card.id,
            name: card.name,
            company: card.company,
            issuerProductCode: card.issuerProductCode ?? '',
            network: card.network ?? '',
            issueStatus: card.issueStatus,
            color: card.color,
            catalogCaveat: card.catalogCaveat ?? '',
        });
        setSources(card.sources.map(source => ({
            clientId: crypto.randomUUID(),
            ...source,
        })));
        setLastResult(undefined);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const currentDraftPayload = (): SystemCardDraftPayload => ({
        ...form,
        network: form.network || undefined,
        issuerProductCode: form.issuerProductCode || undefined,
        catalogCaveat: form.catalogCaveat || undefined,
        sources: sources.map(source => ({
            label: source.label,
            sourceUrl: source.sourceUrl,
            sourceKind: source.sourceKind,
            candidateRole: source.candidateRole,
            required: source.required,
            discoverLinkedPdfs: source.discoverLinkedPdfs,
        })),
    });

    const queueCurrentDraft = () => {
        if (!formRef.current?.reportValidity()) return;
        if (editingCardId) {
            addToast('수정 중인 카드는 배치에 추가할 수 없습니다.', 'error');
            return;
        }
        if (batch.length >= 5) {
            addToast('한 배치에는 최대 5장까지 추가할 수 있습니다.', 'error');
            return;
        }
        const draft = currentDraftPayload();
        if (batch.some(card => card.id === draft.id) ||
            data?.cards.some(card => card.id === draft.id)) {
            addToast('같은 카드 ID가 이미 배치나 시스템 카드 목록에 있습니다.', 'error');
            return;
        }
        if (draft.issuerProductCode && (batch.some(card => (
            card.company === draft.company &&
            card.issuerProductCode === draft.issuerProductCode
        )) || data?.cards.some(card => (
            card.company === draft.company &&
            card.issuerProductCode === draft.issuerProductCode
        )))) {
            addToast('같은 카드사 상품 코드가 이미 배치나 시스템 카드 목록에 있습니다.', 'error');
            return;
        }
        setBatch(current => [...current, draft]);
        setLastBatchResult(undefined);
        resetForm();
        addToast(`${draft.name}을(를) 온보딩 배치에 추가했습니다.`, 'success');
    };

    const createDraft = async (collectAfterSave: boolean) => {
        setBusyAction(collectAfterSave ? 'collect' : 'save');
        setLastResult(undefined);
        let savedCardId: string | undefined;
        try {
            const created = await request<OnboardingCard>('/api/admin/system-cards', {
                method: editingCardId ? 'PATCH' : 'POST',
                body: JSON.stringify(currentDraftPayload()),
            });
            savedCardId = created.id;
            if (!collectAfterSave) {
                setLastResult({ cardId: created.id, collected: false });
                addToast(
                    editingCardId
                        ? '시스템 카드 초안과 공식 출처를 수정했습니다.'
                        : '신규 카드를 비공개 초안으로 저장했습니다.',
                    'success',
                );
                resetForm();
                await load();
                return;
            }

            try {
                const result = await request<CollectionResult>('/api/admin/card-benefits', {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'collect-card',
                        cardId: created.id,
                    }),
                });
                setLastResult({
                    cardId: created.id,
                    collected: true,
                    validationErrorCount: result.validationErrors.length,
                    sourceFailureCount: result.sourceFailures.length,
                });
                addToast(
                    result.validationErrors.length > 0
                        ? `후보를 만들었지만 검증 오류 ${result.validationErrors.length}건을 확인해야 합니다.`
                        : '공식 원문 수집과 검수 후보 생성을 마쳤습니다.',
                    result.validationErrors.length > 0 ? 'info' : 'success',
                );
            } catch (error) {
                const message = getErrorMessage(error, '공식 원문 수집에 실패했습니다.');
                setLastResult({ cardId: created.id, collected: false, error: message });
                addToast(`카드 초안은 저장됐지만 수집에 실패했습니다: ${message}`, 'error');
            }
            resetForm();
            await load();
        } catch (error) {
            if (!savedCardId) {
                addToast(getErrorMessage(error, '신규 카드 초안을 저장하지 못했습니다.'), 'error');
            }
        } finally {
            setBusyAction(undefined);
        }
    };

    const createBatch = async (collectAfterSave: boolean) => {
        if (batch.length === 0) return;
        setBusyAction(collectAfterSave ? 'batch-collect' : 'batch-save');
        setLastResult(undefined);
        setLastBatchResult(undefined);
        let savedCardIds: string[] = [];
        try {
            const created = await request<{ cards: OnboardingCard[] }>(
                '/api/admin/system-cards',
                {
                    method: 'POST',
                    body: JSON.stringify({ cards: batch }),
                },
            );
            savedCardIds = created.cards.map(card => card.id);
            setBatch([]);
            if (!collectAfterSave) {
                setLastBatchResult({ cardIds: savedCardIds });
                addToast(`신규 카드 ${savedCardIds.length}장을 비공개 초안으로 저장했습니다.`, 'success');
                await load();
                return;
            }

            try {
                const collection = await request<CardBenefitBatchResult>(
                    '/api/admin/card-benefits',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            action: 'collect-cards',
                            cardIds: savedCardIds,
                        }),
                    },
                );
                setLastBatchResult({ cardIds: savedCardIds, collection });
                const attentionCount = collection.totals.deferred +
                    collection.totals.failed +
                    collection.totals.validationErrors +
                    collection.totals.sourceFailures;
                addToast(
                    attentionCount > 0
                        ? `배치 수집을 마쳤습니다. 보류·오류 ${attentionCount}건을 확인해주세요.`
                        : `카드 ${savedCardIds.length}장의 검수 후보 생성을 마쳤습니다.`,
                    attentionCount > 0 ? 'info' : 'success',
                );
            } catch (error) {
                const collectionError = getErrorMessage(error, '배치 수집에 실패했습니다.');
                setLastBatchResult({ cardIds: savedCardIds, collectionError });
                addToast(`카드 초안은 저장됐지만 배치 수집에 실패했습니다: ${collectionError}`, 'error');
            }
            await load();
        } catch (error) {
            if (savedCardIds.length === 0) {
                addToast(getErrorMessage(error, '신규 카드 배치를 저장하지 못했습니다.'), 'error');
            }
        } finally {
            setBusyAction(undefined);
        }
    };

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        void createDraft(true);
    };

    return (
        <main className="min-h-screen bg-gray-50 pb-24">
            <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link
                            href="/admin"
                            aria-label="관리자 콘솔로 돌아가기"
                            className="rounded-xl bg-gray-100 p-2 text-gray-600"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <div>
                            <h1 className="text-lg font-black text-gray-950">신규 카드 온보딩</h1>
                            <p className="text-[10px] font-bold text-gray-400">
                                초안 등록 → 공식 원문 수집 → 검수 승인 후 공개
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/admin/card-benefits"
                        className="flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-xs font-black text-white"
                    >
                        <ShieldCheck className="h-4 w-4" />
                        검수함
                    </Link>
                </div>
            </header>

            <div className="mx-auto grid max-w-6xl gap-6 px-5 pt-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
                <form ref={formRef} onSubmit={submit} className="space-y-5">
                    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-start gap-3">
                            <div className="rounded-2xl bg-violet-100 p-3 text-violet-700">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-gray-950">카드 기본정보</h2>
                                <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500">
                                    카드 ID는 한번 정하면 혜택 규칙과 revision의 기준이 되므로 바꾸지 않습니다.
                                </p>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-4 sm:grid-cols-2">
                            <label className="text-xs font-black text-gray-700">
                                카드 ID
                                <input
                                    required
                                    disabled={Boolean(editingCardId)}
                                    pattern="[a-z][a-z0-9_]{2,63}"
                                    maxLength={64}
                                    autoComplete="off"
                                    placeholder="shinhan_example"
                                    value={form.id}
                                    onChange={event => setForm(current => ({
                                        ...current,
                                        id: event.target.value.toLowerCase(),
                                    }))}
                                    className={`${fieldClass} disabled:bg-gray-100 disabled:text-gray-500`}
                                />
                                <span className="mt-1 block text-[9px] font-bold text-gray-400">
                                    영문 소문자 시작 · 숫자와 밑줄 허용
                                </span>
                            </label>
                            <label className="text-xs font-black text-gray-700">
                                카드 이름
                                <input
                                    required
                                    maxLength={160}
                                    placeholder="카드 공식 상품명"
                                    value={form.name}
                                    onChange={event => setForm(current => ({
                                        ...current,
                                        name: event.target.value,
                                    }))}
                                    className={fieldClass}
                                />
                            </label>
                            <label className="text-xs font-black text-gray-700">
                                카드사
                                <input
                                    required
                                    maxLength={100}
                                    placeholder="신한카드"
                                    value={form.company}
                                    onChange={event => setForm(current => ({
                                        ...current,
                                        company: event.target.value,
                                    }))}
                                    className={fieldClass}
                                />
                            </label>
                            <label className="text-xs font-black text-gray-700">
                                카드사 상품 코드 <span className="text-gray-400">(선택)</span>
                                <input
                                    maxLength={120}
                                    placeholder="중복 상품 식별용"
                                    value={form.issuerProductCode}
                                    onChange={event => setForm(current => ({
                                        ...current,
                                        issuerProductCode: event.target.value,
                                    }))}
                                    className={fieldClass}
                                />
                            </label>
                            <label className="text-xs font-black text-gray-700">
                                국제 브랜드 <span className="text-gray-400">(선택)</span>
                                <select
                                    value={form.network}
                                    onChange={event => setForm(current => ({
                                        ...current,
                                        network: event.target.value as CardNetwork | '',
                                    }))}
                                    className={fieldClass}
                                >
                                    <option value="">공통 또는 미확인</option>
                                    {Object.entries(networkLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-xs font-black text-gray-700">
                                발급 상태
                                <select
                                    value={form.issueStatus}
                                    onChange={event => setForm(current => ({
                                        ...current,
                                        issueStatus: event.target.value as SystemCardIssueStatus,
                                    }))}
                                    className={fieldClass}
                                >
                                    <option value="ACTIVE">발급 중</option>
                                    <option value="DISCONTINUED">발급 중단</option>
                                </select>
                            </label>
                        </div>

                        <fieldset className="mt-4">
                            <legend className="text-xs font-black text-gray-700">카드 색상</legend>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {colors.map(([value, label]) => (
                                    <label key={value} className="cursor-pointer">
                                        <input
                                            type="radio"
                                            name="color"
                                            value={value}
                                            checked={form.color === value}
                                            onChange={() => setForm(current => ({ ...current, color: value }))}
                                            className="peer sr-only"
                                        />
                                        <span className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[10px] font-black text-gray-600 peer-checked:border-violet-500 peer-checked:ring-2 peer-checked:ring-violet-100">
                                            <span className={`h-3 w-3 rounded-full ${value}`} />
                                            {label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <label className="mt-4 block text-xs font-black text-gray-700">
                            카탈로그 검수 안내 <span className="text-gray-400">(선택)</span>
                            <textarea
                                maxLength={1_000}
                                rows={3}
                                placeholder="예: 일부 제휴 혜택은 별도 공식 페이지 확인 필요"
                                value={form.catalogCaveat}
                                onChange={event => setForm(current => ({
                                    ...current,
                                    catalogCaveat: event.target.value,
                                }))}
                                className={fieldClass}
                            />
                        </label>
                    </section>

                    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="text-base font-black text-gray-950">공식 출처</h2>
                                <p className="mt-1 text-xs font-medium leading-relaxed text-gray-500">
                                    대표 출처 하나는 필수입니다. 상품 페이지에 안내 PDF가 연결돼 있으면 자동 발견을 켜세요.
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={sources.length >= 8}
                                onClick={() => setSources(current => [...current, makeSource()])}
                                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-100 px-3 py-2 text-[10px] font-black text-violet-700 disabled:opacity-40"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                출처 추가
                            </button>
                        </div>

                        <div className="mt-5 space-y-4">
                            {sources.map((source, index) => (
                                <article key={source.clientId} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <span className="rounded-full bg-gray-900 px-2 py-1 text-[9px] font-black text-white">
                                                출처 {index + 1}
                                            </span>
                                            {source.candidateRole === 'PRIMARY' && (
                                                <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black text-violet-700">
                                                    대표·필수
                                                </span>
                                            )}
                                        </div>
                                        {sources.length > 1 && (
                                            <button
                                                type="button"
                                                aria-label={`출처 ${index + 1} 삭제`}
                                                onClick={() => {
                                                    const remaining = sources.filter(item => item.clientId !== source.clientId);
                                                    if (source.candidateRole === 'PRIMARY') {
                                                        remaining[0] = {
                                                            ...remaining[0],
                                                            candidateRole: 'PRIMARY',
                                                            required: true,
                                                        };
                                                    }
                                                    setSources(remaining);
                                                }}
                                                className="rounded-lg p-2 text-gray-400 hover:bg-rose-100 hover:text-rose-600"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <label className="text-[10px] font-black text-gray-600">
                                            출처 이름
                                            <input
                                                required
                                                maxLength={120}
                                                placeholder="공식 상품 페이지"
                                                value={source.label}
                                                onChange={event => updateSource(source.clientId, {
                                                    label: event.target.value,
                                                })}
                                                className={fieldClass}
                                            />
                                        </label>
                                        <label className="text-[10px] font-black text-gray-600">
                                            문서 종류
                                            <select
                                                value={source.sourceKind}
                                                onChange={event => updateSource(source.clientId, {
                                                    sourceKind: event.target.value as CardBenefitSourceKind,
                                                })}
                                                className={fieldClass}
                                            >
                                                {Object.entries(sourceKindLabels).map(([value, label]) => (
                                                    <option key={value} value={value}>{label}</option>
                                                ))}
                                            </select>
                                        </label>
                                    </div>
                                    <label className="mt-3 block text-[10px] font-black text-gray-600">
                                        공식 HTTPS URL
                                        <input
                                            required
                                            type="url"
                                            inputMode="url"
                                            maxLength={2_000}
                                            placeholder="https://www.card-company.co.kr/..."
                                            value={source.sourceUrl}
                                            onChange={event => updateSource(source.clientId, {
                                                sourceUrl: event.target.value,
                                            })}
                                            className={fieldClass}
                                        />
                                    </label>

                                    <div className="mt-3 flex flex-wrap gap-4 text-[10px] font-black text-gray-600">
                                        <label className="flex items-center gap-2">
                                            <input
                                                type="radio"
                                                name="primary-source"
                                                checked={source.candidateRole === 'PRIMARY'}
                                                onChange={() => designatePrimary(source.clientId)}
                                                className="accent-violet-600"
                                            />
                                            대표 출처
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={source.required}
                                                disabled={source.candidateRole === 'PRIMARY'}
                                                onChange={event => updateSource(source.clientId, {
                                                    required: event.target.checked,
                                                })}
                                                className="accent-violet-600"
                                            />
                                            수집 실패 시 후보 차단
                                        </label>
                                        {source.sourceKind === 'PRODUCT_PAGE' && (
                                            <label className="flex items-center gap-2">
                                                <input
                                                    type="checkbox"
                                                    checked={source.discoverLinkedPdfs}
                                                    onChange={event => updateSource(source.clientId, {
                                                        discoverLinkedPdfs: event.target.checked,
                                                    })}
                                                    className="accent-violet-600"
                                                />
                                                연결된 PDF 자동 발견
                                            </label>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-amber-900">
                        AI 수집은 등록한 공개 공식 문서만 전송하며 사용자·결제 데이터는 보내지 않습니다. API 비용이 발생할 수 있고, 검증 후보를 승인하기 전까지 카드는 공개되지 않습니다.
                    </section>

                    {editingCardId && (
                        <section className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
                            <p className="text-[11px] font-bold text-blue-900">
                                <strong>{editingCardId}</strong> 초안의 기본정보와 공식 출처를 수정 중입니다.
                            </p>
                            <button
                                type="button"
                                disabled={Boolean(busyAction)}
                                onClick={resetForm}
                                className="shrink-0 rounded-lg bg-white px-3 py-2 text-[10px] font-black text-blue-700"
                            >
                                수정 취소
                            </button>
                        </section>
                    )}

                    <div className="grid gap-2 sm:grid-cols-3">
                        <button
                            type="button"
                            disabled={Boolean(busyAction) || Boolean(editingCardId) || batch.length >= 5}
                            onClick={queueCurrentDraft}
                            className="flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-xs font-black text-violet-700 disabled:opacity-50"
                        >
                            <Plus className="h-4 w-4" />
                            배치에 추가 ({batch.length}/5)
                        </button>
                        <button
                            type="button"
                            disabled={Boolean(busyAction)}
                            onClick={() => void createDraft(false)}
                            className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-xs font-black text-gray-700 disabled:opacity-50"
                        >
                            {busyAction === 'save'
                                ? '저장 중…'
                                : editingCardId ? '초안 수정 저장' : '초안만 저장'}
                        </button>
                        <button
                            type="submit"
                            disabled={Boolean(busyAction)}
                            className="flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50"
                        >
                            {busyAction === 'collect'
                                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                                : <DatabaseZap className="h-4 w-4" />}
                            {editingCardId ? '수정 후 AI 수집 시작' : '저장 후 AI 수집 시작'}
                        </button>
                    </div>
                </form>

                <aside className="space-y-5">
                    {batch.length > 0 && (
                        <section className="rounded-3xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-black text-gray-950">온보딩 배치</h2>
                                    <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-500">
                                        최대 5장을 원자적으로 초안 저장하고, AI 예산 범위에서 순서대로 수집합니다.
                                    </p>
                                </div>
                                <span className="shrink-0 rounded-full bg-violet-200 px-2.5 py-1 text-[10px] font-black text-violet-800">
                                    {batch.length}/5
                                </span>
                            </div>
                            <div className="mt-4 space-y-2">
                                {batch.map(card => (
                                    <article
                                        key={card.id}
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-white px-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-black text-gray-900">{card.name}</p>
                                            <p className="mt-0.5 truncate text-[9px] font-bold text-gray-400">
                                                {card.company} · {card.id} · 출처 {card.sources.length}개
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            aria-label={`${card.name} 배치에서 제거`}
                                            disabled={Boolean(busyAction)}
                                            onClick={() => setBatch(current => (
                                                current.filter(item => item.id !== card.id)
                                            ))}
                                            className="rounded-lg p-2 text-gray-400 hover:bg-rose-100 hover:text-rose-600 disabled:opacity-40"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </article>
                                ))}
                            </div>
                            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                                <button
                                    type="button"
                                    disabled={Boolean(busyAction)}
                                    onClick={() => void createBatch(false)}
                                    className="rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-[10px] font-black text-violet-700 disabled:opacity-50"
                                >
                                    {busyAction === 'batch-save' ? '저장 중…' : '배치 초안 저장'}
                                </button>
                                <button
                                    type="button"
                                    disabled={Boolean(busyAction)}
                                    onClick={() => void createBatch(true)}
                                    className="flex items-center justify-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                                >
                                    {busyAction === 'batch-collect'
                                        ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                        : <DatabaseZap className="h-3.5 w-3.5" />}
                                    저장 후 배치 수집
                                </button>
                            </div>
                            <p className="mt-3 text-[9px] font-bold leading-relaxed text-violet-700">
                                AI 상한을 넘긴 카드는 실패시키지 않고 보류합니다. 다음 전체 수집에서 이어서 처리할 수 있습니다.
                            </p>
                        </section>
                    )}

                    {lastBatchResult && (
                        <section className={`rounded-3xl border p-5 ${lastBatchResult.collectionError
                            ? 'border-rose-200 bg-rose-50'
                            : 'border-emerald-200 bg-emerald-50'}`}>
                            <div className="flex items-start gap-3">
                                {lastBatchResult.collectionError
                                    ? <DatabaseZap className="h-5 w-5 text-rose-700" />
                                    : <CheckCircle2 className="h-5 w-5 text-emerald-700" />}
                                <div className="min-w-0 flex-1">
                                    <h2 className="text-sm font-black text-gray-950">
                                        카드 {lastBatchResult.cardIds.length}장 초안 저장 완료
                                    </h2>
                                    {lastBatchResult.collection ? (
                                        <>
                                            <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-600">
                                                후보 {lastBatchResult.collection.totals.created} · 변경 없음 {lastBatchResult.collection.totals.unchanged} · 보류 {lastBatchResult.collection.totals.deferred} · 실패 {lastBatchResult.collection.totals.failed}
                                            </p>
                                            <div className="mt-3 space-y-1.5">
                                                {lastBatchResult.collection.items.map(item => (
                                                    <p key={item.cardId} className="rounded-xl bg-white/70 px-3 py-2 text-[9px] font-bold text-gray-600">
                                                        {item.cardId} · {item.status}
                                                        {item.aiExtraction ? ' · AI 사용' : ''}
                                                        {item.cacheHit ? ' · 캐시' : ''}
                                                        {item.error ? ` · ${item.error}` : ''}
                                                    </p>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <p className={`mt-1 text-[10px] font-bold leading-relaxed ${lastBatchResult.collectionError
                                            ? 'text-rose-700'
                                            : 'text-gray-600'}`}>
                                            {lastBatchResult.collectionError ?? '검수 후보 수집 전의 비공개 상태입니다.'}
                                        </p>
                                    )}
                                    <Link
                                        href="/admin/card-benefits"
                                        className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-violet-700"
                                    >
                                        검수함에서 확인 <ExternalLink className="h-3 w-3" />
                                    </Link>
                                </div>
                            </div>
                        </section>
                    )}

                    {lastResult && (
                        <section className={`rounded-3xl border p-5 ${lastResult.error
                            ? 'border-rose-200 bg-rose-50'
                            : 'border-emerald-200 bg-emerald-50'}`}>
                            <div className="flex items-start gap-3">
                                {lastResult.error
                                    ? <DatabaseZap className="h-5 w-5 text-rose-700" />
                                    : <CheckCircle2 className="h-5 w-5 text-emerald-700" />}
                                <div>
                                    <h2 className="text-sm font-black text-gray-950">
                                        {lastResult.error ? '초안 저장 완료 · 수집 실패' : '처리 완료'}
                                    </h2>
                                    <p className="mt-1 text-[10px] font-bold leading-relaxed text-gray-600">
                                        {lastResult.cardId}
                                        {lastResult.collected
                                            ? ` · 검증 오류 ${lastResult.validationErrorCount ?? 0}건 · 출처 실패 ${lastResult.sourceFailureCount ?? 0}건`
                                            : ' · 비공개 초안'}
                                    </p>
                                    {lastResult.error && (
                                        <p className="mt-2 text-[10px] font-bold leading-relaxed text-rose-700">
                                            {lastResult.error}
                                        </p>
                                    )}
                                    <Link
                                        href="/admin/card-benefits"
                                        className="mt-3 inline-flex items-center gap-1 text-[10px] font-black text-violet-700"
                                    >
                                        검수함에서 확인 <ExternalLink className="h-3 w-3" />
                                    </Link>
                                </div>
                            </div>
                        </section>
                    )}

                    <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-black text-gray-950">시스템 카드 현황</h2>
                                <p className="mt-1 text-[10px] font-bold text-gray-400">
                                    초안은 사용자에게 노출되지 않습니다.
                                </p>
                            </div>
                            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-600">
                                {data?.cards.length ?? 0}장
                            </span>
                        </div>

                        <div className="mt-4 space-y-3">
                            {isLoading && (
                                <div className="flex justify-center py-8 text-gray-400">
                                    <LoaderCircle className="h-5 w-5 animate-spin" />
                                </div>
                            )}
                            {!isLoading && data?.cards.map(card => (
                                <article key={card.id} className="rounded-2xl border border-gray-200 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-xs font-black text-gray-900">{card.name}</p>
                                            <p className="mt-1 truncate text-[9px] font-bold text-gray-400">
                                                {card.company} · {card.id}
                                            </p>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${card.catalogStatus === 'PUBLISHED'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-amber-100 text-amber-700'}`}>
                                            {card.catalogStatus === 'PUBLISHED' ? '공개' : '초안'}
                                        </span>
                                    </div>
                                    <p className="mt-3 text-[9px] font-bold text-gray-500">
                                        출처 {card.sources.length}개 · {card.issueStatus === 'ACTIVE' ? '발급 중' : '발급 중단'} · {card.activeRevision ? `revision ${card.activeRevision}` : '미게시'}
                                    </p>
                                    <p className="mt-1 text-[9px] font-bold text-gray-400">
                                        {card.lastCheckedAt
                                            ? `최근 수집 ${new Date(card.lastCheckedAt).toLocaleString('ko-KR')}`
                                            : '아직 수집하지 않음'}
                                    </p>
                                    {card.catalogStatus === 'DRAFT' && (
                                        <button
                                            type="button"
                                            disabled={Boolean(busyAction)}
                                            onClick={() => editDraft(card)}
                                            className="mt-3 w-full rounded-xl bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-700 disabled:opacity-40"
                                        >
                                            기본정보·출처 수정
                                        </button>
                                    )}
                                </article>
                            ))}
                            {!isLoading && data?.cards.length === 0 && (
                                <p className="py-8 text-center text-xs font-bold text-gray-400">
                                    등록된 시스템 카드가 없습니다.
                                </p>
                            )}
                        </div>
                    </section>
                </aside>
            </div>
        </main>
    );
}
