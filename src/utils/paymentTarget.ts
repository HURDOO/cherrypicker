import type {
    Brand,
    PaymentTarget,
    PaymentTargetSnapshot,
    TransactionHistory,
} from '@/types';

export const GENERAL_PAYMENT_LABEL = '일반 결제';
export const MAX_GENERAL_PAYMENT_LABEL_LENGTH = 80;

export const normalizeGeneralPaymentLabel = (value?: string) => {
    const normalized = value?.trim().replace(/\s+/g, ' ').slice(
        0,
        MAX_GENERAL_PAYMENT_LABEL_LENGTH,
    );
    return normalized || GENERAL_PAYMENT_LABEL;
};

export const toPaymentTargetSnapshot = (
    target: PaymentTarget,
): PaymentTargetSnapshot => target.kind === 'BRAND'
    ? {
        kind: 'BRAND',
        brandId: target.brand.id,
        label: target.brand.name,
    }
    : {
        kind: 'GENERAL',
        label: normalizeGeneralPaymentLabel(target.label),
    };

export const getTransactionPaymentTarget = (
    transaction: TransactionHistory,
    brands: Brand[] = [],
): PaymentTargetSnapshot => {
    if (transaction.paymentTarget) return transaction.paymentTarget;
    if (transaction.brandId) {
        return {
            kind: 'BRAND',
            brandId: transaction.brandId,
            label: brands.find(brand => brand.id === transaction.brandId)?.name ??
                transaction.brandId,
        };
    }
    return { kind: 'GENERAL', label: GENERAL_PAYMENT_LABEL };
};

export const getPaymentTargetHref = (
    pathname: string,
    target?: PaymentTargetSnapshot,
) => {
    const params = new URLSearchParams();
    if (target?.kind === 'BRAND') params.set('brand', target.brandId);
    if (target?.kind === 'GENERAL') params.set('general', '1');
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
};
