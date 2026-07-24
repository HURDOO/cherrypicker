import type {
    BenefitRule,
    Brand,
    Category,
    TransactionHistory,
} from '@/types';

export interface BrandDesignProps {
    categories: Category[];
    brands: Brand[];
    rules: BenefitRule[];
    history: TransactionHistory[];
    selectedBrandId: string | null;
    onSelectBrand: (brand: Brand) => void;
}

