import React, { useState } from 'react';
import { Card } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { X, Plus, Edit2, CreditCard } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';
import EditRuleModal from './EditRuleModal';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';

interface CardDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialCard?: Card | null; // null for new card
}

export default function CardDetailModal({ isOpen, onClose, initialCard }: CardDetailModalProps) {
    const { addCard, updateCard, rules, storageMode } = useAppStore();
    const { addToast } = useToastStore();

    // Form State
    // Form State
    const [cardData, setCardData] = useState<Partial<Card>>(initialCard || {
        name: '',
        company: '',
        color: 'bg-gradient-to-br from-gray-700 to-gray-900',
        limitTable: [],
        network: 'DOMESTIC',
    });

    // Sync state with initialCard when modal opens
    React.useEffect(() => {
        if (isOpen) {
            if (initialCard) {
                setCardData(JSON.parse(JSON.stringify(initialCard)));
            } else {
                setCardData({
                    name: '',
                    company: '',
                    color: 'bg-gradient-to-br from-gray-700 to-gray-900',
                    limitTable: [],
                    network: 'DOMESTIC',
                });
            }
        }
    }, [isOpen, initialCard]);

    // Sub-modal State
    const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
    const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);

    // Derived
    const cardRules = rules.filter(r => r.cardId === initialCard?.id);

    const handleSave = async () => {
        if (!cardData.name) return addToast('카드 이름을 입력해주세요.', 'error');

        try {
            const payload = {
                name: cardData.name,
                company: cardData.company || '',
                color: cardData.color || 'bg-gradient-to-br from-gray-700 to-gray-900',
                limitTable: cardData.limitTable || [],
                network: cardData.network,
            };

            if (initialCard) {
                const savedCard = storageMode === 'guest'
                    ? await localWorkspaceClient.updateCard(initialCard.id, payload)
                    : await apiClient.updateCard(initialCard.id, payload);
                updateCard(savedCard);
            } else {
                const savedCard = storageMode === 'guest'
                    ? await localWorkspaceClient.createCard(payload)
                    : await apiClient.createCard(payload);
                addCard(savedCard);
            }

            addToast('카드 정보가 저장되었습니다.', 'success');
            onClose();

        } catch (error: unknown) {
            addToast(getErrorMessage(error, '카드 정보를 저장하지 못했습니다.'), 'error');
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-40 flex items-center justify-end md:justify-center p-0 md:p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white md:rounded-3xl w-full md:max-w-4xl h-full md:h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300">

                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md ${cardData.color}`}>
                                <CreditCard className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{initialCard ? '카드 상세 설정' : '새 카드 등록'}</h2>
                                <p className="text-xs text-gray-400">카드의 기본 정보와 혜택을 관리합니다.</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                        {/* Left: Basic Info */}
                        <div className="w-full md:w-1/3 border-r border-gray-100 p-6 space-y-6 overflow-y-auto bg-gray-50/50">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <span className="w-1 h-4 bg-blue-500 rounded-full" />
                                기본 정보
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">카드명</label>
                                    <input
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm font-bold focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                        value={cardData.name}
                                        onChange={e => setCardData({ ...cardData, name: e.target.value })}
                                        placeholder="카드 이름 입력"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">카드사</label>
                                    <input
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                        value={cardData.company}
                                        onChange={e => setCardData({ ...cardData, company: e.target.value })}
                                        placeholder="예: 신한카드"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">카드 브랜드</label>
                                    <select
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                        value={cardData.network || 'DOMESTIC'}
                                        onChange={e => setCardData({
                                            ...cardData,
                                            network: e.target.value as Card['network'],
                                        })}
                                    >
                                        <option value="DOMESTIC">국내전용</option>
                                        <option value="MASTERCARD">Mastercard</option>
                                        <option value="VISA">Visa</option>
                                        <option value="AMEX">American Express</option>
                                        <option value="UNIONPAY">UnionPay</option>
                                        <option value="OTHER">기타</option>
                                    </select>
                                    <p className="mt-1 text-[10px] leading-relaxed text-gray-400">
                                        해외 혜택의 국제 브랜드 조건을 판정할 때 사용합니다.
                                    </p>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 mb-1 block">색상 테마 (Tailwind Class)</label>
                                    <input
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-mono text-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                                        value={cardData.color}
                                        onChange={e => setCardData({ ...cardData, color: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="h-px bg-gray-200" />

                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <span className="w-1 h-4 bg-green-500 rounded-full" />
                                실적 구간 (Limit Table)
                            </h3>
                            <div className="space-y-2">
                                {cardData.limitTable?.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            className="w-1/2 p-2 bg-white border border-gray-200 rounded-lg text-xs"
                                            value={item.threshold}
                                            onChange={e => {
                                                const newTable = [...(cardData.limitTable || [])];
                                                newTable[idx].threshold = Number(e.target.value);
                                                setCardData({ ...cardData, limitTable: newTable });
                                            }}
                                            placeholder="실적 (원)"
                                        />
                                        <input
                                            type="number"
                                            className="w-1/2 p-2 bg-white border border-gray-200 rounded-lg text-xs"
                                            value={item.limit}
                                            onChange={e => {
                                                const newTable = [...(cardData.limitTable || [])];
                                                newTable[idx].limit = Number(e.target.value);
                                                setCardData({ ...cardData, limitTable: newTable });
                                            }}
                                            placeholder="한도 (원)"
                                        />
                                        <button
                                            onClick={() => {
                                                const newTable = cardData.limitTable?.filter((_, i) => i !== idx);
                                                setCardData({ ...cardData, limitTable: newTable });
                                            }}
                                            className="text-gray-400 hover:text-red-500"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    onClick={() => setCardData({
                                        ...cardData,
                                        limitTable: [...(cardData.limitTable || []), { threshold: 0, limit: 0 }]
                                    })}
                                    className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-xs font-bold text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors flex items-center justify-center gap-1"
                                >
                                    <Plus className="w-3 h-3" />
                                    구간 추가
                                </button>
                            </div>
                        </div>

                        {/* Right: Benefits */}
                        <div className="w-full md:w-2/3 p-6 overflow-y-auto">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-bold text-gray-900">혜택 목록</h3>
                                <button
                                    onClick={() => {
                                        setSelectedRuleId(null);
                                        setIsRuleModalOpen(true);
                                    }}
                                    disabled={!initialCard}
                                    className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-bold shadow hover:bg-gray-800 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Plus className="w-4 h-4" />
                                    혜택 추가
                                </button>
                            </div>

                            {!initialCard ? (
                                <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50 text-gray-400 text-sm">
                                    카드를 먼저 생성한 후 혜택을 추가할 수 있습니다.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {cardRules.map(rule => (
                                        <div
                                            key={rule.id}
                                            onClick={() => {
                                                setSelectedRuleId(rule.id);
                                                setIsRuleModalOpen(true);
                                            }}
                                            className="group bg-white p-4 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-50 transition-all cursor-pointer relative overflow-hidden"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={clsx(
                                                            "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                                                            rule.action.type === 'PERCENT' ? "bg-blue-50 text-blue-600" : "bg-green-50 text-green-600"
                                                        )}>
                                                            {rule.action.type}
                                                        </span>
                                                        {rule.category && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{rule.category}</span>}
                                                    </div>
                                                    <h4 className="font-bold text-gray-800">{rule.description}</h4>
                                                    <p className="text-xs text-gray-400 mt-1 line-clamp-1">{rule.detail}</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-lg font-black text-gray-900">
                                                        {rule.action.value}
                                                        <span className="text-xs font-bold text-gray-400 ml-0.5">
                                                            {rule.action.type === 'PERCENT' ? '%' : '원'}
                                                        </span>
                                                    </div>
                                                    {rule.limitConfig.monthlyAmount && (
                                                        <div className="text-[10px] text-gray-400 mt-1">
                                                            한도: {rule.limitConfig.monthlyAmount.toLocaleString()}원
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="absolute top-4 right-4 text-blue-500 opacity-0 group-hover:opacity-100 transform translate-x-2 group-hover:translate-x-0 transition-all">
                                                <Edit2 className="w-4 h-4" />
                                            </div>
                                        </div>
                                    ))}
                                    {cardRules.length === 0 && (
                                        <div className="text-center py-12 text-gray-400 text-sm">
                                            등록된 혜택이 없습니다.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Main Footer */}
                    <div className="p-6 border-t border-gray-100 bg-white flex justify-end gap-3 z-10">
                        <button onClick={onClose} className="px-5 py-2.5 text-gray-500 font-bold text-sm hover:bg-gray-50 rounded-xl transition-colors">
                            취소
                        </button>
                        <button onClick={handleSave} className="px-8 py-2.5 bg-gray-900 text-white font-bold text-sm rounded-xl hover:bg-black shadow-lg transition-all active:scale-95">
                            저장 완료
                        </button>
                    </div>

                </div>
            </div>

            {/* Nested Rule Modal */}
            {initialCard && (
                <EditRuleModal
                    key={`${selectedRuleId || 'new'}-${isRuleModalOpen ? 'open' : 'closed'}`}
                    isOpen={isRuleModalOpen}
                    onClose={() => setIsRuleModalOpen(false)}
                    cardId={initialCard.id}
                    existingRule={selectedRuleId ? cardRules.find(r => r.id === selectedRuleId) : null}
                />
            )}
        </>
    );
}

function clsx(...classes: (string | undefined | null | false)[]) {
    return classes.filter(Boolean).join(' ');
}
