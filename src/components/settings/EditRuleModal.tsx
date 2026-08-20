import React, { useState } from 'react';
import { BenefitRule, ActionType, PlatformType } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { X, Trash2, Check } from 'lucide-react';
import { useToastStore } from '@/store/useToastStore';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { localWorkspaceClient } from '@/lib/local-workspace';

interface EditRuleModalProps {
    isOpen: boolean;
    onClose: () => void;
    cardId: string;
    existingRule?: BenefitRule | null; // null means create new
}

const createInitialFormData = (cardId: string, existingRule?: BenefitRule | null): Partial<BenefitRule> => {
    if (existingRule) {
        const rule = structuredClone(existingRule);
        return {
            ...rule,
            condition: {
                ...rule.condition,
                minSpend: rule.condition.minSpend || 0,
                minPerformance: rule.condition.minPerformance || 0
            },
            action: {
                ...rule.action,
                maxDiscount: rule.action.maxDiscount || 0
            },
            limitConfig: {
                dailyCount: 0,
                monthlyCount: 0,
                yearlyCount: 0,
                monthlyAmount: 0,
                ...rule.limitConfig
            },
            includedBrands: rule.includedBrands || [],
            excludedBrands: rule.excludedBrands || [],
            platformType: rule.platformType || 'ALL'
        };
    }

    return {
        cardId,
        description: '',
        detail: '',
        category: '',
        platformType: 'ALL',
        condition: { minSpend: 0, minPerformance: 0 },
        action: { type: 'PERCENT', value: 0, maxDiscount: 0 },
        limitConfig: {
            dailyCount: 0,
            monthlyCount: 0,
            yearlyCount: 0,
            monthlyAmount: 0
        },
        includedBrands: [],
        excludedBrands: []
    };
};

