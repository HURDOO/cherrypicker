'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { calculateBestCards } from '@/utils/calculation';
import { IconByName } from '@/components/ui/IconByName';
import {
    CheckCircle2, AlertCircle, PieChart,
    Wallet, Search, Wifi, WifiOff, X
} from 'lucide-react';
import { useSupabaseSync } from '@/hooks/useSupabaseSync';
import clsx from 'clsx';
import Link from 'next/link';
import { useToastStore } from '@/store/useToastStore';
import { NumericKeypad } from '@/components/ui/NumericKeypad';

export default function HomePage() {
    const {
        categories, brands, cards, rules, history, performances,
        isLoading,
        selectedBrandId, setSelectedBrandId
    } = useAppStore();

    const { saveTransaction } = useSupabaseSync();

    // Local UI State
    const [amount, setAmount] = useState<number>(0);
    const [isOnline, setIsOnline] = useState<boolean>(false);
    const [confirmCardId, setConfirmCardId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const { addToast } = useToastStore();

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

    // Main Logic Calculation
    const calculatedCards = useMemo(() => {
        if (!currentBrand) return [];
        return calculateBestCards(
            amount,
            currentBrand,
            cards,
            rules,
            history,
            performances,
            isOnline
        );
    }, [amount, currentBrand, cards, rules, history, performances, isOnline]);

    const bestCard = calculatedCards[0];

    const handleRecordTransaction = async (card: typeof bestCard) => {
        if (!currentBrand || !card) return;

        // Double Tap Confirmation
        if (confirmCardId !== card.id) {
            setConfirmCardId(card.id);
            setTimeout(() => setConfirmCardId(null), 3000); // 3초 후 초기화
            return;
        }

        setConfirmCardId(null);

        await saveTransaction({
            brandId: currentBrand.id,
            cardId: card.id,
            ruleId: card.matchedRule?.id,
            amount: amount,
            discountAmount: card.calculatedDiscount
        });

        addToast('기록되었습니다.', 'success');
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
                                            className={clsx(
                                                "mt-6 w-full font-bold py-4 rounded-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-xl group-hover:translate-y-[-2px]",
                                                confirmCardId === bestCard.id
                                                    ? "bg-red-500 text-white animate-pulse"
                                                    : "bg-white text-gray-900 hover:bg-blue-50"
                                            )}
                                        >
                                            {confirmCardId === bestCard.id ? (
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
                                            className={clsx(
                                                "mt-6 px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-95",
                                                confirmCardId === bestCard.id
                                                    ? "bg-red-500 text-white animate-pulse"
                                                    : "bg-gray-900 text-white hover:bg-black"
                                            )}
                                        >
                                            {confirmCardId === bestCard.id ? '정말 기록할까요?' : `${bestCard.name}로 기록하기`}
                                        </button>
                                    </div>
                                )}
                            </section>
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
                                            className={clsx(
                                                "mt-1 text-[10px] font-bold transition-colors",
                                                confirmCardId === card.id
                                                    ? "text-red-500 animate-pulse"
                                                    : "text-gray-400 hover:text-blue-600"
                                            )}
                                        >
                                            {confirmCardId === card.id ? '확인?' : '기록'}
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
