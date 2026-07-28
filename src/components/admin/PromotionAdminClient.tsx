'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    AlertCircle,
    ArrowLeft,
    CheckCircle2,
    DatabaseZap,
    ExternalLink,
    FileDiff,
    LoaderCircle,
    PauseCircle,
    PlusCircle,
    PlayCircle,
    RefreshCw,
    XCircle,
} from 'lucide-react';
import type { PromotionOffer, PromotionProvider } from '@/types';
import { getErrorMessage } from '@/lib/api-client';
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
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    linkedPromotionId?: string;
    discoveredAt: string;
    reviewedAt?: string;
};

type AdminData = {
    providers: PromotionProvider[];
    promotions: PromotionOffer[];
    candidates: Candidate[];
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

const hasBrokenEncoding = (value: unknown) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
    return text.includes('\uFFFD') || text.includes('ï¿½');
};

const manualOfferTemplate = {
    providerId: 'kakaopay',
    layer: 'PAY',
    title: '직접 확인한 행사',
    description: '',
    brandIds: [],
    categoryIds: [],
    channels: ['ALL'],
    startsAt: '',
    endsAt: '',
    action: { type: 'FLAT', value: 0 },
    condition: {
        amountBasis: 'REMAINING_AMOUNT',
        manualCheckRequired: true,
        requiredNote: '결제 화면에서 최종 확인',
    },
    compatibility: {
        requiredPayProviderIds: ['kakaopay'],
        allowedFundingTypes: ['CARD', 'MONEY', 'POINTS'],
    },
    limitConfig: {},
    certainty: 'CONDITIONAL',
    sourceUrl: 'https://',
};

