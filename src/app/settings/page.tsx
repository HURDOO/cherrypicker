'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import {
    Database, RefreshCw, CreditCard, ChevronRight,
    PieChart, Settings2, Trash2, LogOut, CheckCircle2, AlertCircle,
    Download, Upload,
} from 'lucide-react';
import CardDetailModal from '@/components/settings/CardDetailModal';
import MasterDataModal from '@/components/settings/MasterDataModal';
import clsx from 'clsx';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';
import { useAuth } from '@/hooks/useAuth';
import {
    formatPerformanceMonthLabel,
    getCurrentMonthInKst,
    getPreviousMonthInKst,
} from '@/lib/monthly-performance';
import { BenefitProfileSettings } from '@/components/settings/BenefitProfileSettings';
import { BrandDiscoverySettings } from '@/components/settings/BrandDiscoverySettings';
import { AccountWorkspaceSync } from '@/components/settings/AccountWorkspaceSync';

export default function SettingsPage() {
    const {
        userId,
        storageMode,
        cards,
        rules,
        performances,
        history,
        isLoading,
        updatePerformance,
    } = useAppStore();
    const { addToast } = useToastStore();
    const { user, signOut } = useAuth();
    const router = useRouter();
    const [isSeeding, setIsSeeding] = useState(false);
    const [confirmStep, setConfirmStep] = useState(false);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [performanceDrafts, setPerformanceDrafts] = useState<Record<string, string>>({});
    const [savingPerformanceCards, setSavingPerformanceCards] = useState<Record<string, boolean>>({});
    const [performancePeriod] = useState(() => {
        const referenceDate = new Date();
        return {
            performanceMonth: getPreviousMonthInKst(referenceDate),
            benefitMonth: getCurrentMonthInKst(referenceDate),
        };
    });
    const performanceRequestVersions = useRef<Record<string, number>>({});
    const importInputRef = useRef<HTMLInputElement>(null);
    const performanceMonthLabel = formatPerformanceMonthLabel(performancePeriod.performanceMonth);
    const benefitMonthLabel = formatPerformanceMonthLabel(performancePeriod.benefitMonth);

    const currentPerformances = useMemo(
        () => performances.filter(
            performance => performance.performanceMonth === performancePeriod.performanceMonth
        ),
        [performances, performancePeriod.performanceMonth]
    );

    const performanceCards = useMemo(
        () => cards.filter(card => card.limitTable.some(tier => tier.threshold > 0)
            || rules.some(rule => rule.cardId === card.id && (rule.condition?.minPerformance || 0) > 0)),
        [cards, rules]
    );

    const managedPerformanceCards = useMemo(() => {
        const activeCardIds = new Set([
            ...performances.map(performance => performance.cardId),
            ...history.map(transaction => transaction.cardId),
        ]);
        return performanceCards.filter(card => activeCardIds.has(card.id));
    }, [performanceCards, performances, history]);

    const completedPerformanceCount = useMemo(() => {
        const completedCardIds = new Set(currentPerformances.map(performance => performance.cardId));
        return managedPerformanceCards.filter(card => completedCardIds.has(card.id)).length;
    }, [currentPerformances, managedPerformanceCards]);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await signOut();
            router.replace('/');
            router.refresh();
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '로그아웃하지 못했습니다.'), 'error');
            setIsSigningOut(false);
        }
    };

    const handleSeedData = async () => {
        if (!confirmStep) {
            setConfirmStep(true);
            setTimeout(() => setConfirmStep(false), 3000); // 3초 후 자동 취소
            return;
        }

        setIsSeeding(true);
        setConfirmStep(false);
        try {
            if (storageMode === 'guest') await localWorkspaceClient.resetPersonalData();
            else await apiClient.resetAccountData();
            addToast('개인 데이터 초기화 완료! 새로고침합니다.', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '개인 데이터를 초기화하지 못했습니다.'), 'error');
        } finally {
            setIsSeeding(false);
        }
    };

    const handleUpdatePerformance = async (cardId: string, value: number) => {
        const requestVersion = (performanceRequestVersions.current[cardId] || 0) + 1;
        performanceRequestVersions.current[cardId] = requestVersion;
        setSavingPerformanceCards(current => ({ ...current, [cardId]: true }));

        try {
            const performance = storageMode === 'guest'
                ? await localWorkspaceClient.updatePerformance(
                    cardId,
                    value,
                    performancePeriod.performanceMonth
                )
                : await apiClient.updatePerformance(
                    cardId,
                    value,
                    performancePeriod.performanceMonth
                );
            if (performanceRequestVersions.current[cardId] !== requestVersion) return;
            updatePerformance(performance);
            setPerformanceDrafts(current => {
                const next = { ...current };
                delete next[cardId];
                return next;
            });
            addToast(`${performanceMonthLabel} 실적을 저장했습니다.`, 'success');
        } catch (error: unknown) {
            if (performanceRequestVersions.current[cardId] !== requestVersion) return;
            addToast(getErrorMessage(error, '전월 실적을 저장하지 못했습니다.'), 'error');
        } finally {
            if (performanceRequestVersions.current[cardId] === requestVersion) {
                setSavingPerformanceCards(current => ({ ...current, [cardId]: false }));
            }
        }
    };

    const handleExport = async () => {
        try {
            const json = await localWorkspaceClient.exportJson();
            const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `cherrypicker-workspace-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
            addToast('기기 데이터를 JSON으로 내보냈습니다.', 'success');
        } catch (error) {
            addToast(getErrorMessage(error, '기기 데이터를 내보내지 못했습니다.'), 'error');
        }
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            addToast('가져올 파일은 5MB 이하여야 합니다.', 'error');
            return;
        }
        if (!window.confirm('현재 이 기기의 개인 데이터를 가져온 파일로 교체할까요?')) return;

        try {
            await localWorkspaceClient.importJson(await file.text());
            addToast('기기 데이터를 가져왔습니다. 새로고침합니다.', 'success');
            window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            addToast(getErrorMessage(error, '기기 데이터를 가져오지 못했습니다.'), 'error');
        }
    };

    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [isCardModalOpen, setIsCardModalOpen] = useState(false);
    const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);

    // Dynamic Imports or simple imports if Next.js handles it well.
    // Assuming we imported them at the top.

    // ... existing handles ...

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <RefreshCw className="h-7 w-7 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-gray-50 pb-32 font-sans selection:bg-blue-100">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md px-6 py-5 sticky top-0 z-20 border-b border-gray-100 flex items-center justify-between">
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-gray-700" />
                    설정
                </h1>
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                </div>
            </header>

            <div className="px-5 pt-6 space-y-8 max-w-lg mx-auto">

                <BenefitProfileSettings />

                <BrandDiscoverySettings userId={userId} />

                {/* 1. Performance Tuning */}
                <section id="performance" className="scroll-mt-24">
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <PieChart className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">{performanceMonthLabel} 실적 입력</h2>
                            <p className="text-[10px] text-gray-500">
                                {benefitMonthLabel} 혜택 계산에 사용할 카드별 실적입니다.
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                        {performanceCards.length > 0 && (
                            <div className="flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3 text-xs">
                                <span className="font-bold text-blue-900">관리 중 카드 입력 현황</span>
                                <span className="font-black text-blue-700">
                                    {managedPerformanceCards.length > 0
                                        ? `${completedPerformanceCount}/${managedPerformanceCards.length}개 완료`
                                        : '관리 중 카드 없음'}
                                </span>
                            </div>
                        )}

                        {performanceCards.map(card => {
                            const storedPerformance = currentPerformances.find(
                                performance => performance.cardId === card.id
                            );
                            const hasDraft = Object.prototype.hasOwnProperty.call(performanceDrafts, card.id);
                            const draft = performanceDrafts[card.id];
                            const inputValue = hasDraft
                                ? draft
                                : (storedPerformance ? String(storedPerformance.amount) : '');
                            const draftAmount = inputValue === '' ? null : Number(inputValue);
                            const hasChangedValue = hasDraft
                                && draftAmount !== null
                                && (!storedPerformance || storedPerformance.amount !== draftAmount);
                            const displayAmount = draftAmount ?? storedPerformance?.amount ?? 0;
                            const percentage = Math.min(100, (displayAmount / 1000000) * 100);
                            const isSaving = Boolean(savingPerformanceCards[card.id]);

                            return (
                                <div key={card.id} className="group">
                                    <div className="mb-3 flex items-start justify-between gap-3">
                                        <div>
                                            <span className="font-bold text-sm text-gray-800 block mb-0.5">{card.name}</span>
                                            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{card.company}</span>
                                        </div>
                                        <span className={clsx(
                                            'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black',
                                            storedPerformance
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-amber-50 text-amber-700'
                                        )}>
                                            {storedPerformance
                                                ? <CheckCircle2 className="h-3 w-3" />
                                                : <AlertCircle className="h-3 w-3" />}
                                            {storedPerformance ? '입력 완료' : '미입력'}
                                        </span>
                                    </div>

                                    <div className="mb-3 flex items-end gap-2">
                                        <div className="flex min-w-0 flex-1 items-end gap-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-blue-400 focus-within:bg-white">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={inputValue}
                                                placeholder="실적 금액"
                                                aria-label={`${card.name} ${performanceMonthLabel} 실적`}
                                                disabled={isSaving}
                                                onChange={(e) => {
                                                    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 12);
                                                    setPerformanceDrafts(current => ({
                                                        ...current,
                                                        [card.id]: value,
                                                    }));
                                                }}
                                                className="block min-w-0 flex-1 bg-transparent text-right text-lg font-black tracking-tight text-blue-600 outline-none placeholder:text-sm placeholder:font-bold placeholder:text-gray-300 disabled:cursor-wait disabled:opacity-60"
                                            />
                                            <span className="mb-1 text-xs font-bold text-gray-400">원</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => draftAmount !== null && handleUpdatePerformance(card.id, draftAmount)}
                                            disabled={!hasChangedValue || isSaving}
                                            className="rounded-xl bg-blue-600 px-3 py-3 text-xs font-black text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                                        >
                                            {isSaving ? '저장 중' : '저장'}
                                        </button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleUpdatePerformance(card.id, 0)}
                                        disabled={isSaving || (storedPerformance?.amount === 0 && !hasDraft)}
                                        className="mb-3 text-[10px] font-bold text-gray-400 underline decoration-gray-200 underline-offset-4 transition-colors hover:text-blue-600 disabled:cursor-default disabled:text-emerald-600 disabled:no-underline"
                                    >
                                        {storedPerformance?.amount === 0 && !hasDraft
                                            ? '0원 입력 완료'
                                            : '사용 실적 없음 (0원으로 저장)'}
                                    </button>

                                    <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 ease-out"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>

                                    <div className="flex justify-between mt-1.5 text-[10px] text-gray-400 font-medium">
                                        <span>0원</span>
                                        <span>50만</span>
                                        <span>100만원+</span>
                                    </div>
                                </div>
                            );
                        })}
                        {performanceCards.length === 0 && (
                            <div className="text-center py-8">
                                <p className="text-gray-400 text-xs">실적 조건이 필요한 카드가 없습니다.</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* 2. Data Management (Added Master Data Button) */}
                <section>
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                            <Database className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">데이터 관리</h2>
                            <p className="text-[10px] text-gray-500">개인 데이터와 사용자 항목을 관리합니다.</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-3xl p-1 shadow-sm border border-gray-100 overflow-hidden">
                            <button
                                onClick={() => setIsMasterDataOpen(true)}
                                className="w-full p-4 text-left hover:bg-gray-50 transition-colors group h-full flex flex-col justify-center"
                            >
                                <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors mb-2">
                                    <Settings2 className="w-4 h-4" />
                                </div>
                                <span className="font-bold text-sm text-gray-800">마스터 데이터</span>
                                <span className="text-[10px] text-gray-400 mt-0.5">브랜드/카테고리 관리</span>
                            </button>
                        </div>

                        <div className="bg-white rounded-3xl p-1 shadow-sm border border-gray-100 overflow-hidden">
                            <button
                                onClick={handleSeedData}
                                disabled={isSeeding}
                                className={clsx(
                                    "w-full p-4 text-left transition-all h-full flex flex-col justify-center relative overflow-hidden",
                                    confirmStep ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"
                                )}
                            >
                                <div className={clsx(
                                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors mb-2",
                                    confirmStep ? "bg-red-100 text-red-500" : "bg-gray-100 text-gray-500"
                                )}>
                                    {isSeeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </div>
                                <span className={clsx("font-bold text-sm", confirmStep ? "text-red-700" : "text-gray-800")}>
                                    {isSeeding ? '삭제 중...' : confirmStep ? '정말 삭제?' : '개인 데이터 삭제'}
                                </span>
                                <span className="text-[10px] text-gray-400 mt-0.5">
                                    {confirmStep ? '클릭하여 확정' : '기록/실적/내 항목 삭제'}
                                </span>
                            </button>
                        </div>
                    </div>
                    {storageMode === 'guest' && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => void handleExport()}
                                className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-xs font-bold text-gray-600 hover:bg-gray-50"
                            >
                                <Download className="h-4 w-4" />
                                JSON 내보내기
                            </button>
                            <button
                                type="button"
                                onClick={() => importInputRef.current?.click()}
                                className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-xs font-bold text-gray-600 hover:bg-gray-50"
                            >
                                <Upload className="h-4 w-4" />
                                JSON 가져오기
                            </button>
                            <input
                                ref={importInputRef}
                                type="file"
                                accept="application/json,.json"
                                onChange={event => void handleImport(event)}
                                className="hidden"
                            />
                        </div>
                    )}
                </section>

                {/* 3. Card List View (Editable) */}
                <section>
                    <div className="flex items-center justify-between mb-4 px-1">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                                <CreditCard className="w-4 h-4" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-gray-900">등록된 카드 목록</h2>
                                <p className="text-[10px] text-gray-500">직접 추가한 카드를 선택해 수정할 수 있습니다.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedCardId(null);
                                setIsCardModalOpen(true);
                            }}
                            className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-md hover:bg-gray-800 transition-colors flex items-center gap-1"
                        >
                            + 카드 추가
                        </button>
                    </div>

                    <div className="space-y-3">
                        {cards.map((card, idx) => (
                            <button
                                key={card.id}
                                disabled={!card.userId}
                                onClick={() => {
                                    if (!card.userId) return;
                                    setSelectedCardId(card.id);
                                    setIsCardModalOpen(true);
                                }}
                                className={clsx(
                                    'w-full bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group transition-all duration-300 text-left',
                                    card.userId
                                        ? 'hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5'
                                        : 'cursor-default opacity-75'
                                )}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-8 text-center font-bold text-gray-300 text-xs italic">
                                        {(idx + 1).toString().padStart(2, '0')}
                                    </div>
                                    <div className="w-px h-8 bg-gray-100" />
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{card.name}</p>
                                        <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                            {card.company}
                                            {!card.userId && (
                                                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">기본 카드</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                {card.userId && (
                                    <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                        <ChevronRight className="w-4 h-4" />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </section>

                {user && <AccountWorkspaceSync />}

                {!user ? (
                    <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-emerald-900">이 기기에 저장 중</p>
                                <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">
                                    로그인 없이 사용할 수 있어요. 브라우저 데이터를 지우기 전까지 이 기기에 보관됩니다.
                                </p>
                                <p className="mt-1 text-[10px] leading-relaxed text-emerald-600">
                                    로그인해도 이 데이터는 그대로 유지되며, 계정 백업과 새 기기 복원을 선택할 수 있어요.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => router.push('/login')}
                                className="shrink-0 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-800"
                            >
                                로그인
                            </button>
                        </div>
                    </section>
                ) : (
                    <section className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">
                                    {user?.name || '내 계정'}
                                </p>
                                <p className="text-[11px] text-gray-400 truncate">{user?.email}</p>
                                <p className="mt-1 text-[10px] text-blue-600">
                                    이 기기의 로컬 데이터로 사용 중
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={handleSignOut}
                                disabled={isSigningOut}
                                className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
                            >
                                <LogOut className="h-4 w-4" />
                                {isSigningOut ? '로그아웃 중' : '로그아웃'}
                            </button>
                        </div>
                    </section>
                )}

                <div className="flex justify-center py-6">
                    <p className="text-[10px] text-gray-300 font-mono">Cherry Picker v0.2.0 • Powered by Gemini 3 Pro</p>
                </div>

            </div>

            {/* Modals */}
            <CardDetailModal
                isOpen={isCardModalOpen}
                onClose={() => setIsCardModalOpen(false)}
                initialCard={selectedCardId ? cards.find(c => c.id === selectedCardId) : null}
            />
            <MasterDataModal
                isOpen={isMasterDataOpen}
                onClose={() => setIsMasterDataOpen(false)}
            />

        </main>
    );
}
