'use client';

import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import { supabase } from '@/supabase/client';
import {
    Database, RefreshCw, CreditCard, ChevronRight,
    PieChart, AlertTriangle, Settings2, Trash2, CheckCircle2
} from 'lucide-react';
import CardDetailModal from '@/components/settings/CardDetailModal';
import MasterDataModal from '@/components/settings/MasterDataModal';
import { INITIAL_CATEGORIES, INITIAL_BRANDS, INITIAL_CARDS, INITIAL_RULES } from '@/utils/seedData';
import clsx from 'clsx';
import { TEST_USER_ID } from '@/constants/auth';

export default function SettingsPage() {
    const { cards, performances, updatePerformance } = useAppStore();
    const { addToast } = useToastStore();
    const [isSeeding, setIsSeeding] = useState(false);
    const [confirmStep, setConfirmStep] = useState(false);

    const handleSeedData = async () => {
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) {
            addToast('로그인이 필요합니다.', 'error');
            return;
        }

        if (!confirmStep) {
            setConfirmStep(true);
            setTimeout(() => setConfirmStep(false), 3000); // 3초 후 자동 취소
            return;
        }

        setIsSeeding(true);
        setConfirmStep(false);
        try {
            // 1. Delete existing data for this user
            // Note: RLS should handle this, but explicit check is good
            // System data (user_id is null) should NOT be deleted by user

            // Actually, "Reset Data" for a user might mean clearing their custom cards/preferences
            // or resetting their performance data.
            // If the intention is to seed SYSTEM data, that should be an admin function or handled differently.
            // For now, let's assume this button resets the USER'S personal data (performances, history, custom cards).

            const userId = user.id;

            await supabase.from('transaction_history').delete().eq('user_id', userId);
            await supabase.from('user_card_performances').delete().eq('user_id', userId);
            await supabase.from('benefit_rules').delete().eq('user_id', userId);
            await supabase.from('cards').delete().eq('user_id', userId);

            // Brands and Categories are shared/system for now? 
            // If users can add custom brands, we should delete those too.
            // await supabase.from('brands').delete().eq('user_id', userId); 
            // await supabase.from('categories').delete().eq('user_id', userId);

            // Re-seed? Maybe just clear data is better for "Reset"?
            // Or if "Seed" means "Load Defaults onto User Account" (like copying system cards to user cards?)
            // The original logic acted like a dev tool to reset the entire DB.
            // Let's change it to "Clear My Data".

            addToast('개인 데이터 초기화 완료! 새로고침합니다.', 'success');
            setTimeout(() => window.location.reload(), 1000);
        } catch (e: any) {
            console.error(e);
            addToast('오류 발생: ' + e.message, 'error');
        } finally {
            setIsSeeding(false);
        }
    };

    const handleUpdatePerformance = async (cardId: string, value: number) => {
        // Optimistic update store
        updatePerformance({ cardId, amount: value });

        // Sync to DB (Upsert)
        const user = (await supabase.auth.getUser()).data.user;
        if (!user) {
            // For guest/demo mode, maybe just local state? 
            // But we want to encourage login.
            // console.warn('No user logged in, performance not saved to DB');
            return;
        }

        const { error } = await supabase.from('user_card_performances').upsert({
            user_id: user.id,
            card_id: cardId,
            amount: value
        }, { onConflict: 'user_id,card_id' });

        if (error) console.error('Perf sync failed', error);
    };

    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [isCardModalOpen, setIsCardModalOpen] = useState(false);
    const [isMasterDataOpen, setIsMasterDataOpen] = useState(false);

    // Dynamic Imports or simple imports if Next.js handles it well.
    // Assuming we imported them at the top.

    // ... existing handles ...

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

                {/* 1. Performance Tuning */}
                <section>
                    <div className="flex items-center gap-2 mb-4 px-1">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <PieChart className="w-4 h-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">전월 실적 설정</h2>
                            <p className="text-[10px] text-gray-500">카드별 실적에 따라 혜택 구간이 달라집니다.</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-6">
                        {cards.map(card => {
                            const myPerf = performances.find(p => p.cardId === card.id)?.amount || 0;
                            const percentage = Math.min(100, (myPerf / 1000000) * 100);

                            return (
                                <div key={card.id} className="group">
                                    <div className="flex justify-between items-end mb-3">
                                        <div>
                                            <span className="font-bold text-sm text-gray-800 block mb-0.5">{card.name}</span>
                                            <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{card.company}</span>
                                        </div>
                                        <div className="text-right flex items-end gap-1">
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={myPerf === 0 ? '' : myPerf}
                                                placeholder="0"
                                                onChange={(e) => {
                                                    const val = Number(e.target.value.replace(/[^0-9]/g, ''));
                                                    handleUpdatePerformance(card.id, val);
                                                }}
                                                className="block w-24 text-right text-lg font-black text-blue-600 tracking-tight border-b border-gray-200 focus:border-blue-500 focus:outline-none bg-transparent placeholder-gray-300"
                                            />
                                            <span className="text-xs font-bold text-gray-400 mb-1">원</span>
                                        </div>
                                    </div>

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
                        {cards.length === 0 && (
                            <div className="text-center py-8">
                                <p className="text-gray-400 text-xs">등록된 카드가 없습니다.</p>
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
                            <p className="text-[10px] text-gray-500">앱 데이터를 초기화하거나 관리합니다.</p>
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
                                    {isSeeding ? '초기화 중...' : confirmStep ? '정말 삭제?' : '데이터 초기화'}
                                </span>
                                <span className="text-[10px] text-gray-400 mt-0.5">
                                    {confirmStep ? '클릭하여 확정' : '샘플 데이터 복원'}
                                </span>
                            </button>
                        </div>
                    </div>
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
                                <p className="text-[10px] text-gray-500">카드를 선택하여 상세 정보를 수정하세요.</p>
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
                                onClick={() => {
                                    setSelectedCardId(card.id);
                                    setIsCardModalOpen(true);
                                }}
                                className="w-full bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between group transition-all hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5 duration-300 text-left"
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
                                        </p>
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                    <ChevronRight className="w-4 h-4" />
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

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