export default function EditRuleModal({ isOpen, onClose, cardId, existingRule }: EditRuleModalProps) {
    const {
        brands,
        categories,
        addRule,
        updateRule,
        removeRule,
        storageMode,
    } = useAppStore();
    const { addToast } = useToastStore();

    // Local State
    const [formData, setFormData] = useState<Partial<BenefitRule>>(() =>
        createInitialFormData(cardId, existingRule)
    );

    const handleSave = async () => {
        const description = formData.description?.trim();
        const action = formData.action;
        if (!description) return addToast('설명을 입력해주세요.', 'error');
        if (!action?.value) return addToast('혜택 값을 입력해주세요.', 'error');

        try {
            const payload = {
                cardId,
                category: formData.category || null,
                includedBrands: formData.includedBrands || [],
                excludedBrands: formData.excludedBrands || [],
                platformType: formData.platformType || 'ALL',
                sharedGroupId: formData.sharedGroupId || null,
                usesCardLimit: formData.usesCardLimit,
                description,
                detail: formData.detail || '',
                condition: formData.condition || {},
                action,
                limitConfig: formData.limitConfig || {}
            };

            if (existingRule) {
                const savedRule = storageMode === 'guest'
                    ? await localWorkspaceClient.updateRule(existingRule.id, payload)
                    : await apiClient.updateRule(existingRule.id, payload);
                updateRule(savedRule);
            } else {
                const savedRule = storageMode === 'guest'
                    ? await localWorkspaceClient.createRule(payload)
                    : await apiClient.createRule(payload);
                addRule(savedRule);
            }

            addToast('혜택이 저장되었습니다.', 'success');
            onClose();

        } catch (error: unknown) {
            addToast(getErrorMessage(error, '혜택을 저장하지 못했습니다.'), 'error');
        }
    };

    const handleDelete = async () => {
        if (!existingRule || !confirm('정말 삭제하시겠습니까?')) return;

        try {
            if (storageMode === 'guest') {
                await localWorkspaceClient.deleteRule(existingRule.id);
            } else {
                await apiClient.deleteRule(existingRule.id);
            }
            removeRule(existingRule.id);
            addToast('삭제되었습니다.', 'success');
            onClose();
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '혜택을 삭제하지 못했습니다.'), 'error');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-900">
                        {existingRule ? '혜택 수정' : '새 혜택 추가'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* 1. Basic Info */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-blue-600 uppercase tracking-wider">기본 정보</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">혜택 설명 (표시용)</label>
                                <input
                                    type="text"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    placeholder="예: 스타벅스 50% 할인"
                                    value={formData.description || ''}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">카테고리</label>
                                <select
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                                    value={formData.category || ''}
                                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                                >
                                    <option value="">카테고리 선택 (공통)</option>
                                    {categories.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-full space-y-1">
                                <label className="text-xs font-bold text-gray-500">상세 설명</label>
                                <textarea
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none h-20"
                                    placeholder="상세 조건이나 유의사항..."
                                    value={formData.detail || ''}
                                    onChange={e => setFormData({ ...formData, detail: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* 2. Conditions */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-green-600 uppercase tracking-wider">조건 (Condition)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">최소결제금액 (Min Spend)</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm text-right"
                                    value={formData.condition?.minSpend || 0}
                                    onChange={e => setFormData({
                                        ...formData,
                                        condition: { ...formData.condition!, minSpend: Number(e.target.value) }
                                    })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">전월실적 조건</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm text-right"
                                    value={formData.condition?.minPerformance || 0}
                                    onChange={e => setFormData({
                                        ...formData,
                                        condition: { ...formData.condition!, minPerformance: Number(e.target.value) }
                                    })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">플랫폼 제한</label>
                                <select
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                                    value={formData.platformType || 'ALL'}
                                    onChange={e => setFormData({ ...formData, platformType: e.target.value as PlatformType })}
                                >
                                    <option value="ALL">모두 (ALL)</option>
                                    <option value="ONLINE">온라인 (ONLINE)</option>
                                    <option value="OFFLINE">오프라인 (OFFLINE)</option>
                                    <option value="OFFICIAL_SITE">공식 홈페이지</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* 3. Brands (Complex) */}
                    <div className="space-y-2">
                        <h3 className="text-sm font-bold text-purple-600 uppercase tracking-wider">대상 브랜드</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">포함 브랜드 (비어있으면 전체)</label>
                                <div className="h-32 border border-gray-200 rounded-lg overflow-y-auto p-2 bg-gray-50">
                                    {brands.map(b => (
                                        <label key={b.id} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-gray-100 rounded px-1">
                                            <input
                                                type="checkbox"
                                                checked={formData.includedBrands?.includes(b.id) || false}
                                                onChange={(e) => {
                                                    const current = formData.includedBrands || [];
                                                    const next = e.target.checked
                                                        ? [...current, b.id]
                                                        : current.filter(id => id !== b.id);
                                                    setFormData({ ...formData, includedBrands: next });
                                                }}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            {b.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 mb-1 block">제외 브랜드</label>
                                <div className="h-32 border border-gray-200 rounded-lg overflow-y-auto p-2 bg-gray-50">
                                    {brands.map(b => (
                                        <label key={b.id} className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-gray-100 rounded px-1">
                                            <input
                                                type="checkbox"
                                                checked={formData.excludedBrands?.includes(b.id) || false}
                                                onChange={(e) => {
                                                    const current = formData.excludedBrands || [];
                                                    const next = e.target.checked
                                                        ? [...current, b.id]
                                                        : current.filter(id => id !== b.id);
                                                    setFormData({ ...formData, excludedBrands: next });
                                                }}
                                                className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                            />
                                            {b.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="h-px bg-gray-100" />

                    {/* 4. Action & Limits */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-bold text-orange-600 uppercase tracking-wider">혜택 및 한도 (Action & Limit)</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">유형 (Type)</label>
                                <select
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white"
                                    value={formData.action?.type || 'PERCENT'}
                                    onChange={e => setFormData({
                                        ...formData,
                                        action: { ...formData.action!, type: e.target.value as ActionType }
                                    })}
                                >
                                    <option value="PERCENT">퍼센트 할인 (%)</option>
                                    <option value="FLAT">정액 할인 (원)</option>
                                    <option value="FIXED_PRICE">고정가 (원)</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">값 (Value)</label>
                                <input
                                    type="number"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm text-right font-bold text-gray-900"
                                    value={formData.action?.value || 0}
                                    onChange={e => setFormData({
                                        ...formData,
                                        action: { ...formData.action!, value: Number(e.target.value) }
                                    })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">건당 최대할인 (Max Disc.)</label>
                                <input
                                    type="number"
                                    placeholder="0 (무제한)"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm text-right"
                                    value={formData.action?.maxDiscount || 0}
                                    onChange={e => setFormData({
                                        ...formData,
                                        action: { ...formData.action!, maxDiscount: Number(e.target.value) }
                                    })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500">월 통합한도 (Monthly Amt)</label>
                                <input
                                    type="number"
                                    placeholder="0 (무제한)"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm text-right"
                                    value={formData.limitConfig?.monthlyAmount || 0}
                                    onChange={e => setFormData({
                                        ...formData,
                                        limitConfig: { ...formData.limitConfig!, monthlyAmount: Number(e.target.value) }
                                    })}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500">일 횟수</label>
                                <input type="number" className="w-full p-1 border rounded text-xs text-right"
                                    value={formData.limitConfig?.dailyCount || 0}
                                    onChange={e => setFormData({ ...formData, limitConfig: { ...formData.limitConfig!, dailyCount: Number(e.target.value) } })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500">월 횟수</label>
                                <input type="number" className="w-full p-1 border rounded text-xs text-right"
                                    value={formData.limitConfig?.monthlyCount || 0}
                                    onChange={e => setFormData({ ...formData, limitConfig: { ...formData.limitConfig!, monthlyCount: Number(e.target.value) } })} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500">년 횟수</label>
                                <input type="number" className="w-full p-1 border rounded text-xs text-right"
                                    value={formData.limitConfig?.yearlyCount || 0}
                                    onChange={e => setFormData({ ...formData, limitConfig: { ...formData.limitConfig!, yearlyCount: Number(e.target.value) } })} />
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                    {existingRule ? (
                        <button
                            onClick={handleDelete}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-100 text-red-500 rounded-xl hover:bg-red-50 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="text-sm font-bold">삭제</span>
                        </button>
                    ) : (
                        <div />
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 text-gray-500 font-bold text-sm hover:bg-gray-100 rounded-xl transition-colors"
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Check className="w-4 h-4" />
                            저장
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
