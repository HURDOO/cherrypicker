'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    DatabaseZap,
    ExternalLink,
    Layers3,
    LoaderCircle,
    PauseCircle,
    PlayCircle,
    PlusCircle,
    RefreshCw,
    Search,
    ShieldAlert,
    Sparkles,
    Store,
    XCircle,
} from 'lucide-react';
import type {
    PromotionApplicabilityScope,
    PromotionCalculationMode,
    PromotionCandidateAudit,
    PromotionOffer,
    PromotionProvider,
    PromotionSemanticAnalysis,
    PromotionValueSemantics,
} from '@/types';
import type { StructuredFieldChange } from '@/lib/structured-diff';
import { getErrorMessage } from '@/lib/api-client';
import {
    canAcknowledgePromotionAuditErrors,
    formatPromotionAuditError,
    unresolvedPromotionAuditErrors,
} from '@/lib/promotion-candidate-audit';
import { useToastStore } from '@/store/useToastStore';

type Candidate = {
    id: string;
    providerId: string;
    sourceUrl: string;
    sourceHash: string;
    sourceTitle: string;
    rawContent: string;
    parsedOffer: Record<string, unknown>;
    diff: Record<string, unknown>;
    sourceBundleHash: string;
    audit?: PromotionCandidateAudit;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    linkedPromotionId?: string;
    discoveredAt: string;
    reviewedAt?: string;
};

