'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { calculateBestCards } from '@/utils/calculation';
import { IconByName } from '@/components/ui/IconByName';
import {
    CheckCircle2, AlertCircle, PieChart,
    Wallet, Search, Wifi, WifiOff, X, ClipboardList, ChevronDown, ChevronUp
} from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';
import { useToastStore } from '@/store/useToastStore';
import { NumericKeypad } from '@/components/ui/NumericKeypad';
import { MonthlyPerformanceReminder } from '@/components/performance/MonthlyPerformanceReminder';
import { CalculatedCard, UserCardPerformance } from '@/types';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import {
    formatPerformanceMonthLabel,
    getCurrentMonthInKst,
    getPreviousMonthInKst,
} from '@/lib/monthly-performance';

const formatWon = (value: number) => `${value.toLocaleString()}원`;

const getPlatformLabel = (platformType?: string) => {
    if (platformType === 'ONLINE') return '온라인 결제';
    if (platformType === 'OFFLINE') return '현장 결제';
    if (platformType === 'OFFICIAL_SITE') return '공식 홈페이지';
    return '온/오프라인 공통';
};

const getActionLabel = (card: CalculatedCard) => {
    const action = card.matchedRule?.action;
    if (!action) return '계산할 혜택 없음';
    if (action.type === 'PERCENT') {
        return `${action.value}% 할인${action.maxDiscount ? ` · 건당 최대 ${formatWon(action.maxDiscount)}` : ''}`;
    }
    if (action.type === 'FLAT') return `${formatWon(action.value)} 정액 할인`;
    return `${formatWon(action.value)} 고정가 적용`;
};

const getConditionLabel = (card: CalculatedCard) => {
    const condition = card.matchedRule?.condition;
    const minSpend = condition?.minSpend ? `최소 ${formatWon(condition.minSpend)}` : '최소 금액 없음';
    const minPerformance = condition?.minPerformance ? `실적 ${formatWon(condition.minPerformance)} 이상` : '별도 실적 조건 없음';
    return `${minSpend} · ${minPerformance}`;
};

const getLimitLabel = (card: CalculatedCard) => {
    if (!card.limitTable || card.limitTable.length === 0) return '통합 한도 없음';
    if (card.monthlyMaxLimit <= 0) return `통합 한도 0원 · 사용 ${formatWon(card.usedDiscount)}`;
    return `잔여 ${formatWon(card.remainingLimit)} / ${formatWon(card.monthlyMaxLimit)} · 사용 ${formatWon(card.usedDiscount)}`;
};

const getUsageLabels = (card: CalculatedCard) => {
    const rule = card.matchedRule;
    const usage = rule?.usage;
    if (!rule || !usage) return [];

    const labels: string[] = [];
    if (rule.limitConfig.dailyCount) labels.push(`오늘 ${usage.dailyCount}/${rule.limitConfig.dailyCount}회`);
    if (rule.limitConfig.monthlyCount) labels.push(`이번 달 ${usage.monthlyCount}/${rule.limitConfig.monthlyCount}회`);
    if (rule.limitConfig.yearlyCount) labels.push(`올해 ${usage.yearlyCount}/${rule.limitConfig.yearlyCount}회`);
    if (rule.limitConfig.monthlyAmount) {
        labels.push(`월 혜택 ${formatWon(usage.monthlyAmount)} / ${formatWon(rule.limitConfig.monthlyAmount)}`);
    }
    return labels;
};

