import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useToastStore } from '@/store/useToastStore';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragOverlay,
    UniqueIdentifier,
    DragStartEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    X, Plus, ShoppingBag, GripVertical, ChevronRight, ChevronDown,
    Trash2, Edit2, Check, Sparkles
} from 'lucide-react';
import clsx from 'clsx';
import { Brand, Category } from '@/types';
import { apiClient, getErrorMessage } from '@/lib/api-client';

interface MasterDataModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// ------------------------------------------------------------------
// Sortable Items
// ------------------------------------------------------------------

function SortableCategoryItem({ category, brands, isExpanded, onToggle, onDelete, onUpdate }: {
    category: Category;
    brands: Brand[];
    isExpanded: boolean;
    onToggle: () => void;
    onDelete: () => void;
    onUpdate: (name: string) => void;
}) {
    const isEditable = Boolean(category.userId);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: category.id,
        data: { type: 'Category', category },
        disabled: !isEditable,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(category.name);

    const handleSave = () => {
        if (editName.trim()) {
            onUpdate(editName.trim());
            setIsEditing(false);
        }
    };

    return (
        <div ref={setNodeRef} style={style} className={clsx("mb-2 transition-all", isDragging ? 'opacity-50 z-50' : '')}>
            <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Header Row */}
                <div className="flex items-center p-3 gap-3 bg-gray-50/50">
                    <button
                        {...attributes}
                        {...listeners}
                        disabled={!isEditable}
                        className="p-1 text-gray-300 enabled:cursor-grab enabled:hover:text-gray-600 enabled:active:cursor-grabbing disabled:text-gray-200"
                        aria-label={isEditable ? '카테고리 순서 변경' : '기본 카테고리'}
                    >
                        <GripVertical className="w-4 h-4" />
                    </button>

                    <button onClick={onToggle} className="p-1 text-gray-400 hover:text-blue-500 transition-colors">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    <div className="flex-1">
                        {isEditing ? (
                            <div className="flex items-center gap-2">
                                <input
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="px-2 py-1 text-sm font-bold border rounded bg-white w-full focus:outline-blue-500"
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                                />
                                <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <div
                                className={clsx('flex items-center gap-2 group', isEditable && 'cursor-pointer')}
                                onClick={() => isEditable && setIsEditing(true)}
                            >
                                <span className="font-bold text-gray-800 text-sm">{category.name}</span>
                                <span className="text-xs text-gray-400 font-normal">({brands.length})</span>
                                {isEditable ? (
                                    <Edit2 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                ) : (
                                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold text-gray-400">기본</span>
                                )}
                            </div>
                        )}
                    </div>

                    {isEditable && (
                        <button onClick={onDelete} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function SortableBrandItem({ brand, onDelete, onUpdate }: {
    brand: Brand;
    onDelete: () => void;
    onUpdate: (name: string) => void;
}) {
    const isEditable = Boolean(brand.userId);
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({
        id: brand.id,
        data: { type: 'Brand', brand },
        disabled: !isEditable,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(brand.name);

    const handleSave = () => {
        if (editName.trim()) {
            onUpdate(editName.trim());
            setIsEditing(false);
        }
    };

    return (
        <div ref={setNodeRef} style={style} className={clsx("flex items-center gap-2 p-2 bg-white rounded-lg border border-gray-100 mb-2 group hover:border-blue-200 transition-all", isDragging && 'opacity-50')}>
            <button
                {...attributes}
                {...listeners}
                disabled={!isEditable}
                className="text-gray-300 enabled:cursor-grab enabled:hover:text-gray-600 enabled:active:cursor-grabbing disabled:text-gray-200"
                aria-label={isEditable ? '브랜드 순서 변경' : '기본 브랜드'}
            >
                <GripVertical className="w-3 h-3" />
            </button>
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <div className="flex-1">
                {isEditing ? (
                    <div className="flex items-center gap-1">
                        <input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="px-1.5 py-0.5 text-xs font-bold border rounded bg-gray-50 w-full focus:outline-blue-500"
                            autoFocus
                            onKeyDown={e => e.key === 'Enter' && handleSave()}
                        />
                        <button onClick={handleSave} className="text-green-600"><Check className="w-3 h-3" /></button>
                    </div>
                ) : (
                    <span
                        className={clsx(
                            'flex items-center gap-1 text-xs font-medium text-gray-700',
                            isEditable && 'cursor-pointer hover:text-blue-600'
                        )}
                        onClick={() => isEditable && setIsEditing(true)}
                    >
                        {brand.name}
                        {!isEditable && <span className="text-[9px] font-bold text-gray-300">기본</span>}
                    </span>
                )}
            </div>
            {isEditable && (
                <button
                    onClick={onDelete}
                    className="text-gray-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

export default function MasterDataModal({ isOpen, onClose }: MasterDataModalProps) {
    const {
        categories, brands,
        addCategory, updateCategory, removeCategory, reorderCategories,
        addBrand, updateBrand, removeBrand, reorderBrands
    } = useAppStore();
    const { addToast } = useToastStore();

    // State
    const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newBrandNames, setNewBrandNames] = useState<Record<string, string>>({});

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Handlers
    const toggleExpand = (catId: string) => {
        const next = new Set(expandedCats);
        if (next.has(catId)) next.delete(catId);
        else next.add(catId);
        setExpandedCats(next);
    };

    const handleAddCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            const category = await apiClient.createCategory({ name: newCategoryName.trim() });
            addCategory(category);
            setNewCategoryName('');
            addToast('카테고리가 추가되었습니다.', 'success');
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '카테고리를 추가하지 못했습니다.'), 'error');
        }
    };

    const handleAddBrand = async (catId: string) => {
        const name = newBrandNames[catId];
        if (!name?.trim()) return;

        try {
            const brand = await apiClient.createBrand({
                name: name.trim(),
                categoryId: catId,
                iconName: 'ShoppingBag'
            });

            addBrand(brand);
            setNewBrandNames(prev => ({ ...prev, [catId]: '' }));
            addToast('브랜드가 추가되었습니다.', 'success');
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '브랜드를 추가하지 못했습니다.'), 'error');
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;

        try {
            await apiClient.deleteCategory(id);
            removeCategory(id);
            addToast('삭제되었습니다.', 'info');
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '카테고리를 삭제하지 못했습니다.'), 'error');
        }
    };

    const handleDeleteBrand = async (id: string) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;

        try {
            await apiClient.deleteBrand(id);
            removeBrand(id);
            addToast('삭제되었습니다.', 'info');
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '브랜드를 삭제하지 못했습니다.'), 'error');
        }
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;
        if (active.id === over.id) return;

        const activeType = active.data.current?.type;
        const overType = over.data.current?.type;

        if (activeType === 'Category' && overType === 'Category') {
            const activeCategory = active.data.current?.category as Category;
            const overCategory = over.data.current?.category as Category;
            if (!activeCategory.userId || !overCategory.userId) return;

            const systemCategories = categories.filter(category => !category.userId);
            const userCategories = categories.filter(category => category.userId);
            const oldIndex = userCategories.findIndex(c => c.id === active.id);
            const newIndex = userCategories.findIndex(c => c.id === over.id);
            const reorderedUserCategories = arrayMove(userCategories, oldIndex, newIndex);
            const newPayload = [...systemCategories, ...reorderedUserCategories];
            reorderCategories(newPayload);
            void apiClient.reorderCategories(
                reorderedUserCategories.map(category => category.id)
            ).catch((error: unknown) => {
                reorderCategories(categories);
                addToast(getErrorMessage(error, '카테고리 순서를 저장하지 못했습니다.'), 'error');
            });
        } else if (activeType === 'Brand' && overType === 'Brand') {
            const activeBrand = active.data.current?.brand as Brand;
            const overBrand = over.data.current?.brand as Brand;

            if (!activeBrand.userId || !overBrand.userId) return;

            if (activeBrand.categoryId !== overBrand.categoryId) {
                // Moving between categories - Optional feature, skip for now strictly as per plan
                return;
            }

            const catId = activeBrand.categoryId;
            const currentCatBrands = brands.filter(
                b => b.categoryId === catId && Boolean(b.userId)
            );
            // We need to reorder the subset via arrayMove
            // But we can't just pass the subset to reorderBrands (it expects full list usually? or we can make it smart)
            // The Store expects "Brand[]". If I pass just the subset, I lose others.
            // So I must reconstruct the full list.

            const oldIndexLocal = currentCatBrands.findIndex(b => b.id === active.id);
            const newIndexLocal = currentCatBrands.findIndex(b => b.id === over.id);

            const newCatBrands = arrayMove(currentCatBrands, oldIndexLocal, newIndexLocal);

            // Reconstruct full list (preserving order of other brands)
            // A simple way: Map original brands, replacing the chunks. 
            // Better: Filter out catBrands, then splice in?
            // Simplest: Just use the new order for the specific IDs.

            const otherBrands = brands.filter(b => b.categoryId !== catId);
            const systemCatBrands = brands.filter(
                b => b.categoryId === catId && !b.userId
            );
            // Wait, this puts all category brands at the end or something. We want to preserve their relative global position? 
            // Actually, in the UI we render by category. So global order only matters within category blocks if we rendered flat.
            // But here we render grouped. So just appending valid data is fine.

            reorderBrands([...otherBrands, ...systemCatBrands, ...newCatBrands]);
            void apiClient.reorderBrands(catId, newCatBrands.map(brand => brand.id)).catch((error: unknown) => {
                reorderBrands(brands);
                addToast(getErrorMessage(error, '브랜드 순서를 저장하지 못했습니다.'), 'error');
            });
        }
    };

    // Updates
    const handleUpdateCategory = async (id: string, name: string) => {
        try {
            const category = await apiClient.updateCategory(id, { name });
            updateCategory(category);
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '카테고리를 수정하지 못했습니다.'), 'error');
        }
    };

    const handleUpdateBrand = async (id: string, name: string) => {
        try {
            const brand = await apiClient.updateBrand(id, { name });
            updateBrand(brand);
        } catch (error: unknown) {
            addToast(getErrorMessage(error, '브랜드를 수정하지 못했습니다.'), 'error');
        }
    };

    if (!isOpen) return null;

    // Sort categories by local order (assuming array order is sort order)

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col h-[80vh]">

                    {/* Header */}
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white z-10">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <ShoppingBag className="w-5 h-5 text-purple-500" />
                                카테고리 & 브랜드 관리
                            </h2>
                            <p className="text-xs text-gray-400 mt-1">드래그하여 순서를 변경하거나 항목을 관리하세요.</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
                        <SortableContext
                            items={categories.map(c => c.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-4">
                                {categories.map(category => (
                                    <div key={category.id}>
                                        <SortableCategoryItem
                                            category={category}
                                            brands={brands.filter(b => b.categoryId === category.id)}
                                            isExpanded={expandedCats.has(category.id)}
                                            onToggle={() => toggleExpand(category.id)}
                                            onDelete={() => handleDeleteCategory(category.id)}
                                            onUpdate={(name) => handleUpdateCategory(category.id, name)}
                                        />

                                        {/* Nested Brands */}
                                        {expandedCats.has(category.id) && (
                                            <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-100 pl-4 animate-in slide-in-from-top-2 duration-200">
                                                <SortableContext
                                                    items={brands.filter(b => b.categoryId === category.id).map(b => b.id)}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {brands
                                                        .filter(b => b.categoryId === category.id)
                                                        .map(brand => (
                                                            <SortableBrandItem
                                                                key={brand.id}
                                                                brand={brand}
                                                                onDelete={() => handleDeleteBrand(brand.id)}
                                                                onUpdate={(name) => handleUpdateBrand(brand.id, name)}
                                                            />
                                                        ))
                                                    }
                                                </SortableContext>

                                                {/* Add Brand Input */}
                                                <div className="flex items-center gap-2 pt-1">
                                                    <input
                                                        placeholder="새 브랜드 추가..."
                                                        className="flex-1 text-xs p-2 rounded-lg border border-gray-200 focus:outline-blue-500 bg-white"
                                                        value={newBrandNames[category.id] || ''}
                                                        onChange={e => setNewBrandNames(prev => ({ ...prev, [category.id]: e.target.value }))}
                                                        onKeyDown={e => e.key === 'Enter' && handleAddBrand(category.id)}
                                                    />
                                                    <button
                                                        onClick={() => handleAddBrand(category.id)}
                                                        className="p-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </SortableContext>

                        {/* Add Category Section */}
                        <div className="mt-8 pt-6 border-t border-gray-100">
                            <h3 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">새 카테고리 추가</h3>
                            <div className="flex gap-2">
                                <input
                                    placeholder="카테고리 이름"
                                    className="flex-1 p-3 bg-white border border-gray-200 rounded-xl text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-50 outline-none transition-all"
                                    value={newCategoryName}
                                    onChange={e => setNewCategoryName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleAddCategory()}
                                />
                                <button
                                    onClick={handleAddCategory}
                                    className="px-5 font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors shadow-lg shadow-purple-100"
                                >
                                    추가
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Drag Overlay for smooth visuals */}
            <DragOverlay>
                {activeId ? (
                    <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-xl opacity-90 w-64 flex items-center gap-3">
                        <div className="p-2 bg-blue-50 text-blue-500 rounded-lg">
                            <Sparkles className="w-4 h-4" />
                        </div>
                        <span className="font-bold text-gray-900">Items moving...</span>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
