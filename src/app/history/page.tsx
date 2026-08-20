'use client';

import React from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Trash2, AlertCircle, Calendar, TrendingUp, History, CreditCard } from 'lucide-react';
import { TransactionHistory } from '@/types';
import { IconByName } from '@/components/ui/IconByName';
import { useToastStore } from '@/store/useToastStore';
import clsx from 'clsx';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';

export default function HistoryPage() {
    const {
        history,
        brands,
        cards,
        storageMode,
        isLoading,
        setLoading,
        clearHistory,
    } = useAppStore();
    const { addToast } = useToastStore();
    const [confirmDelete, setConfirmDelete] = React.useState(false);
    const [selectedCardId, setSelectedCardId] = React.useState<string>('all');

    // Date State (Defaults to current month)
    const [currentDate, setCurrentDate] = React.useState(new Date());

    const handlePrevMonth = () => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(prev.getMonth() - 1);
            return newDate;
        });
    };

    const handleNextMonth = () => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setMonth(prev.getMonth() + 1);
            return newDate;
        });
    };

    // Swipe Handlers
    const [touchStart, setTouchStart] = React.useState<number | null>(null);
    const [touchEnd, setTouchEnd] = React.useState<number | null>(null);

    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            handleNextMonth(); // Next Month (Future)
        } else if (isRightSwipe) {
            handlePrevMonth(); // Prev Month (Past)
        }
    };

    const handleDeleteAll = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
            return;
        }

        setConfirmDelete(false);
        setLoading(true);

        try {
            if (storageMode === 'guest') await localWorkspaceClient.clearHistory();
            else await apiClient.deleteTransactions();
            clearHistory();
            addToast('모든 기록이 삭제되었습니다.', 'success');
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '기록을 삭제하지 못했습니다.'), 'error');
        } finally {
            setLoading(false);
        }
    };

    // 1. Filter history by Date (Global for this view)
    const monthlyHistory = React.useMemo(() => {
        return history.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate.getMonth() === currentDate.getMonth() &&
                txDate.getFullYear() === currentDate.getFullYear();
        });
    }, [history, currentDate]);

    // 2. Filter by Card (from Monthly History)
    const filteredHistory = selectedCardId === 'all'
        ? monthlyHistory
        : monthlyHistory.filter(tx => tx.cardId === selectedCardId);

    const groupHistoryByDate = (hist: TransactionHistory[]) => {
        const grouped: Record<string, TransactionHistory[]> = {};
        hist.forEach(tx => {
            const date = new Date(tx.date).toLocaleDateString();
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(tx);
        });
        return grouped;
    };

    const grouped = groupHistoryByDate(filteredHistory);

    // Helpers
    const getBrand = (brandId: string) => brands.find(b => b.id === brandId);

    // Performance / Card Stats Helper
    const getCardPerformance = (cardId: string) => {
        const card = cards.find(c => c.id === cardId);
        if (!card) return null;

        // 1. Current Month Spend (Usage for SELECTED month)
        // Note: Performance usually depends on Previous Month, but user wants to see "This Month's Report".
        // Use monthlyHistory which is already filtered by currentDate.
        const currentMonthSpend = history
            .filter(tx => {
                const txDate = new Date(tx.date);
                return tx.cardId === cardId &&
                    txDate.getMonth() === currentDate.getMonth() &&
                    txDate.getFullYear() === currentDate.getFullYear();
            })
            .reduce((sum, tx) => sum + tx.amount, 0);

        // 2. Tiers (Limit Table)
        let nextTier = null;
        let currentTier = null;

        if (card.limitTable && card.limitTable.length > 0) {
            const sortedTable = [...card.limitTable].sort((a, b) => a.threshold - b.threshold);
            for (let i = 0; i < sortedTable.length; i++) {
                if (currentMonthSpend >= sortedTable[i].threshold) {
                    currentTier = sortedTable[i];
                } else {
                    nextTier = sortedTable[i];
                    break;
                }
            }
        }

        // 3. Benefit Usage (Selected Month)
        const monthlyBenefitUsed = history
            .filter(tx => {
                const txDate = new Date(tx.date);
                return tx.cardId === cardId &&
                    txDate.getMonth() === currentDate.getMonth() &&
                    txDate.getFullYear() === currentDate.getFullYear();
            })
            .reduce((sum, tx) => sum + tx.discountAmount, 0);

        return {
            card,
            currentMonthSpend,
            currentTier,
            nextTier,
            monthlyBenefitUsed
        };
    };

    const selectedCardStat = selectedCardId !== 'all' ? getCardPerformance(selectedCardId) : null;

    if (isLoading) return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    return (
        <main
            className="min-h-screen bg-gray-50 p-4 pb-32 font-sans selection:bg-blue-100"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-gray-100 -mx-4 -mt-4 mb-6">
                <div className="px-6 py-5 flex items-center justify-between">
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <History className="w-5 h-5 text-gray-700" />
                        소비 리포트
                    </h1>
                    <button
                        onClick={handleDeleteAll}
                        className={clsx(
                            "flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-bold transition-all",
                            confirmDelete
                                ? "bg-red-500 border-red-500 text-white animate-pulse"
                                : "bg-red-50 border-red-100 text-red-500 hover:bg-red-100"
                        )}
                    >
                        {confirmDelete ? (
                            <>
                                <AlertCircle className="w-3.5 h-3.5" />
                                정말 삭제?
                            </>
                        ) : (
                            <>
                                <Trash2 className="w-3.5 h-3.5" />
                                초기화
                            </>
                        )}
                    </button>
                </div>

                {/* Date Navigation */}
                <div className="flex items-center justify-center gap-4 pb-4">
                    <button onClick={handlePrevMonth} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <span className="text-gray-400">◀</span>
                    </button>
                    <span className="text-lg font-bold text-gray-900">
                        {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                    </span>
                    <button onClick={handleNextMonth} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <span className="text-gray-400">▶</span>
                    </button>
                </div>

                {/* Card Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto px-6 pb-4 no-scrollbar">
                    <button
                        onClick={() => setSelectedCardId('all')}
                        className={clsx(
                            "flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border",
                            selectedCardId === 'all'
                                ? "bg-gray-900 border-gray-900 text-white shadow-md"
                                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                        )}
                    >
                        전체 보기
                    </button>
                    {cards.map(card => (
                        <button
                            key={card.id}
                            onClick={() => setSelectedCardId(card.id)}
                            className={clsx(
                                "flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all border flex items-center gap-2",
                                selectedCardId === card.id
                                    ? "bg-blue-600 border-blue-600 text-white shadow-md"
                                    : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                            )}
                        >
                            <span>{card.name}</span>
                        </button>
                    ))}
                </div>
            </header>

            {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6 shadow-sm">
                        <Calendar className="w-10 h-10 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">아직 기록이 없어요</h3>
                    <p className="text-gray-400 font-medium mt-1 text-sm">
                        홈 화면에서 결제를 기록하면<br />여기에 리포트가 만들어집니다.
                    </p>
                </div>
            ) : (
                <div className="space-y-8 max-w-lg mx-auto">
                    {/* Summary Card */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 relative overflow-hidden transition-all duration-300">

                        {/* Summary Content */}
                        {selectedCardId === 'all' ? (
                            // ALL CARDS VIEW
                            <>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -translate-y-8 translate-x-8 opacity-50"></div>
                                <div className="text-center relative z-10 mb-6">
                                    <p className="text-xs text-gray-500 font-bold mb-1 flex items-center justify-center gap-1">
                                        <TrendingUp className="w-3 h-3 text-blue-500" />
                                        {currentDate.getMonth() + 1}월 받은 총 혜택
                                    </p>
                                    <h2 className="text-4xl font-black text-gray-900 tracking-tight">
                                        {monthlyHistory.reduce((sum, tx) => sum + tx.discountAmount, 0).toLocaleString()}
                                        <span className="text-2xl ml-1 text-gray-400 font-bold">원</span>
                                    </h2>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 relative z-10">
                                    <div className="bg-gray-50 rounded-2xl p-3 text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Spend</p>
                                        <p className="text-sm font-bold text-gray-800 mt-0.5">
                                            {monthlyHistory.reduce((sum, tx) => sum + tx.amount, 0).toLocaleString()}원
                                        </p>
                                    </div>
                                    <div className="bg-blue-50 rounded-2xl p-3 text-center">
                                        <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Picking Rate</p>
                                        <p className="text-sm font-bold text-blue-600 mt-0.5">
                                            {monthlyHistory.length > 0 ? (
                                                (monthlyHistory.reduce((sum, tx) => sum + tx.discountAmount, 0) / monthlyHistory.reduce((sum, tx) => sum + tx.amount, 0) * 100).toFixed(1)
                                            ) : 0}%
                                        </p>
                                    </div>
                                </div>
                            </>
                        ) : selectedCardStat ? (
                            // SINGLE CARD VIEW
                            <>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -translate-y-8 translate-x-8 opacity-50"></div>

                                {/* 1. Performance / Spend */}
                                <div className="relative z-10 mb-6 text-center">
                                    <p className="text-xs text-gray-500 font-bold mb-2">{currentDate.getMonth() + 1}월 실적 (이용 금액)</p>
                                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                                        {selectedCardStat.currentMonthSpend.toLocaleString()}
                                        <span className="text-xl ml-1 text-gray-400 font-bold">원</span>
                                    </h2>

                                    {/* Next Tier Progress */}
                                    {selectedCardStat.nextTier ? (
                                        <div className="mt-3 bg-gray-50 rounded-xl p-3 inline-block w-full">
                                            <div className="flex justify-between items-center text-xs mb-1.5">
                                                <span className="font-bold text-gray-500">다음 단계 ({selectedCardStat.nextTier.threshold.toLocaleString()}원) 까지</span>
                                                <span className="font-bold text-indigo-600">
                                                    {(selectedCardStat.nextTier.threshold - selectedCardStat.currentMonthSpend).toLocaleString()}원 남음
                                                </span>
                                            </div>
                                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden w-full">
                                                <div
                                                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                                    style={{ width: `${Math.min(100, (selectedCardStat.currentMonthSpend / selectedCardStat.nextTier.threshold) * 100)}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-3 text-xs font-bold text-green-600 bg-green-50 rounded-xl p-2">
                                            🎉 모든 실적 조건을 달성했어요!
                                        </div>
                                    )}
                                </div>

                                {/* 2. Benefit Limit Status */}
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 relative z-10">
                                    <div className="bg-gray-50 rounded-2xl p-3 text-center">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Discount Received</p>
                                        <p className="text-sm font-bold text-gray-800 mt-0.5">
                                            {selectedCardStat.monthlyBenefitUsed.toLocaleString()}원
                                        </p>
                                    </div>
                                    {/* Show Limit if available (Current Tier Limit) */}
                                    <div className="bg-indigo-50 rounded-2xl p-3 text-center">
                                        <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">
                                            {selectedCardStat.currentTier ? `Max Limit (${(selectedCardStat.currentTier.limit / 10000).toFixed(0)}만)` : 'Benefits'}
                                        </p>
                                        <p className="text-sm font-bold text-indigo-600 mt-0.5">
                                            {selectedCardStat.currentTier ? (
                                                <>
                                                    {Math.max(0, selectedCardStat.currentTier.limit - selectedCardStat.monthlyBenefitUsed).toLocaleString()}원 남음
                                                </>
                                            ) : (
                                                selectedCardStat.nextTier ? '실적 부족' : '한도 없음'
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>

                    {/* Timeline */}
                    <div className="space-y-6">
                        {filteredHistory.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <CreditCard className="w-8 h-8 text-gray-300" />
                                </div>
                                <p className="text-gray-400 font-bold text-sm">이 달의 내역이 없어요</p>
                            </div>
                        ) : (
                            Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()).map(date => (
                                <div key={date}>
                                    <h3 className="text-xs font-bold text-gray-400 mb-3 pl-2 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                                        {date}
                                    </h3>
                                    <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
                                        {grouped[date].map((tx) => {
                                            const brand = getBrand(tx.brandId);
                                            // Optional: Find card name to display if showing 'All'
                                            const txCard = cards.find(c => c.id === tx.cardId);

                                            return (
                                                <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-white group-hover:shadow-sm transition-all">
                                                            {brand ? (
                                                                <IconByName name={brand.iconName || 'HelpCircle'} className="w-5 h-5" />
                                                            ) : (
                                                                <span className="font-bold text-xs">{tx.brandId.substring(0, 1)}</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-gray-800 text-sm">{brand?.name || tx.brandId}</span>
                                                                {(tx.confirmedValue || tx.discountAmount) > 0 && (
                                                                    <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">혜택적용</span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                                                                <CreditCard className="w-3 h-3" />
                                                                {txCard?.name || (
                                                                    tx.fundingType === 'MONEY'
                                                                        ? '페이머니'
                                                                        : tx.fundingType === 'POINTS'
                                                                            ? '포인트'
                                                                            : tx.fundingType === 'GIFT_CERTIFICATE'
                                                                                ? '상품권'
                                                                                : '카드 미지정'
                                                                )}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="font-bold text-gray-900 text-sm">
                                                            {(tx.payableAmount ?? tx.amount).toLocaleString()}
                                                        </p>
                                                        {(tx.confirmedValue || tx.discountAmount) > 0 && (
                                                            <p className="text-[10px] text-blue-500 font-bold">
                                                                혜택 {(tx.confirmedValue || tx.discountAmount).toLocaleString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}