function RecommendationExplainer({
    amount,
    cards,
    performances,
    isOnline,
    isOpen,
    onToggle
}: {
    amount: number;
    cards: CalculatedCard[];
    performances: UserCardPerformance[];
    isOnline: boolean;
    isOpen: boolean;
    onToggle: () => void;
}) {
    const bestCard = cards[0];
    if (!bestCard) return null;

    return (
        <section className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full p-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <ClipboardList className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-gray-900">추천 근거</h2>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {bestCard.calculatedDiscount > 0
                                ? `${bestCard.name}이 ${formatWon(bestCard.calculatedDiscount)}으로 가장 큽니다.`
                                : '적용 가능한 혜택이 없는 이유를 확인해요.'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 shrink-0">
                    {isOpen ? '접기' : '보기'}
                    {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
            </button>

            {isOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                    <div className="grid grid-cols-3 gap-2 pt-4">
                        <div className="bg-gray-50 rounded-2xl p-3">
                            <p className="text-[10px] font-bold text-gray-400">금액</p>
                            <p className="text-xs font-black text-gray-900 mt-1">{formatWon(amount)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-3">
                            <p className="text-[10px] font-bold text-gray-400">채널</p>
                            <p className="text-xs font-black text-gray-900 mt-1">{isOnline ? '온라인' : '오프라인'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-2xl p-3">
                            <p className="text-[10px] font-bold text-gray-400">비교</p>
                            <p className="text-xs font-black text-gray-900 mt-1">{cards.length}개 카드</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {cards.map((card, index) => {
                            const performance = performances.find(item => item.cardId === card.id)?.amount || 0;
                            const usageLabels = getUsageLabels(card);
                            const gapFromBest = Math.max(0, bestCard.calculatedDiscount - card.calculatedDiscount);

                            return (
                                <article
                                    key={card.id}
                                    className={clsx(
                                        "rounded-3xl border p-4 transition-colors",
                                        index === 0 ? "border-blue-100 bg-blue-50/50" : "border-gray-100 bg-white"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={clsx(
                                                    "text-[10px] font-black px-2 py-0.5 rounded-full",
                                                    index === 0 ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"
                                                )}>
                                                    #{index + 1}
                                                </span>
                                                <h3 className="font-black text-sm text-gray-900 truncate">{card.name}</h3>
                                            </div>
                                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                                {card.matchedRule?.description || '매칭된 혜택 없음'}
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className={clsx("text-lg font-black", card.calculatedDiscount > 0 ? "text-blue-600" : "text-gray-300")}>
                                                {formatWon(card.calculatedDiscount)}
                                            </p>
                                            <p className="text-[10px] font-bold text-gray-400">
                                                {index === 0 ? '현재 1위' : `${formatWon(gapFromBest)} 차이`}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-3 grid grid-cols-1 gap-2 text-[11px]">
                                        <div className="flex justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                                            <span className="font-bold text-gray-400 shrink-0">판정</span>
                                            <span className={clsx("font-bold text-right", card.calculatedDiscount > 0 ? "text-gray-800" : "text-orange-500")}>
                                                {card.calculatedDiscount > 0 ? (card.reason || '혜택 적용 가능') : (card.reason || '혜택 없음')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                                            <span className="font-bold text-gray-400 shrink-0">계산식</span>
                                            <span className="font-bold text-gray-800 text-right">{getActionLabel(card)}</span>
                                        </div>
                                        <div className="flex justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                                            <span className="font-bold text-gray-400 shrink-0">조건</span>
                                            <span className="font-bold text-gray-800 text-right">{getConditionLabel(card)}</span>
                                        </div>
                                        <div className="flex justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                                            <span className="font-bold text-gray-400 shrink-0">채널</span>
                                            <span className="font-bold text-gray-800 text-right">{getPlatformLabel(card.matchedRule?.platformType)}</span>
                                        </div>
                                        <div className="flex justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                                            <span className="font-bold text-gray-400 shrink-0">실적/한도</span>
                                            <span className="font-bold text-gray-800 text-right">
                                                실적 {formatWon(performance)} · {getLimitLabel(card)}
                                            </span>
                                        </div>
                                        {usageLabels.length > 0 && (
                                            <div className="flex justify-between gap-3 rounded-2xl bg-white/70 px-3 py-2">
                                                <span className="font-bold text-gray-400 shrink-0">사용량</span>
                                                <span className="font-bold text-gray-800 text-right">{usageLabels.join(' · ')}</span>
                                            </div>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}

export default function HomePage() {
    const {
        categories, brands, cards, rules, history, performances,
        isLoading,
        selectedBrandId, setSelectedBrandId, addTransaction
    } = useAppStore();

    // Local UI State
    const [amount, setAmount] = useState<number>(0);
    const [isOnline, setIsOnline] = useState<boolean>(false);
    const [confirmCardId, setConfirmCardId] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const recordRequestInFlight = useRef(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isExplanationOpen, setIsExplanationOpen] = useState(false);
    const [performancePeriod] = useState(() => {
        const referenceDate = new Date();
        return {
            performanceMonth: getPreviousMonthInKst(referenceDate),
            benefitMonth: getCurrentMonthInKst(referenceDate),
        };
    });

    const { addToast } = useToastStore();
    const performanceMonthLabel = formatPerformanceMonthLabel(performancePeriod.performanceMonth);
    const benefitMonthLabel = formatPerformanceMonthLabel(performancePeriod.benefitMonth);

    // Keypad Handlers
    const handleKeypadChange = (value: string) => {
        setAmount(prev => {
            const currentString = prev.toString();
            // If current value is 0, replace it unless input is 0 or 00
            if (prev === 0) {
                if (value === '0' || value === '00') return 0;
                return Number(value);
            }
            if (currentString.length >= 9) return prev; // Max length check
            return Number(currentString + value);
        });
    };

    const handleKeypadDelete = () => {
        setAmount(prev => {
            const currentString = prev.toString();
            if (currentString.length <= 1) return 0;
            return Number(currentString.slice(0, -1));
        });
    };

    // Derived Data
    const currentBrand = useMemo(() =>
        brands.find(b => b.id === selectedBrandId),
        [brands, selectedBrandId]);

    const filteredBrands = useMemo(() => {
        if (!searchQuery.trim()) return brands;
        const query = searchQuery.trim().toLowerCase();
        return brands.filter(b => b.name.toLowerCase().includes(query));
    }, [brands, searchQuery]);

    const brandsByCategory = useMemo(() => {
        const grouped: Record<string, typeof brands> = {};
        categories.forEach(cat => {
            const catBrands = filteredBrands.filter(b => b.categoryId === cat.id);
            if (catBrands.length > 0) {
                grouped[cat.id] = catBrands;
            }
        });
        return grouped;
    }, [categories, filteredBrands]);

    const currentPerformances = useMemo(
        () => performances.filter(
            performance => performance.performanceMonth === performancePeriod.performanceMonth
        ),
        [performances, performancePeriod.performanceMonth]
    );

    const missingPerformanceCards = useMemo(() => {
        const activeCardIds = new Set([
            ...performances.map(performance => performance.cardId),
            ...history.map(transaction => transaction.cardId),
        ]);
        const enteredCardIds = new Set(currentPerformances.map(performance => performance.cardId));

        return cards.filter(card => {
            const hasPerformanceCondition = card.limitTable.some(tier => tier.threshold > 0)
                || rules.some(rule => rule.cardId === card.id && (rule.condition?.minPerformance || 0) > 0);

            return hasPerformanceCondition
                && activeCardIds.has(card.id)
                && !enteredCardIds.has(card.id);
        });
    }, [cards, rules, history, performances, currentPerformances]);

    // Main Logic Calculation
    const calculatedCards = useMemo(() => {
        if (!currentBrand) return [];
        return calculateBestCards(
            amount,
            currentBrand,
            cards,
            rules,
            history,
            currentPerformances,
            isOnline
        );
    }, [amount, currentBrand, cards, rules, history, currentPerformances, isOnline]);

    const bestCard = calculatedCards[0];

    const handleRecordTransaction = async (card: typeof bestCard) => {
        if (!currentBrand || !card) return;

        if (amount <= 0) {
            addToast('결제 금액을 먼저 입력해주세요.', 'error');
            return;
        }

        if (recordRequestInFlight.current) return;

        // Double Tap Confirmation
        if (confirmCardId !== card.id) {
            setConfirmCardId(card.id);
            setTimeout(() => setConfirmCardId(null), 3000); // 3초 후 초기화
            return;
        }

        setConfirmCardId(null);
        recordRequestInFlight.current = true;
        setIsRecording(true);

        try {
            const transaction = await apiClient.createTransaction({
                brandId: currentBrand.id,
                cardId: card.id,
                amount,
                isOnline,
            });
            addTransaction(transaction);
            addToast('기록되었습니다.', 'success');
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '기록을 저장하지 못했습니다.'), 'error');
        } finally {
            recordRequestInFlight.current = false;
            setIsRecording(false);
        }
    };

    // Loading & Empty States
    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm font-medium text-gray-500">데이터를 불러오는 중입니다...</p>
                </div>
            </div>
        );
    }

    if (cards.length === 0 || brands.length === 0) {
        return (
            <div className="flex flex-col h-screen items-center justify-center p-8 text-center bg-gray-50">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm mb-6">
                    <AlertCircle className="w-10 h-10 text-gray-300" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">데이터가 없습니다</h2>
                <p className="text-gray-500 mb-8 max-w-xs mx-auto text-sm leading-relaxed">
                    아직 카드 혜택 데이터가 설정되지 않았습니다.<br />설정 탭에서 초기 데이터를 생성해주세요.
                </p>
                <Link href="/settings" className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-bold text-sm hover:bg-black transition-all shadow-lg active:scale-95">
                    설정으로 이동
                </Link>
            </div>
        )
    }

    return (
        <main className="min-h-screen bg-gray-50 pb-32 font-sans selection:bg-blue-100">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md px-6 py-4 sticky top-0 z-20 border-b border-gray-100 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 tracking-tight">
                        <span className="text-2xl">🍒</span> Cherry Picker
                    </h1>
                </div>
                <button
                    onClick={() => setIsOnline(!isOnline)}
                    className={clsx(
                        "px-4 py-1.5 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5",
                        isOnline ? "bg-purple-50 text-purple-600 border-purple-200" : "bg-gray-100 text-gray-500 border-gray-200"
                    )}
                >
                    {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                </button>
            </header>

            <div className="px-5 pt-6 space-y-8 max-w-lg mx-auto">

                <MonthlyPerformanceReminder
                    missingCount={missingPerformanceCards.length}
                    performanceMonthLabel={performanceMonthLabel}
                    benefitMonthLabel={benefitMonthLabel}
                />

                {/* 1. Brand Selector */}
                <section className={clsx(
                    "bg-white rounded-[2rem] shadow-sm border border-gray-100 transition-all duration-300 ease-in-out overflow-hidden",
                    selectedBrandId ? "p-4" : "p-5"
                )}>
                    {!selectedBrandId ? (
                        // CASE 1: No Brand Selected (Full View)
                        <div className="space-y-4">
                            <h2 className="text-lg font-bold text-gray-900 ml-1">
                                어떤 브랜드에서<br />결제하시나요?
                            </h2>

                            {/* Search Bar */}
                            <div className="relative mx-1">
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="브랜드 검색..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-gray-900 placeholder-gray-400"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>

                            <div className="h-[60vh] overflow-y-auto pr-2 space-y-6 custom-scrollbar pb-10">
                                {Object.keys(brandsByCategory).length === 0 && searchQuery && (
                                    <div className="text-center py-10 text-gray-400 text-sm">
                                        검색 결과가 없습니다.
                                    </div>
                                )}
                                {categories.map(group => (
                                    brandsByCategory[group.id] && (
                                        <div key={group.id}>
                                            <h3 className="text-[10px] font-bold text-gray-400 mb-3 uppercase tracking-wider pl-1 sticky top-0 bg-white/95 backdrop-blur-sm py-1 z-10">
                                                {group.name}
                                            </h3>
                                            <div className="grid grid-cols-4 gap-2">
                                                {brandsByCategory[group.id].map(brand => (
                                                    <button
                                                        key={brand.id}
                                                        onClick={() => setSelectedBrandId(brand.id)}
                                                        className="flex flex-col items-center justify-center p-2 rounded-2xl transition-all duration-200 border min-h-[76px] relative overflow-hidden bg-white border-gray-100 text-gray-500 hover:bg-gray-50 hover:border-gray-200 active:scale-95"
                                                    >
                                                        <div className="mb-2 p-2 rounded-full bg-gray-100 text-gray-400 transition-colors">
                                                            <IconByName name={brand.iconName || 'HelpCircle'} className="w-4 h-4" />
                                                        </div>
                                                        <span className="text-[10px] font-bold text-center leading-snug break-keep">{brand.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                ))}
                            </div>
                        </div>
                    ) : (
                        // CASE 2: Brand Selected (Collapsed View)
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {currentBrand && (
                                    <>
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                            <IconByName name={currentBrand.iconName || 'HelpCircle'} className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400 font-bold mb-0.5">선택된 브랜드</p>
                                            <p className="text-lg font-black text-gray-900 leading-none">{currentBrand.name}</p>
                                        </div>
                                    </>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    setSelectedBrandId('');
                                    setSearchQuery('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-colors"
                            >
                                변경
                            </button>
                        </div>
                    )}
                </section>

                {/* 2. Amount & Results (Revealed when brand is selected) */}
                {selectedBrandId && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both space-y-8">

                        {/* Amount Input */}
                        <section className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100">
                            <label className="text-xs font-bold text-gray-400 mb-2 block ml-1">결제 금액</label>
                            <div className="relative group">
                                <input
                                    type="text"
                                    value={amount > 0 ? amount.toLocaleString() : ''}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, '');
                                        if (val.length > 9) return;
                                        setAmount(val ? Number(val) : 0);
                                    }}
                                    className="w-full text-4xl font-black p-4 pr-16 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-blue-500 focus:bg-white focus:outline-none transition-all text-gray-900 placeholder-gray-300"
                                    placeholder="0"
                                    inputMode="numeric"
                                />
                                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xl group-focus-within:text-blue-500 transition-colors">원</span>
                            </div>

                            {/* Numeric Keypad */}
                            <div className="mt-4">
                                <NumericKeypad
                                    onValueChange={handleKeypadChange}
                                    onDelete={handleKeypadDelete}
                                />
                            </div>
                        </section>

                        {/* Best Recommendation */}
                        {bestCard && (
                            <section>
                                <h2 className="text-sm font-bold text-gray-900 ml-2 mb-3 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                    최고의 혜택
                                </h2>

                                {bestCard.calculatedDiscount > 0 ? (
                                    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-[2rem] p-7 text-white shadow-2xl shadow-gray-200 relative overflow-hidden ring-1 ring-black/5 group">
                                        {/* Decorative background elements */}
                                        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/20 rounded-full -translate-y-16 translate-x-16 blur-3xl group-hover:bg-blue-500/30 transition-all duration-700"></div>
                                        <div className="absolute bottom-0 left-0 w-40 h-40 bg-purple-500/10 rounded-full translate-y-12 -translate-x-10 blur-3xl"></div>

                                        <div className="flex justify-between items-start mb-8 relative z-10">
                                            <div className="flex items-center gap-4">
                                                <div className={clsx("w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg ring-1 ring-white/10 backdrop-blur-sm bg-white/10", bestCard.color)}>
                                                    {bestCard.name.substring(0, 1)}
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold leading-tight tracking-tight">{bestCard.name}</h3>
                                                    <p className="text-gray-400 text-xs mt-1 font-medium">{bestCard.company}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="block text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-blue-100 tracking-tighter shadow-sm">
                                                    {bestCard.calculatedDiscount.toLocaleString()}
                                                    <span className="text-xl font-bold ml-1 text-blue-400">원</span>
                                                </span>
                                                <span className="text-[10px] text-blue-300/80 font-bold tracking-widest uppercase">Discount</span>
                                            </div>
                                        </div>

                                        <div className="bg-white/10 rounded-2xl p-5 border border-white/5 relative z-10 backdrop-blur-md">
                                            <div className="flex items-center gap-2.5 mb-2.5">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                                <span className="font-bold text-sm text-white tracking-wide">{bestCard.matchedRule?.description || '혜택 적용'}</span>
                                            </div>
                                            <p className="text-xs text-gray-300 pl-[1.6rem] mb-4 leading-relaxed opacity-90">{bestCard.matchedRule?.detail}</p>

                                            {/* Remaining Limit Indicator */}
                                            {bestCard.limitTable && bestCard.limitTable.length > 0 && (
                                                <div className="pl-[1.6rem] pt-3 mt-1 border-t border-white/10 flex items-center gap-2 text-[10px] text-gray-400">
                                                    <PieChart className="w-3 h-3 text-gray-500" />
                                                    <span>
                                                        통합한도 <span className="text-white font-bold mx-1">{bestCard.remainingLimit.toLocaleString()}원</span>
                                                        <span className="opacity-50">/ {bestCard.monthlyMaxLimit.toLocaleString()}</span>
                                                    </span>
                                                </div>
                                            )}

                                            {/* Warnings */}
                                            {bestCard.reason && !['건당 한도 적용', '캐시백/할인', '정액 할인', '정가제', bestCard.matchedRule?.description].some(r => r && bestCard.reason?.includes(r)) && (
                                                <p className="text-xs text-orange-300 pl-[1.6rem] mt-2 flex items-center gap-1.5 font-medium bg-orange-500/10 py-1 px-2 rounded-lg w-fit">
                                                    <AlertCircle className="w-3 h-3" /> {bestCard.reason}
                                                </p>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleRecordTransaction(bestCard)}
                                            disabled={isRecording}
                                            className={clsx(
                                                "mt-6 w-full font-bold py-4 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl group-hover:translate-y-[-2px]",
                                                confirmCardId === bestCard.id
                                                    ? "bg-red-500 text-white animate-pulse"
                                                    : "bg-white text-gray-900 hover:bg-blue-50"
                                            )}
                                        >
                                            {isRecording ? (
                                                '기록 중...'
                                            ) : confirmCardId === bestCard.id ? (
                                                <>
                                                    <AlertCircle className="w-5 h-5 text-white" />
                                                    {bestCard.name} {amount.toLocaleString()}원 결제?
                                                </>
                                            ) : (
                                                <>
                                                    <Wallet className="w-5 h-5 text-gray-600 group-hover:text-blue-600 transition-colors" />
                                                    결제 기록하기
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 text-center">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slow">
                                            <AlertCircle className="w-8 h-8 text-gray-300" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-800">적용 가능한 혜택이 없어요</h3>
                                        <p className="text-sm text-gray-400 mt-2 max-w-[220px] mx-auto leading-relaxed">
                                            {bestCard.reason || "모든 카드의 혜택 조건을 만족하지 못했습니다."}
                                        </p>
                                        <button
                                            onClick={() => handleRecordTransaction(bestCard)}
                                            disabled={isRecording}
                                            className={clsx(
                                                "mt-6 px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95",
                                                confirmCardId === bestCard.id
                                                    ? "bg-red-500 text-white animate-pulse"
                                                    : "bg-gray-900 text-white hover:bg-black"
                                            )}
                                        >
                                            {isRecording
                                                ? '기록 중...'
                                                : confirmCardId === bestCard.id
                                                    ? '정말 기록할까요?'
                                                    : `${bestCard.name}로 기록하기`}
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}

                        {bestCard && (
                            <RecommendationExplainer
                                amount={amount}
                                cards={calculatedCards}
                                performances={currentPerformances}
                                isOnline={isOnline}
                                isOpen={isExplanationOpen}
                                onToggle={() => setIsExplanationOpen(prev => !prev)}
                            />
                        )}

                        {/* 3. Comparison List */}
                        <section className="space-y-3 pb-8">
                            <h2 className="text-sm font-bold text-gray-900 ml-2 mt-10 mb-3 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                {bestCard.calculatedDiscount > 0 ? "다른 카드 비교" : "내 카드 목록"}
                            </h2>

                            {(bestCard.calculatedDiscount > 0 ? calculatedCards.slice(1) : calculatedCards).map((card) => (
                                <div key={card.id} className="bg-white p-4 rounded-2xl border border-gray-100 transition-all active:bg-gray-50 flex items-center justify-between group hover:border-gray-300 hover:shadow-md duration-300">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={clsx("w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300", card.color)}>
                                            {card.name.substring(0, 1)}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-gray-700 text-sm truncate group-hover:text-gray-900 transition-colors">{card.name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                {card.calculatedDiscount > 0 ? (
                                                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{card.matchedRule?.description}</span>
                                                ) : (
                                                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3" />
                                                        {card.reason || '혜택 없음'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <span className={clsx("font-black block text-sm transition-colors", card.calculatedDiscount > 0 ? 'text-gray-900 group-hover:text-blue-600' : 'text-gray-300')}>
                                            {card.calculatedDiscount > 0 ? `+${card.calculatedDiscount.toLocaleString()}` : '0'}
                                        </span>
                                        <button
                                            onClick={() => handleRecordTransaction(card)}
                                            disabled={isRecording}
                                            className={clsx(
                                                "mt-1 text-[10px] font-bold transition-colors",
                                                confirmCardId === card.id
                                                    ? "text-red-500 animate-pulse"
                                                    : "text-gray-400 hover:text-blue-600"
                                            )}
                                        >
                                            {isRecording ? '저장 중' : confirmCardId === card.id ? '확인?' : '기록'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </section>
                    </div>
                )}

            </div >
        </main >
    );
}
