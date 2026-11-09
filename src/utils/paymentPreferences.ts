import type {
    PaymentOpenMode,
    PaymentPayId,
    PaymentPreferences,
    PayRouteCheck,
} from '@/types';

export const PAYMENT_PAY_IDS: readonly PaymentPayId[] = ['kakaopay', 'naverpay'];
export const PAYMENT_PAY_NAMES: Record<PaymentPayId, string> = {
    kakaopay: '카카오페이',
    naverpay: '네이버페이',
};
/** Samsung Pay mode is the one the owner confirmed keeps the card benefit (Shinhan via KakaoPay). */
export const DEFAULT_PAYMENT_OPEN_MODE: PaymentOpenMode = 'SAMSUNG_PAY';
const MAX_ROUTE_CHECKS = 100;

export const isPaymentPayId = (value: unknown): value is PaymentPayId =>
    typeof value === 'string' && (PAYMENT_PAY_IDS as readonly string[]).includes(value);

const isOpenMode = (value: unknown): value is PaymentOpenMode =>
    value === 'CODE' || value === 'SAMSUNG_PAY';

export const createDefaultPaymentPreferences = (): PaymentPreferences => ({
    defaultMethod: 'CARD',
    openModes: {},
    routeChecks: [],
});

export const hasMeaningfulPaymentPreferences = (value: PaymentPreferences) => (
    value.defaultMethod !== 'CARD' ||
    Object.keys(value.openModes).length > 0 ||
    value.routeChecks.length > 0
);

const sameRoute = (
    a: Pick<PayRouteCheck, 'payId' | 'mode' | 'cardCompany'>,
    b: Pick<PayRouteCheck, 'payId' | 'mode' | 'cardCompany'>,
) => a.payId === b.payId && a.mode === b.mode && a.cardCompany === b.cardCompany;

/**
 * Reads saved payment settings. Entries this version does not know (for example a pay added
 * later) are dropped instead of failing, so an older app can still open a newer workspace.
 */
export function parsePaymentPreferences(value: unknown, label: string): PaymentPreferences {
    if (value === undefined) return createDefaultPaymentPreferences();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${label} workspace의 결제수단 설정이 올바르지 않습니다.`);
    }
    const record = value as Record<string, unknown>;
    const defaultMethod = record.defaultMethod === 'CARD' || isPaymentPayId(record.defaultMethod)
        ? record.defaultMethod
        : 'CARD';
    const openModes: PaymentPreferences['openModes'] = {};
    if (record.openModes && typeof record.openModes === 'object') {
        Object.entries(record.openModes as Record<string, unknown>).forEach(([payId, mode]) => {
            if (isPaymentPayId(payId) && isOpenMode(mode)) openModes[payId] = mode;
        });
    }
    const routeChecks: PayRouteCheck[] = [];
    if (Array.isArray(record.routeChecks)) {
        record.routeChecks.forEach(item => {
            if (!item || typeof item !== 'object') return;
            const check = item as Record<string, unknown>;
            const checkedAt = typeof check.checkedAt === 'string' ? new Date(check.checkedAt) : null;
            if (
                !isPaymentPayId(check.payId) ||
                !isOpenMode(check.mode) ||
                typeof check.cardCompany !== 'string' ||
                !check.cardCompany.trim() ||
                check.cardCompany.length > 100 ||
                typeof check.cardBenefitApplied !== 'boolean' ||
                !checkedAt ||
                Number.isNaN(checkedAt.getTime())
            ) return;
            const parsed: PayRouteCheck = {
                payId: check.payId,
                mode: check.mode,
                cardCompany: check.cardCompany,
                cardBenefitApplied: check.cardBenefitApplied,
                checkedAt: checkedAt.toISOString(),
            };
            const existing = routeChecks.findIndex(other => sameRoute(other, parsed));
            if (existing >= 0) routeChecks[existing] = parsed;
            else routeChecks.push(parsed);
        });
    }
    return {
        defaultMethod,
        openModes,
        routeChecks: routeChecks.slice(-MAX_ROUTE_CHECKS),
    };
}

export const getOpenMode = (
    preferences: PaymentPreferences,
    payId: PaymentPayId,
    legacyMode?: PaymentOpenMode,
): PaymentOpenMode => preferences.openModes[payId] ?? legacyMode ?? DEFAULT_PAYMENT_OPEN_MODE;

export type PayRouteStatus = 'APPLIED' | 'NOT_APPLIED' | 'UNCHECKED';

export function getPayRouteStatus(
    preferences: PaymentPreferences,
    route: Pick<PayRouteCheck, 'payId' | 'mode' | 'cardCompany'>,
): PayRouteStatus {
    const check = preferences.routeChecks.find(item => sameRoute(item, route));
    if (!check) return 'UNCHECKED';
    return check.cardBenefitApplied ? 'APPLIED' : 'NOT_APPLIED';
}

/** Saves, replaces or (with `applied: undefined`) clears one route finding. */
export function setPayRouteCheck(
    preferences: PaymentPreferences,
    route: Pick<PayRouteCheck, 'payId' | 'mode' | 'cardCompany'>,
    applied: boolean | undefined,
    now = new Date(),
): PaymentPreferences {
    const others = preferences.routeChecks.filter(item => !sameRoute(item, route));
    return {
        ...preferences,
        routeChecks: applied === undefined
            ? others
            : [...others, {
                ...route,
                cardBenefitApplied: applied,
                checkedAt: now.toISOString(),
            }].slice(-MAX_ROUTE_CHECKS),
    };
}

// GoodDeal is paid on the KakaoPay screen, so it counts as having KakaoPay.
const PAY_ALIASES: Record<string, PaymentPayId> = { 'kakaopay-gooddeal': 'kakaopay' };

/** Pays the user registered that the payment step can open, in a fixed order. */
export const getOpenablePayIds = (enabledPayIds: readonly string[]): PaymentPayId[] => {
    const owned = new Set(enabledPayIds.map(id => PAY_ALIASES[id] ?? id));
    return PAYMENT_PAY_IDS.filter(payId => owned.has(payId));
};

/** The default falls back to the card when its pay is no longer one the user has. */
export const getEffectiveDefaultMethod = (
    preferences: PaymentPreferences,
    enabledPayIds: readonly string[],
): 'CARD' | PaymentPayId => (
    preferences.defaultMethod !== 'CARD' &&
    getOpenablePayIds(enabledPayIds).includes(preferences.defaultMethod)
        ? preferences.defaultMethod
        : 'CARD'
);

/** The default method first, then the card, then the other pays. */
export function orderPayMethods(
    payIds: readonly PaymentPayId[],
    defaultMethod: 'CARD' | PaymentPayId,
): Array<'CARD' | PaymentPayId> {
    const methods: Array<'CARD' | PaymentPayId> = ['CARD', ...payIds];
    const first = methods.includes(defaultMethod) ? defaultMethod : 'CARD';
    return [first, ...methods.filter(method => method !== first)];
}