type CandidateOffer = {
    providerId?: string;
    layer?: string;
    title?: string;
    description?: string;
    brandIds?: string[];
    categoryIds?: string[];
    channels?: string[];
    startsAt?: string;
    endsAt?: string;
    action?: {
        type?: string;
        value?: number;
        valueSemantics?: PromotionValueSemantics;
        maxBenefit?: number;
    };
    condition?: {
        amountBasis?: string;
        applicabilityScope?: PromotionApplicabilityScope;
        calculationMode?: PromotionCalculationMode;
        headlineEligible?: boolean;
        eligibleItemSummary?: string;
        requiredInputs?: string[];
        itemSpecific?: boolean;
        minSpend?: number;
        telecomTiers?: string[];
        requiredSubscriptionProducts?: string[];
        manualCheckRequired?: boolean;
        confirmationRequired?: boolean;
        requiredNote?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

type AdminData = {
    providers: PromotionProvider[];
    promotions: PromotionOffer[];
    candidates: Candidate[];
    sourceBundles: Record<string, SourceDocumentSummary[]>;
    brands: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
    routeVerifications: Array<{
        id: number;
        brandId: string;
        payProviderId?: string;
        cardCompany?: string;
        channel: string;
        cardBenefitEligible: boolean;
        certainty: string;
        evidenceUrl: string;
        verifiedAt: string;
    }>;
};

type SourceDocumentSummary = {
    id: string;
    sourceUrl: string;
    mediaType: string;
    contentHash: string;
    version: number;
    collectedAt: string;
};

type CollectionResult = {
    sourceId: string;
    sourceUrl: string;
    label: string;
    status: 'created' | 'unchanged' | 'failed' | 'skipped';
    discovered: number;
    published: number;
    reviewRequired: number;
    unchanged: number;
    expired: number;
    message?: string;
};

type RiskFilter = 'ALL' | 'BLOCKED' | 'CHANGED' | 'COMPLEX' | 'ENCODING';
type ScopeFilter = 'ALL' | PromotionApplicabilityScope;

const PAGE_SIZE = 20;

const request = async <T,>(init?: RequestInit): Promise<T> => {
    const response = await fetch('/api/admin/promotions', {
        ...init,
        headers: {
            ...(init?.body ? { 'content-type': 'application/json' } : {}),
            ...init?.headers,
        },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '관리자 요청에 실패했습니다.');
    return body as T;
};

const statusLabel = {
    PENDING: '검수 대기',
    APPROVED: '승인',
    REJECTED: '반려',
};

const actionLabels: Record<string, string> = {
    PERCENT: '할인율',
    FLAT: '정액 할인',
    FIXED_PRICE: '특가',
    POINTS: '포인트 적립',
    CASHBACK: '캐시백',
    GIFT_CERTIFICATE: '상품권',
};

const valueSemanticsLabels: Record<PromotionValueSemantics, string> = {
    EXACT: '정확한 값',
    UP_TO: '최대치·정보용',
};

const calculationModeLabels: Record<PromotionCalculationMode, string> = {
    CALCULABLE: '바로 계산',
    CONDITIONAL: '사용자 확인 후 계산',
    INFORMATION_ONLY: '정보만 표시',
};

const scopeLabels: Record<PromotionApplicabilityScope, string> = {
    STORE_WIDE: '매장 전체',
    CATEGORY: '카테고리 한정',
    PRODUCT_SET: '상품 한정',
    CUSTOMER_TARGETED: '고객 한정',
    UNKNOWN: '범위 미확정',
};

const scopeDescriptions: Record<PromotionApplicabilityScope, string> = {
    STORE_WIDE: '대표 최대 혜택 계산에 포함',
    CATEGORY: '대상 카테고리 금액을 따로 입력',
    PRODUCT_SET: '대상 상품 금액을 따로 입력',
    CUSTOMER_TARGETED: '개인별 대상 여부 확인 필요',
    UNKNOWN: '게시 전에 범위를 반드시 선택',
};

const UNKNOWN_ELIGIBLE_ITEM_SUMMARY =
    '제휴사가 지정한 상품·서비스에 한해 적용(세부 대상은 공식 유의사항 확인)';

const hasBrokenEncoding = (value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    return text.includes('\uFFFD') || text.includes('ï¿½');
};

const asOffer = (candidate: Candidate) => candidate.parsedOffer as CandidateOffer;
const candidateScope = (candidate: Candidate): PromotionApplicabilityScope =>
    asOffer(candidate).condition?.applicabilityScope ?? 'UNKNOWN';
const candidateSemanticAnalysis = (candidate: Candidate) => {
    const analysis = candidate.diff.semanticAnalysis;
    if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return undefined;
    return analysis as PromotionSemanticAnalysis;
};

const formatMoney = (value?: number) => value === undefined
    ? '-'
    : `${Math.round(value).toLocaleString('ko-KR')}원`;

const formatAction = (offer: CandidateOffer) => {
    const type = offer.action?.type ?? '';
    const value = offer.action?.value;
    if (value === undefined) return '혜택 값 확인 필요';
    const prefix = offer.action?.valueSemantics === 'UP_TO' ? '최대 ' : '';
    if (type === 'PERCENT') return `${prefix}${value}% 할인`;
    if (type === 'POINTS') return `${prefix}${value}% 적립`;
    if (type === 'CASHBACK') return `${prefix}${value}% 캐시백`;
    if (type === 'FIXED_PRICE') return `${formatMoney(value)} 특가`;
    if (type === 'FLAT' && /캐시백/.test(offer.title ?? '')) return `${formatMoney(value)} 캐시백`;
    if (type === 'FLAT' && offer.layer === 'POST_REWARD') return `${formatMoney(value)} 적립`;
    return `${formatMoney(value)} ${type === 'FLAT' ? '할인' : '혜택'}`;
};

const candidateWarnings = (candidate: Candidate) => Array.isArray(candidate.diff.warnings)
    ? candidate.diff.warnings.filter((warning): warning is string => typeof warning === 'string')
    : [];

const candidateResolutionMessages: Record<string, string> = {
    MISSING_FROM_LATEST_SOURCE: '승인 전에 최신 공식 목록에서 사라져 자동 반려되었습니다. 이 후보는 게시되지 않았습니다.',
    REAPPEARED_IN_SOURCE: '삭제 의심 후 최신 공식 목록에 다시 나타나 삭제 후보가 자동 반려되었습니다.',
    REMOVAL_CONFIRMED: '공식 목록에서 사라진 사실을 확인해 연결된 게시 혜택을 만료했습니다.',
};

const candidateFieldChanges = (candidate: Candidate): StructuredFieldChange[] => {
    const changes = candidate.diff.fieldChanges;
    if (!Array.isArray(changes)) return [];
    return changes.filter((change): change is StructuredFieldChange => (
        Boolean(change) &&
        typeof change === 'object' &&
        typeof (change as StructuredFieldChange).path === 'string' &&
        ['ADDED', 'REMOVED', 'CHANGED'].includes((change as StructuredFieldChange).kind)
    ));
};

const candidateBlockingErrors = (candidate: Candidate) => {
    if (candidate.audit) return candidate.audit.blockingErrors;
    if (
        candidate.status === 'PENDING' &&
        candidate.diff.structured === true &&
        candidate.diff.manual !== true
    ) {
        return ['원문 source bundle 검증이 없는 기존 후보입니다. 공식 페이지를 다시 수집해주세요.'];
    }
    return [];
};

const fieldChangeKindLabel: Record<StructuredFieldChange['kind'], string> = {
    ADDED: '추가',
    REMOVED: '삭제',
    CHANGED: '변경',
};

const formatFieldChangeValue = (value: unknown) => {
    if (value === undefined || value === null || value === '') return '없음';
    if (typeof value === 'boolean') return value ? '예' : '아니요';
    if (typeof value === 'number') return value.toLocaleString('ko-KR');
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
};

const candidateRisk = (candidate: Candidate): Exclude<RiskFilter, 'ALL'> | 'NORMAL' => {
    if (candidateBlockingErrors(candidate).length > 0) return 'BLOCKED';
    if (hasBrokenEncoding(candidate.rawContent) || hasBrokenEncoding(candidate.parsedOffer)) {
        return 'ENCODING';
    }
    if (candidate.diff.changed === true) return 'CHANGED';
    if (candidateScope(candidate) === 'UNKNOWN' ||
        candidateWarnings(candidate).length > 0 ||
        asOffer(candidate).condition?.manualCheckRequired) {
        return 'COMPLEX';
    }
    return 'NORMAL';
};

function SummaryCard({
    label,
    value,
    description,
    tone,
}: {
    label: string;
    value: string | number;
    description: string;
    tone: 'amber' | 'blue' | 'emerald' | 'violet';
}) {
    const tones = {
        amber: 'border-amber-200 bg-amber-50 text-amber-900',
        blue: 'border-blue-200 bg-blue-50 text-blue-900',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        violet: 'border-violet-200 bg-violet-50 text-violet-900',
    };
    return (
        <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
            <p className="text-[10px] font-black uppercase tracking-wide opacity-60">{label}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
            <p className="mt-1 text-[10px] font-bold opacity-60">{description}</p>
        </div>
    );
}

function ManualCandidateForm({
    brands,
    providers,
    onCreated,
}: {
    brands: AdminData['brands'];
    providers: PromotionProvider[];
    onCreated: () => Promise<void>;
}) {
    const addToast = useToastStore(state => state.addToast);
    const [form, setForm] = useState({
        providerId: 'kakaopay',
        brandId: '',
        layer: 'PAY',
        title: '',
        description: '',
        actionType: 'FLAT',
        valueSemantics: 'EXACT' as PromotionValueSemantics,
        actionValue: '',
        minSpend: '',
        requiredSubscriptionProducts: '',
        channel: 'ALL',
        scope: 'UNKNOWN' as PromotionApplicabilityScope,
        sourceUrl: 'https://',
    });
    const [isSaving, setIsSaving] = useState(false);
    const selectedProvider = providers.find(provider => provider.id === form.providerId);

    const create = async () => {
        const actionValue = Number(form.actionValue);
        const minSpend = form.minSpend ? Number(form.minSpend) : undefined;
        const requiredSubscriptionProducts = form.requiredSubscriptionProducts
            .split(',')
            .map(product => product.trim())
            .filter(Boolean);
        if (!form.title.trim() || !form.brandId || !Number.isFinite(actionValue) || actionValue <= 0) {
            addToast('브랜드·제목·혜택 값을 확인해주세요.', 'error');
            return;
        }
        if (selectedProvider?.kind === 'SUBSCRIPTION' && requiredSubscriptionProducts.length === 0) {
            addToast('혜택에 필요한 구독 상품명을 입력해주세요.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            await request({
                method: 'POST',
                body: JSON.stringify({
                    action: 'manual',
                    rawContent: '관리자가 직접 확인한 앱 또는 공식 안내',
                    offer: {
                        providerId: form.providerId,
                        layer: form.layer,
                        title: form.title.trim(),
                        description: form.description.trim() || form.title.trim(),
                        brandIds: [form.brandId],
                        categoryIds: [],
                        channels: [form.channel],
                        action: {
                            type: form.actionType,
                            value: actionValue,
                            valueSemantics: form.valueSemantics,
                        },
                        condition: {
                            amountBasis: form.scope === 'CATEGORY' || form.scope === 'PRODUCT_SET'
                                ? 'ELIGIBLE_ITEM_AMOUNT'
                                : form.layer === 'DISCOUNT' ? 'ORIGINAL_AMOUNT' : 'REMAINING_AMOUNT',
                            applicabilityScope: form.scope,
                            calculationMode: form.valueSemantics === 'UP_TO'
                                ? 'INFORMATION_ONLY'
                                : 'CALCULABLE',
                            headlineEligible: form.scope === 'STORE_WIDE' &&
                                form.valueSemantics === 'EXACT',
                            itemSpecific: form.scope === 'CATEGORY' || form.scope === 'PRODUCT_SET',
                            requiredInputs: [
                                ...(form.scope === 'CATEGORY' || form.scope === 'PRODUCT_SET'
                                    ? ['ELIGIBLE_ITEM_AMOUNT']
                                    : []),
                                ...(selectedProvider?.kind === 'SUBSCRIPTION'
                                    ? ['SUBSCRIPTION_PRODUCT']
                                    : []),
                            ],
                            ...(selectedProvider?.kind === 'SUBSCRIPTION' && {
                                requiredSubscriptionProducts,
                            }),
                            ...((form.scope === 'CATEGORY' || form.scope === 'PRODUCT_SET') && {
                                eligibleItemSummary: form.description.trim() || form.title.trim(),
                            }),
                            ...(minSpend && { minSpend }),
                            manualCheckRequired: true,
                            requiredNote: '게시 전 공식 안내의 대상·기간·횟수 확인',
                        },
                        compatibility: {
                            ...((selectedProvider?.kind === 'PAY' || selectedProvider?.kind === 'GOODDEAL') && {
                                requiredPayProviderIds: [form.providerId],
                            }),
                        },
                        limitConfig: {},
                        certainty: 'CONDITIONAL',
                        sourceUrl: form.sourceUrl,
                    },
                }),
            });
            addToast('검수 후보를 추가했습니다.', 'success');
            setForm(current => ({
                ...current,
                brandId: '',
                title: '',
                description: '',
                actionValue: '',
                minSpend: '',
                requiredSubscriptionProducts: '',
            }));
            await onCreated();
        } catch (error) {
            addToast(getErrorMessage(error, '수동 후보를 추가하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <details className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-gray-900">
                <PlusCircle className="h-4 w-4 text-blue-600" />
                수동 혜택 등록
            </summary>
            <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
                JSON 대신 확인한 값만 입력하면 검수 큐에 추가됩니다.
            </p>
            <div className="mt-4 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                    <select
                        value={form.providerId}
                        onChange={event => setForm(current => ({ ...current, providerId: event.target.value }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                    >
                        {providers.map(provider => (
                            <option key={provider.id} value={provider.id}>{provider.name}</option>
                        ))}
                    </select>
                    <select
                        value={form.brandId}
                        onChange={event => setForm(current => ({ ...current, brandId: event.target.value }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                    >
                        <option value="">브랜드 선택</option>
                        {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                    </select>
                </div>
                <input
                    value={form.title}
                    onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                    placeholder="혜택 제목"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold"
                />
                <textarea
                    value={form.description}
                    onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                    placeholder="대상, 기간, 횟수, 제외 조건"
                    className="h-20 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
                />
                {selectedProvider?.kind === 'SUBSCRIPTION' && (
                    <input
                        value={form.requiredSubscriptionProducts}
                        onChange={event => setForm(current => ({
                            ...current,
                            requiredSubscriptionProducts: event.target.value,
                        }))}
                        placeholder="필수 구독 상품명 (여러 개는 쉼표로 구분)"
                        className="w-full rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900"
                    />
                )}
                <div className="grid grid-cols-2 gap-2">
                    <select
                        value={form.actionType}
                        onChange={event => setForm(current => ({ ...current, actionType: event.target.value }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                    >
                        {Object.entries(actionLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                    <select
                        value={form.valueSemantics}
                        onChange={event => setForm(current => ({
                            ...current,
                            valueSemantics: event.target.value as PromotionValueSemantics,
                        }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                    >
                        {Object.entries(valueSemanticsLabels).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                    <input
                        type="number"
                        min="0"
                        value={form.actionValue}
                        onChange={event => setForm(current => ({ ...current, actionValue: event.target.value }))}
                        placeholder="할인율 또는 금액"
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="number"
                        min="0"
                        value={form.minSpend}
                        onChange={event => setForm(current => ({ ...current, minSpend: event.target.value }))}
                        placeholder="최소 결제금액"
                        className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold"
                    />
                    <select
                        value={form.channel}
                        onChange={event => setForm(current => ({ ...current, channel: event.target.value }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                    >
                        <option value="ALL">온·오프라인</option>
                        <option value="ONLINE">온라인</option>
                        <option value="OFFLINE">오프라인</option>
                        <option value="OFFICIAL_SITE">공식몰</option>
                    </select>
                </div>
                <select
                    value={form.scope}
                    onChange={event => setForm(current => ({
                        ...current,
                        scope: event.target.value as PromotionApplicabilityScope,
                    }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                >
                    {Object.entries(scopeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label} · {scopeDescriptions[value as PromotionApplicabilityScope]}</option>
                    ))}
                </select>
                <input
                    value={form.sourceUrl}
                    onChange={event => setForm(current => ({ ...current, sourceUrl: event.target.value }))}
                    placeholder="공식 근거 URL"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs"
                />
                <button
                    type="button"
                    onClick={create}
                    disabled={isSaving}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                    {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                    검수 큐에 추가
                </button>
            </div>
        </details>
    );
}

function RouteVerificationForm({
    brands,
    providers,
    onCreated,
}: {
    brands: AdminData['brands'];
    providers: PromotionProvider[];
    onCreated: () => Promise<void>;
}) {
    const addToast = useToastStore(state => state.addToast);
    const payProviders = providers.filter(provider =>
        provider.kind === 'PAY' || provider.kind === 'GOODDEAL'
    );
    const [form, setForm] = useState({
        brandId: '',
        payProviderId: '',
        cardCompany: '',
        channel: 'OFFLINE',
        cardBenefitEligible: true,
        certainty: 'CONFIRMED',
        evidenceUrl: 'https://',
    });
    const [isSaving, setIsSaving] = useState(false);

    const save = async () => {
        setIsSaving(true);
        try {
            await request({
                method: 'POST',
                body: JSON.stringify({ action: 'verification', verification: form }),
            });
            addToast('카드 혜택 결제 경로를 검증했습니다.', 'success');
            await onCreated();
        } catch (error) {
            addToast(getErrorMessage(error, '결제 경로 검증을 저장하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <details className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-gray-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                카드 승인 경로 검증
            </summary>
            <div className="mt-4 space-y-2">
                <select
                    value={form.brandId}
                    onChange={event => setForm(current => ({ ...current, brandId: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                >
                    <option value="">브랜드 선택</option>
                    {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                </select>
                <select
                    value={form.payProviderId}
                    onChange={event => setForm(current => ({ ...current, payProviderId: event.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                >
                    <option value="">직접 카드 결제</option>
                    {payProviders.map(provider => (
                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                    ))}
                </select>
                <input
                    value={form.cardCompany}
                    onChange={event => setForm(current => ({ ...current, cardCompany: event.target.value }))}
                    placeholder="카드사 (비우면 전체)"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold"
                />
                <div className="grid grid-cols-2 gap-2">
                    <select
                        value={form.channel}
                        onChange={event => setForm(current => ({ ...current, channel: event.target.value }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                    >
                        <option value="OFFLINE">오프라인</option>
                        <option value="ONLINE">온라인</option>
                        <option value="ALL">전체</option>
                    </select>
                    <select
                        value={form.certainty}
                        onChange={event => setForm(current => ({ ...current, certainty: event.target.value }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                    >
                        <option value="CONFIRMED">확정</option>
                        <option value="CONDITIONAL">조건부</option>
                        <option value="ESTIMATED">예상</option>
                    </select>
                </div>
                <label className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold">
                    카드 혜택 적용
                    <input
                        type="checkbox"
                        checked={form.cardBenefitEligible}
                        onChange={event => setForm(current => ({
                            ...current,
                            cardBenefitEligible: event.target.checked,
                        }))}
                        className="h-4 w-4 accent-emerald-600"
                    />
                </label>
                <input
                    value={form.evidenceUrl}
                    onChange={event => setForm(current => ({ ...current, evidenceUrl: event.target.value }))}
                    placeholder="근거 URL"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold"
                />
                <button
                    type="button"
                    onClick={save}
                    disabled={isSaving || !form.brandId || form.evidenceUrl === 'https://'}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-black text-white disabled:opacity-40"
                >
                    {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    검증 기록 저장
                </button>
            </div>
        </details>
    );
}

function CandidateCard({
    candidate,
    providerName,
    brandNames,
    brands,
    sourceDocuments,
    selected,
    onSelect,
    onComplete,
}: {
    candidate: Candidate;
    providerName: string;
    brandNames: Map<string, string>;
    brands: AdminData['brands'];
    sourceDocuments: SourceDocumentSummary[];
    selected: boolean;
    onSelect: (checked: boolean) => void;
    onComplete: () => Promise<void>;
}) {
    const addToast = useToastStore(state => state.addToast);
    const offer = asOffer(candidate);
    const risk = candidateRisk(candidate);
    const warnings = candidateWarnings(candidate);
    const fieldChanges = candidateFieldChanges(candidate);
    const semanticAnalysis = candidateSemanticAnalysis(candidate);
    const storedBlockingErrors = candidateBlockingErrors(candidate);
    const removalCandidate = candidate.diff.removedFromSource === true;
    const resolution = typeof candidate.diff.resolution === 'string'
        ? candidate.diff.resolution
        : undefined;
    const resolutionMessage = resolution
        ? candidateResolutionMessages[resolution]
        : undefined;
    const auditEvidence = [...new Map(
        (candidate.audit?.coverage ?? [])
            .flatMap(item => item.evidence)
            .map(reference => [
                `${reference.documentId}:${reference.quote}`,
                reference,
            ])
    ).values()];
    const [form, setForm] = useState({
        title: offer.title ?? candidate.sourceTitle,
        description: offer.description ?? '',
        brandId: offer.brandIds?.[0] ?? '',
        actionType: offer.action?.type ?? 'FLAT',
        actionValue: String(offer.action?.value ?? ''),
        valueSemantics: offer.action?.valueSemantics ?? 'EXACT' as PromotionValueSemantics,
        calculationMode: offer.condition?.calculationMode ?? (
            offer.action?.valueSemantics === 'UP_TO'
                ? 'INFORMATION_ONLY'
                : 'CALCULABLE'
        ) as PromotionCalculationMode,
        maxBenefit: String(offer.action?.maxBenefit ?? ''),
        minSpend: String(offer.condition?.minSpend ?? ''),
        requiredNote: offer.condition?.requiredNote ?? '',
        applicabilityScope: offer.condition?.applicabilityScope ?? 'UNKNOWN' as PromotionApplicabilityScope,
        eligibleItemSummary: offer.condition?.eligibleItemSummary ?? '',
        manualCheckRequired: Boolean(offer.condition?.manualCheckRequired),
    });
    const [isSaving, setIsSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [highRiskChangesAcknowledged, setHighRiskChangesAcknowledged] = useState(false);
    const buildReviewedParsedOffer = () => {
        const actionValue = Number(form.actionValue);
        const maxBenefit = form.maxBenefit ? Number(form.maxBenefit) : undefined;
        const minSpend = form.minSpend ? Number(form.minSpend) : undefined;
        const itemScoped = form.applicabilityScope === 'CATEGORY' ||
            form.applicabilityScope === 'PRODUCT_SET';
        const requiredInputs = [
            ...(offer.condition?.requiredInputs ?? []).filter(input =>
                input !== 'ELIGIBLE_ITEM_AMOUNT'
            ),
            ...(itemScoped ? ['ELIGIBLE_ITEM_AMOUNT'] : []),
        ];
        return {
            ...candidate.parsedOffer,
            title: form.title.trim(),
            description: form.description.trim(),
            brandIds: form.brandId ? [form.brandId] : offer.brandIds ?? [],
            certainty: form.calculationMode === 'CONDITIONAL'
                ? 'CONDITIONAL'
                : offer.certainty,
            action: {
                ...offer.action,
                type: form.actionType,
                value: actionValue,
                valueSemantics: form.valueSemantics,
                ...(maxBenefit ? { maxBenefit } : { maxBenefit: undefined }),
            },
            condition: {
                ...offer.condition,
                amountBasis: itemScoped
                    ? 'ELIGIBLE_ITEM_AMOUNT'
                    : offer.condition?.amountBasis === 'ELIGIBLE_ITEM_AMOUNT'
                        ? offer.layer === 'DISCOUNT' ? 'ORIGINAL_AMOUNT' : 'REMAINING_AMOUNT'
                        : offer.condition?.amountBasis,
                applicabilityScope: form.applicabilityScope,
                calculationMode: form.calculationMode,
                headlineEligible: form.applicabilityScope === 'STORE_WIDE' &&
                    form.calculationMode !== 'INFORMATION_ONLY',
                itemSpecific: itemScoped,
                requiredInputs,
                ...(form.eligibleItemSummary.trim()
                    ? { eligibleItemSummary: form.eligibleItemSummary.trim() }
                    : { eligibleItemSummary: undefined }),
                ...(minSpend ? { minSpend } : { minSpend: undefined }),
                confirmationRequired: form.calculationMode === 'CONDITIONAL',
                manualCheckRequired: form.manualCheckRequired ||
                    form.applicabilityScope === 'UNKNOWN',
                ...(form.requiredNote.trim()
                    ? { requiredNote: form.requiredNote.trim() }
                    : { requiredNote: undefined }),
            },
        };
    };
    const blockingErrors = unresolvedPromotionAuditErrors(
        storedBlockingErrors,
        buildReviewedParsedOffer(),
    );
    const hasBlockingErrors = blockingErrors.length > 0;
    const resolvedBlockingErrorCount = storedBlockingErrors.length - blockingErrors.length;
    const canAcknowledgeHighRiskChanges = !removalCandidate &&
        canAcknowledgePromotionAuditErrors(blockingErrors);
    const approvalBlocked = candidate.status === 'PENDING' && hasBlockingErrors &&
        !(canAcknowledgeHighRiskChanges && highRiskChangesAcknowledged);

    const previousRestrictedScope = fieldChanges.find(change => (
        change.path === 'condition.applicabilityScope' &&
        change.kind === 'CHANGED' &&
        (change.before === 'CATEGORY' || change.before === 'PRODUCT_SET') &&
        change.after !== 'CATEGORY' && change.after !== 'PRODUCT_SET'
    ))?.before as PromotionApplicabilityScope | undefined;
    const removedEligibleItemSummary = fieldChanges.find(change => (
        change.path === 'condition.eligibleItemSummary' && change.kind === 'REMOVED'
    ));
    const canApplyRestrictedFallback = candidate.status === 'PENDING' &&
        Boolean(previousRestrictedScope && removedEligibleItemSummary);

    const applyRestrictedFallback = () => {
        if (!previousRestrictedScope) return;
        setForm(current => ({
            ...current,
            applicabilityScope: previousRestrictedScope,
            eligibleItemSummary: UNKNOWN_ELIGIBLE_ITEM_SUMMARY,
            calculationMode: 'CONDITIONAL',
            manualCheckRequired: true,
            requiredNote: current.requiredNote.trim() ||
                '세부 대상 상품·서비스는 결제 전 공식 유의사항을 확인해야 합니다.',
        }));
        setHighRiskChangesAcknowledged(false);
        setIsEditing(true);
    };

    const update = async (status: 'APPROVED' | 'REJECTED') => {
        setIsSaving(true);
        try {
            const parsedOffer = status === 'APPROVED'
                ? buildReviewedParsedOffer()
                : undefined;
            await request({
                method: 'PATCH',
                body: JSON.stringify({
                    candidateId: candidate.id,
                    status,
                    ...(parsedOffer && { parsedOffer }),
                    ...(status === 'APPROVED' && highRiskChangesAcknowledged && {
                        acknowledgeHighRiskChanges: true,
                    }),
                }),
            });
            addToast(
                status === 'APPROVED'
                    ? '혜택을 게시했습니다.'
                    : removalCandidate
                        ? '삭제 감지를 오탐으로 처리하고 기존 혜택을 유지했습니다.'
                        : '후보를 반려했습니다.',
                'success',
            );
            await onComplete();
        } catch (error) {
            addToast(getErrorMessage(error, '검수 결과를 저장하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const confirmRemoval = async () => {
        const title = offer.title ?? candidate.sourceTitle;
        if (!window.confirm(
            `${title} 혜택이 공식 목록에서 사라진 것으로 확정하고 만료 처리할까요?`
        )) return;
        setIsSaving(true);
        try {
            await request({
                method: 'PATCH',
                body: JSON.stringify({
                    action: 'confirm-removal',
                    candidateId: candidate.id,
                }),
            });
            addToast('사라진 혜택을 만료 처리했습니다.', 'success');
            await onComplete();
        } catch (error) {
            addToast(getErrorMessage(error, '사라진 혜택을 만료하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const brandLabel = (offer.brandIds ?? [])
        .map(id => brandNames.get(id) ?? id)
        .join(', ') || '브랜드 확인 필요';

    return (
        <article className={`rounded-2xl border bg-white p-4 shadow-sm transition ${
            selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
        }`}>
            <div className="flex items-start gap-3">
                {candidate.status === 'PENDING' && (
                    <input
                        type="checkbox"
                        checked={selected}
                        disabled={storedBlockingErrors.length > 0}
                        onChange={event => onSelect(event.target.checked)}
                        aria-label={`${offer.title ?? candidate.sourceTitle} 선택`}
                        className="mt-1 h-4 w-4 shrink-0 accent-blue-600 disabled:opacity-30"
                    />
                )}
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[9px] font-black text-gray-600">
                            {providerName}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black ${
                            candidate.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800'
                                : candidate.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                        }`}>
                            {statusLabel[candidate.status]}
                        </span>
                        {hasBlockingErrors && (
                            <span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black text-rose-700">
                                {canAcknowledgeHighRiskChanges
                                    ? highRiskChangesAcknowledged ? '위험 변경 확인 완료' : '위험 변경 확인 필요'
                                    : '승인 차단'}
                            </span>
                        )}
                        {!hasBlockingErrors && resolvedBlockingErrorCount > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black text-emerald-700">
                                위험 변경 수정 완료
                            </span>
                        )}
                        {removalCandidate && (
                            <span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black text-rose-700">
                                공식 목록에서 사라짐
                            </span>
                        )}
                        {risk === 'CHANGED' && (
                            <span className="rounded-full bg-blue-100 px-2 py-1 text-[9px] font-black text-blue-700">변경 감지</span>
                        )}
                        {risk === 'COMPLEX' && (
                            <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black text-violet-700">조건 확인</span>
                        )}
                        {risk === 'ENCODING' && (
                            <span className="rounded-full bg-rose-100 px-2 py-1 text-[9px] font-black text-rose-700">문자 오류</span>
                        )}
                        <span className={`rounded-full px-2 py-1 text-[9px] font-black ${
                            form.applicabilityScope === 'STORE_WIDE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : form.applicabilityScope === 'CATEGORY' || form.applicabilityScope === 'PRODUCT_SET'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-gray-200 text-gray-700'
                        }`}>
                            {scopeLabels[form.applicabilityScope]}
                        </span>
                    </div>
                    <h3 className="mt-2 truncate text-sm font-black text-gray-950">
                        {offer.title ?? candidate.sourceTitle}
                    </h3>
                    <p className="mt-1 truncate text-[11px] font-bold text-gray-500">{brandLabel}</p>
                </div>
                <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-gray-100 p-2 text-gray-500 hover:text-blue-600"
                    aria-label="공식 원문 열기"
                >
                    <ExternalLink className="h-4 w-4" />
                </a>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[9px] font-black text-gray-400">혜택</p>
                    <p className="mt-0.5 text-[11px] font-black text-gray-800">{formatAction(offer)}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[9px] font-black text-gray-400">최소 결제</p>
                    <p className="mt-0.5 text-[11px] font-black text-gray-800">
                        {formatMoney(offer.condition?.minSpend)}
                    </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[9px] font-black text-gray-400">대표 계산</p>
                    <p className="mt-0.5 truncate text-[11px] font-black text-gray-800">
                        {form.applicabilityScope === 'STORE_WIDE' ? '포함' : '분리'}
                    </p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[9px] font-black text-gray-400">수집일</p>
                    <p className="mt-0.5 text-[11px] font-black text-gray-800">
                        {new Date(candidate.discoveredAt).toLocaleDateString('ko-KR')}
                    </p>
                </div>
            </div>

            {(warnings.length > 0 || offer.condition?.requiredNote) && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-violet-800">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {warnings[0] ?? offer.condition?.requiredNote}
                </div>
            )}

            {removalCandidate && candidate.status === 'PENDING' && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-rose-800">
                    기존 게시 혜택은 아직 유지 중입니다. 공식 원문에서 실제로 사라진 것을 확인했다면 만료하고, 수집 누락이면 오탐으로 처리하세요.
                </div>
            )}

            {resolutionMessage && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-gray-600">
                    {resolutionMessage}
                </div>
            )}

            {(candidate.audit || approvalBlocked) && (
                <div className={`mt-3 rounded-xl border px-3 py-3 ${
                    hasBlockingErrors
                        ? 'border-rose-200 bg-rose-50'
                        : 'border-emerald-200 bg-emerald-50'
                }`}>
                    <div className="flex flex-wrap items-center gap-2 text-[9px] font-black">
                        {candidate.audit ? (
                            <>
                                <span className={hasBlockingErrors ? 'text-rose-800' : 'text-emerald-800'}>
                                    공식 근거 {candidate.audit.summary.coveredFields}개
                                </span>
                                <span className="text-gray-400">
                                    누락 {candidate.audit.summary.missingFields}개
                                </span>
                                <span className="text-gray-400">
                                    고위험 변경 {candidate.audit.summary.highRiskChanges}개
                                </span>
                            </>
                        ) : (
                            <span className="text-rose-800">원문 감사 기록 없음</span>
                        )}
                        {candidate.sourceBundleHash && (
                            <code className="text-gray-400">
                                bundle {candidate.sourceBundleHash.slice(0, 8)}
                            </code>
                        )}
                    </div>
                    {blockingErrors.length > 0 && (
                        <ul className="mt-2 space-y-1.5 text-[10px] font-bold leading-relaxed text-rose-800">
                            {blockingErrors.slice(0, 5).map(error => (
                                <li key={error} className="flex gap-1.5">
                                    <span>•</span>
                                    <span>{formatPromotionAuditError(error)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {resolvedBlockingErrorCount > 0 && (
                        <p className="mt-2 text-[10px] font-bold leading-relaxed text-emerald-800">
                            수정한 최종값에서 제거 예정 필드 {resolvedBlockingErrorCount}개가 복원되어 해당 경고를 해소했습니다.
                        </p>
                    )}
                    {canApplyRestrictedFallback && hasBlockingErrors && (
                        <button
                            type="button"
                            onClick={applyRestrictedFallback}
                            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-[10px] font-black text-white"
                        >
                            상품 한정·조건부로 안전 보정
                        </button>
                    )}
                    {auditEvidence.length > 0 && (
                        <details className="mt-2 border-t border-current/10 pt-2">
                            <summary className="cursor-pointer text-[9px] font-black text-gray-600">
                                연결된 공식 근거 문장 {auditEvidence.length}개
                            </summary>
                            <ul className="mt-2 space-y-1.5">
                                {auditEvidence.slice(0, 5).map(reference => (
                                    <li key={`${reference.documentId}:${reference.quote}`}>
                                        <a
                                            href={reference.sourceUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="line-clamp-2 text-[9px] font-bold leading-relaxed text-blue-700"
                                        >
                                            “{reference.quote}”
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                    {sourceDocuments.length > 0 && (
                        <details className="mt-2 border-t border-current/10 pt-2">
                            <summary className="cursor-pointer text-[9px] font-black text-gray-600">
                                보존된 공식 원문 {sourceDocuments.length}개
                            </summary>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {sourceDocuments.slice(0, 12).map(document => (
                                    <a
                                        key={document.id}
                                        href={`/api/admin/promotions/source-documents/${encodeURIComponent(document.id)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[9px] font-black text-blue-700"
                                    >
                                        저장 원문 v{document.version}
                                        <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                ))}
                                {sourceDocuments.length > 12 && (
                                    <span className="rounded-full bg-white px-2 py-1 text-[9px] font-black text-gray-500">
                                        외 {sourceDocuments.length - 12}개
                                    </span>
                                )}
                            </div>
                        </details>
                    )}
                </div>
            )}

            {semanticAnalysis && (
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2 text-[9px] font-black text-blue-800">
                        <Sparkles className="h-3.5 w-3.5" />
                        {semanticAnalysis.provider === 'openai' ? 'OpenAI 분류' : '규칙 분류'}
                        <span className="text-blue-600/70">
                            신뢰도 {Math.round(semanticAnalysis.confidence * 100)}%
                        </span>
                    </div>
                    <p className="mt-1 text-[10px] font-bold leading-relaxed text-blue-900/75">
                        {semanticAnalysis.reasoningSummary}
                    </p>
                    {semanticAnalysis.evidenceQuotes?.[0] && (
                        <p className="mt-1 line-clamp-2 text-[9px] text-blue-800/60">
                            근거: “{semanticAnalysis.evidenceQuotes[0]}”
                        </p>
                    )}
                </div>
            )}

            {fieldChanges.length > 0 && (
                <details className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
                    <summary className="cursor-pointer text-[10px] font-black text-blue-800">
                        이전 수집본 대비 필드 변경 {fieldChanges.length}건
                    </summary>
                    <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
                        {fieldChanges.map((change, index) => (
                            <div
                                key={`${change.path}-${change.kind}-${index}`}
                                className="rounded-lg bg-white/80 px-2.5 py-2 text-[9px] leading-relaxed text-gray-700"
                            >
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className={`rounded-full px-1.5 py-0.5 font-black ${
                                        change.kind === 'REMOVED'
                                            ? 'bg-rose-100 text-rose-700'
                                            : change.kind === 'ADDED'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-blue-100 text-blue-700'
                                    }`}>
                                        {fieldChangeKindLabel[change.kind]}
                                    </span>
                                    <code className="break-all font-bold text-gray-800">{change.path}</code>
                                </div>
                                <p className="mt-1 break-words text-gray-500">
                                    {formatFieldChangeValue(change.before)} → {formatFieldChangeValue(change.after)}
                                </p>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            <div className="mt-3 border-t border-gray-100 pt-3">
                <button
                    type="button"
                    onClick={() => setIsEditing(current => !current)}
                    className="text-[10px] font-black text-blue-700"
                >
                    {isEditing ? '상세 닫기' : '상세 확인 및 수정'}
                </button>
                {isEditing && (
                <div className="mt-3 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                        <label className="text-[10px] font-black text-gray-500">
                            혜택 제목
                            <input
                                value={form.title}
                                onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                                disabled={candidate.status !== 'PENDING'}
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-900 disabled:bg-gray-50"
                            />
                        </label>
                        <label className="text-[10px] font-black text-gray-500">
                            브랜드
                            <select
                                value={form.brandId}
                                onChange={event => setForm(current => ({ ...current, brandId: event.target.value }))}
                                disabled={candidate.status !== 'PENDING'}
                                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold disabled:bg-gray-50"
                            >
                                {brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <label className="text-[10px] font-black text-gray-500">
                            적용 범위 (필수)
                            <select
                                value={form.applicabilityScope}
                                onChange={event => setForm(current => ({
                                    ...current,
                                    applicabilityScope: event.target.value as PromotionApplicabilityScope,
                                }))}
                                disabled={candidate.status !== 'PENDING'}
                                className={`mt-1 w-full rounded-xl border bg-white px-3 py-2 text-xs font-bold disabled:bg-gray-50 ${
                                    form.applicabilityScope === 'UNKNOWN'
                                        ? 'border-rose-300 text-rose-700'
                                        : 'border-gray-200 text-gray-900'
                                }`}
                            >
                                {Object.entries(scopeLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                            <span className="mt-1 block font-medium text-gray-400">
                                {scopeDescriptions[form.applicabilityScope]}
                            </span>
                        </label>
                        <label className="text-[10px] font-black text-gray-500">
                            대상 상품·카테고리 요약
                            <input
                                value={form.eligibleItemSummary}
                                onChange={event => setForm(current => ({
                                    ...current,
                                    eligibleItemSummary: event.target.value,
                                }))}
                                disabled={candidate.status !== 'PENDING' || !(
                                    form.applicabilityScope === 'CATEGORY' ||
                                    form.applicabilityScope === 'PRODUCT_SET'
                                )}
                                placeholder="예: 인기 맥주 번들 5종"
                                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold disabled:bg-gray-50"
                            />
                        </label>
                    </div>
                    <label className="block text-[10px] font-black text-gray-500">
                        조건 설명
                        <textarea
                            value={form.description}
                            onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                            disabled={candidate.status !== 'PENDING'}
                            className="mt-1 h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs leading-relaxed disabled:bg-gray-50"
                        />
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        <label className="text-[10px] font-black text-gray-500">
                            계산 방식
                            <select
                                value={form.actionType}
                                onChange={event => setForm(current => ({ ...current, actionType: event.target.value }))}
                                disabled={candidate.status !== 'PENDING'}
                                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs disabled:bg-gray-50"
                            >
                                {Object.entries(actionLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[10px] font-black text-gray-500">
                            값 의미
                            <select
                                value={form.valueSemantics}
                                onChange={event => setForm(current => ({
                                    ...current,
                                    valueSemantics: event.target.value as PromotionValueSemantics,
                                }))}
                                disabled={candidate.status !== 'PENDING'}
                                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-2 py-2 text-xs disabled:bg-gray-50"
                            >
                                {Object.entries(valueSemanticsLabels).map(([value, label]) => (
                                    <option key={value} value={value}>{label}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-[10px] font-black text-gray-500">
                            혜택 값
                            <input
                                type="number"
                                min="0"
                                value={form.actionValue}
                                onChange={event => setForm(current => ({ ...current, actionValue: event.target.value }))}
                                disabled={candidate.status !== 'PENDING'}
                                className="mt-1 w-full rounded-xl border border-gray-200 px-2 py-2 text-xs disabled:bg-gray-50"
                            />
                        </label>
                        <label className="text-[10px] font-black text-gray-500">
                            최대 혜택(원)
                            <input
                                type="number"
                                min="0"
                                value={form.maxBenefit}
                                onChange={event => setForm(current => ({ ...current, maxBenefit: event.target.value }))}
                                disabled={candidate.status !== 'PENDING'}
                                className="mt-1 w-full rounded-xl border border-gray-200 px-2 py-2 text-xs disabled:bg-gray-50"
                            />
                        </label>
                        <label className="text-[10px] font-black text-gray-500">
                            최소 결제(원)
                            <input
                                type="number"
                                min="0"
                                value={form.minSpend}
                                onChange={event => setForm(current => ({ ...current, minSpend: event.target.value }))}
                                disabled={candidate.status !== 'PENDING'}
                                className="mt-1 w-full rounded-xl border border-gray-200 px-2 py-2 text-xs disabled:bg-gray-50"
                            />
                        </label>
                    </div>
                    <label className="block text-[10px] font-black text-gray-500">
                        추천 계산 처리
                        <select
                            value={form.calculationMode}
                            onChange={event => setForm(current => ({
                                ...current,
                                calculationMode: event.target.value as PromotionCalculationMode,
                            }))}
                            disabled={candidate.status !== 'PENDING'}
                            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold disabled:bg-gray-50"
                        >
                            {Object.entries(calculationModeLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block text-[10px] font-black text-gray-500">
                        검수 메모
                        <input
                            value={form.requiredNote}
                            onChange={event => setForm(current => ({ ...current, requiredNote: event.target.value }))}
                            disabled={candidate.status !== 'PENDING'}
                            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-xs disabled:bg-gray-50"
                        />
                    </label>
                    <label className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-[10px] font-black text-gray-600">
                        추가 관리자 확인 필요
                        <input
                            type="checkbox"
                            checked={form.manualCheckRequired}
                            onChange={event => setForm(current => ({
                                ...current,
                                manualCheckRequired: event.target.checked,
                            }))}
                            disabled={candidate.status !== 'PENDING'}
                            className="h-4 w-4 accent-violet-600"
                        />
                    </label>
                    <details className="rounded-xl bg-gray-50 p-3">
                        <summary className="cursor-pointer text-[10px] font-black text-gray-600">공식 원문 미리보기</summary>
                        <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-gray-500">
                            {hasBrokenEncoding(candidate.rawContent)
                                ? '문자 인코딩이 손상된 기존 수집본입니다.'
                                : candidate.rawContent}
                        </p>
                    </details>
                </div>
                )}
            </div>

            {candidate.status === 'PENDING' && canAcknowledgeHighRiskChanges && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-900">
                    <input
                        type="checkbox"
                        checked={highRiskChangesAcknowledged}
                        onChange={event => setHighRiskChangesAcknowledged(event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                    />
                    <span>기존 혜택에서 제거되는 고위험 조건과 현재 수정값을 확인했으며, 이 내용으로 게시합니다.</span>
                </label>
            )}

            {candidate.status === 'PENDING' && (
                <div className="mt-3 flex justify-end gap-2 border-t border-gray-100 pt-3">
                    {removalCandidate ? (
                        <>
                            <button
                                type="button"
                                onClick={() => update('REJECTED')}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 rounded-xl bg-gray-100 px-4 py-2 text-[11px] font-black text-gray-700 disabled:opacity-50"
                            >
                                <XCircle className="h-4 w-4" />
                                오탐·혜택 유지
                            </button>
                            <button
                                type="button"
                                onClick={confirmRemoval}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50"
                            >
                                {isSaving
                                    ? <LoaderCircle className="h-4 w-4 animate-spin" />
                                    : <CheckCircle2 className="h-4 w-4" />}
                                사라짐 확정·만료
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => update('REJECTED')}
                                disabled={isSaving}
                                className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-4 py-2 text-[11px] font-black text-rose-700 disabled:opacity-50"
                            >
                                <XCircle className="h-4 w-4" />
                                반려
                            </button>
                            <button
                                type="button"
                                onClick={() => update('APPROVED')}
                                disabled={isSaving || form.applicabilityScope === 'UNKNOWN' || approvalBlocked}
                                title={approvalBlocked
                                    ? blockingErrors[0]
                                    : form.applicabilityScope === 'UNKNOWN'
                                        ? '적용 범위를 먼저 선택해주세요.'
                                        : undefined}
                                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[11px] font-black text-white disabled:opacity-50"
                            >
                                {isSaving
                                    ? <LoaderCircle className="h-4 w-4 animate-spin" />
                                    : <CheckCircle2 className="h-4 w-4" />}
                                확인 후 게시
                            </button>
                        </>
                    )}
                </div>
            )}
        </article>
    );
}

export function PromotionAdminClient() {
    const addToast = useToastStore(state => state.addToast);
    const [data, setData] = useState<AdminData>();
    const [isLoading, setIsLoading] = useState(true);
    const [isCollecting, setIsCollecting] = useState(false);
    const [collectionResults, setCollectionResults] = useState<CollectionResult[]>([]);
    const [statusFilter, setStatusFilter] = useState<'ALL' | Candidate['status']>('PENDING');
    const [providerFilter, setProviderFilter] = useState('ALL');
    const [riskFilter, setRiskFilter] = useState<RiskFilter>('ALL');
    const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkSaving, setIsBulkSaving] = useState(false);
    const [promotionSearch, setPromotionSearch] = useState('');

    const providerNames = useMemo(
        () => new Map(data?.providers.map(provider => [provider.id, provider.name]) ?? []),
        [data]
    );
    const brandNames = useMemo(
        () => new Map(data?.brands.map(brand => [brand.id, brand.name]) ?? []),
        [data]
    );
    const statusCounts = useMemo(() => ({
        ALL: data?.candidates.length ?? 0,
        PENDING: data?.candidates.filter(candidate => candidate.status === 'PENDING').length ?? 0,
        APPROVED: data?.candidates.filter(candidate => candidate.status === 'APPROVED').length ?? 0,
        REJECTED: data?.candidates.filter(candidate => candidate.status === 'REJECTED').length ?? 0,
    }), [data]);

    const filteredCandidates = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('ko-KR');
        return (data?.candidates ?? [])
            .filter(candidate => statusFilter === 'ALL' || candidate.status === statusFilter)
            .filter(candidate => providerFilter === 'ALL' || candidate.providerId === providerFilter)
            .filter(candidate => riskFilter === 'ALL' || candidateRisk(candidate) === riskFilter)
            .filter(candidate => scopeFilter === 'ALL' || candidateScope(candidate) === scopeFilter)
            .filter(candidate => {
                if (!term) return true;
                const offer = asOffer(candidate);
                const brands = (offer.brandIds ?? []).map(id => brandNames.get(id) ?? id).join(' ');
                return [
                    offer.title,
                    offer.description,
                    candidate.sourceTitle,
                    providerNames.get(candidate.providerId),
                    brands,
                    scopeLabels[candidateScope(candidate)],
                ].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR').includes(term);
            })
            .sort((a, b) => {
                const score = (candidate: Candidate) => {
                    const risk = candidateRisk(candidate);
                    if (risk === 'BLOCKED') return 4;
                    if (risk === 'ENCODING') return 3;
                    if (risk === 'CHANGED') return 2;
                    if (risk === 'COMPLEX') return 1;
                    return 0;
                };
                return score(b) - score(a) ||
                    new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
            });
    }, [brandNames, data, providerFilter, providerNames, riskFilter, scopeFilter, search, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredCandidates.length / PAGE_SIZE));
    const pagedCandidates = filteredCandidates.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const pendingChanged = data?.candidates.filter(candidate =>
        candidate.status === 'PENDING' && candidate.diff.changed === true
    ).length ?? 0;
    const pendingUnscoped = data?.candidates.filter(candidate =>
        candidate.status === 'PENDING' && candidateScope(candidate) === 'UNKNOWN'
    ).length ?? 0;
    const publishedCount = data?.promotions.filter(promotion => promotion.status === 'PUBLISHED').length ?? 0;

    const filteredPromotions = useMemo(() => {
        const term = promotionSearch.trim().toLocaleLowerCase('ko-KR');
        return (data?.promotions ?? []).filter(promotion => {
            if (!term) return true;
            return [
                promotion.title,
                promotion.description,
                providerNames.get(promotion.providerId),
                promotion.brandIds.map(id => brandNames.get(id) ?? id).join(' '),
            ].join(' ').toLocaleLowerCase('ko-KR').includes(term);
        });
    }, [brandNames, data, promotionSearch, providerNames]);

    const load = async () => {
        setIsLoading(true);
        try {
            setData(await request<AdminData>({ cache: 'no-store' }));
        } catch (error) {
            addToast(getErrorMessage(error, '프로모션 관리 데이터를 불러오지 못했습니다.'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // The initial admin load should run once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setPage(1);
        setSelectedIds(new Set());
    }, [providerFilter, riskFilter, scopeFilter, search, statusFilter]);

    const collect = async () => {
        setIsCollecting(true);
        try {
            const result = await request<{ results: CollectionResult[] }>({
                method: 'POST',
                body: JSON.stringify({ action: 'collect' }),
            });
            setCollectionResults(result.results);
            const discovered = result.results.reduce((sum, item) => sum + item.discovered, 0);
            const published = result.results.reduce((sum, item) => sum + item.published, 0);
            const reviewRequired = result.results.reduce((sum, item) => sum + item.reviewRequired, 0);
            const failed = result.results.filter(item => item.status === 'failed').length;
            addToast(
                `신규 ${discovered}건 · 자동 게시 ${published}건` +
                `${reviewRequired ? ` · 검수 ${reviewRequired}건` : ''}` +
                `${failed ? ` · 실패 ${failed}곳` : ''}`,
                failed ? 'error' : 'success'
            );
            await load();
        } catch (error) {
            addToast(getErrorMessage(error, '공식 페이지를 수집하지 못했습니다.'), 'error');
        } finally {
            setIsCollecting(false);
        }
    };

    const bulkUpdate = async (status: 'APPROVED' | 'REJECTED') => {
        if (selectedIds.size === 0) return;
        if (status === 'APPROVED' && (data?.candidates ?? []).some(candidate =>
            selectedIds.has(candidate.id) && candidateScope(candidate) === 'UNKNOWN'
        )) {
            addToast('범위 미확정 후보는 적용 범위를 선택한 뒤 게시해주세요.', 'error');
            return;
        }
        if (status === 'APPROVED' && (data?.candidates ?? []).some(candidate =>
            selectedIds.has(candidate.id) && candidateBlockingErrors(candidate).length > 0
        )) {
            addToast('공식 근거 또는 삭제 검증 오류가 있는 후보는 일괄 게시할 수 없습니다.', 'error');
            return;
        }
        setIsBulkSaving(true);
        try {
            const result = await request<{
                reviewed: string[];
                failed: Array<{ id: string; message: string }>;
            }>({
                method: 'PATCH',
                body: JSON.stringify({ candidateIds: [...selectedIds], status }),
            });
            addToast(
                `${result.reviewed.length}건을 ${status === 'APPROVED' ? '게시' : '반려'}했습니다.` +
                `${result.failed.length ? ` 실패 ${result.failed.length}건` : ''}`,
                result.failed.length ? 'error' : 'success'
            );
            setSelectedIds(new Set());
            await load();
        } catch (error) {
            addToast(getErrorMessage(error, '일괄 검수에 실패했습니다.'), 'error');
        } finally {
            setIsBulkSaving(false);
        }
    };

    const updatePromotionStatus = async (
        promotionId: string,
        status: 'PUBLISHED' | 'PAUSED'
    ) => {
        try {
            await request({
                method: 'PATCH',
                body: JSON.stringify({ promotionId, status }),
            });
            await load();
        } catch (error) {
            addToast(getErrorMessage(error, '혜택 상태를 바꾸지 못했습니다.'), 'error');
        }
    };

    const selectablePageIds = pagedCandidates
        .filter(candidate => (
            candidate.status === 'PENDING' && candidateBlockingErrors(candidate).length === 0
        ))
        .map(candidate => candidate.id);
    const allPageSelected = selectablePageIds.length > 0 &&
        selectablePageIds.every(id => selectedIds.has(id));
    const selectedHasUnknown = (data?.candidates ?? []).some(candidate =>
        selectedIds.has(candidate.id) && candidateScope(candidate) === 'UNKNOWN'
    );
    const selectedHasBlocked = (data?.candidates ?? []).some(candidate =>
        selectedIds.has(candidate.id) && candidateBlockingErrors(candidate).length > 0
    );

    return (
        <main className="min-h-screen bg-gray-50 pb-24">
            <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-5 py-3 backdrop-blur">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <Link href="/" className="rounded-xl bg-gray-100 p-2 text-gray-600">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <div className="min-w-0">
                            <h1 className="truncate text-lg font-black text-gray-950">혜택 운영센터</h1>
                            <p className="hidden text-[10px] font-bold text-gray-400 sm:block">
                                확인이 필요한 혜택만 빠르게 검수하세요
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Link
                            href="/admin/card-benefits"
                            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-black text-gray-700"
                        >
                            카드 혜택
                        </Link>
                        <button
                            type="button"
                            onClick={collect}
                            disabled={isCollecting}
                            className="flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                        >
                            {isCollecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
                            {isCollecting ? '수집 중' : '지금 수집'}
                        </button>
                    </div>
                </div>
            </header>

            <div className="mx-auto max-w-7xl px-5 pt-6">
                <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <SummaryCard
                        label="오늘의 일"
                        value={statusCounts.PENDING}
                        description="검수 대기 혜택"
                        tone="amber"
                    />
                    <SummaryCard
                        label="범위 확인"
                        value={pendingUnscoped}
                        description={`${pendingChanged}건은 기존 혜택 변경`}
                        tone="blue"
                    />
                    <SummaryCard
                        label="서비스 중"
                        value={publishedCount}
                        description="현재 게시 혜택"
                        tone="emerald"
                    />
                    <SummaryCard
                        label="데이터 범위"
                        value={data?.brands.length ?? 0}
                        description="검색 가능 브랜드"
                        tone="violet"
                    />
                </section>

                {collectionResults.length > 0 && (
                    <details className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                        <summary className="cursor-pointer text-xs font-black text-gray-800">
                            마지막 수집 결과 · {collectionResults.filter(item => item.status === 'failed').length}곳 실패
                        </summary>
                        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            {collectionResults.map(result => (
                                <div key={result.sourceId} className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <a
                                            href={result.sourceUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="truncate text-[11px] font-black text-gray-800 hover:text-blue-600"
                                        >
                                            {result.label}
                                        </a>
                                        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${
                                            result.status === 'failed'
                                                ? 'bg-rose-100 text-rose-700'
                                                : result.status === 'skipped'
                                                    ? 'bg-gray-200 text-gray-600'
                                                    : 'bg-emerald-100 text-emerald-700'
                                        }`}>
                                            {result.status === 'failed' ? '실패' : result.status === 'skipped' ? '제외' : '정상'}
                                        </span>
                                    </div>
                                    <p className="mt-1 text-[10px] text-gray-500">
                                        신규 {result.discovered} · 게시 {result.published} · 검수 {result.reviewRequired} · 만료 {result.expired}
                                    </p>
                                    {result.message && <p className="mt-1 text-[10px] text-amber-700">{result.message}</p>}
                                </div>
                            ))}
                        </div>
                    </details>
                )}

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <section className="min-w-0">
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="flex items-center gap-2 text-sm font-black text-gray-950">
                                        <Layers3 className="h-4 w-4 text-blue-600" />
                                        검수 큐
                                    </h2>
                                    <p className="mt-1 text-[10px] font-bold text-gray-400">
                                        변경·복합 조건이 위에 먼저 표시됩니다.
                                    </p>
                                </div>
                                <div className="flex rounded-xl bg-gray-100 p-1">
                                    {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(status => (
                                        <button
                                            type="button"
                                            key={status}
                                            onClick={() => setStatusFilter(status)}
                                            className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${
                                                statusFilter === status ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-400'
                                            }`}
                                        >
                                            {status === 'ALL' ? '전체' : statusLabel[status]} {statusCounts[status]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_150px_150px_150px]">
                                <label className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                    <input
                                        value={search}
                                        onChange={event => setSearch(event.target.value)}
                                        placeholder="브랜드, 제목, 조건 검색"
                                        className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-400"
                                    />
                                </label>
                                <select
                                    value={providerFilter}
                                    onChange={event => setProviderFilter(event.target.value)}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                                >
                                    <option value="ALL">전체 제공자</option>
                                    {data?.providers.map(provider => (
                                        <option key={provider.id} value={provider.id}>{provider.name}</option>
                                    ))}
                                </select>
                                <select
                                    value={riskFilter}
                                    onChange={event => setRiskFilter(event.target.value as RiskFilter)}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                                >
                                    <option value="ALL">전체 유형</option>
                                    <option value="BLOCKED">승인 차단</option>
                                    <option value="CHANGED">변경 감지</option>
                                    <option value="COMPLEX">조건 확인</option>
                                    <option value="ENCODING">문자 오류</option>
                                </select>
                                <select
                                    value={scopeFilter}
                                    onChange={event => setScopeFilter(event.target.value as ScopeFilter)}
                                    className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold"
                                >
                                    <option value="ALL">전체 적용 범위</option>
                                    {Object.entries(scopeLabels).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            {selectablePageIds.length > 0 && (
                                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-3 py-2">
                                    <label className="flex items-center gap-2 text-[10px] font-black text-blue-900">
                                        <input
                                            type="checkbox"
                                            checked={allPageSelected}
                                            onChange={event => {
                                                setSelectedIds(current => {
                                                    const next = new Set(current);
                                                    selectablePageIds.forEach(id => {
                                                        if (event.target.checked) next.add(id);
                                                        else next.delete(id);
                                                    });
                                                    return next;
                                                });
                                            }}
                                            className="h-4 w-4 accent-blue-600"
                                        />
                                        현재 페이지 선택
                                    </label>
                                    <span className="text-[10px] font-bold text-blue-700">
                                        {filteredCandidates.length}건 결과 · {selectedIds.size}건 선택
                                    </span>
                                </div>
                            )}
                        </div>

                        {isLoading ? (
                            <div className="flex justify-center py-24">
                                <LoaderCircle className="h-7 w-7 animate-spin text-blue-600" />
                            </div>
                        ) : pagedCandidates.length > 0 ? (
                            <div className="mt-3 space-y-3">
                                {pagedCandidates.map(candidate => (
                                    <CandidateCard
                                        key={candidate.id}
                                        candidate={candidate}
                                        providerName={providerNames.get(candidate.providerId) ?? candidate.providerId}
                                        brandNames={brandNames}
                                        brands={data?.brands ?? []}
                                        sourceDocuments={
                                            data?.sourceBundles[candidate.sourceBundleHash] ?? []
                                        }
                                        selected={selectedIds.has(candidate.id)}
                                        onSelect={checked => setSelectedIds(current => {
                                            const next = new Set(current);
                                            if (checked) next.add(candidate.id);
                                            else next.delete(candidate.id);
                                            return next;
                                        })}
                                        onComplete={load}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white py-20 text-center">
                                <RefreshCw className="mx-auto h-6 w-6 text-gray-300" />
                                <p className="mt-3 text-xs font-black text-gray-500">검색 결과가 없습니다</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch('');
                                        setProviderFilter('ALL');
                                        setRiskFilter('ALL');
                                        setScopeFilter('ALL');
                                    }}
                                    className="mt-2 text-[10px] font-black text-blue-600"
                                >
                                    필터 초기화
                                </button>
                            </div>
                        )}

                        {totalPages > 1 && (
                            <div className="mt-4 flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setPage(current => Math.max(1, current - 1))}
                                    disabled={page === 1}
                                    className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 disabled:opacity-30"
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </button>
                                <span className="text-[11px] font-black text-gray-600">{page} / {totalPages}</span>
                                <button
                                    type="button"
                                    onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                                    disabled={page === totalPages}
                                    className="rounded-xl border border-gray-200 bg-white p-2 text-gray-600 disabled:opacity-30"
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </section>

                    <aside className="space-y-4">
                        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                            <h2 className="flex items-center gap-2 text-xs font-black text-blue-950">
                                <Sparkles className="h-4 w-4" />
                                빠른 검수 순서
                            </h2>
                            <ol className="mt-3 space-y-2 text-[10px] font-bold leading-relaxed text-blue-900/70">
                                <li>1. 범위 미확정 항목을 매장 전체·상품·고객 한정으로 나눕니다.</li>
                                <li>2. AI/규칙 분류의 근거 문장이 원문과 맞는지 확인합니다.</li>
                                <li>3. 범위가 확정된 같은 유형만 선택해 일괄 처리합니다.</li>
                            </ol>
                        </section>

                        <details className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" open>
                            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-black text-gray-950">
                                <span className="flex items-center gap-2">
                                    <Store className="h-4 w-4 text-emerald-600" />
                                    게시 혜택
                                </span>
                                <span className="text-[10px] text-gray-400">{filteredPromotions.length}건</span>
                            </summary>
                            <label className="relative mt-3 block">
                                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                                <input
                                    value={promotionSearch}
                                    onChange={event => setPromotionSearch(event.target.value)}
                                    placeholder="게시 혜택 검색"
                                    className="w-full rounded-xl border border-gray-200 py-2 pl-8 pr-3 text-[11px]"
                                />
                            </label>
                            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                                {filteredPromotions.slice(0, 50).map(promotion => (
                                    <div key={promotion.id} className="rounded-xl border border-gray-100 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-black text-gray-400">
                                                    {providerNames.get(promotion.providerId)} · {
                                                        scopeLabels[promotion.condition.applicabilityScope ?? 'UNKNOWN']
                                                    }
                                                </p>
                                                <p className="mt-1 line-clamp-2 text-[11px] font-black text-gray-900">
                                                    {promotion.title}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updatePromotionStatus(
                                                    promotion.id,
                                                    promotion.status === 'PUBLISHED' ? 'PAUSED' : 'PUBLISHED'
                                                )}
                                                disabled={promotion.status !== 'PUBLISHED' &&
                                                    (!promotion.condition.applicabilityScope ||
                                                        promotion.condition.applicabilityScope === 'UNKNOWN')}
                                                className={`shrink-0 rounded-lg p-1.5 ${
                                                    promotion.status === 'PUBLISHED'
                                                        ? 'bg-emerald-50 text-emerald-600'
                                                        : 'bg-gray-100 text-gray-500'
                                                } disabled:cursor-not-allowed disabled:opacity-30`}
                                                aria-label={promotion.status === 'PUBLISHED'
                                                    ? '게시 중지'
                                                    : !promotion.condition.applicabilityScope ||
                                                        promotion.condition.applicabilityScope === 'UNKNOWN'
                                                        ? '범위 재검수 필요'
                                                        : '다시 게시'}
                                            >
                                                {promotion.status === 'PUBLISHED'
                                                    ? <PauseCircle className="h-3.5 w-3.5" />
                                                    : <PlayCircle className="h-3.5 w-3.5" />}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {filteredPromotions.length > 50 && (
                                <p className="mt-2 text-center text-[9px] font-bold text-gray-400">
                                    검색을 사용하면 나머지 {filteredPromotions.length - 50}건도 찾을 수 있습니다.
                                </p>
                            )}
                        </details>

                        <ManualCandidateForm
                            brands={data?.brands ?? []}
                            providers={data?.providers ?? []}
                            onCreated={load}
                        />
                        <RouteVerificationForm
                            brands={data?.brands ?? []}
                            providers={data?.providers ?? []}
                            onCreated={load}
                        />
                    </aside>
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="fixed inset-x-0 bottom-5 z-30 mx-auto flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-3 rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-white shadow-2xl">
                    <div>
                        <p className="text-xs font-black">{selectedIds.size}건 선택됨</p>
                        <p className="text-[9px] font-bold text-gray-400">
                            {selectedHasBlocked
                                ? '공식 근거·삭제 검증 오류가 있는 항목은 게시할 수 없습니다.'
                                : selectedHasUnknown
                                    ? '범위 미확정 항목은 일괄 게시할 수 없습니다.'
                                : '적용 범위와 같은 근거인지 확인 후 처리하세요.'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => bulkUpdate('REJECTED')}
                            disabled={isBulkSaving}
                            className="rounded-xl bg-white/10 px-3 py-2 text-[10px] font-black text-rose-200 disabled:opacity-50"
                        >
                            일괄 반려
                        </button>
                        <button
                            type="button"
                            onClick={() => bulkUpdate('APPROVED')}
                            disabled={isBulkSaving || selectedHasUnknown || selectedHasBlocked}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-[10px] font-black text-white disabled:opacity-50"
                        >
                            {isBulkSaving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
                            일괄 게시
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