function ManualCandidateForm({ onCreated }: { onCreated: () => Promise<void> }) {
    const addToast = useToastStore(state => state.addToast);
    const [json, setJson] = useState(() => JSON.stringify(manualOfferTemplate, null, 2));
    const [isSaving, setIsSaving] = useState(false);

    const create = async () => {
        setIsSaving(true);
        try {
            await request({
                method: 'POST',
                body: JSON.stringify({
                    action: 'manual',
                    offer: JSON.parse(json),
                    rawContent: '카카오페이 또는 굿딜 앱에서 관리자가 직접 확인',
                }),
            });
            addToast('수동 검수 후보를 추가했습니다.', 'success');
            await onCreated();
        } catch (error) {
            addToast(getErrorMessage(error, '수동 후보를 추가하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <details className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-gray-900">
                <PlusCircle className="h-4 w-4 text-blue-600" />
                앱 전용 행사 직접 등록
            </summary>
            <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
                카카오페이·굿딜 앱에서 확인한 내용을 후보로 넣습니다. 저장 후에도 승인 단계가 필요합니다.
            </p>
            <textarea
                value={json}
                onChange={event => setJson(event.target.value)}
                spellCheck={false}
                className="mt-3 h-72 w-full rounded-2xl border border-gray-200 bg-gray-950 p-3 font-mono text-[10px] leading-relaxed text-emerald-200 outline-none"
            />
            <button
                type="button"
                onClick={create}
                disabled={isSaving}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-xs font-black text-white disabled:opacity-50"
            >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
                검수 후보로 저장
            </button>
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
        <details className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-black text-gray-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                카드 승인 경로 검증
            </summary>
            <p className="mt-3 text-[10px] leading-relaxed text-gray-500">
                실결제 명세나 카드사 근거를 확인한 경로만 확정 혜택으로 올립니다.
            </p>
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

function CandidateEditor({
    candidate,
    providerName,
    onComplete,
}: {
    candidate: Candidate;
    providerName: string;
    onComplete: () => Promise<void>;
}) {
    const addToast = useToastStore(state => state.addToast);
    const encodingBroken = hasBrokenEncoding(candidate.rawContent) ||
        hasBrokenEncoding(candidate.parsedOffer) ||
        hasBrokenEncoding(candidate.sourceTitle);
    const displayTitle = hasBrokenEncoding(candidate.sourceTitle)
        ? `${providerName} 공식 페이지 수집본`
        : candidate.sourceTitle;
    const [json, setJson] = useState(() => JSON.stringify({
        ...candidate.parsedOffer,
        ...(hasBrokenEncoding(candidate.parsedOffer.title) && {
            title: `${providerName} 공식 혜택`,
        }),
    }, null, 2));
    const [isSaving, setIsSaving] = useState(false);

    const update = async (status: 'APPROVED' | 'REJECTED') => {
        setIsSaving(true);
        try {
            const parsedOffer = status === 'APPROVED' ? JSON.parse(json) : undefined;
            await request({
                method: 'PATCH',
                body: JSON.stringify({
                    candidateId: candidate.id,
                    status,
                    ...(parsedOffer && { parsedOffer }),
                }),
            });
            addToast(status === 'APPROVED' ? '프로모션을 게시했습니다.' : '후보를 반려했습니다.', 'success');
            await onComplete();
        } catch (error) {
            addToast(getErrorMessage(error, '검수 결과를 저장하지 못했습니다.'), 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <article className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-black text-gray-600">
                            {providerName}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                            candidate.status === 'PENDING'
                                ? 'bg-amber-100 text-amber-800'
                                : candidate.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-rose-100 text-rose-800'
                        }`}>
                            {statusLabel[candidate.status]}
                        </span>
                    </div>
                    <h2 className="mt-2 text-sm font-black text-gray-900">{displayTitle}</h2>
                    <p className="mt-1 text-[10px] text-gray-400">
                        {new Date(candidate.discoveredAt).toLocaleString('ko-KR')}
                    </p>
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

            {Boolean(candidate.diff.changed) && (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-[10px] font-bold text-blue-700">
                    <FileDiff className="h-4 w-4" />
                    이전 수집본과 내용이 달라졌습니다. 승인본은 자동으로 바뀌지 않습니다.
                </div>
            )}

            {encodingBroken && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold leading-relaxed text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    이전 수집본의 문자 인코딩이 깨졌습니다. 공식 페이지를 다시 수집하면 교정된 새 후보로 교체됩니다.
                </div>
            )}

            <details className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3">
                <summary className="cursor-pointer text-[10px] font-black text-gray-600">원문 미리보기</summary>
                <p className="mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap text-[10px] leading-relaxed text-gray-500">
                    {encodingBroken
                        ? '이 기존 원문은 문자 인코딩이 손상되어 숨겼습니다. 다시 수집한 후보를 사용해주세요.'
                        : candidate.rawContent.slice(0, 5000)}
                </p>
            </details>

            <label className="mt-4 block text-[10px] font-black text-gray-500">
                파싱 결과 · 승인 전 수정 가능
            </label>
            <textarea
                value={json}
                onChange={event => setJson(event.target.value)}
                spellCheck={false}
                disabled={candidate.status !== 'PENDING'}
                className="mt-2 h-80 w-full rounded-2xl border border-gray-200 bg-gray-950 p-4 font-mono text-[11px] leading-relaxed text-emerald-200 outline-none focus:border-blue-500 disabled:opacity-60"
            />

            {candidate.status === 'PENDING' && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() => update('REJECTED')}
                        disabled={isSaving}
                        className="flex items-center justify-center gap-2 rounded-xl bg-rose-50 py-3 text-xs font-black text-rose-700 disabled:opacity-50"
                    >
                        <XCircle className="h-4 w-4" />
                        반려
                    </button>
                    <button
                        type="button"
                        onClick={() => update('APPROVED')}
                        disabled={isSaving}
                        className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-xs font-black text-white disabled:opacity-50"
                    >
                        {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        검수 후 게시
                    </button>
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
    const [statusFilter, setStatusFilter] = useState<'ALL' | Candidate['status']>('PENDING');
    const providerNames = useMemo(
        () => new Map(data?.providers.map(provider => [provider.id, provider.name]) ?? []),
        [data]
    );
    const filteredCandidates = useMemo(
        () => data?.candidates.filter(candidate =>
            statusFilter === 'ALL' || candidate.status === statusFilter
        ) ?? [],
        [data, statusFilter]
    );

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

    const collect = async () => {
        setIsCollecting(true);
        try {
            const result = await request<{
                results: Array<{ status: string; sourceUrl: string }>;
            }>({
                method: 'POST',
                body: JSON.stringify({ action: 'collect' }),
            });
            const created = result.results.filter(item => item.status === 'created').length;
            const failed = result.results.filter(item => item.status === 'failed').length;
            addToast(`새 후보 ${created}건 수집${failed ? ` · 실패 ${failed}건` : ''}`, failed ? 'error' : 'success');
            await load();
        } catch (error) {
            addToast(getErrorMessage(error, '공식 페이지를 수집하지 못했습니다.'), 'error');
        } finally {
            setIsCollecting(false);
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
            addToast(getErrorMessage(error, '프로모션 상태를 바꾸지 못했습니다.'), 'error');
        }
    };

    return (
        <main className="min-h-screen bg-gray-50 pb-20">
            <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-6 py-4 backdrop-blur">
                <div className="mx-auto flex max-w-5xl items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="rounded-xl bg-gray-100 p-2 text-gray-600">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                        <div>
                            <h1 className="text-lg font-black text-gray-900">프로모션 검수센터</h1>
                            <p className="text-[10px] font-bold text-gray-400">공식 출처 → 후보 → 관리자 승인 → 추천 반영</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={collect}
                        disabled={isCollecting}
                        className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                    >
                        {isCollecting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
                        {isCollecting ? '수집 중' : '공식 페이지 수집'}
                    </button>
                </div>
            </header>

            <div className="mx-auto grid max-w-5xl gap-8 px-5 pt-6 lg:grid-cols-[1fr_300px]">
                <section>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-sm font-black text-gray-900">수집 후보</h2>
                            <p className="text-[10px] text-gray-500">원문과 계산 조건을 확인한 뒤에만 게시하세요.</p>
                        </div>
                        <div className="flex rounded-xl bg-gray-100 p-1">
                            {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map(status => (
                                <button
                                    type="button"
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${
                                        statusFilter === status ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
                                    }`}
                                >
                                    {status === 'ALL' ? '전체' : statusLabel[status]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <LoaderCircle className="h-6 w-6 animate-spin text-blue-600" />
                        </div>
                    ) : filteredCandidates.length > 0 ? (
                        <div className="space-y-5">
                            {filteredCandidates.map(candidate => (
                                <CandidateEditor
                                    key={candidate.id}
                                    candidate={candidate}
                                    providerName={providerNames.get(candidate.providerId) ?? candidate.providerId}
                                    onComplete={load}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-dashed border-gray-300 bg-white py-16 text-center">
                            <RefreshCw className="mx-auto h-6 w-6 text-gray-300" />
                            <p className="mt-3 text-xs font-black text-gray-500">해당 상태의 후보가 없습니다</p>
                        </div>
                    )}
                </section>

                <aside className="space-y-5">
                    <ManualCandidateForm onCreated={load} />
                    <RouteVerificationForm
                        brands={data?.brands ?? []}
                        providers={data?.providers ?? []}
                        onCreated={load}
                    />

                    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                        <h2 className="text-sm font-black text-gray-900">게시 중 혜택</h2>
                        <div className="mt-4 space-y-3">
                            {data?.promotions.length ? data.promotions.map(promotion => (
                                <div key={promotion.id} className="rounded-2xl border border-gray-100 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400">
                                                {providerNames.get(promotion.providerId)}
                                            </p>
                                            <p className="mt-1 text-xs font-black text-gray-900">{promotion.title}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updatePromotionStatus(
                                                promotion.id,
                                                promotion.status === 'PUBLISHED' ? 'PAUSED' : 'PUBLISHED'
                                            )}
                                            className={`rounded-lg p-1.5 ${
                                                promotion.status === 'PUBLISHED'
                                                    ? 'bg-emerald-50 text-emerald-600'
                                                    : 'bg-gray-100 text-gray-500'
                                            }`}
                                            aria-label={promotion.status === 'PUBLISHED' ? '게시 중지' : '다시 게시'}
                                        >
                                            {promotion.status === 'PUBLISHED'
                                                ? <PauseCircle className="h-4 w-4" />
                                                : <PlayCircle className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <p className="py-6 text-center text-[11px] font-bold text-gray-400">게시된 혜택이 없습니다</p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                        <h2 className="flex items-center gap-2 text-xs font-black text-amber-900">
                            <AlertCircle className="h-4 w-4" />
                            운영 원칙
                        </h2>
                        <ul className="mt-3 space-y-2 text-[10px] leading-relaxed text-amber-900/70">
                            <li>• 로그인이나 앱 전용 화면은 자동 수집하지 않습니다.</li>
                            <li>• 새 수집본은 기존 승인본을 덮어쓰지 않습니다.</li>
                            <li>• 선착순·개인별 혜택은 조건부로 게시합니다.</li>
                            <li>• 카드 중복 여부가 불명확하면 예상으로 표시합니다.</li>
                        </ul>
                    </section>
                </aside>
            </div>
        </main>
    );
}
